#!/usr/bin/env node
/* Servidor do Quadro de Férias.
   Sem dependências externas: usa só o que vem no Node (http, sqlite, crypto).
   Roda com  node servidor.js  e escuta na porta 3000 (ou a da variável PORT). */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [maior, menor] = process.versions.node.split('.').map(Number);
if(maior < 22 || (maior === 22 && menor < 5)){
  console.error('Este servidor precisa do Node 22.5 ou mais novo (usa o módulo node:sqlite).');
  console.error('Node encontrado: ' + process.versions.node);
  process.exit(1);
}
const { DatabaseSync } = require('node:sqlite');

const Regras = require('./publico/regras.js');
const PAPEIS = Regras.PAPEIS.map(p => p.chave);          // gestor, dp, diretor

const PORTA = Number(process.env.PORT) || 3000;
const PASTA_DADOS = process.env.FERIAS_DADOS || path.join(__dirname, 'dados');
const PUBLICO = path.join(__dirname, 'publico');
const LIMITE_CORPO = 64 * 1024;

/* ------------------------------------------------------------------ banco */
fs.mkdirSync(PASTA_DADOS, { recursive: true });
const db = new DatabaseSync(path.join(PASTA_DADOS, 'ferias.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS funcionarios (
    id        TEXT PRIMARY KEY,
    nome      TEXT NOT NULL,
    cargo     TEXT NOT NULL DEFAULT '',
    setor     TEXT NOT NULL DEFAULT '',
    admissao  TEXT NOT NULL DEFAULT '',
    ativo     INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS solicitacoes (
    id                TEXT PRIMARY KEY,
    funcionario_id    TEXT NOT NULL,
    inicio            TEXT NOT NULL,
    dias              INTEGER NOT NULL,
    obs               TEXT NOT NULL DEFAULT '',
    status            TEXT NOT NULL,
    criada_em         TEXT NOT NULL,
    motivo            TEXT NOT NULL DEFAULT '',
    recusada_por      TEXT NOT NULL DEFAULT '',
    aut_gestor        TEXT NOT NULL DEFAULT '',
    aut_gestor_nome   TEXT NOT NULL DEFAULT '',
    aut_dp            TEXT NOT NULL DEFAULT '',
    aut_dp_nome       TEXT NOT NULL DEFAULT '',
    aut_diretor       TEXT NOT NULL DEFAULT '',
    aut_diretor_nome  TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_sol_func ON solicitacoes(funcionario_id);
  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

const cfgLer = db.prepare('SELECT valor FROM config WHERE chave = ?');
const cfgGravar = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
const config = {
  ler: (k, padrao) => { const r = cfgLer.get(k); return r ? r.valor : (padrao === undefined ? '' : padrao); },
  gravar: (k, v) => cfgGravar.run(k, String(v))
};

/* ------------------------------------------------------------------ acesso */
function hashPin(pin, sal){ return crypto.scryptSync(String(pin), sal, 32).toString('hex'); }

function definirPin(papel, pin){
  const sal = crypto.randomBytes(16).toString('hex');
  config.gravar('pin_' + papel + '_sal', sal);
  config.gravar('pin_' + papel + '_hash', hashPin(pin, sal));
}
function confereePin(papel, pin){
  const sal = config.ler('pin_' + papel + '_sal');
  const esperado = config.ler('pin_' + papel + '_hash');
  if(!sal || !esperado) return false;
  const a = Buffer.from(hashPin(pin, sal), 'hex'), b = Buffer.from(esperado, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function papelDoPin(pin){
  for(const papel of PAPEIS) if(confereePin(papel, pin)) return papel;
  return null;
}
const jaConfigurado = () => PAPEIS.every(p => !!config.ler('pin_' + p + '_hash'));

const sessoes = new Map();                 // token -> { ate, papel }
const VALIDADE = 12 * 60 * 60 * 1000;
function novaSessao(papel){
  const token = crypto.randomBytes(24).toString('hex');
  sessoes.set(token, { ate: Date.now() + VALIDADE, papel });
  return token;
}
function sessaoDe(req){
  const token = req.headers['x-ferias-token'];
  if(!token) return null;
  const s = sessoes.get(token);
  if(!s) return null;
  if(s.ate < Date.now()){ sessoes.delete(token); return null; }
  return s;
}
setInterval(() => {
  const agora = Date.now();
  for(const [t, s] of sessoes) if(s.ate < agora) sessoes.delete(t);
}, 10 * 60 * 1000).unref();

const tentativas = new Map();
const bloqueado = ip => { const t = tentativas.get(ip); return !!(t && t.n >= 10 && t.ate > Date.now()); };
function errou(ip){
  const t = tentativas.get(ip) || { n:0, ate:0 };
  t.n++; t.ate = Date.now() + 5 * 60 * 1000;
  tentativas.set(ip, t);
}

/* ------------------------------------------------------------------ dados */
const q = {
  funcionarios: db.prepare('SELECT id, nome, cargo, setor, admissao, ativo FROM funcionarios ORDER BY nome'),
  funcionario:  db.prepare('SELECT id, nome, cargo, setor, admissao, ativo FROM funcionarios WHERE id = ?'),
  gravarFunc: db.prepare(`INSERT INTO funcionarios (id, nome, cargo, setor, admissao, ativo, criado_em)
                          VALUES (?, ?, ?, ?, ?, ?, ?)
                          ON CONFLICT(id) DO UPDATE SET
                            nome = excluded.nome, cargo = excluded.cargo,
                            setor = excluded.setor, admissao = excluded.admissao, ativo = excluded.ativo`),
  apagarFunc: db.prepare('DELETE FROM funcionarios WHERE id = ?'),
  solicitacoes: db.prepare(`SELECT s.id, s.funcionario_id AS funcionarioId, s.inicio, s.dias, s.obs, s.status,
                                   s.criada_em AS criadaEm, s.motivo, s.recusada_por AS recusadaPor,
                                   s.aut_gestor, s.aut_gestor_nome, s.aut_dp, s.aut_dp_nome,
                                   s.aut_diretor, s.aut_diretor_nome,
                                   f.nome, f.setor, f.cargo
                            FROM solicitacoes s LEFT JOIN funcionarios f ON f.id = s.funcionario_id
                            ORDER BY s.inicio`),
  solicitacao: db.prepare('SELECT * FROM solicitacoes WHERE id = ?'),
  criarSol: db.prepare(`INSERT INTO solicitacoes
      (id, funcionario_id, inicio, dias, obs, status, criada_em, motivo, recusada_por,
       aut_gestor, aut_gestor_nome, aut_dp, aut_dp_nome, aut_diretor, aut_diretor_nome)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?)`),
  statusSol: db.prepare('UPDATE solicitacoes SET status = ?, motivo = ?, recusada_por = ? WHERE id = ?'),
  apagarSol: db.prepare('DELETE FROM solicitacoes WHERE id = ?')
};
const autorizarSol = {};
for(const p of PAPEIS){
  autorizarSol[p] = db.prepare(`UPDATE solicitacoes SET aut_${p} = ?, aut_${p}_nome = ?, status = ? WHERE id = ?`);
}

const todosFuncionarios = () => q.funcionarios.all().map(f => ({ ...f, ativo: !!f.ativo }));
const todasSolicitacoes = () => q.solicitacoes.all().map(s => ({
  ...s, nome: s.nome || '(funcionário removido)', setor: s.setor || '', cargo: s.cargo || ''
}));
const minhasDe = (id, todas) => todas.filter(s => s.funcionarioId === id);

const uid = () => crypto.randomBytes(9).toString('hex');
const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

/** Depois de assinar, o status vira 'autorizada' quando os três já assinaram. */
function statusApos(atual, papelAssinado){
  const assinado = {};
  for(const p of PAPEIS) assinado[p] = p === papelAssinado ? true : !!atual['aut_' + p];
  return PAPEIS.every(p => assinado[p]) ? 'autorizada' : 'pendente';
}

/* ------------------------------------------------------------------- HTTP */
function json(res, codigo, corpo){
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(corpo));
}
function lerCorpo(req){
  return new Promise((ok, falha) => {
    let bruto = '', tamanho = 0;
    req.on('data', p => {
      tamanho += p.length;
      if(tamanho > LIMITE_CORPO){ falha(new Error('corpo grande demais')); req.destroy(); return; }
      bruto += p;
    });
    req.on('end', () => { try{ ok(bruto ? JSON.parse(bruto) : {}); }catch(e){ falha(new Error('JSON inválido')); } });
    req.on('error', falha);
  });
}
const TIPOS = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };
function servirArquivo(res, nome){
  const arquivo = path.join(PUBLICO, nome);
  if(!arquivo.startsWith(PUBLICO + path.sep)){ json(res, 403, { erro:'caminho inválido' }); return; }
  fs.readFile(arquivo, (e, dados) => {
    if(e){ res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); res.end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control':'no-cache' });
    res.end(dados);
  });
}

const servidor = http.createServer(async (req, res) => {
  const rota = new URL(req.url, 'http://local').pathname;
  const ip = req.socket.remoteAddress || '?';
  const sessao = sessaoDe(req);
  const exigir = papel => {
    if(!sessao) throw Object.assign(new Error('Sua sessão expirou. Entre de novo com o seu PIN.'), { http:401 });
    if(papel && sessao.papel !== papel) throw Object.assign(new Error('Só o departamento pessoal pode fazer isso.'), { http:403 });
  };

  try{
    if(req.method === 'GET'){
      if(rota === '/' || rota === '/index.html') return servirArquivo(res, 'index.html');
      if(rota === '/regras.js') return servirArquivo(res, 'regras.js');
    }

    /* ---------- estado ---------- */
    if(rota === '/api/estado' && req.method === 'GET'){
      const nomes = {};
      for(const p of PAPEIS) nomes[p] = config.ler('nome_' + p);
      return json(res, 200, {
        funcionarios: todosFuncionarios(),
        solicitacoes: todasSolicitacoes(),
        empresa: config.ler('empresa'),
        nomes,
        configurado: jaConfigurado(),
        papel: sessao ? sessao.papel : ''
      });
    }

    /* ---------- primeira configuração: os três PINs de uma vez ---------- */
    if(rota === '/api/configurar' && req.method === 'POST'){
      if(jaConfigurado()) return json(res, 400, { erro:'Os PINs já foram definidos. Use "Trocar PINs" na área do departamento pessoal.' });
      const corpo = await lerCorpo(req);
      const pins = {};
      for(const p of PAPEIS){
        const dados = corpo[p] || {};
        const pin = String(dados.pin || '');
        const nome = texto(dados.nome, 120);
        if(!nome) return json(res, 400, { erro:'Informe o nome de quem responde por cada papel.' });
        if(pin.length < 4) return json(res, 400, { erro:'Cada PIN precisa de pelo menos 4 caracteres.' });
        pins[p] = { pin, nome };
      }
      const valores = PAPEIS.map(p => pins[p].pin);
      if(new Set(valores).size !== valores.length) return json(res, 400, { erro:'Os três PINs precisam ser diferentes entre si.' });
      for(const p of PAPEIS){ definirPin(p, pins[p].pin); config.gravar('nome_' + p, pins[p].nome); }
      return json(res, 200, { token: novaSessao('dp'), papel:'dp' });
    }

    /* ---------- entrar ---------- */
    if(rota === '/api/pin' && req.method === 'POST'){
      const corpo = await lerCorpo(req);
      const pin = String(corpo.pin || '');
      if(!jaConfigurado()) return json(res, 400, { erro:'Os PINs ainda não foram definidos.' });
      if(bloqueado(ip)) return json(res, 429, { erro:'Muitas tentativas erradas. Espere 5 minutos.' });
      const papel = papelDoPin(pin);
      if(!papel){ errou(ip); return json(res, 401, { erro:'PIN incorreto.' }); }
      tentativas.delete(ip);
      return json(res, 200, { token: novaSessao(papel), papel, nome: config.ler('nome_' + papel) });
    }

    if(rota === '/api/pins' && req.method === 'POST'){
      exigir('dp');
      const corpo = await lerCorpo(req);
      let mudou = 0;
      for(const p of PAPEIS){
        const dados = corpo[p] || {};
        if(dados.nome !== undefined) config.gravar('nome_' + p, texto(dados.nome, 120));
        const pin = String(dados.pin || '');
        if(pin){
          if(pin.length < 4) return json(res, 400, { erro:'Cada PIN precisa de pelo menos 4 caracteres.' });
          definirPin(p, pin); mudou++;
        }
      }
      return json(res, 200, { ok:true, trocados: mudou });
    }

    /* ---------- solicitação do funcionário ---------- */
    if(rota === '/api/solicitacoes' && req.method === 'POST'){
      const corpo = await lerCorpo(req);
      const func = q.funcionario.get(String(corpo.funcionarioId || ''));
      if(!func || !func.ativo) return json(res, 400, { erro:'Funcionário não encontrado.' });

      const todas = todasSolicitacoes();
      const pedido = { id:null, inicio: texto(corpo.inicio, 10), dias: Math.trunc(Number(corpo.dias) || 0) };
      const V = Regras.validar(func, pedido, minhasDe(func.id, todas), todosFuncionarios(), todas);
      if(V.erros.length) return json(res, 400, { erro: V.erros[0].t, erros: V.erros });

      const id = uid();
      q.criarSol.run(id, func.id, pedido.inicio, pedido.dias, texto(corpo.obs, 500),
                     'pendente', new Date().toISOString(), '', '', '', '', '', '');
      return json(res, 200, { id });
    }

    const mSol = rota.match(/^\/api\/solicitacoes\/([a-f0-9]{18})(\/cancelar|\/autorizar|\/recusar)?$/);
    if(mSol){
      const id = mSol[1], acao = mSol[2] || '';
      const atual = q.solicitacao.get(id);
      if(!atual) return json(res, 404, { erro:'Solicitação não encontrada.' });

      if(acao === '/cancelar' && req.method === 'POST'){
        const corpo = await lerCorpo(req);
        const ehDono = corpo.funcionarioId === atual.funcionario_id;
        if(!ehDono && !sessao) return json(res, 403, { erro:'Este pedido é de outra pessoa.' });
        if(atual.status !== 'pendente') return json(res, 400, { erro:'Só dá para cancelar um pedido que ainda está em análise.' });
        q.statusSol.run('cancelada', '', '', id);
        return json(res, 200, { ok:true });
      }

      exigir();

      if(acao === '/autorizar' && req.method === 'POST'){
        if(atual.status !== 'pendente') return json(res, 400, { erro:'Este pedido não está mais em análise.' });
        if(atual['aut_' + sessao.papel]) return json(res, 400, { erro:'Você já autorizou este pedido.' });
        const nome = config.ler('nome_' + sessao.papel) || sessao.papel;
        autorizarSol[sessao.papel].run(new Date().toISOString(), nome, statusApos(atual, sessao.papel), id);
        return json(res, 200, { ok:true });
      }

      if(acao === '/recusar' && req.method === 'POST'){
        if(atual.status !== 'pendente') return json(res, 400, { erro:'Este pedido não está mais em análise.' });
        const corpo = await lerCorpo(req);
        const motivo = texto(corpo.motivo, 300);
        if(!motivo) return json(res, 400, { erro:'Escreva o motivo da recusa.' });
        q.statusSol.run('recusada', motivo, config.ler('nome_' + sessao.papel) || sessao.papel, id);
        return json(res, 200, { ok:true });
      }

      if(!acao && req.method === 'DELETE'){
        exigir('dp');
        q.apagarSol.run(id);
        return json(res, 200, { ok:true });
      }
    }

    /* ---------- cadastro, só o departamento pessoal ---------- */
    if(rota === '/api/funcionarios' && req.method === 'POST'){
      exigir('dp');
      const corpo = await lerCorpo(req);
      const nome = texto(corpo.nome, 120);
      const admissao = texto(corpo.admissao, 10);
      if(!nome) return json(res, 400, { erro:'O nome é obrigatório.' });
      if(admissao && !Regras.pd(admissao)) return json(res, 400, { erro:'A data de admissão informada não existe.' });
      const id = /^[a-f0-9]{18}$/.test(String(corpo.id || '')) ? corpo.id : uid();
      q.gravarFunc.run(id, nome, texto(corpo.cargo, 80), texto(corpo.setor, 80), admissao,
                       corpo.ativo === false ? 0 : 1, new Date().toISOString());
      return json(res, 200, { id });
    }

    const mFunc = rota.match(/^\/api\/funcionarios\/([a-f0-9]{18})$/);
    if(mFunc && req.method === 'DELETE'){
      exigir('dp');
      q.apagarFunc.run(mFunc[1]);
      return json(res, 200, { ok:true });
    }

    /* ---------- férias já combinadas antes do sistema ---------- */
    if(rota === '/api/historico' && req.method === 'POST'){
      exigir('dp');
      const corpo = await lerCorpo(req);
      const func = q.funcionario.get(String(corpo.funcionarioId || ''));
      if(!func) return json(res, 400, { erro:'Funcionário não encontrado.' });
      const inicio = texto(corpo.inicio, 10);
      const dias = Math.trunc(Number(corpo.dias) || 0);
      if(!Regras.pd(inicio)) return json(res, 400, { erro:'Informe uma data válida.' });
      if(dias < 1 || dias > 30) return json(res, 400, { erro:'Os dias precisam ficar entre 1 e 30.' });
      const agora = new Date().toISOString();
      const nome = config.ler('nome_dp') || 'Departamento pessoal';
      q.criarSol.run(uid(), func.id, inicio, dias, 'Lançado pelo departamento pessoal.', 'autorizada', agora,
                     agora, nome, agora, nome, agora, nome);
      return json(res, 200, { ok:true });
    }

    if(rota === '/api/empresa' && req.method === 'POST'){
      exigir('dp');
      const corpo = await lerCorpo(req);
      config.gravar('empresa', texto(corpo.nome, 120));
      return json(res, 200, { ok:true });
    }

    json(res, 404, { erro:'Rota não encontrada.' });
  }catch(e){
    const esperado = !!e.http || ['JSON inválido','corpo grande demais'].includes(e.message);
    if(!res.headersSent){
      json(res, e.http || 400, { erro: esperado ? e.message : 'Erro ao processar o pedido.' });
    }
    if(!esperado) console.error('[erro]', e);
  }
});

if(require.main === module){
  servidor.listen(PORTA, () => {
    console.log('Quadro de Férias no ar em http://localhost:' + PORTA);
    console.log('Banco: ' + path.join(PASTA_DADOS, 'ferias.db'));
    if(!jaConfigurado()) console.log('Os PINs ainda não foram definidos — quem abrir a aba Autorização define os três.');
  });
}

module.exports = { servidor, db };

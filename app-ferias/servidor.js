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
    id            TEXT PRIMARY KEY,
    nome          TEXT NOT NULL,
    cargo         TEXT NOT NULL DEFAULT '',
    setor         TEXT NOT NULL DEFAULT '',
    admissao      TEXT NOT NULL,
    dias_direito  INTEGER NOT NULL DEFAULT 30,
    ativo         INTEGER NOT NULL DEFAULT 1,
    criado_em     TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS solicitacoes (
    id                  TEXT PRIMARY KEY,
    funcionario_id      TEXT NOT NULL,
    inicio              TEXT NOT NULL,
    dias                INTEGER NOT NULL,
    obs                 TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL,
    criada_em           TEXT NOT NULL,
    decidida_em         TEXT NOT NULL DEFAULT '',
    motivo              TEXT NOT NULL DEFAULT '',
    periodo_aquisitivo  TEXT NOT NULL DEFAULT ''
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
  ler: (k, padrao) => { const r = cfgLer.get(k); return r ? r.valor : padrao; },
  gravar: (k, v) => cfgGravar.run(k, String(v))
};

/* ------------------------------------------------------------------ senha */
function hashPin(pin, sal){
  return crypto.scryptSync(String(pin), sal, 32).toString('hex');
}
function definirPin(pin){
  const sal = crypto.randomBytes(16).toString('hex');
  config.gravar('pin_sal', sal);
  config.gravar('pin_hash', hashPin(pin, sal));
}
function conferePin(pin){
  const sal = config.ler('pin_sal'), esperado = config.ler('pin_hash');
  if(!sal || !esperado) return false;
  const obtido = hashPin(pin, sal);
  const a = Buffer.from(obtido, 'hex'), b = Buffer.from(esperado, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const sessoes = new Map();                 // token -> validade (ms)
const VALIDADE = 12 * 60 * 60 * 1000;
function novaSessao(){
  const token = crypto.randomBytes(24).toString('hex');
  sessoes.set(token, Date.now() + VALIDADE);
  return token;
}
function ehGestor(req){
  const token = req.headers['x-ferias-token'];
  if(!token) return false;
  const ate = sessoes.get(token);
  if(!ate) return false;
  if(ate < Date.now()){ sessoes.delete(token); return false; }
  return true;
}
setInterval(() => {
  const agora = Date.now();
  for(const [t, ate] of sessoes) if(ate < agora) sessoes.delete(t);
}, 10 * 60 * 1000).unref();

const tentativas = new Map();              // ip -> { n, ate }
function bloqueado(ip){
  const t = tentativas.get(ip);
  return !!(t && t.n >= 10 && t.ate > Date.now());
}
function errou(ip){
  const t = tentativas.get(ip) || { n:0, ate:0 };
  t.n++;
  t.ate = Date.now() + 5 * 60 * 1000;
  tentativas.set(ip, t);
}

/* ------------------------------------------------------------------ dados */
const q = {
  funcionarios: db.prepare(`SELECT id, nome, cargo, setor, admissao,
                                   dias_direito AS diasDireito, ativo
                            FROM funcionarios ORDER BY nome`),
  funcionario: db.prepare('SELECT id, nome, cargo, setor, admissao, dias_direito AS diasDireito, ativo FROM funcionarios WHERE id = ?'),
  gravarFunc: db.prepare(`INSERT INTO funcionarios (id, nome, cargo, setor, admissao, dias_direito, ativo, criado_em)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                          ON CONFLICT(id) DO UPDATE SET
                            nome = excluded.nome, cargo = excluded.cargo, setor = excluded.setor,
                            admissao = excluded.admissao, dias_direito = excluded.dias_direito, ativo = excluded.ativo`),
  apagarFunc: db.prepare('DELETE FROM funcionarios WHERE id = ?'),
  solicitacoes: db.prepare(`SELECT s.id, s.funcionario_id AS funcionarioId, s.inicio, s.dias, s.obs, s.status,
                                   s.criada_em AS criadaEm, s.decidida_em AS decididaEm, s.motivo,
                                   s.periodo_aquisitivo AS periodoAquisitivo,
                                   f.nome, f.setor
                            FROM solicitacoes s LEFT JOIN funcionarios f ON f.id = s.funcionario_id
                            ORDER BY s.inicio`),
  solicitacao: db.prepare('SELECT * FROM solicitacoes WHERE id = ?'),
  criarSol: db.prepare(`INSERT INTO solicitacoes (id, funcionario_id, inicio, dias, obs, status, criada_em, decidida_em, motivo, periodo_aquisitivo)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  decidirSol: db.prepare('UPDATE solicitacoes SET status = ?, motivo = ?, decidida_em = ? WHERE id = ?'),
  apagarSol: db.prepare('DELETE FROM solicitacoes WHERE id = ?')
};

const todosFuncionarios = () => q.funcionarios.all().map(f => ({ ...f, ativo: !!f.ativo }));
const todasSolicitacoes = () => q.solicitacoes.all().map(s => ({ ...s, nome: s.nome || '(funcionário removido)', setor: s.setor || '' }));
const ativasDe = (id, todas) => todas.filter(s => s.funcionarioId === id && (s.status === 'pendente' || s.status === 'aprovada'));

function uid(){ return crypto.randomBytes(9).toString('hex'); }
function texto(v, max){ return String(v == null ? '' : v).trim().slice(0, max); }

/* ------------------------------------------------------------------- HTTP */
function json(res, codigo, corpo){
  const dado = JSON.stringify(corpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(dado);
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
  const url = new URL(req.url, 'http://local');
  const rota = url.pathname;
  const ip = req.socket.remoteAddress || '?';

  try{
    /* ---------- arquivos ---------- */
    if(req.method === 'GET'){
      if(rota === '/' || rota === '/index.html') return servirArquivo(res, 'index.html');
      if(rota === '/regras.js') return servirArquivo(res, 'regras.js');
    }

    /* ---------- estado ---------- */
    if(rota === '/api/estado' && req.method === 'GET'){
      return json(res, 200, {
        funcionarios: todosFuncionarios(),
        solicitacoes: todasSolicitacoes(),
        empresa: config.ler('empresa', ''),
        temPin: !!config.ler('pin_hash'),
        gestor: ehGestor(req)
      });
    }

    /* ---------- entrar na gestão ---------- */
    if(rota === '/api/pin' && req.method === 'POST'){
      const corpo = await lerCorpo(req);
      const pin = String(corpo.pin || '');
      if(pin.length < 4) return json(res, 400, { erro:'O PIN precisa de pelo menos 4 caracteres.' });
      if(!config.ler('pin_hash')){
        definirPin(pin);
        return json(res, 200, { token: novaSessao(), definido: true });
      }
      if(bloqueado(ip)) return json(res, 429, { erro:'Muitas tentativas erradas. Espere 5 minutos.' });
      if(!conferePin(pin)){ errou(ip); return json(res, 401, { erro:'PIN incorreto.' }); }
      tentativas.delete(ip);
      return json(res, 200, { token: novaSessao() });
    }

    if(rota === '/api/pin/trocar' && req.method === 'POST'){
      if(!ehGestor(req)) return json(res, 401, { erro:'Entre na área do RH antes.' });
      const corpo = await lerCorpo(req);
      if(!conferePin(String(corpo.atual || ''))) return json(res, 401, { erro:'O PIN atual não confere.' });
      const novo = String(corpo.novo || '');
      if(novo.length < 4) return json(res, 400, { erro:'O novo PIN precisa de pelo menos 4 caracteres.' });
      definirPin(novo);
      return json(res, 200, { ok:true });
    }

    /* ---------- solicitação do funcionário ---------- */
    if(rota === '/api/solicitacoes' && req.method === 'POST'){
      const corpo = await lerCorpo(req);
      const func = q.funcionario.get(String(corpo.funcionarioId || ''));
      if(!func || !func.ativo) return json(res, 400, { erro:'Funcionário não encontrado.' });

      const todas = todasSolicitacoes();
      const pedido = { id:null, inicio: texto(corpo.inicio, 10), dias: Math.trunc(Number(corpo.dias) || 0) };
      const R = Regras.validar(func, pedido, ativasDe(func.id, todas), todosFuncionarios(), todas);
      if(R.erros.length) return json(res, 400, { erro: R.erros[0].t, erros: R.erros });

      const reg = {
        id: uid(),
        inicio: pedido.inicio,
        dias: pedido.dias,
        obs: texto(corpo.obs, 500),
        periodoAquisitivo: R.slot ? Regras.fmt(R.slot.p.ini) + ' a ' + Regras.fmt(R.slot.p.fim) : ''
      };
      q.criarSol.run(reg.id, func.id, reg.inicio, reg.dias, reg.obs, 'pendente', new Date().toISOString(), '', '', reg.periodoAquisitivo);
      return json(res, 200, { id: reg.id });
    }

    const mSol = rota.match(/^\/api\/solicitacoes\/([a-f0-9]{18})(\/cancelar|\/decisao)?$/);
    if(mSol){
      const id = mSol[1], acao = mSol[2] || '';
      const atual = q.solicitacao.get(id);
      if(!atual) return json(res, 404, { erro:'Solicitação não encontrada.' });

      /* o próprio funcionário cancela um pedido ainda pendente */
      if(acao === '/cancelar' && req.method === 'POST'){
        const corpo = await lerCorpo(req);
        if(corpo.funcionarioId !== atual.funcionario_id) return json(res, 403, { erro:'Este pedido é de outra pessoa.' });
        if(atual.status !== 'pendente') return json(res, 400, { erro:'Só dá para cancelar um pedido que ainda está pendente.' });
        q.decidirSol.run('cancelada', '', new Date().toISOString(), id);
        return json(res, 200, { ok:true });
      }

      if(!ehGestor(req)) return json(res, 401, { erro:'Entre na área do RH antes.' });

      if(acao === '/decisao' && req.method === 'POST'){
        const corpo = await lerCorpo(req);
        const status = corpo.status === 'aprovada' ? 'aprovada' : corpo.status === 'recusada' ? 'recusada' : null;
        if(!status) return json(res, 400, { erro:'Decisão inválida.' });
        const motivo = texto(corpo.motivo, 300);
        if(status === 'recusada' && !motivo) return json(res, 400, { erro:'Escreva o motivo da recusa.' });
        q.decidirSol.run(status, motivo, new Date().toISOString(), id);
        return json(res, 200, { ok:true });
      }

      if(!acao && req.method === 'DELETE'){
        q.apagarSol.run(id);
        return json(res, 200, { ok:true });
      }
    }

    /* ---------- área do RH ---------- */
    if(rota === '/api/funcionarios' && req.method === 'POST'){
      if(!ehGestor(req)) return json(res, 401, { erro:'Entre na área do RH antes.' });
      const corpo = await lerCorpo(req);
      const nome = texto(corpo.nome, 120);
      const admissao = texto(corpo.admissao, 10);
      if(!nome) return json(res, 400, { erro:'O nome é obrigatório.' });
      if(!Regras.pd(admissao)) return json(res, 400, { erro:'Informe uma data de admissão válida.' });
      if(Regras.pd(admissao) > Regras.hoje()) return json(res, 400, { erro:'A data de admissão não pode estar no futuro.' });
      const dias = Math.trunc(Number(corpo.diasDireito) || 30);
      const id = /^[a-f0-9]{18}$/.test(String(corpo.id || '')) ? corpo.id : uid();
      q.gravarFunc.run(id, nome, texto(corpo.cargo, 80), texto(corpo.setor, 80), admissao,
                       dias >= 1 && dias <= 30 ? dias : 30,
                       corpo.ativo === false ? 0 : 1, new Date().toISOString());
      return json(res, 200, { id });
    }

    const mFunc = rota.match(/^\/api\/funcionarios\/([a-f0-9]{18})$/);
    if(mFunc && req.method === 'DELETE'){
      if(!ehGestor(req)) return json(res, 401, { erro:'Entre na área do RH antes.' });
      q.apagarFunc.run(mFunc[1]);
      return json(res, 200, { ok:true });
    }

    /* ---------- férias já gozadas, lançadas pelo RH ---------- */
    if(rota === '/api/historico' && req.method === 'POST'){
      if(!ehGestor(req)) return json(res, 401, { erro:'Entre na área do RH antes.' });
      const corpo = await lerCorpo(req);
      const func = q.funcionario.get(String(corpo.funcionarioId || ''));
      if(!func) return json(res, 400, { erro:'Funcionário não encontrado.' });
      const inicio = texto(corpo.inicio, 10);
      const dias = Math.trunc(Number(corpo.dias) || 0);
      const dIni = Regras.pd(inicio);
      if(!dIni) return json(res, 400, { erro:'Informe uma data válida.' });
      if(dias < 1 || dias > 30) return json(res, 400, { erro:'Os dias gozados precisam ficar entre 1 e 30.' });
      if(dIni < Regras.pd(func.admissao)) return json(res, 400, { erro:'A data é anterior à admissão.' });
      const alvo = Regras.periodoAlvo(func, ativasDe(func.id, todasSolicitacoes()), dIni);
      const agora = new Date().toISOString();
      q.criarSol.run(uid(), func.id, inicio, dias, 'Lançamento retroativo pelo RH.', 'aprovada', agora, agora, '',
                     alvo.slot ? Regras.fmt(alvo.slot.p.ini) + ' a ' + Regras.fmt(alvo.slot.p.fim) : '');
      return json(res, 200, { ok:true });
    }

    if(rota === '/api/empresa' && req.method === 'POST'){
      if(!ehGestor(req)) return json(res, 401, { erro:'Entre na área do RH antes.' });
      const corpo = await lerCorpo(req);
      config.gravar('empresa', texto(corpo.nome, 120));
      return json(res, 200, { ok:true });
    }

    json(res, 404, { erro:'Rota não encontrada.' });
  }catch(e){
    if(!res.headersSent) json(res, 400, { erro: e.message === 'JSON inválido' || e.message === 'corpo grande demais' ? e.message : 'Erro ao processar o pedido.' });
    if(!['JSON inválido','corpo grande demais'].includes(e.message)) console.error('[erro]', e);
  }
});

if(require.main === module){
  servidor.listen(PORTA, () => {
    console.log('Quadro de Férias no ar em http://localhost:' + PORTA);
    console.log('Banco: ' + path.join(PASTA_DADOS, 'ferias.db'));
    if(!config.ler('pin_hash')) console.log('Nenhum PIN definido ainda — o primeiro que abrir a aba Gestão define o PIN do RH.');
  });
}

module.exports = { servidor, db };

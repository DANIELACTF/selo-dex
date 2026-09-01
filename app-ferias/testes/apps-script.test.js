/* Testes do Codigo.gs (versão Google Apps Script).
   As APIs do Google são simuladas aqui: a planilha vira uma matriz em memória.
   Isso não testa a publicação no Google — testa a lógica que vai rodar lá.
   Uso: node testes/apps-script.test.js */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const pastaGas = path.join(__dirname, '..', 'google-apps-script');

/* ------------------------------------------------- planilha de mentirinha */
function novaAba(nome){
  const celulas = [];
  function garantir(l, c){
    while(celulas.length < l) celulas.push([]);
    const linha = celulas[l-1];
    while(linha.length < c) linha.push('');
  }
  function larguraMax(){ return celulas.reduce((m,l) => Math.max(m, l.length), 0); }

  function faixa(l, c, nl, nc){
    return {
      getValues(){
        const fora = [];
        for(let i = 0; i < nl; i++){
          const linha = [];
          for(let j = 0; j < nc; j++){
            const orig = celulas[l-1+i];
            linha.push(orig && orig[c-1+j] !== undefined ? orig[c-1+j] : '');
          }
          fora.push(linha);
        }
        return fora;
      },
      setValues(v){
        for(let i = 0; i < v.length; i++){
          garantir(l+i, c + v[i].length - 1);
          for(let j = 0; j < v[i].length; j++) celulas[l-1+i][c-1+j] = v[i][j];
        }
        return this;
      },
      setValue(x){ garantir(l, c); celulas[l-1][c-1] = x; return this; },
      setFontWeight(){ return this; },
      setNumberFormat(){ return this; }
    };
  }

  return {
    nome,
    _celulas: celulas,
    getRange(a, b, c, d){
      if(typeof a === 'string') return faixa(1, 1, Math.max(celulas.length,1), Math.max(larguraMax(),1));
      return faixa(a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    },
    getDataRange(){ return faixa(1, 1, Math.max(celulas.length,1), Math.max(larguraMax(),1)); },
    getLastRow(){ return celulas.length; },
    appendRow(v){ celulas.push(v.slice()); },
    deleteRow(l){ celulas.splice(l-1, 1); },
    setFrozenRows(){}, hideColumns(){}
  };
}

const abas = {};
const SpreadsheetApp = {
  getActive(){
    return {
      getSheetByName: n => abas[n] || null,
      insertSheet(n){ abas[n] = novaAba(n); return abas[n]; },
      getUrl: () => 'https://docs.google.com/spreadsheets/d/FAKE/edit'
    };
  },
  getUi(){ return { createMenu(){ return { addItem(){ return this; }, addToUi(){} }; } }; }
};

const guardados = {};
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (k in guardados ? guardados[k] : null),
    setProperty: (k,v) => { guardados[k] = String(v); }
  })
};

let contadorUuid = 0;
const Utilities = {
  getUuid(){ return 'uuid' + (++contadorUuid).toString().padStart(4,'0') + '-aaaa-bbbb-cccc-' + Date.now().toString(16); },
  DigestAlgorithm: { SHA_256:'SHA_256' },
  Charset: { UTF_8:'UTF_8' },
  computeDigest(_algo, texto){
    const buf = crypto.createHash('sha256').update(texto, 'utf8').digest();
    return Array.from(buf).map(b => (b > 127 ? b - 256 : b));   // o Apps Script devolve bytes com sinal
  }
};

const LockService = { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) };

const HtmlService = {
  createHtmlOutputFromFile(nome){
    const conteudo = fs.readFileSync(path.join(pastaGas, nome + '.html'), 'utf8');
    return { getContent: () => conteudo };
  },
  createTemplateFromFile(){ return { evaluate: () => ({ setTitle(){ return this; }, addMetaTag(){ return this; } }) }; }
};

/* ------------------------------------------------------------- carrega o .gs */
const contexto = vm.createContext({ SpreadsheetApp, PropertiesService, Utilities, LockService, HtmlService, console });
vm.runInContext(fs.readFileSync(path.join(pastaGas, 'Codigo.gs'), 'utf8'), contexto, { filename:'Codigo.gs' });
const G = new Proxy({}, { get: (_, nome) => contexto[nome] });

/* ------------------------------------------------------------------ testes */
let testes = 0, falhas = 0;
function ok(cond, nome, extra){
  testes++;
  if(!cond){ falhas++; console.log('  FALHOU: ' + nome + (extra ? '  -> ' + extra : '')); }
}
function recusa(fn, trecho, nome){
  testes++;
  try{ fn(); falhas++; console.log('  FALHOU: ' + nome + '  -> não recusou'); }
  catch(e){
    if(trecho && !new RegExp(trecho, 'i').test(e.message)){
      falhas++; console.log('  FALHOU: ' + nome + '  -> mensagem inesperada: ' + e.message);
    }
  }
}

/* --- estado inicial e criação das abas --- */
let estado = G.carregarEstado('');
ok(estado.temPin === false && estado.gestor === false, 'começa sem PIN e sem sessão');
ok(estado.funcionarios.length === 0 && estado.solicitacoes.length === 0, 'começa sem dados');
ok(!!abas['Funcionários'] && !!abas['Solicitações'] && !!abas['Ajustes'], 'cria as três abas sozinho');
ok(abas['Solicitações']._celulas[0][0] === 'ID' && abas['Solicitações']._celulas[0][3] === 'Período', 'cabeçalho legível na aba de solicitações',
   JSON.stringify(abas['Solicitações']._celulas[0]));

/* --- as regras vêm do mesmo arquivo da tela --- */
ok(G.motor().fmt(G.motor().pascoa(2026)) === '05/04/2026', 'servidor carrega o motor de regras do regras_js.html');

/* --- proteção antes de entrar --- */
recusa(() => G.salvarFuncionario('', { nome:'Intruso', admissao:'2020-01-02' }), 'sessão', 'cadastrar exige sessão do RH');
recusa(() => G.decidirSolicitacao('', 'x', 'aprovada', ''), 'sessão', 'aprovar exige sessão do RH');
recusa(() => G.linkDaPlanilha('token-falso'), 'sessão', 'link da planilha exige sessão do RH');

/* --- PIN --- */
recusa(() => G.entrarGestao('123'), 'pelo menos 4', 'PIN curto é recusado');
let entrada = G.entrarGestao('2468');
ok(entrada.definido === true && entrada.token, 'primeiro acesso define o PIN');
const token = entrada.token;
recusa(() => G.entrarGestao('0000'), 'incorreto', 'PIN errado é recusado');
ok(G.entrarGestao('2468').definido === false, 'PIN certo entra sem redefinir');
ok(G.carregarEstado(token).gestor === true, 'sessão válida é reconhecida');
ok(G.carregarEstado('outro').gestor === false, 'token inventado não vale');

/* --- cadastro --- */
ok(G.salvarFuncionario(token, { nome:'Ana Souza Lima', cargo:'Analista fiscal', setor:'Fiscal', admissao:'2025-03-11' }).ok, 'cadastra funcionário');
ok(G.salvarFuncionario(token, { nome:'Carla Monteiro', setor:'Fiscal', admissao:'2022-04-01' }).ok, 'cadastra segundo funcionário');
recusa(() => G.salvarFuncionario(token, { nome:'Sem data' }), 'admissão válida', 'exige data de admissão');
recusa(() => G.salvarFuncionario(token, { nome:'Futuro', admissao:'2030-01-02' }), 'futuro', 'recusa admissão no futuro');
estado = G.carregarEstado(token);
ok(estado.funcionarios.length === 2, 'dois funcionários gravados');
const ana = estado.funcionarios.filter(f => f.nome === 'Ana Souza Lima')[0];
const carla = estado.funcionarios.filter(f => f.nome === 'Carla Monteiro')[0];
ok(ana.admissao === '2025-03-11' && ana.diasDireito === 30 && ana.ativo === true, 'lê o funcionário de volta certo', JSON.stringify(ana));

/* --- o servidor refaz a conferência da CLT --- */
recusa(() => G.enviarSolicitacao({ funcionarioId: ana.id, inicio:'2026-10-09', dias:20 }), 'sexta', 'recusa início na sexta');
recusa(() => G.enviarSolicitacao({ funcionarioId: ana.id, inicio:'2026-10-05', dias:45 }), 'não pode passar de 30', 'recusa mais de 30 dias');
recusa(() => G.enviarSolicitacao({ funcionarioId:'nao-existe', inicio:'2026-10-05', dias:10 }), 'não encontrado', 'recusa funcionário inexistente');

/* --- pedido válido, sem sessão de RH --- */
ok(G.enviarSolicitacao({ funcionarioId: ana.id, inicio:'2026-10-05', dias:20, obs:'Viagem marcada.' }).ok, 'funcionário envia pedido sem login');
estado = G.carregarEstado('');
const pedido = estado.solicitacoes[0];
ok(estado.solicitacoes.length === 1 && pedido.status === 'pendente', 'pedido entra como pendente');
ok(pedido.nome === 'Ana Souza Lima' && pedido.inicio === '2026-10-05' && pedido.dias === 20, 'pedido gravado com nome e datas', JSON.stringify(pedido));
ok(pedido.periodoAquisitivo === '11/03/2025 a 10/03/2026', 'período aquisitivo calculado no servidor', pedido.periodoAquisitivo);
const linhaPedido = abas['Solicitações']._celulas[1];
ok(linhaPedido[3] === '05/10/2026 a 24/10/2026', 'planilha mostra o período em português', String(linhaPedido[3]));

/* --- saldo --- */
recusa(() => G.enviarSolicitacao({ funcionarioId: ana.id, inicio:'2026-12-07', dias:15 }), 'Saldo insuficiente', 'segundo pedido acima do saldo é recusado');
ok(G.enviarSolicitacao({ funcionarioId: ana.id, inicio:'2026-12-07', dias:10 }).ok, 'segundo pedido dentro do saldo passa');

/* --- decisão --- */
recusa(() => G.decidirSolicitacao(token, pedido.id, 'recusada', ''), 'motivo', 'recusar sem motivo é bloqueado');
recusa(() => G.decidirSolicitacao(token, pedido.id, 'talvez', ''), 'inválida', 'decisão inventada é bloqueada');
ok(G.decidirSolicitacao(token, pedido.id, 'aprovada', '').ok, 'RH aprova');
ok(G.carregarEstado('').solicitacoes.filter(s => s.id === pedido.id)[0].status === 'aprovada', 'situação virou aprovada');

/* --- cancelamento pelo funcionário --- */
G.enviarSolicitacao({ funcionarioId: carla.id, inicio:'2027-02-01', dias:20 });
const daCarla = G.carregarEstado('').solicitacoes.filter(s => s.funcionarioId === carla.id)[0];
recusa(() => G.cancelarSolicitacao(daCarla.id, ana.id), 'outra pessoa', 'ninguém cancela pedido alheio');
ok(G.cancelarSolicitacao(daCarla.id, carla.id).ok, 'funcionário cancela o próprio pedido');
recusa(() => G.cancelarSolicitacao(daCarla.id, carla.id), 'pendente', 'não cancela duas vezes');
recusa(() => G.cancelarSolicitacao(pedido.id, ana.id), 'pendente', 'não cancela pedido já aprovado');

/* --- histórico --- */
recusa(() => G.lancarHistorico('', { funcionarioId: carla.id, inicio:'2023-05-08', dias:30 }), 'sessão', 'histórico exige sessão');
ok(G.lancarHistorico(token, { funcionarioId: carla.id, inicio:'2023-05-08', dias:30 }).ok, 'RH lança férias já gozadas');
recusa(() => G.lancarHistorico(token, { funcionarioId: carla.id, inicio:'2019-01-02', dias:30 }), 'anterior à admissão', 'histórico antes da admissão é recusado');

/* --- editar funcionário atualiza o nome nos pedidos já gravados --- */
G.salvarFuncionario(token, { id: ana.id, nome:'Ana Souza Lima Rocha', cargo:'Analista fiscal', setor:'Contábil', admissao:'2025-03-11' });
estado = G.carregarEstado('');
ok(estado.funcionarios.filter(f => f.id === ana.id)[0].nome === 'Ana Souza Lima Rocha', 'nome atualizado no cadastro');
ok(estado.solicitacoes.filter(s => s.funcionarioId === ana.id).every(s => s.nome === 'Ana Souza Lima Rocha' && s.setor === 'Contábil'),
   'nome e setor atualizados nos pedidos já gravados');
ok(estado.funcionarios.length === 2, 'editar não duplica o funcionário');

/* --- planilha devolve Date em vez de texto --- */
abas['Funcionários']._celulas[1][4] = new Date(2025, 2, 11);
ok(G.carregarEstado('').funcionarios.filter(f => f.id === ana.id)[0].admissao === '2025-03-11',
   'converte data devolvida como Date pelo Sheets');

/* --- ajustes e PIN --- */
ok(G.salvarEmpresa(token, 'Contabilidade Selo Ltda').ok, 'grava o nome da empresa');
ok(G.carregarEstado('').empresa === 'Contabilidade Selo Ltda', 'nome da empresa volta no estado');
ok(/docs\.google\.com/.test(G.linkDaPlanilha(token).url), 'devolve o link da planilha para o RH');
recusa(() => G.trocarPin(token, 'errado', '9876'), 'não confere', 'trocar PIN exige o PIN atual');
recusa(() => G.trocarPin(token, '2468', '12'), 'pelo menos 4', 'novo PIN curto é recusado');
ok(G.trocarPin(token, '2468', '9876').ok, 'troca o PIN');
ok(G.entrarGestao('9876').definido === false, 'entra com o PIN novo');
recusa(() => G.entrarGestao('2468'), 'incorreto', 'PIN antigo não vale mais');

/* --- exclusão e remoção --- */
const antes = G.carregarEstado('').solicitacoes.length;
ok(G.excluirSolicitacao(token, daCarla.id).ok, 'RH exclui registro');
ok(G.carregarEstado('').solicitacoes.length === antes - 1, 'registro sumiu da planilha');
recusa(() => G.excluirSolicitacao(token, 'nao-existe'), 'não encontrada', 'excluir inexistente avisa');
ok(G.removerFuncionario(token, carla.id).ok, 'RH remove funcionário');
ok(G.carregarEstado('').funcionarios.length === 1, 'funcionário sumiu do cadastro');

console.log((falhas ? '\n' : '') + testes + ' testes do Apps Script, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);

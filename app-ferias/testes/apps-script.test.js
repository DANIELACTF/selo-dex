/* Testes do Codigo.gs (versão Google Apps Script).
   As APIs do Google são simuladas aqui: a planilha vira uma matriz em memória.
   Isso não testa a publicação no Google — testa a lógica que vai rodar lá.
   Uso: node testes/apps-script.test.js */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const D = require('./datas.js');

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
let respostaDaJanela = 'YES';          // o que o usuário clica na confirmação do menu
const janelasVistas = [];
const SpreadsheetApp = {
  getActive(){
    return {
      getSheetByName: n => abas[n] || null,
      insertSheet(n){ abas[n] = novaAba(n); return abas[n]; },
      getUrl: () => 'https://docs.google.com/spreadsheets/d/FAKE/edit'
    };
  },
  getUi(){
    return {
      createMenu(){ return { addItem(){ return this; }, addToUi(){} }; },
      alert(titulo, texto, botoes){ janelasVistas.push({ titulo, texto, botoes }); return respostaDaJanela; },
      ButtonSet: { YES_NO:'YES_NO', OK:'OK' },
      Button: { YES:'YES', NO:'NO', OK:'OK' }
    };
  }
};

const guardados = {};
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (k in guardados ? guardados[k] : null),
    setProperty: (k,v) => { guardados[k] = String(v); },
    getProperties: () => Object.assign({}, guardados),
    deleteProperty: k => { delete guardados[k]; }
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
const estado = t => G.carregarEstado(t || '');
const acharSol = (t, id) => estado(t).solicitacoes.filter(s => s.id === id)[0];

/* --- estado inicial e criação das abas --- */
let e = estado();
ok(e.configurado === false && e.papel === '', 'começa sem PIN e sem sessão');
ok(!!abas['Funcionários'] && !!abas['Solicitações'] && !!abas['Ajustes'], 'cria as três abas sozinho');
ok(abas['Funcionários']._celulas[0].join() === 'ID,Nome,Cargo,Setor,Ativo',
   'cadastro sem coluna de admissão', abas['Funcionários']._celulas[0].join());
ok(abas['Solicitações']._celulas[0][3] === 'Período' && abas['Solicitações']._celulas[0][7] === 'Autorizada por',
   'cabeçalho legível, com uma coluna de autorização', JSON.stringify(abas['Solicitações']._celulas[0].slice(0,10)));
ok(abas['Solicitações']._celulas[0].indexOf('Diretor') < 0 && abas['Solicitações']._celulas[0].indexOf('Departamento pessoal') < 0,
   'sem colunas de diretor e departamento pessoal');
ok(G.motor().fmt(G.motor().pascoa(2026)) === '05/04/2026', 'servidor carrega o motor de regras do regras_js.html');
ok(G.motor().periodos === undefined, 'o motor não tem mais cálculo de período aquisitivo');
ok(G.motor().PAPEIS.length === 1 && G.motor().PAPEIS[0].chave === 'gestor', 'só o gestor autoriza');

/* --- proteção antes de configurar --- */
recusa(() => G.entrarGestao('2468'), 'ainda não foi definido', 'não dá para entrar antes de definir o PIN');
recusa(() => G.salvarFuncionario('', { nome:'Intruso' }), 'sessão', 'cadastrar exige sessão');

/* --- definir o PIN --- */
const setup = pin => ({ gestor:{ nome:'Paulo Ribeiro', pin } });
recusa(() => G.configurarPins(setup('123')), 'pelo menos 4', 'PIN curto é recusado');
recusa(() => G.configurarPins({ gestor:{ nome:'', pin:'1111' } }), 'nome', 'exige o nome de quem autoriza');
const inicial = G.configurarPins(setup('1111'));
ok(inicial.papel === 'gestor' && inicial.token, 'define o PIN e entra como gestor');
const tk = inicial.token;
recusa(() => G.configurarPins(setup('7777')), 'já foi definido', 'não configura duas vezes');

/* --- entrar --- */
let ent = G.entrarGestao('1111');
ok(ent.papel === 'gestor' && ent.nome === 'Paulo Ribeiro', 'entra com o PIN do gestor', JSON.stringify(ent));
recusa(() => G.entrarGestao('0000'), 'incorreto', 'PIN errado é recusado');
ok(estado(tk).papel === 'gestor', 'sessão é reconhecida');
ok(estado('inventado').papel === '', 'token inventado não vale');

/* --- cadastro sem data de admissão --- */
ok(G.salvarFuncionario(tk, { nome:'Ana Souza Lima', cargo:'Analista fiscal', setor:'Fiscal' }).ok, 'cadastra funcionário');
ok(G.salvarFuncionario(tk, { nome:'Carla Monteiro', setor:'Fiscal' }).ok, 'cadastra segundo funcionário');
recusa(() => G.salvarFuncionario(tk, { nome:'' }), 'obrigatório', 'nome é obrigatório');
ok(G.salvarFuncionario(tk, { nome:'Com admissão', setor:'Fiscal', admissao:'2026-02-30' }).ok,
   'data de admissão enviada por engano é ignorada');
e = estado(tk);
ok(e.funcionarios.every(f => f.admissao === undefined), 'o cadastro não guarda mais admissão',
   JSON.stringify(Object.keys(e.funcionarios[0])));
const ana = e.funcionarios.filter(f => f.nome === 'Ana Souza Lima')[0];
const carla = e.funcionarios.filter(f => f.nome === 'Carla Monteiro')[0];
ok(ana && ana.setor === 'Fiscal' && ana.ativo === true, 'lê o funcionário de volta certo', JSON.stringify(ana));

/* --- o servidor refaz a conferência --- */
recusa(() => G.enviarSolicitacao({ funcionarioId: ana.id, inicio:D.SEX, dias:20 }), 'sexta', 'recusa início na sexta');
recusa(() => G.enviarSolicitacao({ funcionarioId: ana.id, inicio:D.SEG, dias:45 }), 'não pode passar de 30', 'recusa mais de 30 dias');
recusa(() => G.enviarSolicitacao({ funcionarioId:'nada', inicio:D.SEG, dias:10 }), 'não encontrado', 'recusa funcionário inexistente');

/* --- pedido válido, sem login --- */
ok(G.enviarSolicitacao({ funcionarioId: ana.id, inicio:D.SEG, dias:20, obs:'Viagem marcada.' }).ok, 'funcionário envia pedido sem login');
let sol = estado().solicitacoes[0];
ok(sol.status === 'pendente' && sol.nome === 'Ana Souza Lima' && sol.inicio === D.SEG && sol.dias === 20,
   'pedido gravado com nome e datas', JSON.stringify(sol));
ok(!sol.aut_gestor, 'nasce sem assinatura');
const linha = abas['Solicitações']._celulas[1];
ok(linha[3] === D.dia(D.SEG) + ' a ' + D.fim(D.SEG, 20) && linha[5] === D.retorno(D.SEG, 20),
   'planilha mostra período e retorno em português', String(linha[3]) + ' / ' + String(linha[5]));
ok(G.enviarSolicitacao({ funcionarioId: ana.id, inicio:D.SEG_LONGE, dias:30 }).ok, 'segundo período longo é aceito');

/* --- uma assinatura basta --- */
recusa(() => G.autorizarSolicitacao('', sol.id), 'sessão', 'autorizar exige sessão');
ok(G.autorizarSolicitacao(tk, sol.id).ok, 'gestor autoriza');
sol = acharSol('', sol.id);
ok(sol.status === 'autorizada', 'uma assinatura já autoriza', sol.status);
ok(sol.aut_gestor_nome === 'Paulo Ribeiro' && !!sol.aut_gestor, 'guarda nome e data de quem assinou',
   JSON.stringify({ n:sol.aut_gestor_nome, d:!!sol.aut_gestor }));
ok(/^\d{2}\/\d{2}\/\d{4}$/.test(String(abas['Solicitações']._celulas[1][8])),
   'planilha mostra a data da autorização em português', String(abas['Solicitações']._celulas[1][8]));
recusa(() => G.autorizarSolicitacao(tk, sol.id), 'não está mais em análise', 'não autoriza o que já está autorizado');

/* --- recusa --- */
G.enviarSolicitacao({ funcionarioId: carla.id, inicio:D.SEG_MAIS_7, dias:20 });
let daCarla = estado().solicitacoes.filter(s => s.funcionarioId === carla.id)[0];
recusa(() => G.recusarSolicitacao(tk, daCarla.id, ''), 'motivo', 'recusar sem motivo é bloqueado');
ok(G.recusarSolicitacao(tk, daCarla.id, 'Setor descoberto.').ok, 'gestor recusa');
daCarla = acharSol('', daCarla.id);
ok(daCarla.status === 'recusada' && daCarla.recusadaPor === 'Paulo Ribeiro', 'registra quem recusou', daCarla.recusadaPor);
recusa(() => G.autorizarSolicitacao(tk, daCarla.id), 'não está mais em análise', 'não autoriza pedido recusado');

/* --- cancelamento pelo funcionário --- */
G.enviarSolicitacao({ funcionarioId: carla.id, inicio:D.SEG_LONGE, dias:10 });
let outra = estado().solicitacoes.filter(s => s.funcionarioId === carla.id && s.status === 'pendente')[0];
recusa(() => G.cancelarSolicitacao(outra.id, ana.id, ''), 'outra pessoa', 'ninguém cancela pedido alheio');
ok(G.cancelarSolicitacao(outra.id, carla.id, '').ok, 'funcionário cancela o próprio pedido');
recusa(() => G.cancelarSolicitacao(outra.id, carla.id, ''), 'em análise', 'não cancela duas vezes');
recusa(() => G.cancelarSolicitacao(sol.id, ana.id, ''), 'em análise', 'não cancela pedido já autorizado');

/* --- histórico --- */
recusa(() => G.lancarHistorico('', { funcionarioId: carla.id, inicio:D.PASSADO, dias:30 }), 'sessão', 'histórico exige sessão');
ok(G.lancarHistorico(tk, { funcionarioId: carla.id, inicio:D.PASSADO, dias:30 }).ok, 'gestor lança férias já combinadas');
const lancada = estado().solicitacoes.filter(s => s.obs.indexOf('Lançado') === 0)[0];
ok(lancada && lancada.status === 'autorizada' && lancada.aut_gestor_nome === 'Paulo Ribeiro', 'lançamento entra já assinado');

/* --- editar funcionário atualiza os pedidos já gravados --- */
G.salvarFuncionario(tk, { id: ana.id, nome:'Ana Souza Lima Rocha', setor:'Contábil' });
e = estado(tk);
ok(e.funcionarios.filter(f => f.id === ana.id)[0].nome === 'Ana Souza Lima Rocha', 'nome atualizado no cadastro');
ok(e.solicitacoes.filter(s => s.funcionarioId === ana.id).every(s => s.nome === 'Ana Souza Lima Rocha' && s.setor === 'Contábil'),
   'nome e setor atualizados nos pedidos já gravados');
ok(e.funcionarios.filter(f => f.id === ana.id).length === 1, 'editar não duplica o funcionário');

/* --- planilha devolvendo Date em vez de texto --- */
const comoData = D.SEG.split('-').map(Number);
abas['Solicitações']._celulas[1][13] = new Date(comoData[0], comoData[1] - 1, comoData[2]);
ok(estado().solicitacoes.filter(s => s.id === sol.id)[0].inicio === D.SEG, 'converte data devolvida como Date pelo Sheets');

/* --- ajustes e PIN --- */
ok(G.salvarEmpresa(tk, 'Contabilidade Selo Ltda').ok, 'grava o nome da empresa');
ok(estado().empresa === 'Contabilidade Selo Ltda', 'nome da empresa volta no estado');
ok(estado().nomes.gestor === 'Paulo Ribeiro', 'nome do gestor volta no estado');
ok(/docs\.google\.com/.test(G.linkDaPlanilha(tk).url), 'devolve o link da planilha');
recusa(() => G.trocarPins('', { gestor:{ nome:'X' } }), 'sessão', 'trocar PIN exige sessão');
recusa(() => G.trocarPins(tk, { gestor:{ pin:'12' } }), 'pelo menos 4', 'PIN novo curto é recusado');
ok(G.trocarPins(tk, { gestor:{ nome:'Paulo R. Ribeiro', pin:'8888' } }).trocados === 1, 'troca nome e PIN');
ok(G.entrarGestao('8888').papel === 'gestor', 'entra com o PIN novo');
recusa(() => G.entrarGestao('1111'), 'incorreto', 'o PIN antigo não vale mais');
ok(estado().nomes.gestor === 'Paulo R. Ribeiro', 'nome do gestor atualizado');

/* --- exclusão --- */
recusa(() => G.excluirSolicitacao('', daCarla.id), 'sessão', 'excluir exige sessão');
const antes = estado().solicitacoes.length;
ok(G.excluirSolicitacao(tk, daCarla.id).ok, 'gestor exclui registro');
ok(estado().solicitacoes.length === antes - 1, 'registro sumiu da planilha');
recusa(() => G.excluirSolicitacao(tk, 'nao-existe'), 'não encontrada', 'excluir inexistente avisa');
ok(G.removerFuncionario(tk, carla.id).ok, 'gestor remove funcionário');

/* --- esqueci o PIN --- */
ok(typeof G.redefinirPIN === 'function', 'existe a função de redefinir o PIN para o menu da planilha');
ok(estado().configurado === true, 'antes de redefinir, o PIN está definido');

janelasVistas.length = 0;
respostaDaJanela = 'NO';
G.redefinirPIN();
ok(estado().configurado === true, 'cancelar na confirmação não apaga o PIN');
ok(janelasVistas.length === 1 && /não são afetadas/.test(janelasVistas[0].texto),
   'a confirmação avisa que os dados não são afetados');

janelasVistas.length = 0;
respostaDaJanela = 'YES';
const equipeAntes = estado().funcionarios.length;
const pedidosAntes = estado().solicitacoes.length;
G.redefinirPIN();
ok(estado().configurado === false, 'confirmar apaga o PIN');
ok(estado('nao-importa').papel === '' && estado(tk).papel === '', 'quem estava logado é derrubado');
recusa(() => G.entrarGestao('8888'), 'ainda não foi definido', 'o PIN antigo não entra mais');
ok(estado().funcionarios.length === equipeAntes, 'a equipe continua cadastrada', estado().funcionarios.length + ' de ' + equipeAntes);
ok(estado().solicitacoes.length === pedidosAntes, 'as solicitações continuam na planilha');
ok(janelasVistas.length === 2 && /PIN apagado/.test(janelasVistas[1].titulo), 'avisa que foi apagado e o que fazer agora');

const novo = G.configurarPins({ gestor:{ nome:'Daniela Carvalho', pin:'4321' } });
ok(novo.papel === 'gestor' && novo.token, 'dá para definir um PIN novo depois de redefinir');
ok(G.entrarGestao('4321').papel === 'gestor', 'entra com o PIN novo');
ok(estado(novo.token).funcionarios.length === equipeAntes, 'a equipe continua lá com o PIN novo');

console.log((falhas ? '\n' : '') + testes + ' testes do Apps Script, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);

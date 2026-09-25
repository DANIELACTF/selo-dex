// Testes do Codigo.gs com a planilha simulada.
// Executar: node simulador-ibs-cbs/web-app/testes/codigo.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { criarAmbiente } = require('./planilha-falsa');

function carregar(){
  const amb = criarAmbiente();
  const ctx = vm.createContext(Object.assign({}, amb));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Codigo.gs'), 'utf8'), ctx);
  return { ctx, amb };
}

let n = 0;
function ok(cond, msg){ n++; assert.ok(cond, msg); }

// Estado vazio
let { ctx, amb } = carregar();
ok(ctx.carregarEstado().simulacoes.length === 0, 'começa sem simulações');
ok(amb.planilha.getSheetByName('Simulações'), 'cria a aba Simulações');

// Salvar e abrir
const estado = { parametros: { empresa: 'ACME', regime: 'presumido' }, operacoes: [{ tipo: 'venda', valor: 10 }], cronoEditado: false };
let r = ctx.salvarSimulacao({ nome: 'Base', estado });
ok(r.id && r.simulacoes.length === 1, 'salva a primeira');
ok(r.simulacoes[0].regime === 'Lucro Presumido' && r.simulacoes[0].empresa === 'ACME', 'guarda empresa e regime');
let aberta = ctx.abrirSimulacao(r.id);
ok(JSON.stringify(aberta.estado) === JSON.stringify(estado), 'abre o mesmo estado');
ok(aberta.nome === 'Base', 'devolve o nome');

// Mesmo nome grava por cima
const id1 = r.id;
r = ctx.salvarSimulacao({ nome: 'base', estado: Object.assign({}, estado, { operacoes: [] }) });
ok(r.simulacoes.length === 1 && r.id === id1, 'mesmo nome sobrescreve');
ok(ctx.abrirSimulacao(id1).estado.operacoes.length === 0, 'conteúdo foi trocado');

// Estado grande, com espaços nas emendas dos pedaços e texto que parece fórmula
const muitas = [];
for(let i = 0; i < 700; i++) muitas.push({ tipo: 'compra', descricao: '=SOMA(A1) item ' + i + '   com espaços   ', valor: i + 0.5 });
const grande = { parametros: { empresa: '=HACK' }, operacoes: muitas };
r = ctx.salvarSimulacao({ nome: '+Grande', estado: grande });
ok(r.simulacoes.some((s) => s.nome === 'Grande'), 'nome sem sinal de fórmula');
ok(r.simulacoes.some((s) => s.empresa === 'HACK'), 'empresa sem sinal de fórmula');
const linha = amb.planilha.getSheetByName('Simulações').dados.find((l) => l[1] === 'Grande');
ok(linha.slice(6).filter(Boolean).length > 1, 'estado grande dividido em vários pedaços');
ok(linha.slice(6).filter(Boolean).every((p) => p.charAt(0) === '~'), 'pedaços com prefixo');
ok(JSON.stringify(ctx.abrirSimulacao(r.id).estado) === JSON.stringify(grande), 'estado grande volta idêntico');

// Regravar menor limpa os pedaços antigos
r = ctx.salvarSimulacao({ id: r.id, nome: 'Grande', estado: { operacoes: [] } });
ok(ctx.abrirSimulacao(r.id).estado.operacoes.length === 0, 'regravar menor não deixa sobra');

// Erros
assert.throws(() => ctx.salvarSimulacao({ nome: '  ', estado: {} }), /nome/);
assert.throws(() => ctx.abrirSimulacao('nao-existe'), /não encontrada/);

// Excluir
const antes = ctx.carregarEstado().simulacoes.length;
ok(ctx.excluirSimulacao(id1).simulacoes.length === antes - 1, 'exclui');

// Gravar resultado
const g = ctx.gravarResultado({ titulo: 'T', subtitulo: 'S', blocos: [
  { titulo: 'B1', cabecalho: ['a', 'b'], formatos: ['texto', 'moeda'], linhas: [['x', 1], ['y']] }
] });
const res = amb.planilha.getSheetByName('Resultado');
ok(res && res.dados.some((l) => l[0] === 'y' && l[1] === ''), 'grava blocos e completa colunas faltantes');
ok(/#gid=/.test(g.url), 'devolve link da aba');
ctx.gravarResultado({ titulo: 'T2', blocos: [] });
ok(!res.dados.some((l) => l[0] === 'y'), 'regravar limpa a aba');

ok(ctx.linkDaPlanilha().url.indexOf('https://') === 0, 'link da planilha');

console.log(`Codigo.gs: OK — ${n} verificações.`);

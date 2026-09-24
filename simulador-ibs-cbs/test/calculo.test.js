// Testes das funções puras de cálculo do SimuladorIBSCBS.gs.
// Executar: node simulador-ibs-cbs/test/calculo.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'SimuladorIBSCBS.gs'), 'utf8'), ctx);
const S = ctx.SIM;

let total = 0;
const perto = (atual, esperado, msg) => {
  total++;
  assert.ok(Math.abs(atual - esperado) < 0.005, `${msg}: esperado ${esperado}, obtido ${atual}`);
};

const params = {
  regime: S.REGIME_REAL, naoCumulativo: true, aliqPis: 0.0165, aliqCofins: 0.076,
  excluiIcmsPC: true, excluiTribBase: true, cbsRef: 0.088, ibsRef: 0.177,
  credSimples: 0.03, credRural: 0
};

// Cronograma com as fórmulas resolvidas para CBS 8,8% e IBS 17,7%.
const resolver = (v) => (typeof v === 'string' && v.charAt(0) === '='
  ? Function('P_CBS_REF', 'P_IBS_REF', 'return ' + v.slice(1))(0.088, 0.177) : v);
const crono = ctx.CRONOGRAMA.map((l) => ctx.linhaCronograma_(l.map(resolver)));
const ano = (a) => crono.find((c) => c.rotulo === String(a));
const atual = ctx.cenarioAtual_();
const trats = ctx.indexarTratamentos_(ctx.TRATAMENTOS);
const T = (nome) => trats[ctx.chave_(nome)];

// Monta uma operação na ordem das colunas da aba Operações.
const op = (campos) => {
  const l = new Array(ctx.CABECALHO_OPS.length).fill('');
  Object.keys(campos).forEach((k) => { l[ctx.C[k]] = campos[k]; });
  return ctx.linhaOperacao_(l, trats, 2);
};
const calc = (ops, c, p = params) => ctx.calcularCenario_(ops, p, c);

// --- Reduções de alíquota -----------------------------------------------------
perto(calc([op({ TIPO: 'Venda', VALOR: 1000 })], ano(2033)).cbs, 88, 'padrão: CBS 8,8%');
perto(calc([op({ TIPO: 'Venda', VALOR: 1000 })], ano(2033)).ibs, 177, 'padrão: IBS 17,7%');
let r = calc([op({ TIPO: 'Venda', VALOR: 1000, TRAT: 'Alimentos para consumo humano (-60%)' })], ano(2033));
perto(r.cbs + r.ibs, 106, 'redução de 60%');
r = calc([op({ TIPO: 'Venda', VALOR: 1000, TRAT: 'Profissões intelectuais regulamentadas (-30%)' })], ano(2033));
perto(r.cbs + r.ibs, 185.5, 'redução de 30%');
r = calc([op({ TIPO: 'Venda', VALOR: 1000, TRAT: 'Locação, cessão onerosa e arrendamento de imóveis (-70%)' })], ano(2033));
perto(r.cbs + r.ibs, 79.5, 'locação -70%');
r = calc([op({ TIPO: 'Venda', VALOR: 1000, TRAT: 'Cesta Básica Nacional (alíquota zero)' })], ano(2033));
perto(r.cbs + r.ibs, 0, 'alíquota zero');
r = calc([op({ TIPO: 'Venda', VALOR: 1000, TRAT: 0.5 })], ano(2033));
perto(r.cbs + r.ibs, 132.5, 'redução informada como número');

// --- Crédito vedado ao adquirente (bares e restaurantes) ---------------------------
r = calc([op({ TIPO: 'Compra', VALOR: 1000, TRAT: 'Bares e restaurantes (-40%)' })], ano(2033));
perto(r.cbsCredito + r.ibsCredito, 0, 'compra de restaurante sem crédito');
r = calc([op({ TIPO: 'Compra', VALOR: 1000 })], ano(2033));
perto(r.cbsCredito + r.ibsCredito, 265, 'compra padrão: crédito integral (crédito em branco = Sim)');
r = calc([op({ TIPO: 'Compra', VALOR: 1000, CRED_IBS: 'Não' })], ano(2033));
perto(r.cbsCredito + r.ibsCredito, 0, 'uso e consumo pessoal sem crédito');

// --- Exportação ------------------------------------------------------------------
const exp = [op({ TIPO: 'Venda', VALOR: 1000, TRAT: 'Exportação (imune, mantém créditos)', ICMS: 0.18, IPI: 0.1 })];
perto(calc(exp, atual).carga, 0, 'exportação sem tributos hoje');
perto(calc(exp, ano(2033)).carga, 0, 'exportação sem IBS/CBS');

// --- Serviços financeiros (alíquota específica) --------------------------------
const fin = [op({ TIPO: 'Venda', VALOR: 1000, TRAT: 'Serviços financeiros (alíquota específica)' })];
r = calc(fin, ano(2027));
perto(r.cbs + r.ibs, 108.5, 'financeiro 2027: 10,85%');
perto(r.cbs, 108.5 * 0.087 / 0.088, 'financeiro 2027: parcela CBS');
r = calc(fin, ano(2033));
perto(r.cbs + r.ibs, 125, 'financeiro 2033: 12,5%');

// --- Fornecedor do Simples e produtor rural ----------------------------------------
r = calc([op({ TIPO: 'Compra', VALOR: 1000, FORN: S.FORN_SIMPLES })], ano(2033));
perto(r.cbsCredito + r.ibsCredito, 30, 'Simples 2033: crédito de 3%');
r = calc([op({ TIPO: 'Compra', VALOR: 1000, FORN: S.FORN_SIMPLES })], ano(2027));
perto(r.cbsCredito + r.ibsCredito, 30 * 0.088 / 0.265, 'Simples 2027: crédito escalonado');
r = calc([op({ TIPO: 'Compra', VALOR: 1000, FORN: S.FORN_SIMPLES, CRED_PCT: 0.05 })], ano(2033));
perto(r.cbsCredito + r.ibsCredito, 50, 'Simples com percentual informado');
r = calc([op({ TIPO: 'Compra', VALOR: 1000, FORN: S.FORN_RURAL })], ano(2033),
  Object.assign({}, params, { credRural: 0.1 }));
perto(r.cbsCredito + r.ibsCredito, 100, 'crédito presumido do produtor rural');

// --- PIS/COFINS atual ---------------------------------------------------------------
r = calc([op({ TIPO: 'Venda', VALOR: 1000, PC: S.PC_CUMULATIVO })], atual);
perto(r.pis + r.cofins, 36.5, 'receita cumulativa no Lucro Real');
r = calc([op({ TIPO: 'Venda', VALOR: 1000, PC: S.PC_MONOFASICO })], atual);
perto(r.pis + r.cofins, 0, 'revenda monofásica');
r = calc([op({ TIPO: 'Compra', VALOR: 1000, CRED_PC: 'Sim' })], atual,
  Object.assign({}, params, { naoCumulativo: false, aliqPis: 0.0065, aliqCofins: 0.03 }));
perto(r.pis + r.cofins, 0, 'Lucro Presumido sem crédito de PIS/COFINS');

// --- Imposto Seletivo -----------------------------------------------------------------
const sel = [op({ TIPO: 'Venda', VALOR: 1000, IS: 0.1 })];
perto(calc(sel, atual).is, 0, 'IS inexistente hoje');
r = calc(sel, ano(2027));
perto(r.is, 100, 'IS em 2027');
perto(r.cbs, 1100 * 0.087, 'IS integra a base da CBS');

// --- 2026: IBS/CBS destacados mas fora da carga ---------------------------------------
const ex = ctx.EXEMPLO_OPS.map((l, i) => ctx.linhaOperacao_(l, trats, i + 2));
perto(calc(ex, ano(2026)).carga, calc(ex, atual).carga, 'carga 2026 igual à atual');

// --- Tratamento inexistente ------------------------------------------------------------
assert.throws(() => op({ TIPO: 'Venda', VALOR: 1, TRAT: 'Inventado' }), /não existe/);
assert.strictEqual(ctx.pct_(18), 0.18);

// --- Todos os tratamentos do catálogo têm nome único ------------------------------------
assert.strictEqual(Object.keys(trats).length, ctx.TRATAMENTOS.length);
ctx.EXEMPLO_OPS.forEach((l) => assert.ok(!l[3] || trats[ctx.chave_(l[3])], 'exemplo usa tratamento válido: ' + l[3]));

console.log(`OK — ${total} verificações passaram.\n\nExemplo (Lucro Real):`);
ctx.simular_(ex, params, crono).forEach((x) =>
  console.log(x.rotulo.padEnd(6), x.carga.toFixed(2).padStart(10), (x.cargaPct * 100).toFixed(2) + '%'));

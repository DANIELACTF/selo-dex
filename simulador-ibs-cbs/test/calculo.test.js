// Testes das funções puras de cálculo do SimuladorIBSCBS.gs.
// Executar: node simulador-ibs-cbs/test/calculo.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'SimuladorIBSCBS.gs'), 'utf8'), ctx);

const perto = (atual, esperado, msg) =>
  assert.ok(Math.abs(atual - esperado) < 0.005, `${msg}: esperado ${esperado}, obtido ${atual}`);

const paramsReal = {
  regime: ctx.SIM.REGIME_REAL, naoCumulativo: true, aliqPis: 0.0165, aliqCofins: 0.076,
  excluiIcmsPC: true, excluiTribBase: true
};
const ops = ctx.EXEMPLO_OPS.map(ctx.linhaOperacao_);

// Cronograma com as fórmulas resolvidas para CBS 8,8% e IBS 17,7%.
const resolver = (v) => {
  if (typeof v !== 'string' || v.charAt(0) !== '=') return v;
  return Function('P_CBS_REF', 'P_IBS_REF', 'return ' + v.slice(1))(0.088, 0.177);
};
const crono = ctx.CRONOGRAMA.map((l) => ctx.linhaCronograma_(l.map(resolver)));

// Cenário atual (Lucro Real)
const atual = ctx.calcularCenario_(ops, paramsReal, ctx.cenarioAtual_());
perto(atual.faturamento, 150000, 'faturamento');
perto(atual.icms, 10500, 'ICMS atual');
perto(atual.iss, 1500, 'ISS atual');
perto(atual.pis, 1262.25, 'PIS atual');
perto(atual.cofins, 5814, 'COFINS atual');
perto(atual.carga, 19076.25, 'carga atual');

// 2026: IBS/CBS destacados, mas fora da carga
const r2026 = ctx.calcularCenario_(ops, paramsReal, crono[0]);
perto(r2026.carga, atual.carga, 'carga 2026 igual à atual');
assert.ok(r2026.cbs > 0 && r2026.ibs > 0, '2026 destaca IBS/CBS');

// 2027: sem PIS/COFINS e IPI; CBS 8,7%; IBS 0,1%
const r2027 = ctx.calcularCenario_(ops, paramsReal, crono[1]);
perto(r2027.pis + r2027.cofins + r2027.ipi, 0, 'PIS/COFINS/IPI extintos em 2027');
perto(r2027.icms, 10500, 'ICMS integral em 2027');

// 2033: só IBS/CBS a 26,5%
const r2033 = ctx.calcularCenario_(ops, paramsReal, crono[7]);
perto(r2033.icms + r2033.iss, 0, 'ICMS/ISS extintos em 2033');
perto(r2033.cbsDebito + r2033.ibsDebito, 36570, 'débitos IBS/CBS 2033');
perto(r2033.cbsCredito + r2033.ibsCredito, 17490, 'créditos IBS/CBS 2033');
perto(r2033.carga, 19080, 'carga 2033');

// Lucro Presumido: PIS/COFINS cumulativos, sem crédito
const paramsPres = Object.assign({}, paramsReal, { naoCumulativo: false, aliqPis: 0.0065, aliqCofins: 0.03 });
const pres = ctx.calcularCenario_(ops, paramsPres, ctx.cenarioAtual_());
perto(pres.pis, (82000 + 17600 + 30000) * 0.0065, 'PIS cumulativo sem créditos');

// Simulação completa: 9 cenários e variação relativa ao atual
const todos = ctx.simular_(ops, paramsReal, crono);
assert.strictEqual(todos.length, 9);
perto(todos[0].variacao, 0, 'variação do atual');
perto(todos[8].variacao, 19080 - 19076.25, 'variação 2033');

// Percentuais digitados sem "%"
assert.strictEqual(ctx.pct_(18), 0.18);
assert.strictEqual(ctx.pct_(0.18), 0.18);

console.log('OK — todos os testes passaram.');
todos.forEach((r) => console.log(r.rotulo.padEnd(6), r.carga.toFixed(2).padStart(10), (r.cargaPct * 100).toFixed(2) + '%'));

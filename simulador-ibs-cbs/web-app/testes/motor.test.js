// Testes do motor de cálculo (motor_js.html).
// Executar: node simulador-ibs-cbs/web-app/testes/motor.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'motor_js.html'), 'utf8')
  .replace(/<\/?script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
const M = new Function(fonte + '; return motorIbsCbs();')();

let total = 0;
function perto(atual, esperado, msg){
  total++;
  assert.ok(Math.abs(atual - esperado) < 0.005, `${msg}: esperado ${esperado}, obtido ${atual}`);
}

const p = Object.assign(M.parametrosPadrao(), { regime: 'real' });
const crono = M.cronogramaPadrao(p.cbsRef, p.ibsRef);
const ano = (a) => crono.find((c) => c.ano === a);
const atual = M.cenarioAtual();
const op = (tipo, x) => Object.assign(M.novaOperacao(tipo), { valor: 1000 }, x || {});
const calc = (ops, c, par) => M.calcularCenario(ops, par || p, c);

// Reduções
let r = calc([op('venda')], ano(2033));
perto(r.cbs, 88, 'padrão: CBS 8,8%');
perto(r.ibs, 177, 'padrão: IBS 17,7%');
r = calc([op('venda', { tratamento: 'alim60' })], ano(2033)); perto(r.cbs + r.ibs, 106, 'redução de 60%');
r = calc([op('venda', { tratamento: 'prof30' })], ano(2033)); perto(r.cbs + r.ibs, 185.5, 'redução de 30%');
r = calc([op('venda', { tratamento: 'bares40' })], ano(2033)); perto(r.cbs + r.ibs, 159, 'bares -40%');
r = calc([op('venda', { tratamento: 'imovel50' })], ano(2033)); perto(r.cbs + r.ibs, 132.5, 'imóveis -50%');
r = calc([op('venda', { tratamento: 'locacao70' })], ano(2033)); perto(r.cbs + r.ibs, 79.5, 'locação -70%');
r = calc([op('venda', { tratamento: 'cesta0' })], ano(2033)); perto(r.cbs + r.ibs, 0, 'alíquota zero');
r = calc([op('venda', { tratamento: 'personalizado', reducao: 0.5 })], ano(2033)); perto(r.cbs + r.ibs, 132.5, 'redução personalizada');

// Crédito
r = calc([op('compra', { tratamento: 'bares40' })], ano(2033)); perto(r.cbsCredito + r.ibsCredito, 0, 'restaurante sem crédito');
r = calc([op('compra', { tratamento: 'hotel40' })], ano(2033)); perto(r.cbsCredito + r.ibsCredito, 0, 'hotel sem crédito');
r = calc([op('compra')], ano(2033)); perto(r.cbsCredito + r.ibsCredito, 265, 'compra padrão com crédito integral');
r = calc([op('compra', { credIbsCbs: false })], ano(2033)); perto(r.cbsCredito + r.ibsCredito, 0, 'uso e consumo pessoal');
r = calc([op('compra', { fornecedor: 'sem' })], ano(2033)); perto(r.cbsCredito + r.ibsCredito, 0, 'fornecedor sem crédito');

// Exportação
const exp = [op('venda', { tratamento: 'export', icms: 0.18, ipi: 0.1 })];
perto(calc(exp, atual).carga, 0, 'exportação sem tributos hoje');
perto(calc(exp, ano(2033)).carga, 0, 'exportação sem IBS/CBS');

// Serviços financeiros
const fin = [op('venda', { tratamento: 'financeiro' })];
r = calc(fin, ano(2027)); perto(r.cbs + r.ibs, 108.5, 'financeiro 2027'); perto(r.cbs, 108.5 * 0.087 / 0.088, 'financeiro 2027 CBS');
r = calc(fin, ano(2033)); perto(r.cbs + r.ibs, 125, 'financeiro 2033');

// Simples e produtor rural
r = calc([op('compra', { fornecedor: 'simples' })], ano(2033)); perto(r.cbsCredito + r.ibsCredito, 30, 'Simples 2033');
r = calc([op('compra', { fornecedor: 'simples' })], ano(2027)); perto(r.cbsCredito + r.ibsCredito, 30 * 0.088 / 0.265, 'Simples 2027 escalonado');
r = calc([op('compra', { fornecedor: 'simples', credPct: 0.05 })], ano(2033)); perto(r.cbsCredito + r.ibsCredito, 50, 'Simples com % informado');
r = calc([op('compra', { fornecedor: 'rural' })], ano(2033), Object.assign({}, p, { credRural: 0.1 }));
perto(r.cbsCredito + r.ibsCredito, 100, 'produtor rural');

// PIS/COFINS hoje
r = calc([op('venda', { pisCofins: 'cumulativo' })], atual); perto(r.pis + r.cofins, 36.5, 'cumulativo no Real');
r = calc([op('venda', { pisCofins: 'monofasico' })], atual); perto(r.pis + r.cofins, 0, 'monofásico');
r = calc([op('venda')], atual); perto(r.pis + r.cofins, 92.5, 'não cumulativo 9,25%');
r = calc([op('venda')], atual, Object.assign({}, p, { regime: 'presumido' })); perto(r.pis + r.cofins, 36.5, 'Presumido 3,65%');
r = calc([op('compra')], atual, Object.assign({}, p, { regime: 'presumido' })); perto(r.pis + r.cofins, 0, 'Presumido sem crédito');
r = calc([op('venda', { icms: 0.18 })], atual); perto(r.pis, 820 * 0.0165, 'ICMS fora da base do PIS');

// Imposto Seletivo
const sel = [op('venda', { is: 0.1 })];
perto(calc(sel, atual).is, 0, 'sem IS hoje');
r = calc(sel, ano(2027)); perto(r.is, 100, 'IS em 2027'); perto(r.cbs, 1100 * 0.087, 'IS na base da CBS');

// Exemplo completo
const ex = M.exemplo();
const res = M.simular(ex, p, crono);
assert.strictEqual(res.length, 9);
perto(res[1].carga, res[0].carga, '2026 igual ao atual');
perto(res[0].variacao, 0, 'variação do atual');
ex.forEach((o) => assert.ok(M.tratamento(o.tratamento), 'exemplo com tratamento válido: ' + o.tratamento));

// Conferência de operação
assert.ok(M.conferirOperacao(op('venda', { valor: 0 }), p).some((a) => a.tipo === 'err'), 'valor zero impede');
assert.ok(M.conferirOperacao(op('compra', { tratamento: 'bares40' }), p).some((a) => a.tipo === 'avi'), 'aviso de crédito vedado');
assert.ok(!M.conferirOperacao(op('venda'), p).some((a) => a.tipo === 'err'), 'operação válida');

// Formatação e leitura de números
assert.strictEqual(M.moeda(1234567.891), 'R$ 1.234.567,89');
assert.strictEqual(M.moeda(-5), '−R$ 5,00');
assert.strictEqual(M.pct(0.265), '26,50%');
assert.strictEqual(M.numero('1.234,56'), 1234.56);
assert.strictEqual(M.numero('1234.56'), 1234.56);
assert.strictEqual(M.numero('18%'), 18);
assert.ok(isNaN(M.numero('abc')));

// Catálogo: ids únicos
assert.strictEqual(new Set(M.TRATAMENTOS.map((t) => t.id)).size, M.TRATAMENTOS.length);

console.log(`motor: OK — ${total} verificações numéricas e demais asserções passaram.`);
res.forEach((x) => console.log('  ' + x.ano.padEnd(6), M.moeda(x.carga).padStart(14), M.pct(x.cargaPct)));

// ---------------- Empresas de serviço: preço e margem ----------------
{
  const ps = Object.assign(M.parametrosPadrao(), { regime: 'presumido', perfil: 'servicos', folha: 500, b2b: 0.5 });
  const cr = M.cronogramaPadrao(ps.cbsRef, ps.ibsRef);
  const venda = Object.assign(M.novaOperacao('venda', ps), { valor: 1000 });
  assert.strictEqual(venda.tratamento, 'servgeral', 'serviço novo usa "Serviços em geral"');
  assert.strictEqual(venda.iss, 0.05, 'serviço novo usa o ISS do município');
  const rs = M.simular([venda], ps, cr);
  const ano = (a) => rs.find((x) => x.ano === a);
  perto(rs[0].tribVendas, 86.5, 'hoje: ISS 5% + PIS/COFINS 3,65%');
  perto(rs[0].resultado, 413.5, 'hoje: resultado antes de IR');
  perto(ano('2033').resultado, 500, '2033 com preço atual: sem ISS e PIS/COFINS');
  perto(ano('2033').reajuste, -0.0865, '2033: valor pode cair 8,65% e manter o resultado');
  perto(ano('2033').varPrecoSemCredito, 0.9135 * 1.265 - 1, '2033: cliente sem crédito paga mais');
  perto(ano('2033').varPrecoComCredito, -0.0865, '2033: cliente com crédito paga menos');
  perto(ano('2033').varPrecoMedio, ((0.9135 * 1.265 - 1) + -0.0865) / 2, 'média pelos clientes com crédito');
  perto(ano('2027').varPrecoSemCredito, (913.5 / 950) * (1000 + 950 * 0.088) / 1000 - 1, '2027: ISS fica, CBS entra');
  perto(ano('2026').reajuste, 0, '2026 sem mudança');

  // ISS fixo da sociedade de profissionais
  const sup = Object.assign({}, ps, { issFixo: 300 });
  const vs = Object.assign(M.novaOperacao('venda', sup), { valor: 1000, iss: 0, tratamento: 'prof30' });
  perto(M.calcularCenario([vs], sup, M.cenarioAtual()).iss, 300, 'ISS fixo hoje');
  perto(M.calcularCenario([vs], sup, cr.find((c) => c.ano === 2030)).iss, 240, 'ISS fixo a 80% em 2030');
  perto(M.calcularCenario([vs], sup, cr.find((c) => c.ano === 2033)).iss, 0, 'ISS fixo extinto em 2033');

  // Compra de fornecedor regular sem direito a crédito vira custo a partir de 2027
  const almoco = Object.assign(M.novaOperacao('compra'), { valor: 1000, tratamento: 'bares40', credPisCofins: false });
  const ra = M.simular([venda, almoco], ps, cr);
  perto(ra.find((x) => x.ano === '2033').custoFixo - ano('2033').custoFixo, 1000 + 159, 'restaurante: IBS/CBS sem crédito vira custo');

  // Avisos de serviço
  assert.ok(M.conferirOperacao(Object.assign({}, venda, { iss: 0 }), ps).some((a) => /sem ISS/.test(a.t)), 'avisa serviço sem ISS');
  assert.ok(!M.conferirOperacao(Object.assign({}, venda, { iss: 0 }), sup).some((a) => /sem ISS/.test(a.t)), 'ISS fixo dispensa o aviso');
  assert.ok(M.exemploServicos().every((o) => M.tratamento(o.tratamento)), 'exemplo de serviços válido');
  assert.ok(M.TRATAMENTOS.filter((t) => t.servico).length >= 15, 'catálogo marca os serviços');
  console.log('serviços: OK — preço e margem conferidos à mão.');
}
{
  const ps = Object.assign(M.parametrosPadrao(), { perfil: 'servicos' });
  const energia = Object.assign(M.novaOperacao('compra', ps), { valor: 100, icms: 0.18 });
  assert.ok(M.conferirOperacao(energia, ps).some((a) => /não se credita de ICMS/.test(a.t)), 'avisa crédito de ICMS em serviço');
  const r = M.calcularCenario(M.exemploServicos(), ps, M.cenarioAtual());
  assert.ok(r.icms >= 0 && r.ipi >= 0, 'exemplo de serviços sem ICMS negativo');
  console.log('serviços: aviso de ICMS e exemplo OK.');
}

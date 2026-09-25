/**
 * ============================================================================
 *  SIMULADOR IBS / CBS — EMPRESAS DO REGIME REGULAR (Lucro Real / Presumido)
 * ============================================================================
 *
 *  Simula o impacto da Reforma Tributária do consumo (EC 132/2023 e
 *  LC 214/2025) comparando a carga atual (ICMS, ISS, IPI, PIS e COFINS) com a
 *  carga em cada ano da transição (2026 a 2033), com débitos e créditos de
 *  IBS e CBS.
 *
 *  Como usar:
 *    1. Extensões > Apps Script > cole este arquivo > salve.
 *    2. Recarregue a planilha. Aparecerá o menu "Simulador IBS/CBS".
 *    3. Simulador IBS/CBS > Configurar planilha.
 *    4. Preencha "Parâmetros" e "Operações" (ou insira o exemplo).
 *    5. Simulador IBS/CBS > Calcular simulação.
 *
 *  Premissas principais (todas editáveis nas abas Parâmetros e Cronograma):
 *    - O valor da operação informado é mantido constante em todos os anos
 *      (preço constante). ICMS, ISS, PIS e COFINS são "por dentro" do valor;
 *      IPI, IBS e CBS são "por fora".
 *    - Na transição, ICMS, ISS, PIS e COFINS não integram a base do IBS/CBS
 *      (opção configurável).
 *    - As alíquotas de referência de IBS e CBS ainda serão fixadas pelo
 *      Senado; os valores padrão são estimativas e devem ser revisados.
 *
 *  Resultado meramente estimativo. Não substitui a análise de um profissional.
 * ============================================================================
 */

var SIM = {
  ABA_PARAM: 'Parâmetros',
  ABA_CRONO: 'Cronograma',
  ABA_OPS: 'Operações',
  ABA_RES: 'Resultado',
  REGIME_REAL: 'Lucro Real (não cumulativo)',
  REGIME_PRESUMIDO: 'Lucro Presumido (cumulativo)',
  LINHAS_OPS: 500,
  FMT_MOEDA: '"R$" #,##0.00;[Red]-"R$" #,##0.00',
  FMT_PCT: '0.00%',
  COR_TITULO: '#1f4e78',
  COR_CABECALHO: '#d9e2f3',
  COR_ENTRADA: '#fff2cc'
};

// Parâmetros gerais. Cada valor fica num intervalo nomeado (P_<chave>).
var PARAMETROS = [
  { chave: 'EMPRESA', rotulo: 'Empresa', valor: 'Minha Empresa Ltda', fmt: '@' },
  { chave: 'CNPJ', rotulo: 'CNPJ', valor: '', fmt: '@' },
  { chave: 'REGIME', rotulo: 'Regime de apuração do PIS/COFINS',
    valor: SIM.REGIME_REAL, lista: [SIM.REGIME_REAL, SIM.REGIME_PRESUMIDO],
    nota: 'Lucro Real: PIS/COFINS não cumulativos (com créditos). Lucro Presumido: cumulativos (sem créditos). IBS/CBS são não cumulativos em ambos.' },
  { chave: 'ALIQ_PIS', rotulo: 'Alíquota do PIS',
    formula: '=IF(P_REGIME="' + SIM.REGIME_REAL + '",0.0165,0.0065)', fmt: SIM.FMT_PCT,
    nota: 'Calculada pelo regime (1,65% ou 0,65%). Pode ser sobrescrita.' },
  { chave: 'ALIQ_COFINS', rotulo: 'Alíquota da COFINS',
    formula: '=IF(P_REGIME="' + SIM.REGIME_REAL + '",0.076,0.03)', fmt: SIM.FMT_PCT,
    nota: 'Calculada pelo regime (7,6% ou 3%). Pode ser sobrescrita.' },
  { chave: 'EXCL_ICMS_PC', rotulo: 'Excluir ICMS da base do PIS/COFINS?', valor: 'Sim',
    lista: ['Sim', 'Não'], nota: 'Tema 69 do STF.' },
  { chave: 'CBS_REF', rotulo: 'Alíquota de referência da CBS', valor: 0.088, fmt: SIM.FMT_PCT,
    nota: 'Estimativa. Revise quando a alíquota de referência for publicada.' },
  { chave: 'IBS_REF', rotulo: 'Alíquota de referência do IBS (UF + Município)', valor: 0.177,
    fmt: SIM.FMT_PCT, nota: 'Estimativa. Revise conforme as alíquotas do seu estado e município.' },
  { chave: 'EXCL_TRIB_BASE', rotulo: 'Excluir ICMS/ISS/PIS/COFINS da base do IBS/CBS?', valor: 'Sim',
    lista: ['Sim', 'Não'], nota: 'Regra de transição da LC 214/2025 (2026 a 2032).' },
  { chave: 'PERIODO', rotulo: 'Período dos valores informados', valor: 'Mensal',
    lista: ['Mensal', 'Trimestral', 'Anual'], nota: 'Apenas informativo: o resultado segue o mesmo período.' }
];

// Cronograma de transição. Colunas: Ano, CBS, IBS, fator ICMS/ISS,
// PIS/COFINS vigente, IPI vigente, IBS/CBS recolhido, observação.
var CRONOGRAMA = [
  [2026, 0.009, 0.001, 1, 'Sim', 'Sim', 'Não',
    'Ano-teste: CBS 0,9% e IBS 0,1% destacados, compensáveis com PIS/COFINS (sem custo adicional).'],
  [2027, '=P_CBS_REF-0.001', 0.001, 1, 'Não', 'Não', 'Sim',
    'CBS plena (-0,1 p.p.); PIS/COFINS extintos; IPI zerado (exceto ZFM); IBS 0,1%.'],
  [2028, '=P_CBS_REF-0.001', 0.001, 1, 'Não', 'Não', 'Sim', 'Mesmas regras de 2027.'],
  [2029, '=P_CBS_REF', '=P_IBS_REF*0.1', 0.9, 'Não', 'Não', 'Sim', 'ICMS/ISS a 90%; IBS a 10% (estimativa).'],
  [2030, '=P_CBS_REF', '=P_IBS_REF*0.2', 0.8, 'Não', 'Não', 'Sim', 'ICMS/ISS a 80%; IBS a 20% (estimativa).'],
  [2031, '=P_CBS_REF', '=P_IBS_REF*0.3', 0.7, 'Não', 'Não', 'Sim', 'ICMS/ISS a 70%; IBS a 30% (estimativa).'],
  [2032, '=P_CBS_REF', '=P_IBS_REF*0.4', 0.6, 'Não', 'Não', 'Sim', 'ICMS/ISS a 60%; IBS a 40% (estimativa).'],
  [2033, '=P_CBS_REF', '=P_IBS_REF', 0, 'Não', 'Não', 'Sim', 'Modelo definitivo: ICMS e ISS extintos.']
];

var CABECALHO_OPS = [
  'Tipo', 'Descrição', 'Valor da operação (R$)', 'Redução IBS/CBS (%)',
  'ICMS (%)', 'ISS (%)', 'IPI (%)',
  'Crédito IBS/CBS? (compras)', 'Crédito PIS/COFINS? (compras)', 'Crédito ICMS/IPI? (compras)'
];

var EXEMPLO_OPS = [
  ['Venda', 'Venda de mercadorias (tributação integral)', 100000, 0, 0.18, 0, 0, '', '', ''],
  ['Venda', 'Venda de itens com redução de 60%', 20000, 0.6, 0.12, 0, 0, '', '', ''],
  ['Venda', 'Prestação de serviços', 30000, 0, 0, 0.05, 0, '', '', ''],
  ['Compra', 'Mercadorias para revenda', 50000, 0, 0.18, 0, 0, 'Sim', 'Sim', 'Sim'],
  ['Compra', 'Energia elétrica', 5000, 0, 0.18, 0, 0, 'Sim', 'Sim', 'Sim'],
  ['Compra', 'Serviços de terceiros (PJ)', 8000, 0, 0, 0.05, 0, 'Sim', 'Sim', 'Não'],
  ['Compra', 'Material de uso e consumo', 3000, 0, 0.18, 0, 0, 'Sim', 'Não', 'Não']
];

// ---------------------------------------------------------------------------
//  Menu
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Simulador IBS/CBS')
    .addItem('1. Configurar planilha', 'configurarPlanilha')
    .addItem('2. Calcular simulação', 'calcularSimulacao')
    .addSeparator()
    .addItem('Inserir operações de exemplo', 'inserirExemplo')
    .addItem('Limpar operações', 'limparOperacoes')
    .addSeparator()
    .addItem('Sobre / premissas', 'mostrarSobre')
    .addToUi();
}

function configurarPlanilha() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  if (ss.getSheetByName(SIM.ABA_PARAM) || ss.getSheetByName(SIM.ABA_CRONO)) {
    var resp = ui.alert('Configurar planilha',
      'As abas "Parâmetros", "Cronograma" e "Resultado" serão recriadas com os valores padrão. ' +
      'A aba "Operações" será mantida. Continuar?', ui.ButtonSet.YES_NO);
    if (resp !== ui.Button.YES) return;
  }
  montarParametros_(ss);
  montarCronograma_(ss);
  montarOperacoes_(ss);
  obterAbaLimpa_(ss, SIM.ABA_RES);
  ss.setActiveSheet(ss.getSheetByName(SIM.ABA_PARAM));
  ui.alert('Planilha configurada. Preencha "Parâmetros" e "Operações" e depois use ' +
    '"Simulador IBS/CBS > Calcular simulação".');
}

function inserirExemplo() {
  var ss = SpreadsheetApp.getActive();
  var aba = ss.getSheetByName(SIM.ABA_OPS) || montarOperacoes_(ss);
  var ultima = Math.max(aba.getLastRow(), 1);
  aba.getRange(ultima + 1, 1, EXEMPLO_OPS.length, CABECALHO_OPS.length).setValues(EXEMPLO_OPS);
  ss.setActiveSheet(aba);
}

function limparOperacoes() {
  var ui = SpreadsheetApp.getUi();
  var aba = SpreadsheetApp.getActive().getSheetByName(SIM.ABA_OPS);
  if (!aba) return;
  if (ui.alert('Limpar operações', 'Apagar todas as operações lançadas?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  aba.getRange(2, 1, SIM.LINHAS_OPS, CABECALHO_OPS.length).clearContent();
}

function mostrarSobre() {
  SpreadsheetApp.getUi().alert('Simulador IBS/CBS — Regime Regular',
    'Compara a carga atual (ICMS, ISS, IPI, PIS, COFINS) com a de cada ano da transição (2026–2033).\n\n' +
    '• Preço constante: o valor da operação é o mesmo em todos os anos.\n' +
    '• ICMS, ISS, PIS e COFINS "por dentro"; IPI, IBS e CBS "por fora".\n' +
    '• 2026: IBS/CBS destacados apenas para teste (compensáveis com PIS/COFINS).\n' +
    '• 2027: CBS plena, fim do PIS/COFINS, IPI zerado (exceto ZFM).\n' +
    '• 2029–2032: ICMS/ISS reduzidos a 90/80/70/60%; IBS sobe na proporção.\n' +
    '• 2033: ICMS e ISS extintos.\n' +
    '• Valores negativos no resultado indicam saldo credor.\n' +
    '• Não considera Imposto Seletivo, regimes específicos, split payment nem créditos presumidos.\n\n' +
    'As alíquotas de referência são estimativas e podem ser editadas.\n' +
    'Resultado estimativo; confirme com seu contador.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// ---------------------------------------------------------------------------
//  Montagem das abas
// ---------------------------------------------------------------------------

function obterAbaLimpa_(ss, nome) {
  var aba = ss.getSheetByName(nome) || ss.insertSheet(nome);
  aba.getCharts().forEach(function (g) { aba.removeChart(g); });
  aba.clear();
  aba.getRange(1, 1, aba.getMaxRows(), aba.getMaxColumns()).breakApart().clearDataValidations();
  return aba;
}

function titulo_(aba, texto, colunas) {
  aba.getRange(1, 1, 1, colunas).merge()
    .setValue(texto).setFontSize(14).setFontWeight('bold')
    .setFontColor('#ffffff').setBackground(SIM.COR_TITULO);
}

function cabecalho_(range) {
  range.setFontWeight('bold').setBackground(SIM.COR_CABECALHO)
    .setWrap(true).setVerticalAlignment('middle');
}

function montarParametros_(ss) {
  var aba = obterAbaLimpa_(ss, SIM.ABA_PARAM);
  titulo_(aba, 'Parâmetros da simulação', 3);
  cabecalho_(aba.getRange(2, 1, 1, 3).setValues([['Parâmetro', 'Valor', 'Observação']]));

  PARAMETROS.forEach(function (p, i) {
    var linha = i + 3;
    aba.getRange(linha, 1).setValue(p.rotulo);
    var cel = aba.getRange(linha, 2).setBackground(SIM.COR_ENTRADA);
    ss.setNamedRange('P_' + p.chave, cel);
    if (p.fmt) cel.setNumberFormat(p.fmt);
    if (p.lista) {
      cel.setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInList(p.lista, true).setAllowInvalid(false).build());
    }
    aba.getRange(linha, 3).setValue(p.nota || '');
  });
  // Fórmulas depois dos intervalos nomeados existirem.
  PARAMETROS.forEach(function (p, i) {
    var cel = aba.getRange(i + 3, 2);
    if (p.formula) cel.setFormula(p.formula); else cel.setValue(p.valor);
  });

  aba.setColumnWidth(1, 340).setColumnWidth(2, 240).setColumnWidth(3, 560);
  aba.getRange(3, 3, PARAMETROS.length, 1).setWrap(true).setFontColor('#595959');
  aba.setFrozenRows(2);
  return aba;
}

function montarCronograma_(ss) {
  var aba = obterAbaLimpa_(ss, SIM.ABA_CRONO);
  titulo_(aba, 'Cronograma de transição (EC 132/2023 e LC 214/2025) — editável', 8);
  cabecalho_(aba.getRange(2, 1, 1, 8).setValues([[
    'Ano', 'Alíquota CBS', 'Alíquota IBS', 'Fator ICMS/ISS (100% = integral)',
    'PIS/COFINS vigentes?', 'IPI vigente?', 'IBS/CBS recolhidos? (entram na carga)', 'Observação'
  ]]));

  var n = CRONOGRAMA.length;
  CRONOGRAMA.forEach(function (linha, i) {
    linha.forEach(function (v, j) {
      var cel = aba.getRange(i + 3, j + 1);
      if (typeof v === 'string' && v.charAt(0) === '=') cel.setFormula(v); else cel.setValue(v);
    });
  });

  aba.getRange(3, 2, n, 3).setNumberFormat(SIM.FMT_PCT).setBackground(SIM.COR_ENTRADA);
  aba.getRange(3, 5, n, 3).setBackground(SIM.COR_ENTRADA).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Sim', 'Não'], true).build());
  aba.getRange(3, 8, n, 1).setWrap(true).setFontColor('#595959');
  aba.setColumnWidth(1, 70);
  for (var c = 2; c <= 7; c++) aba.setColumnWidth(c, 140);
  aba.setColumnWidth(8, 520);
  aba.setRowHeight(2, 48);
  aba.setFrozenRows(2);
  return aba;
}

function montarOperacoes_(ss) {
  var aba = ss.getSheetByName(SIM.ABA_OPS);
  var nova = !aba;
  if (nova) aba = ss.insertSheet(SIM.ABA_OPS);

  var nCol = CABECALHO_OPS.length;
  var total = SIM.LINHAS_OPS;
  if (aba.getMaxRows() < total + 1) aba.insertRowsAfter(aba.getMaxRows(), total + 1 - aba.getMaxRows());

  cabecalho_(aba.getRange(1, 1, 1, nCol).setValues([CABECALHO_OPS]));
  aba.setRowHeight(1, 48);
  aba.setFrozenRows(1);

  var simNao = SpreadsheetApp.newDataValidation().requireValueInList(['Sim', 'Não'], true).build();
  aba.getRange(2, 1, total, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Venda', 'Compra'], true).build());
  aba.getRange(2, 3, total, 1).setNumberFormat(SIM.FMT_MOEDA);
  aba.getRange(2, 4, total, 4).setNumberFormat(SIM.FMT_PCT);
  aba.getRange(2, 8, total, 3).setDataValidation(simNao);

  aba.getRange(1, 4).setNote('Redução de alíquota do IBS/CBS aplicável ao item. Ex.: 0% (integral), ' +
    '30% (profissões regulamentadas), 60% (saúde, educação, alimentos etc.), 100% (alíquota zero).');
  aba.getRange(1, 5).setNote('Alíquota efetiva de ICMS da operação (já considerando reduções de base).');
  aba.getRange(1, 8).setNote('Compras: a aquisição gera crédito de IBS/CBS? Uso e consumo pessoal não gera. ' +
    'Compras de optantes do Simples geram crédito limitado ao valor recolhido pelo fornecedor.');
  aba.getRange(1, 9).setNote('Compras: gera crédito de PIS/COFINS hoje? Só se aplica ao Lucro Real (não cumulativo).');
  aba.getRange(1, 10).setNote('Compras: gera crédito de ICMS/IPI hoje?');

  aba.setColumnWidth(1, 80).setColumnWidth(2, 320).setColumnWidth(3, 160);
  for (var c = 4; c <= nCol; c++) aba.setColumnWidth(c, 120);
  return aba;
}

// ---------------------------------------------------------------------------
//  Leitura dos dados
// ---------------------------------------------------------------------------

function pct_(v) {
  var n = Number(v) || 0;
  return n > 1 ? n / 100 : n; // aceita "18" ou "18%"
}

function sim_(v) {
  return String(v).trim().toLowerCase().charAt(0) === 's';
}

function lerParametros_(ss) {
  function val(chave) {
    var r = ss.getRangeByName('P_' + chave);
    if (!r) throw new Error('Parâmetro "' + chave + '" não encontrado. Execute "Configurar planilha".');
    return r.getValue();
  }
  return {
    empresa: val('EMPRESA'),
    cnpj: val('CNPJ'),
    regime: val('REGIME'),
    naoCumulativo: val('REGIME') === SIM.REGIME_REAL,
    aliqPis: pct_(val('ALIQ_PIS')),
    aliqCofins: pct_(val('ALIQ_COFINS')),
    excluiIcmsPC: sim_(val('EXCL_ICMS_PC')),
    excluiTribBase: sim_(val('EXCL_TRIB_BASE')),
    periodo: val('PERIODO')
  };
}

function lerCronograma_(ss) {
  var aba = ss.getSheetByName(SIM.ABA_CRONO);
  if (!aba) throw new Error('Aba "' + SIM.ABA_CRONO + '" não encontrada. Execute "Configurar planilha".');
  var n = aba.getLastRow() - 2;
  if (n < 1) return [];
  return aba.getRange(3, 1, n, 7).getValues()
    .filter(function (l) { return l[0] !== ''; })
    .map(linhaCronograma_);
}

function linhaCronograma_(l) {
  return {
    rotulo: String(l[0]),
    cbs: pct_(l[1]),
    ibs: pct_(l[2]),
    fator: pct_(l[3]),
    pisCofins: sim_(l[4]),
    ipi: sim_(l[5]),
    efetivo: sim_(l[6])
  };
}

function cenarioAtual_() {
  return { rotulo: 'Atual', cbs: 0, ibs: 0, fator: 1, pisCofins: true, ipi: true, efetivo: false };
}

function lerOperacoes_(ss) {
  var aba = ss.getSheetByName(SIM.ABA_OPS);
  if (!aba || aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_OPS.length).getValues()
    .map(linhaOperacao_)
    .filter(function (op) { return op !== null; });
}

function linhaOperacao_(l) {
  var tipo = String(l[0]).trim();
  var valor = Number(l[2]) || 0;
  if ((tipo !== 'Venda' && tipo !== 'Compra') || valor === 0) return null;
  return {
    tipo: tipo,
    descricao: l[1],
    valor: valor,
    reducao: Math.min(pct_(l[3]), 1),
    icms: pct_(l[4]),
    iss: pct_(l[5]),
    ipi: pct_(l[6]),
    credIbsCbs: sim_(l[7]),
    credPisCofins: sim_(l[8]),
    credIcmsIpi: sim_(l[9])
  };
}

// ---------------------------------------------------------------------------
//  Cálculo (funções puras — sem acesso à planilha)
// ---------------------------------------------------------------------------

/**
 * Calcula os tributos de todas as operações em um cenário (ano).
 * @param {Object[]} ops Operações (ver linhaOperacao_).
 * @param {Object} p Parâmetros (ver lerParametros_).
 * @param {Object} c Linha do cronograma (ver linhaCronograma_).
 * @return {Object} Totais do cenário.
 */
function calcularCenario_(ops, p, c) {
  var r = {
    rotulo: c.rotulo, faturamento: 0, icms: 0, iss: 0, ipi: 0, pis: 0, cofins: 0,
    cbsDebito: 0, cbsCredito: 0, ibsDebito: 0, ibsCredito: 0
  };

  ops.forEach(function (op) {
    var icms = op.valor * op.icms * c.fator;
    var iss = op.valor * op.iss * c.fator;
    var ipi = c.ipi ? op.valor * op.ipi : 0;
    var basePisCofins = op.valor - (p.excluiIcmsPC ? icms : 0);
    var pis = c.pisCofins ? basePisCofins * p.aliqPis : 0;
    var cofins = c.pisCofins ? basePisCofins * p.aliqCofins : 0;
    var baseIbsCbs = op.valor - (p.excluiTribBase ? icms + iss + pis + cofins : 0);
    var cbs = baseIbsCbs * c.cbs * (1 - op.reducao);
    var ibs = baseIbsCbs * c.ibs * (1 - op.reducao);

    if (op.tipo === 'Venda') {
      r.faturamento += op.valor;
      r.icms += icms;
      r.iss += iss;
      r.ipi += ipi;
      r.pis += pis;
      r.cofins += cofins;
      r.cbsDebito += cbs;
      r.ibsDebito += ibs;
    } else {
      if (op.credIcmsIpi) {
        r.icms -= icms;
        r.ipi -= ipi;
      }
      if (op.credPisCofins && p.naoCumulativo) {
        r.pis -= pis;
        r.cofins -= cofins;
      }
      if (op.credIbsCbs) {
        r.cbsCredito += cbs;
        r.ibsCredito += ibs;
      }
    }
  });

  r.cbs = r.cbsDebito - r.cbsCredito;
  r.ibs = r.ibsDebito - r.ibsCredito;
  r.efetivo = c.efetivo;
  r.cargaAtuais = r.icms + r.iss + r.ipi + r.pis + r.cofins;
  r.carga = r.cargaAtuais + (c.efetivo ? r.cbs + r.ibs : 0);
  r.cargaPct = r.faturamento ? r.carga / r.faturamento : 0;
  return r;
}

/** Calcula o cenário atual e todos os anos do cronograma. */
function simular_(ops, p, cronograma) {
  var cenarios = [cenarioAtual_()].concat(cronograma);
  var resultados = cenarios.map(function (c) { return calcularCenario_(ops, p, c); });
  var base = resultados[0].carga;
  resultados.forEach(function (r) {
    r.variacao = r.carga - base;
    r.variacaoPct = base ? r.variacao / Math.abs(base) : 0;
  });
  return resultados;
}

// ---------------------------------------------------------------------------
//  Execução e saída
// ---------------------------------------------------------------------------

function calcularSimulacao() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  try {
    var p = lerParametros_(ss);
    var ops = lerOperacoes_(ss);
    if (!ops.length) {
      ui.alert('Nenhuma operação válida em "' + SIM.ABA_OPS + '". Informe Tipo (Venda/Compra) e Valor.');
      return;
    }
    var resultados = simular_(ops, p, lerCronograma_(ss));
    escreverResultado_(ss, p, ops, resultados);
    ss.setActiveSheet(ss.getSheetByName(SIM.ABA_RES));
    ss.toast('Simulação concluída (' + ops.length + ' operações).', 'Simulador IBS/CBS', 5);
  } catch (e) {
    ui.alert('Erro na simulação', e.message, ui.ButtonSet.OK);
  }
}

function escreverResultado_(ss, p, ops, res) {
  var aba = obterAbaLimpa_(ss, SIM.ABA_RES);
  var n = res.length;
  var nCol = 14;

  titulo_(aba, 'Simulação IBS/CBS — ' + p.empresa + (p.cnpj ? ' (' + p.cnpj + ')' : ''), nCol);
  aba.getRange(2, 1, 1, nCol).merge().setValue(
    'Regime: ' + p.regime + ' | Valores: ' + p.periodo + ' | Operações: ' + ops.length +
    ' | Gerado em ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm'))
    .setFontColor('#595959');

  // Tabela 1 — carga por cenário
  var lin1 = 4;
  cabecalho_(aba.getRange(lin1, 1, 1, nCol).setValues([[
    'Cenário', 'Faturamento', 'ICMS', 'ISS', 'IPI', 'PIS', 'COFINS', 'CBS', 'IBS',
    'IBS/CBS na carga?', 'Carga total', 'Carga / faturamento', 'Variação vs atual (R$)', 'Variação vs atual (%)'
  ]]));
  aba.getRange(lin1 + 1, 1, n, 1).setNumberFormat('@'); // anos como rótulo (texto) no gráfico
  aba.getRange(lin1 + 1, 1, n, nCol).setValues(res.map(function (r) {
    return [r.rotulo, r.faturamento, r.icms, r.iss, r.ipi, r.pis, r.cofins, r.cbs, r.ibs,
      r.rotulo === 'Atual' ? '—' : (r.efetivo ? 'Sim' : 'Não (teste)'),
      r.carga, r.cargaPct, r.variacao, r.variacaoPct];
  }));
  aba.getRange(lin1 + 1, 2, n, 8).setNumberFormat(SIM.FMT_MOEDA);
  aba.getRange(lin1 + 1, 11, n, 1).setNumberFormat(SIM.FMT_MOEDA).setFontWeight('bold');
  aba.getRange(lin1 + 1, 12, n, 1).setNumberFormat(SIM.FMT_PCT);
  aba.getRange(lin1 + 1, 13, n, 1).setNumberFormat(SIM.FMT_MOEDA);
  aba.getRange(lin1 + 1, 14, n, 1).setNumberFormat('+0.00%;[Red]-0.00%;0.00%');
  aba.getRange(lin1 + 1, 1, 1, nCol).setBackground('#f2f2f2');
  aba.getRange(lin1 + 1, 1, n, 1).setFontWeight('bold').setHorizontalAlignment('left');
  aba.getRange(lin1 + 1, 10, n, 1).setHorizontalAlignment('center');

  // Tabela 2 — débitos e créditos de IBS/CBS
  var lin2 = lin1 + n + 3;
  aba.getRange(lin2 - 1, 1).setValue('Débitos e créditos de IBS/CBS').setFontWeight('bold').setFontSize(12);
  cabecalho_(aba.getRange(lin2, 1, 1, 9).setValues([[
    'Cenário', 'Débito CBS', 'Crédito CBS', 'Saldo CBS', 'Débito IBS', 'Crédito IBS', 'Saldo IBS',
    'Saldo IBS + CBS', 'Alíquota efetiva IBS+CBS s/ faturamento'
  ]]));
  var res2 = res.slice(1);
  aba.getRange(lin2 + 1, 1, res2.length, 1).setNumberFormat('@');
  aba.getRange(lin2 + 1, 1, res2.length, 9).setValues(res2.map(function (r) {
    return [r.rotulo, r.cbsDebito, r.cbsCredito, r.cbs, r.ibsDebito, r.ibsCredito, r.ibs,
      r.cbs + r.ibs, r.faturamento ? (r.cbs + r.ibs) / r.faturamento : 0];
  }));
  aba.getRange(lin2 + 1, 2, res2.length, 7).setNumberFormat(SIM.FMT_MOEDA);
  aba.getRange(lin2 + 1, 9, res2.length, 1).setNumberFormat(SIM.FMT_PCT);
  aba.getRange(lin2 + 1, 1, res2.length, 1).setFontWeight('bold').setHorizontalAlignment('left');

  // Observações
  var lin3 = lin2 + res2.length + 2;
  var notas = [
    ['Observações'],
    ['• Preço constante: o valor de cada operação é o mesmo em todos os cenários; a variação mostra o efeito sobre a carga.'],
    ['• ICMS, ISS, PIS e COFINS "por dentro"; IPI, IBS e CBS "por fora" (somados ao valor cobrado do cliente).'],
    ['• 2026: IBS/CBS apenas destacados (compensáveis com PIS/COFINS), por isso não entram na carga total.'],
    ['• Valores negativos indicam saldo credor (créditos maiores que débitos).'],
    ['• Não considera Imposto Seletivo, regimes específicos, créditos presumidos, split payment nem efeitos no IRPJ/CSLL.'],
    ['• Alíquotas de referência estimadas — ajuste em "Parâmetros" e "Cronograma". Resultado meramente estimativo.']
  ];
  aba.getRange(lin3, 1, notas.length, 1).setValues(notas).setFontColor('#595959');
  aba.getRange(lin3, 1).setFontWeight('bold').setFontColor('#000000');

  aba.setColumnWidth(1, 110);
  for (var c = 2; c <= nCol; c++) aba.setColumnWidth(c, 130);
  aba.setRowHeight(lin1, 48);
  aba.setRowHeight(lin2, 48);
  aba.setFrozenRows(lin1);

  // Gráfico da carga total por cenário
  var grafico = aba.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(aba.getRange(lin1, 1, n + 1, 1))
    .addRange(aba.getRange(lin1, 11, n + 1, 1))
    .setNumHeaders(1)
    .setOption('title', 'Carga tributária total por cenário')
    .setOption('legend', { position: 'none' })
    .setOption('vAxis', { format: 'currency' })
    .setPosition(lin3 + notas.length + 1, 1, 0, 0)
    .setOption('width', 900)
    .setOption('height', 360)
    .build();
  aba.insertChart(grafico);
}

// ---------------------------------------------------------------------------
//  Funções personalizadas (uso direto em células)
// ---------------------------------------------------------------------------

/**
 * Retorna a alíquota de CBS ou IBS de um ano, conforme a aba Cronograma.
 *
 * @param {number} ano Ano de 2026 a 2033.
 * @param {string} tributo "CBS" ou "IBS".
 * @param {number} [reducao] Percentual de redução (ex.: 60%). Padrão 0.
 * @return {number} Alíquota aplicável.
 * @customfunction
 */
function ALIQUOTA_IBSCBS(ano, tributo, reducao) {
  var c = buscarAno_(ano);
  var t = String(tributo || '').trim().toUpperCase();
  if (t !== 'CBS' && t !== 'IBS') throw new Error('Tributo deve ser "CBS" ou "IBS".');
  return (t === 'CBS' ? c.cbs : c.ibs) * (1 - Math.min(pct_(reducao), 1));
}

/**
 * Calcula o valor de CBS sobre uma base de cálculo em um ano.
 *
 * @param {number} base Base de cálculo (valor sem IBS/CBS).
 * @param {number} ano Ano de 2026 a 2033.
 * @param {number} [reducao] Percentual de redução (ex.: 60%). Padrão 0.
 * @return {number} Valor da CBS.
 * @customfunction
 */
function CBS_SIMULADA(base, ano, reducao) {
  return (Number(base) || 0) * ALIQUOTA_IBSCBS(ano, 'CBS', reducao);
}

/**
 * Calcula o valor de IBS sobre uma base de cálculo em um ano.
 *
 * @param {number} base Base de cálculo (valor sem IBS/CBS).
 * @param {number} ano Ano de 2026 a 2033.
 * @param {number} [reducao] Percentual de redução (ex.: 60%). Padrão 0.
 * @return {number} Valor do IBS.
 * @customfunction
 */
function IBS_SIMULADO(base, ano, reducao) {
  return (Number(base) || 0) * ALIQUOTA_IBSCBS(ano, 'IBS', reducao);
}

function buscarAno_(ano) {
  var alvo = String(Number(ano));
  var linhas = lerCronograma_(SpreadsheetApp.getActive());
  for (var i = 0; i < linhas.length; i++) {
    if (linhas[i].rotulo === alvo) return linhas[i];
  }
  throw new Error('Ano ' + ano + ' não encontrado na aba Cronograma.');
}

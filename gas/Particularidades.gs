/**
 * Particularidades.gs — o formulário da reunião com o Paulo.
 *
 * Porta de onboarding/planilha_particularidades.py, só que aqui o
 * "arquivo .xlsx" é uma aba da própria planilha: a pessoa preenche no
 * Sheets e o app lê de volta na etapa 2, sem upload nem download.
 */

/** Gera/atualiza a aba Particularidades a partir da aba Triagem. */
function gerarParticularidades(competencia) {
  competencia = competencia || competenciaAtual();
  validarCompetencia(competencia);

  var triagem = abaObrigatoria_(ABAS.triagem);
  var empresas = lerObjetos_(triagem).filter(function (e) { return e['N° Cliente']; });
  if (!empresas.length) {
    return { erro: 'A aba "' + ABAS.triagem + '" está vazia. Processe um e-mail "EMPRESA NOVA" antes.' };
  }

  var aba = aba_(ABAS.particularidades, true);
  var idx = indices_(aba);
  if (!idx['N° Cliente']) {
    montarCabecalhoParticularidades_(aba);
    idx = indices_(aba);
  }

  var jaTem = valoresColuna_(aba, idx['N° Cliente']);
  var novas = empresas.filter(function (e) { return jaTem.indexOf(String(e['N° Cliente'])) === -1; });
  if (!novas.length) {
    return { erro: 'Todas as empresas da triagem já estão na aba "' + ABAS.particularidades + '".' };
  }

  var primeiraNova = aba.getLastRow() + 1;
  acrescentarLinhas_(aba, idx, novas.map(function (e) {
    var reg = {};
    reg['N° Cliente'] = e['N° Cliente'];
    reg['Razão social'] = e['Razão social'];
    reg['CNPJ'] = e['CNPJ'];
    reg['Município / UF'] = e['Município / UF'] || '';
    reg['Certificado A1'] = e['Certificado'] || '';
    reg['Senha (cofre)'] = e['Senha (cofre)'] || '';
    reg['Regime confirmado'] = regimeParaLista_(e['Regime informado']);
    reg[COL_COMPETENCIA] = competencia;
    reg['Situação'] = 'Pendente distribuição';
    return reg;
  }));

  aplicarFormatoParticularidades_(aba, primeiraNova, aba.getLastRow());
  registrarLog_('Particularidades', novas.length + ' empresa(s), competência ' + competencia);

  return {
    criadas: novas.length,
    competencia: competencia,
    liberaEm: competenciaLiberacao(competencia),
    aba: ABAS.particularidades
  };
}

function regimeParaLista_(regimeInformado) {
  var r = String(regimeInformado || '').trim();
  return REGIMES.indexOf(r) !== -1 ? r : '⚠ A confirmar';
}

function montarCabecalhoParticularidades_(aba) {
  var titulos = COLS_PARTICULARIDADES.map(function (c) { return c.titulo; });
  escreverCabecalho_(aba, titulos);
  COLS_PARTICULARIDADES.forEach(function (c, i) { aba.setColumnWidth(i + 1, c.largura); });
  aba.setFrozenColumns(COLS_IDENTIFICACAO);
}

function aplicarFormatoParticularidades_(aba, primeira, ultima) {
  if (ultima < primeira) return;
  var linhas = ultima - primeira + 1;

  aba.getRange(primeira, 1, linhas, COLS_PARTICULARIDADES.length)
    .setFontSize(9).setVerticalAlignment('top').setWrap(true)
    .setBorder(true, true, true, true, true, true, CORES.borda, SpreadsheetApp.BorderStyle.SOLID);

  // Identificação vem da triagem: fundo neutro para dizer "não edite".
  aba.getRange(primeira, 1, linhas, COLS_IDENTIFICACAO).setBackground(CORES.cabecalho);
  // O resto é preenchimento manual: amarelo, como no .xlsx original.
  aba.getRange(primeira, COLS_IDENTIFICACAO + 1, linhas,
    COLS_PARTICULARIDADES.length - COLS_IDENTIFICACAO).setBackground(CORES.preencher);

  COLS_PARTICULARIDADES.forEach(function (c, i) {
    if (!c.lista) return;
    var regra = SpreadsheetApp.newDataValidation()
      .requireValueInList(c.lista, true)
      .setAllowInvalid(false)
      .setHelpText('Escolha um valor da lista — é o que mantém a carteira consistente.')
      .build();
    aba.getRange(primeira, i + 1, linhas, 1).setDataValidation(regra);
  });

  // Competência como texto, senão o Sheets converte "08/2026" em data.
  var colComp = indices_(aba)[COL_COMPETENCIA];
  if (colComp) aba.getRange(primeira, colComp, linhas, 1).setNumberFormat('@');
}

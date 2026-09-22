/**
 * Particularidades.gs — o formato da aba que concentra tudo.
 *
 * Ela é a única aba do fluxo: recebe o que a etapa 1 apurou do e-mail e da
 * Receita e o que a reunião com o Paulo definir. O que o app preenche vem em
 * cinza (não se reescreve à mão); o que é decisão da pessoa vem em amarelo,
 * com lista suspensa onde o valor precisa ser consistente com a carteira.
 */

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

  // Cinza: veio do e-mail ou da Receita. Amarelo: é você quem preenche.
  COLS_PARTICULARIDADES.forEach(function (c, i) {
    aba.getRange(primeira, i + 1, linhas, 1)
      .setBackground(c.manual ? CORES.preencher : CORES.cabecalho);
  });

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

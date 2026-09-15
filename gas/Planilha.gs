/**
 * Planilha.gs — utilidades de aba, cabeçalho e escrita.
 *
 * Tudo que mexe em Sheets passa por aqui, para o resto do app continuar
 * sendo lógica pura e testável fora do Apps Script.
 */

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function aba_(nome, criarSeFaltar) {
  var planilha = ss_();
  var aba = planilha.getSheetByName(nome);
  if (!aba && criarSeFaltar) aba = planilha.insertSheet(nome);
  return aba;
}

function abaObrigatoria_(nome) {
  var aba = aba_(nome, false);
  if (!aba) {
    throw new Error('A aba "' + nome + '" não existe nesta planilha. ' +
      'Use o menu Onboarding Fiscal → Configurar → Criar/conferir abas.');
  }
  return aba;
}

/** {título do cabeçalho: número da coluna (1-based)}. */
function indices_(aba) {
  var ultima = aba.getLastColumn();
  if (ultima < 1) return {};
  var cabecalho = aba.getRange(1, 1, 1, ultima).getValues()[0];
  var idx = {};
  cabecalho.forEach(function (titulo, i) {
    var t = String(titulo).trim();
    if (t) idx[t] = i + 1;
  });
  return idx;
}

/**
 * Acrescenta ao fim da aba as colunas que faltarem. Aditivo de propósito:
 * não mexe nas colunas que o escritório já usa.
 */
function garantirColunas_(aba, colunas) {
  var idx = indices_(aba);
  colunas.forEach(function (nome) {
    if (!idx[nome]) {
      var nova = Math.max(aba.getLastColumn(), 1) + 1;
      var celula = aba.getRange(1, nova);
      celula.setValue(nome);
      formatarCabecalho_(celula);
      aba.setColumnWidth(nova, 130);
      idx[nome] = nova;
    }
  });
  return idx;
}

function formatarCabecalho_(intervalo) {
  intervalo.setBackground(CORES.navy).setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(9)
    .setVerticalAlignment('middle').setHorizontalAlignment('center')
    .setWrap(true);
}

/** Escreve o cabeçalho de uma aba e congela a primeira linha. */
function escreverCabecalho_(aba, titulos) {
  aba.getRange(1, 1, 1, titulos.length).setValues([titulos]);
  formatarCabecalho_(aba.getRange(1, 1, 1, titulos.length));
  aba.setRowHeight(1, 34);
  aba.setFrozenRows(1);
}

/** Valores de uma coluna, da linha 2 para baixo, como texto sem vazios. */
function valoresColuna_(aba, coluna) {
  var ultima = aba.getLastRow();
  if (ultima < 2 || !coluna) return [];
  return aba.getRange(2, coluna, ultima - 1, 1).getValues()
    .map(function (l) { return String(l[0]).trim(); })
    .filter(String);
}

/** Lê a aba inteira como lista de objetos {cabeçalho: valor}. */
function lerObjetos_(aba) {
  var ultimaLinha = aba.getLastRow();
  var ultimaCol = aba.getLastColumn();
  if (ultimaLinha < 2 || ultimaCol < 1) return [];

  var dados = aba.getRange(1, 1, ultimaLinha, ultimaCol).getValues();
  var cabecalho = dados[0].map(function (c) { return String(c).trim(); });

  return dados.slice(1).map(function (linha, i) {
    var obj = { _linha: i + 2 };
    cabecalho.forEach(function (titulo, c) {
      if (titulo) obj[titulo] = linha[c] === null || linha[c] === undefined ? '' : String(linha[c]).trim();
    });
    return obj;
  });
}

/** Acrescenta linhas ao fim da aba, respeitando a ordem do cabeçalho. */
function acrescentarLinhas_(aba, idx, registros) {
  if (!registros.length) return;
  var largura = aba.getLastColumn();
  var linhas = registros.map(function (reg) {
    var linha = new Array(largura).fill('');
    Object.keys(reg).forEach(function (coluna) {
      if (idx[coluna]) linha[idx[coluna] - 1] = reg[coluna];
    });
    return linha;
  });
  aba.getRange(aba.getLastRow() + 1, 1, linhas.length, largura).setValues(linhas);
}

function competenciaDaCaixa_(valor) {
  // O Sheets às vezes converte "08/2026" em data; normaliza de volta.
  if (valor instanceof Date) return pad2_(valor.getMonth() + 1) + '/' + valor.getFullYear();
  return String(valor || '').trim();
}

function hojeBr_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
}

function agoraIso_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm');
}

/** Registra o que o app fez, para dar rastro a quem abrir a planilha depois. */
function registrarLog_(acao, detalhe) {
  var aba = aba_(ABAS.log, true);
  if (aba.getLastRow() === 0) {
    escreverCabecalho_(aba, ['Quando', 'Quem', 'Ação', 'Detalhe']);
    aba.setColumnWidth(1, 130);
    aba.setColumnWidth(3, 200);
    aba.setColumnWidth(4, 520);
  }
  var quem = '';
  try { quem = Session.getActiveUser().getEmail() || ''; } catch (e) { quem = '(não identificado)'; }
  aba.appendRow([agoraIso_(), quem, acao, detalhe]);
}

function alerta_(titulo, mensagem) {
  SpreadsheetApp.getUi().alert(titulo, mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
}

function toast_(mensagem) {
  ss_().toast(mensagem, 'Onboarding Fiscal', 6);
}

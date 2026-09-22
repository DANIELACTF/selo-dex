/**
 * Parser.gs — lê o e-mail "EMPRESA NOVA" da Thays.
 *
 * Porta de onboarding/parser.py. O formato não é padronizado entre os
 * e-mails (bullet ou não, "CNPJ:" com ou sem rótulo, "N°"/"n°", espaçamento
 * variável), então o parser usa heurística sobre blocos delimitados por
 * "<nome da empresa> CNPJ ... N°####".
 *
 * Se a Thays mudar o formato, ajuste os padrões daqui e rode
 * `node tests/test_gas.mjs`, que confere contra os e-mails reais de
 * fixtures/.
 */

// Nome não inclui dígitos de propósito: evita que telefone solto no texto
// anterior seja engolido pelo grupo não-guloso do nome.
//
// Tolerâncias que o OCR do PDF exigiu, vistas em e-mails reais:
//   • o marcador de número vem como "N°" (U+00B0) no texto do Outlook e como
//     "Nº" (U+00BA, ordinal masculino) quando sai do OCR — e às vezes "No";
//   • o rótulo "CNPJ" é lido como "CNP)" ou "CNPU", porque o J encosta nos
//     dois pontos.
var BLOCO_HEADER_RE = new RegExp(
  '([A-ZÀ-Ü&,.\\-\\s]{4,}?)\\s*' +
  '(?:CNP[JU)\\]|]?\\s*:?\\s*)?' +
  '(\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2})\\s*' +
  '[Nn]\\s*[°ºoO.\\-]?\\s*(\\d{3,6})',
  'g');

var EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
var SENHA_RE = /senha\s*(?:certificado)?\s*:?\s*([^\n]+)/i;
var CELULAR_RE = /celular\s*:?\s*([\d()\-\s+]{8,})/i;
// A lista de anexos vem depois de "N anexos (25 KB)". No texto do Outlook
// ela ocupa uma linha; no OCR ela se parte em várias ("NT" numa linha,
// "REZENDE IMOBILIARIA S A 2026-2027.pfx;" na seguinte). Pegamos uma janela
// depois do marcador e recompomos os nomes pelos ponto-e-vírgulas.
var ANEXOS_BLOCO_RE = /\d+\s+anexos?\s*\([^)]*\)([\s\S]{0,600})/gi;
var RE_NOME_ARQUIVO = /\.[A-Za-z0-9]{2,5}$/;
// O Outlook grava a data em dois formatos, conforme a configuração de quem
// imprime: "Data Qui, 27/08/2026 16:26" e "Data Seg, 2026-09-14 16:00".
var DATA_EMAIL_RE = /Data\s*:?\s*\S+,?\s*(\d{2}\/\d{2}\/\d{4})/i;
var DATA_EMAIL_ISO_RE = /Data\s*:?\s*\S+,?\s*(\d{4})-(\d{2})-(\d{2})/i;
var OBS_RE = /(?:obs\.?|observa[cç][aã]o)\s*:?\s*([^\n]+)/i;
var GRUPO_RE = /mesmo grupo[^\n]*/i;

var REGIME_PATTERNS = [
  ['MEI', /\bMEI\b/i],
  ['Simples Nacional', /simples\s+nacional|optante\s+pelo\s+simples/i],
  ['Lucro Presumido', /lucro\s+presumido/i],
  ['Lucro Real', /lucro\s+real/i]
];

function limparNome_(nome) {
  return nome.replace(/^[\s\t\n\-•.]+|[\s\t\n\-•.]+$/g, '').replace(/\s+/g, ' ');
}

/**
 * Extrai as empresas citadas no e-mail.
 * @return {Array<Object>} {numero, nome, cnpj, regimeInformado, emailContato,
 *                          senhaCertificado, celular, observacao, blocoTexto}
 */
function parseEmail(texto) {
  var matches = [];
  var m;
  BLOCO_HEADER_RE.lastIndex = 0;
  while ((m = BLOCO_HEADER_RE.exec(texto)) !== null) {
    matches.push({ nome: m[1], cnpj: m[2], numero: m[3], inicio: m.index, fim: BLOCO_HEADER_RE.lastIndex });
  }

  return matches.map(function (h, i) {
    var corpo = texto.slice(h.fim, i + 1 < matches.length ? matches[i + 1].inicio : texto.length);

    var regime = null;
    for (var k = 0; k < REGIME_PATTERNS.length; k++) {
      if (REGIME_PATTERNS[k][1].test(corpo)) { regime = REGIME_PATTERNS[k][0]; break; }
    }

    var senha = SENHA_RE.exec(corpo);
    var celular = CELULAR_RE.exec(corpo);
    var obsM = OBS_RE.exec(corpo);
    var grupoM = obsM ? null : GRUPO_RE.exec(corpo);

    return {
      numero: h.numero,
      nome: limparNome_(h.nome),
      cnpj: h.cnpj,
      regimeInformado: regime,
      emailContato: corpo.match(EMAIL_RE) || [],
      senhaCertificado: senha ? senha[1].trim() : null,
      celular: celular ? celular[1].trim() : null,
      observacao: obsM ? obsM[1].trim() : (grupoM ? grupoM[0].trim() : null),
      blocoTexto: corpo.trim()
    };
  });
}

/** Nomes de arquivo listados depois de "N anexos (...)" no e-mail. */
function extrairAnexos(texto) {
  var anexos = [];
  var m;
  ANEXOS_BLOCO_RE.lastIndex = 0;
  while ((m = ANEXOS_BLOCO_RE.exec(texto)) !== null) {
    // A lista acaba no corpo da mensagem; o ponto-e-vírgula é o separador,
    // e só interessa o que tem cara de nome de arquivo.
    m[1].split(';').forEach(function (parte) {
      var nome = parte.replace(/\s+/g, ' ').trim();
      if (nome && RE_NOME_ARQUIVO.test(nome)) anexos.push(nome);
    });
  }
  return anexos;
}

/** Data de envio (linha "Data: ..."), sempre em DD/MM/AAAA, ou null. */
function extrairDataEmail(texto) {
  var m = DATA_EMAIL_RE.exec(texto);
  if (m) return m[1];

  var iso = DATA_EMAIL_ISO_RE.exec(texto);
  return iso ? iso[3] + '/' + iso[2] + '/' + iso[1] : null;
}

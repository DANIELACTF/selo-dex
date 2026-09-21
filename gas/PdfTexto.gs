/**
 * PdfTexto.gs — converte o PDF do e-mail em texto, para o resto da etapa 1
 * trabalhar em cima.
 *
 * Como: o Drive converte PDF em Documento Google e, quando o PDF é imagem
 * escaneada — que é o caso do comprovante que a Thays manda —, faz OCR no
 * caminho. Lemos o texto do documento e jogamos a conversão fora.
 *
 * Por que pela API REST e não pelo serviço avançado do Drive: o serviço
 * avançado precisa ser ligado à mão em cada projeto do Apps Script, e
 * esquecer disso fazia a etapa 1 falhar inteira. A API REST usa o token que
 * a própria planilha já tem (o escopo `drive` está no appsscript.json), então
 * não há passo de configuração nenhum.
 */

var URL_DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
var MIME_DOC_GOOGLE = 'application/vnd.google-apps.document';

/** Tipos que o Drive converte com OCR. */
var TIPOS_CONVERSIVEIS = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp'
};

function tipoDoArquivo_(nome) {
  var m = /\.([A-Za-z0-9]+)\s*$/.exec(String(nome || ''));
  return m ? TIPOS_CONVERSIVEIS[m[1].toLowerCase()] || null : null;
}

/**
 * Sobe o arquivo pedindo a conversão em Documento Google e devolve o id.
 * Multipart montado à mão porque o UrlFetchApp não monta sozinho.
 */
function subirParaConversao_(bytes, mime, nome) {
  var limite = 'moraex' + Utilities.getUuid().replace(/-/g, '');
  var metadados = JSON.stringify({ name: 'conversao-temporaria-' + nome, mimeType: MIME_DOC_GOOGLE });

  var cabeca = Utilities.newBlob(
    '--' + limite + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    metadados + '\r\n' +
    '--' + limite + '\r\n' +
    'Content-Type: ' + mime + '\r\n\r\n'
  ).getBytes();
  var rabo = Utilities.newBlob('\r\n--' + limite + '--').getBytes();

  var resposta = UrlFetchApp.fetch(
    URL_DRIVE_UPLOAD + '?uploadType=multipart&supportsAllDrives=true&ocrLanguage=pt&fields=id',
    {
      method: 'post',
      contentType: 'multipart/related; boundary=' + limite,
      payload: cabeca.concat(Utilities.newBlob(bytes).getBytes()).concat(rabo),
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    }
  );

  var codigo = resposta.getResponseCode();
  var corpo = resposta.getContentText();
  if (codigo === 401 || codigo === 403) {
    throw new Error('o Google recusou a conversão (HTTP ' + codigo + '). Abra o menu ' +
      'Configurar → Criar/conferir abas para reautorizar o app e tente de novo.');
  }
  if (codigo < 200 || codigo >= 300) {
    throw new Error('o Drive respondeu HTTP ' + codigo + ' ao converter' + detalheDoDrive_(corpo));
  }

  var id = JSON.parse(corpo).id;
  if (!id) throw new Error('o Drive converteu mas não devolveu o id do documento');
  return id;
}

function detalheDoDrive_(corpo) {
  try {
    var erro = JSON.parse(corpo).error;
    return erro && erro.message ? ' (' + erro.message + ')' : '';
  } catch (e) {
    return '';
  }
}

/**
 * @param {string} base64  conteúdo do arquivo
 * @param {string} nome    nome do arquivo, para a mensagem de erro
 * @return {{texto: ?string, erro: ?string}}
 */
function pdfParaTexto(base64, nome) {
  var mime = tipoDoArquivo_(nome);
  if (!mime) {
    return { texto: null, erro: 'formato não suportado — envie PDF ou imagem ' +
      '(PNG, JPG, GIF, BMP, TIFF, WEBP)' };
  }

  var id = null;
  try {
    id = subirParaConversao_(Utilities.base64Decode(base64), mime, nome);
    var texto = DocumentApp.openById(id).getBody().getText();
    if (!String(texto).trim()) {
      return { texto: null, erro: 'a conversão saiu vazia — o arquivo pode estar em branco, ' +
        'protegido por senha, ou com a imagem ilegível para o OCR' };
    }
    return { texto: texto, erro: null };
  } catch (e) {
    return { texto: null, erro: String(e && e.message ? e.message : e) };
  } finally {
    // A conversão é descartável: não deixamos lixo no Drive da pessoa.
    if (id) {
      try {
        DriveApp.getFileById(id).setTrashed(true);
      } catch (e) { /* já foi, ou sem permissão: não é motivo para falhar */ }
    }
  }
}

/**
 * Converte vários arquivos e devolve o texto de todos junto, com o relato do
 * que deu certo e do que não deu.
 *
 * @param {Array<{nome: string, base64: string}>} arquivos
 * @return {{texto: string, lidos: Array<string>, falharam: Array<string>}}
 */
function pdfsParaTexto(arquivos) {
  var partes = [];
  var lidos = [];
  var falharam = [];

  var lista = arquivos || [];
  if (lista.length > MAX_PDFS_POR_EXECUCAO) {
    lista.slice(MAX_PDFS_POR_EXECUCAO).forEach(function (a) {
      falharam.push(a.nome + ': não convertido — no máximo ' + MAX_PDFS_POR_EXECUCAO +
        ' arquivos por execução, para a conversão não estourar o tempo. Processe o resto depois.');
    });
    lista = lista.slice(0, MAX_PDFS_POR_EXECUCAO);
  }

  lista.forEach(function (a) {
    var r = pdfParaTexto(a.base64, a.nome);
    if (r.texto) {
      partes.push(r.texto);
      lidos.push(a.nome);
    } else {
      falharam.push(a.nome + ': ' + r.erro);
    }
  });

  return { texto: partes.join('\n\n'), lidos: lidos, falharam: falharam };
}

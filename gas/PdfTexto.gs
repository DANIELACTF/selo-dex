/**
 * PdfTexto.gs — converte um PDF anexado em texto, para o leitor de
 * comprovante (Comprovante.gs) trabalhar em cima.
 *
 * Como: o Drive converte PDF em Documento Google, com OCR quando o PDF é
 * imagem escaneada. Lemos o texto do documento e jogamos a conversão fora.
 *
 * Requisito: o **serviço avançado do Drive** precisa estar ligado no projeto
 * do Apps Script (Editor → Serviços → +Drive API). Sem ele, a função avisa
 * em vez de quebrar — e o app continua funcionando pelo comprovante colado
 * no corpo do e-mail, que não precisa de conversão nenhuma.
 */

var IDIOMA_OCR = 'pt';

/** O serviço avançado do Drive está disponível neste projeto? */
function driveAvancadoDisponivel() {
  try {
    return typeof Drive !== 'undefined' && !!Drive.Files;
  } catch (e) {
    return false;
  }
}

/**
 * @param {string} base64   conteúdo do PDF
 * @param {string} nome     nome do arquivo, para a mensagem de erro
 * @return {{texto: ?string, erro: ?string}}
 */
function pdfParaTexto(base64, nome) {
  if (!driveAvancadoDisponivel()) {
    return { texto: null, erro: 'o serviço avançado do Drive não está ligado neste projeto ' +
      '(Editor do Apps Script → Serviços → + → Drive API)' };
  }

  var convertido = null;
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), 'application/pdf', nome);
    convertido = Drive.Files.create(
      { name: 'conversao-temporaria-' + nome, mimeType: MimeType.GOOGLE_DOCS },
      blob,
      { ocrLanguage: IDIOMA_OCR, supportsAllDrives: true }
    );
    var texto = DocumentApp.openById(convertido.id).getBody().getText();
    return { texto: texto, erro: null };
  } catch (e) {
    return { texto: null, erro: String(e && e.message ? e.message : e) };
  } finally {
    // A conversão é descartável: não deixamos lixo no Drive da pessoa.
    if (convertido && convertido.id) {
      try {
        DriveApp.getFileById(convertido.id).setTrashed(true);
      } catch (e) { /* já foi, ou sem permissão: não é motivo para falhar */ }
    }
  }
}

/**
 * Converte vários PDFs e devolve o texto de todos junto, com o relato do
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
        ' PDFs por execução, para a conversão não estourar o tempo. Processe o resto depois.');
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

/** Chamado pela barra lateral: converte os PDFs e processa o e-mail. */
function processarComAnexos(texto, consultar, arquivos) {
  try {
    var conversao = pdfsParaTexto(arquivos);
    var resumo = processarEmail(texto, consultar !== false, conversao.texto);
    if (resumo && !resumo.erro) {
      resumo.pdfsLidos = conversao.lidos;
      resumo.pdfsComFalha = conversao.falharam;
    }
    return resumo;
  } catch (e) {
    return { erro: String(e && e.message ? e.message : e) };
  }
}

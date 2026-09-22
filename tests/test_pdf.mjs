import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/** Contexto com dublês do Drive/UrlFetch, para exercitar a conversão. */
function contexto(resposta, textoDoDoc) {
  const chamadas = [];
  const lixeira = [];
  const ctx = {
    console,
    UrlFetchApp: {
      fetch(url, opcoes) {
        chamadas.push({ url, opcoes });
        return {
          getResponseCode: () => resposta.codigo,
          getContentText: () => resposta.corpo
        };
      }
    },
    Utilities: {
      getUuid: () => 'aaaa-bbbb',
      base64Decode: () => [1, 2, 3],
      newBlob: (x) => ({ getBytes: () => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : x) })
    },
    ScriptApp: { getOAuthToken: () => 'token-de-teste' },
    DocumentApp: { openById: () => ({ getBody: () => ({ getText: () => textoDoDoc }) }) },
    DriveApp: { getFileById: (id) => ({ setTrashed: () => lixeira.push(id) }) },
    SpreadsheetApp: { getUi: () => ({}) }, Session: {}, HtmlService: {}
  };
  vm.createContext(ctx);
  for (const f of ['Config.gs', 'PdfTexto.gs']) {
    vm.runInContext(fs.readFileSync(`gas/${f}`, 'utf8'), ctx, { filename: f });
  }
  return { ctx, chamadas, lixeira };
}

const OK = { codigo: 200, corpo: JSON.stringify({ id: 'doc-123' }) };

test('converte sem exigir o serviço avançado do Drive', () => {
  const { ctx, chamadas } = contexto(OK, 'TEXTO DO E-MAIL');
  const r = ctx.pdfParaTexto('base64', 'email.pdf');

  assert.equal(r.erro, null);
  assert.equal(r.texto, 'TEXTO DO E-MAIL');
  assert.equal(chamadas.length, 1);
  assert.match(chamadas[0].url, /upload\/drive\/v3\/files/);
  assert.match(chamadas[0].url, /uploadType=multipart/);
  assert.match(chamadas[0].url, /ocrLanguage=pt/);
  assert.equal(chamadas[0].opcoes.headers.Authorization, 'Bearer token-de-teste');
  assert.match(chamadas[0].opcoes.contentType, /^multipart\/related; boundary=/);
});

test('a conversão temporária vai para a lixeira', () => {
  const { ctx, lixeira } = contexto(OK, 'TEXTO');
  ctx.pdfParaTexto('base64', 'email.pdf');
  assert.deepEqual([...lixeira], ['doc-123']);
});

test('imagem também é aceita — é como o comprovante chega', () => {
  const { ctx } = contexto(OK, 'COMPROVANTE');
  for (const nome of ['print.png', 'foto.JPG', 'scan.tiff']) {
    assert.equal(ctx.pdfParaTexto('base64', nome).erro, null, nome);
  }
});

test('formato que o Drive não converte é recusado com explicação', () => {
  const { ctx, chamadas } = contexto(OK, 'x');
  const r = ctx.pdfParaTexto('base64', 'planilha.xlsx');
  assert.match(r.erro, /formato não suportado/);
  assert.equal(chamadas.length, 0, 'nem deveria chamar o Drive');
});

test('403 diz exatamente o que ligar, não só que falhou', () => {
  const { ctx } = contexto(
    { codigo: 403, corpo: '{"error":{"message":"Drive API has not been used in project"}}' }, '');
  const erro = ctx.pdfParaTexto('base64', 'email.pdf').erro;
  assert.match(erro, /HTTP 403/);
  assert.match(erro, /Drive API has not been used/, 'a mensagem do Google precisa aparecer');
  assert.match(erro, /Serviços/, 'precisa dizer onde ligar');
  assert.match(erro, /Drive API/);
});

test('com o serviço avançado ligado, a API REST nem é chamada', () => {
  const { ctx, chamadas } = contexto(OK, 'TEXTO PELO SERVIÇO');
  ctx.Drive = { Files: { create: () => ({ id: 'doc-avancado' }) } };

  const r = ctx.pdfParaTexto('base64', 'email.pdf');
  assert.equal(r.texto, 'TEXTO PELO SERVIÇO');
  assert.equal(chamadas.length, 0, 'não deveria cair no caminho REST');
});

test('serviço avançado de versão antiga (insert) também serve', () => {
  const { ctx } = contexto(OK, 'TEXTO');
  ctx.Drive = { Files: { insert: () => ({ id: 'doc-antigo' }) } };
  assert.equal(ctx.pdfParaTexto('base64', 'email.pdf').erro, null);
});

test('erro do Drive traz a mensagem que ele devolveu', () => {
  const { ctx } = contexto({ codigo: 500, corpo: '{"error":{"message":"Backend Error"}}' }, '');
  const r = ctx.pdfParaTexto('base64', 'email.pdf');
  assert.match(r.erro, /HTTP 500/);
  assert.match(r.erro, /Backend Error/);
});

test('conversão vazia é reportada, não tratada como sucesso', () => {
  const { ctx } = contexto(OK, '   \n  ');
  assert.match(ctx.pdfParaTexto('base64', 'email.pdf').erro, /saiu vazia/);
});

test('vários arquivos: junta o texto e relata o que falhou', () => {
  const { ctx } = contexto(OK, 'PEDAÇO');
  const r = ctx.pdfsParaTexto([
    { nome: 'email.pdf', base64: 'a' },
    { nome: 'comprovante.png', base64: 'b' },
    { nome: 'planilha.xlsx', base64: 'c' }
  ]);
  assert.equal(r.texto, 'PEDAÇO\n\nPEDAÇO');
  assert.deepEqual([...r.lidos], ['email.pdf', 'comprovante.png']);
  assert.equal(r.falharam.length, 1);
  assert.match(r.falharam[0], /planilha\.xlsx/);
});

test('o teto por execução é respeitado e avisado', () => {
  const { ctx } = contexto(OK, 'X');
  const muitos = [];
  for (let i = 0; i < 9; i++) muitos.push({ nome: `arq${i}.pdf`, base64: 'a' });
  const r = ctx.pdfsParaTexto(muitos);
  assert.equal(r.lidos.length, ctx.MAX_PDFS_POR_EXECUCAO);
  assert.equal(r.falharam.length, 9 - ctx.MAX_PDFS_POR_EXECUCAO);
  assert.match(r.falharam[0], /no máximo/);
});

/**
 * Testa a leitura do comprovante e do e-mail contra material REAL.
 *
 *   node --test tests/test_comprovante.mjs
 *
 * Os fixtures aqui não são reconstruções: saíram dos PDFs que a Thays
 * enviou. `fixtures/email-real-*.txt` é o texto que o Outlook produz;
 * `fixtures/ocr/*.txt` é o que o OCR produz das mesmas páginas, com os
 * comprovantes que vêm como imagem.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const gas = { console };
vm.createContext(gas);
for (const arquivo of ['Config.gs', 'Competencia.gs', 'Parser.gs', 'Regras.gs', 'Comprovante.gs']) {
  vm.runInContext(fs.readFileSync(`gas/${arquivo}`, 'utf8'), gas, { filename: arquivo });
}

const planos = (v) => JSON.parse(JSON.stringify(v));
const ler = (caminho) => fs.readFileSync(caminho, 'utf8');

const EMAIL_LIMPO = ler('fixtures/email-real-27-08-2026.txt');
const EMAIL_ISO = ler('fixtures/email-real-14-09-2026-iso.txt');
const EMAIL_OCR = ler('fixtures/ocr/email-27-08-2026-ocr.txt');

// -------------------------------------------- o e-mail, nos três formatos

const LOTE_27_08 = [
  ['1093', '57.226.244/0001-04', 'MEI'],
  ['1094', '68.449.732/0001-05', 'Lucro Presumido'],
  ['1095', '68.311.865/0001-02', 'Lucro Presumido'],
  ['1096', '32.529.246/0001-41', 'Simples Nacional'],
  ['1097', '45.668.642/0001-00', 'Simples Nacional'],
  ['1098', '55.195.793/0001-33', 'Lucro Presumido'],
  ['1099', '60.772.067/0001-76', 'Lucro Presumido']
];

test('lê as 7 empresas do e-mail real, do texto do Outlook', () => {
  const empresas = gas.parseEmail(EMAIL_LIMPO);
  assert.deepEqual(planos(empresas.map((e) => [e.numero, e.cnpj, e.regimeInformado])), LOTE_27_08);
});

test('acha as mesmas 7 empresas quando o texto vem do OCR', () => {
  // O OCR escreve "Nº" (ordinal masculino) no lugar de "N°" e "CNP)" no
  // lugar de "CNPJ" — foi o que travava o reconhecimento.
  const empresas = gas.parseEmail(EMAIL_OCR);
  assert.deepEqual(planos(empresas.map((e) => [e.numero, e.cnpj])),
    LOTE_27_08.map(([numero, cnpj]) => [numero, cnpj]));
});

test('o OCR embaralha a ordem da página e pode perder o regime', () => {
  // Limitação medida, não defeito do parser: no PDF real o "MEI" do N°1093
  // sai ANTES do cabeçalho da empresa, caindo fora do bloco dela. Com o
  // texto do Outlook, que preserva a ordem, o regime é lido normalmente.
  const doOcr = gas.parseEmail(EMAIL_OCR).find((e) => e.numero === '1093');
  const doTexto = gas.parseEmail(EMAIL_LIMPO).find((e) => e.numero === '1093');
  assert.equal(doTexto.regimeInformado, 'MEI');
  assert.equal(doOcr.regimeInformado, null);

  // As outras seis mantêm o regime mesmo no OCR — a perda é pontual.
  const comRegime = gas.parseEmail(EMAIL_OCR).filter((e) => e.regimeInformado);
  assert.equal(comRegime.length, 6);
});

test('todos os CNPJs do lote real passam no dígito verificador', () => {
  for (const [numero, cnpj] of LOTE_27_08) {
    assert.ok(gas.cnpjValido(cnpj), `N°${numero} (${cnpj}) deveria ser válido`);
  }
});

test('lê o segundo e-mail real, com a data em formato ISO', () => {
  const empresas = gas.parseEmail(EMAIL_ISO);
  assert.deepEqual(planos(empresas.map((e) => e.numero)), ['1102', '1103', '1104', '1105']);
});

test('a data sai em DD/MM/AAAA nos dois formatos do Outlook', () => {
  assert.equal(gas.extrairDataEmail(EMAIL_LIMPO), '27/08/2026');  // "Data Qui, 27/08/2026 16:26"
  assert.equal(gas.extrairDataEmail(EMAIL_ISO), '14/09/2026');    // "Data Seg, 2026-09-14 16:00"
  assert.equal(gas.extrairDataEmail(EMAIL_OCR), '27/08/2026');
});

test('os anexos .pfx são reconhecidos no e-mail real', () => {
  assert.deepEqual(planos(gas.extrairAnexos(EMAIL_LIMPO)), [
    'NT REZENDE IMOBILIARIA S A 2026-2027.pfx',
    'NT REZENDE PARTICIPACOES LTDA 2026-2027.pfx'
  ]);
});

// ------------------------------------- o comprovante escaneado: o que dá

/** O bloco de texto de uma empresa do lote, pelo N°. */
function blocoDe(texto, numero) {
  const empresa = gas.parseEmail(texto).find((e) => e.numero === numero);
  return empresa ? empresa.blocoTexto : null;
}

test('aproveita o CNAE do comprovante escaneado', () => {
  // N°1094 — N&T REZENDE IMOBILIARIA: "68.10-2.01 - Compra e venda de
  // imóveis próprios" (o OCR trocou o segundo hífen por ponto).
  const d = gas.lerComprovante(blocoDe(EMAIL_OCR, '1094'), '68.449.732/0001-05');
  assert.ok(d, 'deveria reconhecer o comprovante');
  assert.equal(d.cnaeCodigo, '6810201');
  assert.match(d.cnaeDescricao, /Compra e venda de imóveis próprios/);
  assert.deepEqual(planos(d.cnaesSecundarios.map((c) => c.codigo)), ['6810202', '6822600']);
  assert.equal(d.uf, 'RJ');
});

test('o CNPJ do comprovante vem do e-mail, não do OCR', () => {
  // No OCR o CNPJ desta empresa sai como "EE 449 732000105".
  const d = gas.lerComprovante(blocoDe(EMAIL_OCR, '1094'), '68.449.732/0001-05');
  assert.equal(d.cnpj, '68.449.732/0001-05');
  assert.equal(d.cnpjValido, true);
});

test('a razão social NUNCA sai do comprovante escaneado', () => {
  // O OCR ofereceria "CÓDIGO E VESCHIÇÃO UA NATUNEZA JUNIUICA" como nome.
  for (const numero of ['1093', '1094', '1097']) {
    const bloco = blocoDe(EMAIL_OCR, numero);
    const d = gas.lerComprovante(bloco, '11.111.111/0001-11');
    if (d) assert.equal(d.razaoSocial, null, `N°${numero} não pode ter nome vindo do OCR`);
  }
});

test('todo resultado de OCR carrega o aviso de conferência', () => {
  const d = gas.lerComprovante(blocoDe(EMAIL_OCR, '1094'), '68.449.732/0001-05');
  assert.ok(d.avisos.some((a) => /OCR/.test(a) && /conferir/.test(a)));
  assert.match(d.fonte, /OCR/);
});

test('não afirma opção pelo Simples — o comprovante não informa isso', () => {
  const d = gas.lerComprovante(blocoDe(EMAIL_OCR, '1094'), '68.449.732/0001-05');
  assert.equal(d.optanteSimples, null);
  assert.equal(d.optanteMei, null);
});

test('o quanto o OCR rende neste lote real — 2 de 7', () => {
  // Número medido, não aspiracional. Caiu? alguma mudança piorou a leitura.
  // Subiu? melhorou, e este teste deve ser atualizado junto.
  const aproveitados = gas.parseEmail(EMAIL_OCR).filter((e) => {
    const d = gas.lerComprovante(e.blocoTexto, e.cnpj);
    return d && d.cnaeCodigo;
  });
  assert.equal(aproveitados.length, 2,
    `o OCR rendeu ${aproveitados.length} de 7 — se mudou, atualize o número e o LEIA-ME`);
});

test('texto que não é comprovante devolve null', () => {
  assert.equal(gas.lerComprovante('Segue novas empresas para cadastrar.', '11.111.111/0001-11'), null);
  assert.equal(gas.lerComprovante('', '11.111.111/0001-11'), null);
  assert.equal(gas.lerComprovante(null, '11.111.111/0001-11'), null);
});

test('o CNAE sai no formato que a ficha imprime', () => {
  const d = gas.lerComprovante(blocoDe(EMAIL_OCR, '1094'), '68.449.732/0001-05');
  assert.equal(gas.formatarCodigoCnae(d.cnaeCodigo), '68.10-2-01');
  assert.match(gas.formatarCnaePrincipal(d), /^68\.10-2-01 — Compra e venda/);
});

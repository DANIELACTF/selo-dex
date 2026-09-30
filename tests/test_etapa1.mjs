/**
 * Testa a etapa 1 no formato novo: o e-mail chega como PDF, o trabalho é
 * feito em chamadas curtas (é o que move a barra de progresso) e o resultado
 * é gravado em Particularidades e Pendentes Daniela.
 *
 *   node --test tests/test_etapa1.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planilhaFalsa, comoObjetos } from './planilha-falsa.mjs';

const planos = (v) => JSON.parse(JSON.stringify(v));

/** O texto que a conversão do PDF real entrega, comprovantes em OCR. */
const TEXTO_DO_PDF = fs.readFileSync('fixtures/ocr/email-27-08-2026-ocr.txt', 'utf8');

const CAB_PENDENTES = ['N° Cliente', 'Nome', 'CNPJ', 'Regime Tributário', 'Segmento',
  'Sugestão Analista', 'Origem', 'Observação', 'Competência entrada', 'Libera em'];
const CAB_CARTEIRA = ['N° Cliente', 'Nome', 'CNPJ', 'Regime Tributário', 'Segmento',
  'Analista Responsável', 'Nível', 'Status'];

/** Planilha pronta, com a conversão de PDF devolvendo o texto de teste. */
function cenario(texto) {
  const p = planilhaFalsa({
    'Pendentes Daniela': [CAB_PENDENTES],
    'Carteira Completa': [CAB_CARTEIRA]
  });
  p.ctx.pdfsParaTexto = () => ({
    texto: texto === undefined ? TEXTO_DO_PDF : texto,
    lidos: ['email.pdf'], falharam: []
  });
  p.ctx.consultarCnpj = (cnpj) => {
    const d = p.ctx.dadosCadastraisVazios_(cnpj, null);
    d.municipio = 'RIO DE JANEIRO';
    d.uf = 'RJ';
    d.porte = 'ME';
    d.situacaoCadastral = 'ATIVA';
    d.fonte = 'BrasilAPI';
    return d;
  };
  p.ctx.consultarOptanteSimples = (cnpj) => ({
    cnpj, optante: apenas(cnpj) === '45668642000100', mensagem: null, erro: null
  });
  return p;
}

const apenas = (s) => String(s).replace(/\D/g, '');

/** Roda os três passos como a barra lateral faz. */
function rodarTudo(ctx, consultar = true) {
  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  assert.ok(lote.ok, `abrirLote falhou: ${lote.erro}`);
  const resultados = lote.empresas.map((item) => ctx.consultarEmpresaDoLote(item, consultar));
  return { lote, resultados, resumo: ctx.gravarLote(lote, resultados) };
}

// ------------------------------------------------- passo 1: abrir o lote

test('abrirLote lê o PDF e lista as empresas sem consultar nada', () => {
  const { ctx } = cenario();
  let consultou = false;
  ctx.consultarCnpj = () => { consultou = true; };

  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  assert.equal(lote.ok, true);
  assert.equal(consultou, false, 'abrir o lote não pode consultar — isso é o passo 2');
  assert.deepEqual(planos(lote.empresas.map((e) => e.numero)),
    ['1093', '1094', '1095', '1096', '1097', '1098', '1099']);
  assert.equal(lote.recebidoEm, '27/08/2026');
  assert.equal(lote.competencia, '08/2026');
});

test('abrirLote já traz o que a barra precisa mostrar por empresa', () => {
  const { ctx } = cenario();
  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  const rezende = lote.empresas.find((e) => e.numero === '1094');

  assert.equal(rezende.nome, 'N&T REZENDE IMOBILIARIA S A');
  assert.equal(rezende.tipo, 'Matriz');
  assert.equal(rezende.cnpjValido, true);
  assert.equal(rezende.certificado, true, 'o .pfx dela está nos anexos do e-mail');
  // o comprovante dela veio legível o bastante para render o CNAE
  assert.ok(rezende.comprovante);
  assert.equal(rezende.comprovante.cnaeCodigo, '6810201');
});

test('quem não tem comprovante legível é listado, não inventado', () => {
  const { ctx } = cenario();
  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  // medido: o OCR deste lote rende comprovante em 2 das 7
  assert.equal(lote.semComprovante.length, 4);
  assert.equal(lote.empresas.filter((e) => e.comprovante).length, 3);
  // dos 3 reconhecidos, só 2 renderam CNAE aproveitável
  assert.equal(lote.empresas.filter((e) => e.comprovante && e.comprovante.cnaeCodigo).length, 2);
});

test('PDF sem empresa nenhuma explica o que faltou, com amostra do texto', () => {
  const { ctx } = cenario('Bom dia, segue em anexo o relatório mensal.');
  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  assert.match(lote.erro, /não encontrei nenhuma empresa/);
  assert.match(lote.amostraDoTexto, /relatório mensal/);
});

test('sem anexo, pede o PDF em vez de processar vazio', () => {
  const { ctx } = cenario();
  assert.match(ctx.abrirLote([]).erro, /Anexe o PDF/);
});

test('PDF que não converteu é reportado', () => {
  const { ctx } = cenario();
  ctx.pdfsParaTexto = () => ({ texto: '', lidos: [], falharam: ['email.pdf: Drive não ligado'] });
  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  assert.match(lote.erro, /Não consegui ler/);
  assert.deepEqual(planos(lote.pdfsComFalha), ['email.pdf: Drive não ligado']);
});

// --------------------------------------- passo 2: uma empresa por chamada

test('consultarEmpresaDoLote trata uma empresa de cada vez', () => {
  const { ctx } = cenario();
  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);

  const r = ctx.consultarEmpresaDoLote(lote.empresas[1], true);
  assert.equal(r.ok, true);
  assert.equal(r.numero, '1094');
  assert.equal(r.dados.fonte, 'BrasilAPI');
});

test('a consulta tem precedência sobre o comprovante escaneado', () => {
  // O OCR erra o bastante para não poder mandar numa ficha de cliente: ele
  // é recurso para quando a consulta falha, não fonte preferida.
  const { ctx } = cenario();
  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  const comComprovante = lote.empresas.find((e) => e.comprovante);

  const r = ctx.consultarEmpresaDoLote(comComprovante, true);
  assert.equal(r.dados.fonte, 'BrasilAPI');
});

test('falhando a consulta, o comprovante escaneado entra — marcado', () => {
  const { ctx } = cenario();
  ctx.consultarCnpj = (cnpj) => ctx.dadosCadastraisVazios_(cnpj, 'BrasilAPI respondeu HTTP 404');

  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  const comComprovante = lote.empresas.find((e) => e.comprovante);
  const r = ctx.consultarEmpresaDoLote(comComprovante, true);

  assert.match(r.dados.fonte, /OCR/);
  assert.ok(r.dados.avisos.some((a) => /conferir/.test(a)));
  assert.equal(r.dados.razaoSocial, null, 'o nome nunca vem do OCR');
});

test('erro numa empresa não derruba as outras', () => {
  const { ctx } = cenario();
  ctx.consultarOptanteSimples = () => { throw new Error('Receita fora do ar'); };

  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  const r = ctx.consultarEmpresaDoLote(lote.empresas[0], true);
  assert.equal(r.ok, false);
  assert.match(r.erro, /Receita fora do ar/);
  assert.equal(r.numero, '1093', 'o resultado precisa dizer de quem é o erro');
});

// ------------------------------------------------ passo 3: gravar o lote

test('grava em Particularidades e em Pendentes Daniela, de uma vez', () => {
  const { ctx, aba } = cenario();
  const { resumo } = rodarTudo(ctx);

  assert.equal(resumo.gravadas.length, 7);
  assert.equal(comoObjetos(aba('Particularidades')).length, 7);
  assert.equal(comoObjetos(aba('Pendentes Daniela')).length, 7);
  assert.equal(resumo.competencia, '08/2026');
  assert.equal(resumo.liberaEm, '11/2026');
});

test('a linha consolida o que era da Triagem e o que é da reunião', () => {
  const { ctx, aba } = cenario();
  rodarTudo(ctx);

  const linha = comoObjetos(aba('Particularidades')).find((l) => l['N° Cliente'] === '1099');
  // bloco do app: identificação do e-mail + cadastro da consulta
  assert.equal(linha['Razão social'], 'THAIS REIS DESIGN LTDA');
  assert.equal(linha['Tipo'], 'Matriz');
  assert.equal(linha['Município / UF'], 'RIO DE JANEIRO/RJ');
  assert.equal(linha['Porte'], 'ME');
  assert.equal(linha['Situação cadastral'], 'ATIVA');
  assert.equal(linha['Regime informado'], 'Lucro Presumido');
  assert.equal(linha['Regime / enquadramento'],
    'Lucro Presumido — PIS/COFINS cumulativo; IRPJ/CSLL trimestral');
  assert.equal(linha['Fonte dos dados'], 'BrasilAPI');
  assert.equal(linha['Competência entrada'], '08/2026');
  assert.equal(linha['Processado em'], '27/08/2026');
  // bloco da reunião fica em branco, para a pessoa preencher
  assert.equal(linha['Particularidade 1 (Paulo)'], '');
  assert.equal(linha['Responsável (analista)'], '');
  assert.equal(linha['Situação'], 'Pendente distribuição');
});

test('a entrada em carência sai com a competência do e-mail', () => {
  const { ctx, aba } = cenario();
  rodarTudo(ctx);

  const pend = comoObjetos(aba('Pendentes Daniela'));
  assert.deepEqual(planos(pend.map((l) => l['N° Cliente'])),
    ['1093', '1094', '1095', '1096', '1097', '1098', '1099']);
  assert.equal(pend[0]['Competência entrada'], '08/2026');
  assert.equal(pend[0]['Libera em'], '11/2026');
  assert.equal(pend[0]['Origem'], '🆕 Onboarding');
});

test('processar o mesmo PDF duas vezes não duplica', () => {
  const { ctx, aba } = cenario();
  rodarTudo(ctx);
  const segunda = rodarTudo(ctx);

  assert.equal(segunda.resumo.gravadas.length, 0);
  assert.equal(segunda.resumo.jaExistiam.length, 7);
  assert.equal(comoObjetos(aba('Particularidades')).length, 7);
  assert.equal(comoObjetos(aba('Pendentes Daniela')).length, 7);
});

test('empresa já na carteira não é recadastrada', () => {
  const { ctx, aba } = cenario();
  aba('Carteira Completa').appendRow(['1094', 'N&T REZENDE IMOBILIARIA S A',
    '68.449.732/0001-05', 'Lucro Presumido', 'Serviço', 'Wellington', 'Auxiliar', 'OK']);

  const { resumo } = rodarTudo(ctx);
  assert.ok(!resumo.gravadas.some((g) => g.numero === '1094'), 'a que já está na carteira');
  assert.equal(resumo.gravadas.length, 6);
});

test('CNPJ que não passa no dígito verificador é apontado, não gravado em silêncio', () => {
  // 60.772.067/0001-70 tem o último dígito trocado, como um OCR faria
  const { ctx, aba } = cenario(
    TEXTO_DO_PDF.replace('60.772.067/0001-76', '60.772.067/0001-70'));

  const { resumo } = rodarTudo(ctx);
  assert.equal(resumo.cnpjSuspeito.length, 1);
  assert.match(resumo.cnpjSuspeito[0], /1099/);

  const linha = comoObjetos(aba('Particularidades')).find((l) => l['N° Cliente'] === '1099');
  assert.match(linha['Particularidades'], /dígito verificador/);
});

test('certificado faltante vira alerta e texto de cobrança', () => {
  const { ctx } = cenario();
  const { resumo } = rodarTudo(ctx);

  // Dos 7, só 2 têm .pfx nos anexos. O MEI (N°1093) normalmente não geraria
  // alerta, mas o OCR perdeu o "MEI" dele (veja test_comprovante.mjs), então
  // ele entra na cobrança — com o texto do Outlook seriam 4.
  assert.equal(resumo.alertasCertificado.length, 5);
  assert.match(resumo.textoCobranca, /certificado digital A1/);
  assert.match(resumo.textoCobranca, /THAIS REIS DESIGN/);
});

test('sem consultar, grava o que dá e marca o resto como não consultado', () => {
  const { ctx, aba } = cenario();
  const { resumo } = rodarTudo(ctx, false);

  assert.equal(resumo.gravadas.length, 7);
  const linhas = comoObjetos(aba('Particularidades'));
  // sem consulta, ninguém tem o Simples — é a única coisa que só a Receita diz
  assert.ok(linhas.every((l) => l['Simples (RFB)'] === '?'));
  // quem teve comprovante reconhecido fica marcado como OCR — 3 neste lote,
  // dos quais 2 renderam CNAE
  const comOcr = linhas.filter((l) => /OCR/.test(l['Fonte dos dados']));
  assert.equal(comOcr.length, 3);
  assert.ok(comOcr.every((l) => /OCR/.test(l['Particularidades'])),
    'a linha precisa avisar que o dado veio de OCR');
});

test('cada passo é uma chamada curta — o lote nunca é consultado de uma vez', () => {
  const { ctx } = cenario();
  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  let chamadas = 0;
  const original = ctx.consultarOptanteSimples;
  ctx.consultarOptanteSimples = (cnpj) => { chamadas++; return original(cnpj); };

  ctx.consultarEmpresaDoLote(lote.empresas[0], true);
  assert.equal(chamadas, 1, 'uma chamada deve consultar exatamente uma empresa');
  ctx.consultarEmpresaDoLote(lote.empresas[1], true);
  assert.equal(chamadas, 2);
});

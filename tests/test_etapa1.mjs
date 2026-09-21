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

const COMPROVANTE = fs.readFileSync('fixtures/comprovantes/1099-THAIS-REIS-linhas.txt', 'utf8');

/** O texto que sairia da conversão do PDF do e-mail. */
const TEXTO_DO_PDF = [
  'EMPRESA NOVA', '',
  'De: Thays Oliveira | Administrativo Moraex <secretaria@moraex.com.br>',
  'Data: Qui, 27/08/2026 13:07', '',
  '2 anexos (30 KB)',
  'THAIS REIS DESIGN LTDA.pfx; C LORENA DISTRIBUIDORA LTDA.pfx;', '',
  'Segue novas empresas para cadastrar.', '',
  'THAIS REIS DESIGN LTDA CNPJ: 60.772.067/0001-76 N°1099',
  'Lucro Presumido',
  'E mail : enfesta.adm@gmail.com', '',
  'C LORENA DISTRIBUIDORA LTDA CNPJ: 68.717.251/0001-25 N°1091',
  'Simples Nacional',
  'E mail : lorena@exemplo.com.br', '',
  COMPROVANTE
].join('\n');

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
    d.razaoSocial = 'C LORENA DISTRIBUIDORA LTDA';
    d.municipio = 'RIO DE JANEIRO';
    d.uf = 'RJ';
    d.porte = 'ME';
    d.situacaoCadastral = 'ATIVA';
    d.fonte = 'BrasilAPI';
    return d;
  };
  p.ctx.consultarOptanteSimples = (cnpj) => ({
    cnpj, optante: apenas(cnpj) === '68717251000125', mensagem: null, erro: null
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
  assert.deepEqual(planos(lote.empresas.map((e) => e.numero)), ['1099', '1091']);
  assert.equal(lote.recebidoEm, '27/08/2026');
  assert.equal(lote.competencia, '08/2026');
});

test('abrirLote já traz o que a barra precisa mostrar por empresa', () => {
  const { ctx } = cenario();
  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  const thais = lote.empresas[0];

  assert.equal(thais.nome, 'THAIS REIS DESIGN LTDA');
  assert.equal(thais.tipo, 'Matriz');
  assert.equal(thais.cnpjValido, true);
  assert.equal(thais.certificado, true, 'o .pfx dela está nos anexos');
  assert.ok(thais.comprovante, 'o comprovante do PDF deveria estar casado com ela');
  assert.equal(thais.comprovante.porte, 'EPP');
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
  assert.equal(r.numero, '1091');
  assert.equal(r.simples, 'Sim');
  assert.equal(r.dados.fonte, 'BrasilAPI');
});

test('empresa com comprovante no PDF não vai à consulta de cadastro', () => {
  const { ctx } = cenario();
  let consultouCadastro = 0;
  const original = ctx.consultarCnpj;
  ctx.consultarCnpj = (cnpj) => { consultouCadastro++; return original(cnpj); };

  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  const r = ctx.consultarEmpresaDoLote(lote.empresas[0], true);

  assert.equal(consultouCadastro, 0);
  assert.equal(r.dados.fonte, 'Comprovante RFB');
  assert.equal(r.dados.porte, 'EPP');
});

test('erro numa empresa não derruba as outras', () => {
  const { ctx } = cenario();
  ctx.consultarOptanteSimples = () => { throw new Error('Receita fora do ar'); };

  const lote = ctx.abrirLote([{ nome: 'email.pdf', base64: 'x' }]);
  const r = ctx.consultarEmpresaDoLote(lote.empresas[0], true);
  assert.equal(r.ok, false);
  assert.match(r.erro, /Receita fora do ar/);
  assert.equal(r.numero, '1099', 'o resultado precisa dizer de quem é o erro');
});

// ------------------------------------------------ passo 3: gravar o lote

test('grava em Particularidades e em Pendentes Daniela, de uma vez', () => {
  const { ctx, aba } = cenario();
  const { resumo } = rodarTudo(ctx);

  assert.equal(resumo.gravadas.length, 2);
  assert.equal(comoObjetos(aba('Particularidades')).length, 2);
  assert.equal(comoObjetos(aba('Pendentes Daniela')).length, 2);
  assert.equal(resumo.competencia, '08/2026');
  assert.equal(resumo.liberaEm, '11/2026');
});

test('a linha consolida o que era da Triagem e o que é da reunião', () => {
  const { ctx, aba } = cenario();
  rodarTudo(ctx);

  const thais = comoObjetos(aba('Particularidades')).find((l) => l['N° Cliente'] === '1099');
  // bloco do app
  assert.equal(thais['Razão social'], 'THAIS REIS DESIGN LTDA');
  assert.equal(thais['Tipo'], 'Matriz');
  assert.equal(thais['Abertura'], '12/05/2025');
  assert.equal(thais['Porte'], 'EPP');
  assert.equal(thais['Município / UF'], 'DUQUE DE CAXIAS/RJ');
  assert.equal(thais['CNAE principal'],
    '82.30-0-01 — Serviços de organização de feiras, congressos, exposições e festas');
  assert.equal(thais['CNAEs secundários'], '78.20-5-00; 82.30-0-02');
  assert.equal(thais['Regime informado'], 'Lucro Presumido');
  assert.equal(thais['Regime / enquadramento'],
    'Lucro Presumido — PIS/COFINS cumulativo; IRPJ/CSLL trimestral');
  assert.equal(thais['Situação cadastral'], 'ATIVA');
  assert.equal(thais['Fonte dos dados'], 'Comprovante RFB');
  assert.equal(thais['Certificado A1'], 'recebido');
  assert.equal(thais['Competência entrada'], '08/2026');
  assert.equal(thais['Processado em'], '27/08/2026');
  // bloco da reunião fica em branco, para a pessoa preencher
  assert.equal(thais['Particularidade 1 (Paulo)'], '');
  assert.equal(thais['Responsável (analista)'], '');
  assert.equal(thais['Situação'], 'Pendente distribuição');
});

test('a entrada em carência sai com a competência do e-mail', () => {
  const { ctx, aba } = cenario();
  rodarTudo(ctx);

  const pend = comoObjetos(aba('Pendentes Daniela'));
  assert.deepEqual(planos(pend.map((l) => l['N° Cliente'])), ['1099', '1091']);
  assert.equal(pend[0]['Competência entrada'], '08/2026');
  assert.equal(pend[0]['Libera em'], '11/2026');
  assert.equal(pend[0]['Origem'], '🆕 Onboarding');
});

test('processar o mesmo PDF duas vezes não duplica', () => {
  const { ctx, aba } = cenario();
  rodarTudo(ctx);
  const segunda = rodarTudo(ctx);

  assert.equal(segunda.resumo.gravadas.length, 0);
  assert.equal(segunda.resumo.jaExistiam.length, 2);
  assert.equal(comoObjetos(aba('Particularidades')).length, 2);
  assert.equal(comoObjetos(aba('Pendentes Daniela')).length, 2);
});

test('empresa já na carteira não é recadastrada', () => {
  const { ctx, aba } = cenario();
  aba('Carteira Completa').appendRow(['1091', 'C LORENA DISTRIBUIDORA LTDA',
    '68.717.251/0001-25', 'Simples Nacional', 'Comércio', 'Wellington', 'Auxiliar', 'OK']);

  const { resumo } = rodarTudo(ctx);
  assert.deepEqual(planos(resumo.gravadas.map((g) => g.numero)), ['1099']);
});

test('CNPJ que não passa no dígito verificador é apontado, não gravado em silêncio', () => {
  // 60.772.067/0001-70 tem o último dígito trocado, como um OCR faria
  const { ctx, aba } = cenario(TEXTO_DO_PDF.replace(
    'THAIS REIS DESIGN LTDA CNPJ: 60.772.067/0001-76 N°1099',
    'THAIS REIS DESIGN LTDA CNPJ: 60.772.067/0001-70 N°1099'));

  const { resumo } = rodarTudo(ctx);
  assert.equal(resumo.cnpjSuspeito.length, 1);
  assert.match(resumo.cnpjSuspeito[0], /1099/);

  const linha = comoObjetos(aba('Particularidades')).find((l) => l['N° Cliente'] === '1099');
  assert.match(linha['Particularidades'], /dígito verificador/);
});

test('certificado faltante vira alerta e texto de cobrança', () => {
  const { ctx } = cenario(TEXTO_DO_PDF.replace(
    'THAIS REIS DESIGN LTDA.pfx; C LORENA DISTRIBUIDORA LTDA.pfx;', 'outro-arquivo.pfx;'));
  const { resumo } = rodarTudo(ctx);

  assert.equal(resumo.alertasCertificado.length, 2);
  assert.match(resumo.textoCobranca, /certificado digital A1/);
  assert.match(resumo.textoCobranca, /THAIS REIS DESIGN/);
});

test('sem consultar, grava o que dá e marca o resto como não consultado', () => {
  const { ctx, aba } = cenario();
  const { resumo } = rodarTudo(ctx, false);

  assert.equal(resumo.gravadas.length, 2);
  const lorena = comoObjetos(aba('Particularidades')).find((l) => l['N° Cliente'] === '1091');
  assert.equal(lorena['Simples (RFB)'], '?');
  assert.equal(lorena['Fonte dos dados'], '(não consultado)');
  // mas a que tinha comprovante continua completa
  const thais = comoObjetos(aba('Particularidades')).find((l) => l['N° Cliente'] === '1099');
  assert.equal(thais['Porte'], 'EPP');
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

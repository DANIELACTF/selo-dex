/**
 * Testa as três operações de carteira do app do Sheets — distribuir, dar
 * baixa e trocar responsável — contra um dublê da API do Google Sheets.
 *
 *   node --test tests/test_gestao.mjs
 *
 * O que se verifica aqui não é formatação: é para onde a linha foi, o que
 * ficou registrado e quando a operação é recusada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, comoObjetos } from './planilha-falsa.mjs';

const CAB_CARTEIRA = ['N° Cliente', 'Nome', 'CNPJ', 'Regime Tributário', 'Segmento',
  'Analista Responsável', 'Nível', 'Status'];
const CAB_PENDENTES = ['N° Cliente', 'Nome', 'CNPJ', 'Regime Tributário', 'Segmento',
  'Sugestão Analista', 'Origem', 'Observação', 'Competência entrada', 'Libera em'];

/**
 * Hoje é 09/2026 no dublê. Quem entrou em 05/2026 já cumpriu a carência
 * (libera em 08/2026); quem entrou em 08/2026 ainda está nela (libera em
 * 11/2026).
 */
function cenario() {
  return planilhaFalsa({
    // A aba de inativos já existe na carteira do escritório — o app a usa,
    // não a cria.
    'Clientes Inativos': [['N° Cliente', 'Nome', 'CNPJ', 'Regime Tributário', 'Segmento',
      'Último responsável', 'Motivo', 'Observação', 'Competência da baixa', 'Baixado em',
      'Baixado por', 'Status']],
    'Carteira Completa': [CAB_CARTEIRA,
      ['500', 'ANTIGA LTDA', '11.111.111/0001-11', 'Simples Nacional', 'Serviço',
        'Wellington', 'Auxiliar', 'OK']],
    'Pendentes Daniela': [CAB_PENDENTES,
      ['1091', 'C LORENA LTDA', '68.717.251/0001-25', 'Lucro Real', 'Comércio',
        '', '🆕 Onboarding', '', '05/2026', '08/2026'],
      ['1092', 'GRAFICA SQUARE LTDA', '30.569.577/0001-80', 'Simples Nacional', 'Serviço',
        'Matheus Telles (Júnior)', '🆕 Onboarding', '', '08/2026', '11/2026'],
      ['777', 'SEM DATA LTDA', '99.999.999/0001-99', 'Lucro Presumido', 'Misto',
        '', '', '', '', '']]
  });
}

const numeros = (aba) => comoObjetos(aba).map((l) => l['N° Cliente']);

// Arrays vindos do contexto da VM têm outro Object.prototype, e o
// deepStrictEqual compara protótipo. Passar por JSON iguala os realms.
const planos = (v) => JSON.parse(JSON.stringify(v));

// ------------------------------------------------------- 1. distribuir

test('carência vencida: o cliente vai para a carteira do analista', () => {
  const { ctx, aba } = cenario();
  const r = ctx.distribuirCliente('1091', 'Dulce Neves', 'Sênior', false);

  assert.equal(r.distribuido, true);
  assert.equal(r.antecipado, false);
  assert.equal(r.analista, 'Dulce Neves (Sênior)');

  assert.ok(numeros(aba('Carteira Completa')).includes('1091'));
  assert.ok(!numeros(aba('Pendentes Daniela')).includes('1091'));

  const linha = comoObjetos(aba('Carteira Completa')).find((l) => l['N° Cliente'] === '1091');
  assert.equal(linha['Analista Responsável'], 'Dulce Neves');
  assert.equal(linha['Nível'], 'Sênior');
  assert.equal(linha['Nome'], 'C LORENA LTDA');
  assert.equal(linha['CNPJ'], '68.717.251/0001-25');
  assert.equal(linha['Regime Tributário'], 'Lucro Real');
});

test('carência correndo: anota o destino e NÃO move a empresa', () => {
  const { ctx, aba } = cenario();
  const r = ctx.distribuirCliente('1092', 'Dulce Neves', 'Sênior', false);

  assert.equal(r.agendado, true);
  assert.equal(r.liberaEm, '11/2026');
  assert.equal(r.faltam, 2);

  // continua em pendentes, com a sugestão atualizada
  assert.ok(numeros(aba('Pendentes Daniela')).includes('1092'));
  assert.ok(!numeros(aba('Carteira Completa')).includes('1092'));
  const linha = comoObjetos(aba('Pendentes Daniela')).find((l) => l['N° Cliente'] === '1092');
  assert.equal(linha['Sugestão Analista'], 'Dulce Neves (Sênior)');
});

test('antecipar move a empresa e marca a operação como antecipação', () => {
  const { ctx, aba } = cenario();
  const r = ctx.distribuirCliente('1092', 'Dulce Neves', 'Sênior', true);

  assert.equal(r.distribuido, true);
  assert.equal(r.antecipado, true);
  assert.equal(r.liberaEm, '11/2026');
  assert.ok(numeros(aba('Carteira Completa')).includes('1092'));
  assert.ok(!numeros(aba('Pendentes Daniela')).includes('1092'));

  const mov = comoObjetos(aba('Movimentações')).pop();
  assert.equal(mov['Operação'], 'Distribuição antecipada');
  assert.match(mov['Motivo / observação'], /ANTECIPADA/);
});

test('sem competência de entrada, recusa e diz o que preencher', () => {
  const { ctx, aba } = cenario();
  const r = ctx.distribuirCliente('777', 'Dulce Neves', 'Sênior', false);

  assert.match(r.erro, /não tem competência de entrada/);
  assert.match(r.erro, /Competência entrada/);
  assert.ok(numeros(aba('Pendentes Daniela')).includes('777'));
});

test('distribuir exige cliente e analista', () => {
  const { ctx } = cenario();
  assert.match(ctx.distribuirCliente('', 'Dulce Neves', 'Sênior', false).erro, /Escolha o cliente/);
  assert.match(ctx.distribuirCliente('1091', '', 'Sênior', false).erro, /Escolha o analista/);
});

test('quem não está em pendentes não pode ser distribuído', () => {
  const { ctx } = cenario();
  assert.match(ctx.distribuirCliente('500', 'Dulce Neves', 'Sênior', false).erro,
    /não está em "Pendentes Daniela"/);
});

// ------------------------------------------------------------ 2. baixa

const CAB_INATIVOS = ['N° Cliente', 'Nome', 'CNPJ', 'Regime Tributário', 'Segmento',
  'Último responsável', 'Motivo', 'Observação', 'Competência da baixa', 'Baixado em',
  'Baixado por', 'Status'];

/** A planilha do escritório: já tem a aba de inativos, e um banner na carteira. */
function cenarioComInativos(nomeDaAba = 'Clientes Inativos') {
  const dados = {
    'Carteira Completa': [
      ['Carteira Tributária Fiscal — Dep. Fiscal Moraex', '', '', '', '', '', '', ''],
      ['Atualizado em: 30/09/2026', '', '', '', '', '', '', ''],
      CAB_CARTEIRA,
      ['500', 'ANTIGA LTDA', '11.111.111/0001-11', 'Simples Nacional', 'Serviço',
        'Wellington', 'Auxiliar', 'OK'],
      ['501', 'OUTRA LTDA', '22.222.222/0001-22', 'Lucro Presumido', 'Comércio',
        'Dulce Neves', 'Sênior', 'OK']],
    'Pendentes Daniela': [CAB_PENDENTES,
      ['1091', 'C LORENA LTDA', '68.717.251/0001-25', 'Lucro Real', 'Comércio',
        '', '🆕 Onboarding', '', '05/2026', '08/2026']]
  };
  dados[nomeDaAba] = [CAB_INATIVOS];
  return planilhaFalsa(dados);
}

test('a baixa REMOVE da Carteira Completa e leva para a aba de inativos', () => {
  const { ctx, aba } = cenarioComInativos();
  const r = ctx.baixarCliente('500', 'Encerramento de contrato (cliente pediu)', 'Distrato 01/09');

  assert.ok(!r.erro, `baixarCliente falhou: ${r.erro}`);
  assert.equal(r.baixado, true);
  assert.equal(r.de, 'Carteira Completa');
  assert.equal(r.para, 'Clientes Inativos');

  // saiu mesmo da carteira — é o que não estava acontecendo
  assert.deepEqual(planos(numeros(aba('Carteira Completa'))), ['501']);

  const inativo = comoObjetos(aba('Clientes Inativos'))[0];
  assert.equal(inativo['N° Cliente'], '500');
  assert.equal(inativo['Nome'], 'ANTIGA LTDA');
  assert.equal(inativo['CNPJ'], '11.111.111/0001-11');
  assert.equal(inativo['Último responsável'], 'Wellington');
  assert.equal(inativo['Motivo'], 'Encerramento de contrato (cliente pediu)');
  assert.equal(inativo['Observação'], 'Distrato 01/09');
  assert.equal(inativo['Baixado por'], 'daniela@moraex.com.br');
  assert.equal(inativo['Status'], 'Inativo');
});

test('o banner acima do cabeçalho não atrapalha a remoção', () => {
  // A carteira real tem título e data antes dos rótulos: se a linha for
  // calculada errado, a baixa apagaria a empresa errada.
  const { ctx, aba } = cenarioComInativos();
  ctx.baixarCliente('501', 'Inadimplência', '');

  const restantes = comoObjetos(aba('Carteira Completa'));
  assert.equal(restantes.length, 1);
  assert.equal(restantes[0]['N° Cliente'], '500', 'apagou a linha errada');
});

test('não cria aba nova: usa a que já existe, com o nome que ela tiver', () => {
  for (const nome of ['Clientes Inativos', 'Inativos', 'CLIENTES INATIVOS', 'Clientes inativos']) {
    const { ctx, planilha } = cenarioComInativos(nome);
    const r = ctx.baixarCliente('500', 'Inadimplência', '');

    assert.ok(!r.erro, `com a aba chamada "${nome}": ${r.erro}`);
    assert.equal(r.para, nome, 'usa a aba com o nome que ela já tem');

    // Movimentações é criada de propósito; nenhuma SEGUNDA aba de inativos
    // pode aparecer ao lado da que já existe.
    const comCaraDeInativos = planilha.getSheets()
      .map((a) => a.getName())
      .filter((n) => /inativ|baixad|encerrad/i.test(n));
    assert.deepEqual(planos(comCaraDeInativos), [nome]);
  }
});

test('sem aba de inativos, recusa e diz quais abas existem — não cria nada', () => {
  const { ctx, aba, planilha } = planilhaFalsa({
    'Carteira Completa': [CAB_CARTEIRA,
      ['500', 'ANTIGA LTDA', '11.111.111/0001-11', 'Simples', 'Serviço', 'Wellington', 'Auxiliar', 'OK']],
    'Pendentes Daniela': [CAB_PENDENTES]
  });
  const antes = planilha.getSheets().length;
  const r = ctx.baixarCliente('500', 'Inadimplência', '');

  assert.match(r.erro, /Não achei a aba de clientes inativos/);
  assert.match(r.erro, /Carteira Completa/, 'deve listar as abas que existem');
  assert.match(r.erro, /Nada foi movido/);
  assert.equal(planilha.getSheets().length, antes, 'não pode criar a aba por conta própria');
  assert.deepEqual(planos(numeros(aba('Carteira Completa'))), ['500'], 'o cliente fica onde estava');
});

test('baixa de quem está em carência sai de Pendentes', () => {
  const { ctx, aba } = cenarioComInativos();
  const r = ctx.baixarCliente('1091', 'Baixa do CNPJ na Receita', '');

  assert.equal(r.de, 'Pendentes Daniela');
  assert.match(r.responsavel, /sem responsável/);
  assert.deepEqual(planos(numeros(aba('Pendentes Daniela'))), []);
  assert.equal(comoObjetos(aba('Clientes Inativos'))[0]['N° Cliente'], '1091');
});

test('a baixa entra em Movimentações, com as duas abas', () => {
  const { ctx, aba } = cenarioComInativos();
  ctx.baixarCliente('500', 'Transferência para outro escritório', 'foi para a concorrência');

  const mov = comoObjetos(aba('Movimentações'))[0];
  assert.equal(mov['Operação'], 'Baixa');
  assert.equal(mov['N° Cliente'], '500');
  assert.equal(mov['De'], 'Carteira Completa');
  assert.equal(mov['Para'], 'Clientes Inativos');
  assert.match(mov['Motivo / observação'], /Transferência.*concorrência/);
  assert.equal(mov['Quem'], 'daniela@moraex.com.br');
});

test('baixa exige motivo', () => {
  const { ctx, aba } = cenarioComInativos();
  assert.match(ctx.baixarCliente('500', '', 'sem motivo').erro, /Escolha o motivo/);
  assert.ok(numeros(aba('Carteira Completa')).includes('500'));
});

test('baixar quem não existe não apaga nada', () => {
  const { ctx, aba } = cenarioComInativos();
  assert.match(ctx.baixarCliente('9999', 'Inadimplência', '').erro, /não está nem em/);
  assert.equal(numeros(aba('Carteira Completa')).length, 2);
  assert.equal(comoObjetos(aba('Clientes Inativos')).length, 0);
});

test('aba de inativos sem coluna em comum é recusada, sem mover nada', () => {
  const { ctx, aba } = planilhaFalsa({
    'Carteira Completa': [CAB_CARTEIRA,
      ['500', 'ANTIGA LTDA', '11.111.111/0001-11', 'Simples', 'Serviço', 'Wellington', 'Auxiliar', 'OK']],
    'Pendentes Daniela': [CAB_PENDENTES],
    'Clientes Inativos': [['Coluna Estranha', 'Outra Coisa']]
  });
  const r = ctx.baixarCliente('500', 'Inadimplência', '');
  assert.match(r.erro, /nenhuma coluna em comum/);
  assert.ok(numeros(aba('Carteira Completa')).includes('500'));
});

// ------------------------------------------------------------ 3. troca

test('troca na carteira muda o responsável e o nível', () => {
  const { ctx, aba } = cenario();
  const r = ctx.trocarResponsavel('500', 'Dulce Neves', 'Sênior', 'Redistribuição de carga', '');

  assert.equal(r.trocado, true);
  assert.equal(r.anterior, 'Wellington');
  assert.equal(r.novo, 'Dulce Neves (Sênior)');
  assert.equal(r.emCarencia, false);

  const linha = comoObjetos(aba('Carteira Completa')).find((l) => l['N° Cliente'] === '500');
  assert.equal(linha['Analista Responsável'], 'Dulce Neves');
  assert.equal(linha['Nível'], 'Sênior');
});

test('troca em carência mexe na sugestão, não no responsável', () => {
  const { ctx, aba } = cenario();
  const r = ctx.trocarResponsavel('1092', 'Dulce Neves', 'Sênior', 'Saída do analista', '');

  assert.equal(r.trocado, true);
  assert.equal(r.emCarencia, true);
  assert.equal(r.anterior, 'Matheus Telles (Júnior)');

  // não saiu de pendentes
  assert.ok(numeros(aba('Pendentes Daniela')).includes('1092'));
  const linha = comoObjetos(aba('Pendentes Daniela')).find((l) => l['N° Cliente'] === '1092');
  assert.equal(linha['Sugestão Analista'], 'Dulce Neves (Sênior)');
});

test('trocar para o mesmo analista é recusado', () => {
  const { ctx } = cenario();
  assert.match(ctx.trocarResponsavel('500', 'Wellington', 'Auxiliar', 'Redistribuição de carga', '').erro,
    /já está com Wellington/);
});

test('troca exige motivo', () => {
  const { ctx } = cenario();
  assert.match(ctx.trocarResponsavel('500', 'Dulce Neves', 'Sênior', '', '').erro, /Escolha o motivo/);
});

// --------------------------------------------------------- histórico

test('cada operação vira uma linha em Movimentações', () => {
  const { ctx, aba } = cenario();
  ctx.distribuirCliente('1091', 'Dulce Neves', 'Sênior', false);
  ctx.trocarResponsavel('500', 'Monica Oliveira', 'Júnior', 'Férias / afastamento', 'volta em 10/2026');
  ctx.baixarCliente('1092', 'Transferência para outro escritório', 'foi para a concorrência');

  const mov = comoObjetos(aba('Movimentações'));
  assert.equal(mov.length, 3);
  assert.deepEqual(planos(mov.map((m) => m['Operação'])),
    ['Distribuição', 'Troca de responsável', 'Baixa']);

  assert.equal(mov[1]['De'], 'Wellington');
  assert.equal(mov[1]['Para'], 'Monica Oliveira (Júnior)');
  assert.match(mov[1]['Motivo / observação'], /Férias \/ afastamento — volta em 10\/2026/);

  assert.equal(mov[2]['Para'], 'Clientes Inativos');
  for (const linha of mov) {
    assert.equal(linha['Quem'], 'daniela@moraex.com.br');
    assert.ok(linha['Quando'], 'toda movimentação tem data');
    assert.ok(linha['Competência'], 'toda movimentação tem competência');
  }
});

test('anotar destino sem mover também fica registrado', () => {
  const { ctx, aba } = cenario();
  ctx.distribuirCliente('1092', 'Dulce Neves', 'Sênior', false);
  const mov = comoObjetos(aba('Movimentações'))[0];
  assert.equal(mov['Operação'], 'Destino definido');
  assert.equal(mov['Para'], 'Dulce Neves (Sênior)');
  assert.match(mov['Motivo / observação'], /Carência até 11\/2026/);
});

// ----------------------------------------------------- dados do painel

test('o painel recebe a situação de carência de cada pendente', () => {
  const { ctx } = cenario();
  const d = ctx.carregarGestao();

  const porNumero = {};
  d.pendentes.forEach((c) => { porNumero[c.numero] = c; });

  assert.equal(porNumero['1091'].liberada, true);
  assert.equal(porNumero['1092'].liberada, false);
  assert.equal(porNumero['1092'].faltam, 2);
  assert.equal(porNumero['777'].semCompetencia, true);

  assert.equal(d.carteira.length, 1);
  assert.equal(d.carteira[0].analista, 'Wellington');
  assert.ok(d.motivosBaixa.length && d.motivosTroca.length);
  assert.equal(d.mesesCarencia, 3);
});

test('a carteira reflete o estado depois das operações', () => {
  const { ctx } = cenario();
  ctx.distribuirCliente('1091', 'Dulce Neves', 'Sênior', false);
  ctx.baixarCliente('500', 'Inadimplência', '');

  const d = ctx.carregarGestao();
  assert.deepEqual(planos(d.carteira.map((c) => c.numero)), ['1091']);
  assert.deepEqual(planos(d.pendentes.map((c) => c.numero)), ['1092', '777']);
});

// ------------------------- planilha do escritório, com suas irregularidades

import fs from 'node:fs';
import { carregarPainel } from './painel-falso.mjs';

const CAB_CARTEIRA_REAL = CAB_CARTEIRA;

test('cabeçalho abaixo de um título de banner ainda é encontrado', () => {
  // Carteira importada de .xlsx costuma ter título e data antes dos rótulos.
  const { ctx, aba } = planilhaFalsa({
    'Carteira Completa': [
      ['Carteira Tributária Fiscal — Dep. Fiscal Moraex', '', '', '', '', '', '', ''],
      ['Atualizado em: 03/09/2026', '', '', '', '', '', '', ''],
      CAB_CARTEIRA_REAL,
      ['500', 'ANTIGA LTDA', '11.111.111/0001-11', 'Simples Nacional', 'Serviço',
        'Wellington', 'Auxiliar', 'OK']],
    'Pendentes Daniela': [
      ['Pendentes sob a Gestão Fiscal', '', '', '', '', '', '', '', '', ''],
      CAB_PENDENTES,
      ['1091', 'C LORENA LTDA', '68.717.251/0001-25', 'Lucro Real', 'Comércio',
        '', '🆕 Onboarding', '', '05/2026', '08/2026']]
  });

  const d = ctx.carregarGestao();
  assert.equal(d.ok, true);
  assert.deepEqual(planos(d.carteira.map((c) => c.numero)), ['500']);
  assert.deepEqual(planos(d.pendentes.map((c) => c.numero)), ['1091']);
  assert.equal(d.diagnostico.find((a) => a.aba === 'Carteira Completa').linhaCabecalho, 3);
  assert.equal(d.diagnostico.find((a) => a.aba === 'Pendentes Daniela').linhaCabecalho, 2);

  // e a operação continua acertando a linha certa
  ctx.distribuirCliente('1091', 'Dulce Neves', 'Sênior', false);
  assert.ok(comoObjetos(aba('Carteira Completa')).some((l) => l['N° Cliente'] === '1091'));
});

test('aba que não existe é relatada, não engolida', () => {
  const { ctx } = planilhaFalsa({
    'Carteira Completa': [CAB_CARTEIRA]
  });
  const d = ctx.carregarGestao();
  assert.equal(d.ok, true);
  const pend = d.diagnostico.find((a) => a.aba === 'Pendentes Daniela');
  assert.equal(pend.existe, false);
  assert.ok(pend.faltando.length);
});

test('coluna essencial ausente é nomeada no diagnóstico', () => {
  const { ctx } = planilhaFalsa({
    'Carteira Completa': [CAB_CARTEIRA],
    'Pendentes Daniela': [['Cliente', 'Empresa', 'CNPJ'], ['1091', 'C LORENA LTDA', '68.7']]
  });
  const pend = ctx.carregarGestao().diagnostico.find((a) => a.aba === 'Pendentes Daniela');
  assert.ok(pend.faltando.includes('N° Cliente'), 'deveria apontar a coluna que falta');
  assert.ok(pend.colunas.includes('Cliente'), 'deveria listar o que encontrou');
});

// ------------------------------------------- o painel nunca fica mudo

test('painel carrega a lista quando as abas estão em ordem', () => {
  const { ctx } = cenario();
  const p = carregarPainel('Gestao.html', ctx);
  assert.deepEqual(planos(p.chamadas.map((c) => c.funcao)), ['carregarGestao']);
  assert.ok(!p.corpo().includes('Carregando'), 'o painel ficou preso no "Carregando"');
  assert.match(p.corpo(), /id="cliente"/);
});

test('sem pendentes, o painel explica em vez de mostrar tela vazia', () => {
  const { ctx } = planilhaFalsa({
    'Carteira Completa': [CAB_CARTEIRA],
    'Pendentes Daniela': [['Cliente', 'Empresa'], ['1091', 'C LORENA LTDA']]
  });
  const p = carregarPainel('Gestao.html', ctx);
  assert.ok(!p.corpo().includes('Carregando'));
  assert.match(p.corpo(), /o que o app encontrou/i);
  assert.match(p.corpo(), /faltam as colunas/i);
  assert.match(p.corpo(), /N° Cliente/);
});

test('servidor com Gestao.gs velho: o painel diz isso, não fica carregando', () => {
  const { ctx } = cenario();
  ctx.carregarGestao = function () { return { pendentes: [], carteira: [] }; };  // sem ok:true
  const p = carregarPainel('Gestao.html', ctx);
  assert.ok(!p.corpo().includes('Carregando'));
  assert.match(p.corpo(), /Gestao\.gs/);
  assert.match(p.corpo(), /desatualizado/);
});

test('servidor sem resposta: o painel diz isso, não fica carregando', () => {
  const { ctx } = cenario();
  ctx.carregarGestao = function () { return undefined; };
  const p = carregarPainel('Gestao.html', ctx);
  assert.ok(!p.corpo().includes('Carregando'));
  assert.match(p.corpo(), /não reconheço|sem os dados/);
});

test('servidor que lança erro: o painel mostra a mensagem', () => {
  const { ctx } = cenario();
  ctx.carregarGestao = function () { throw new Error('A aba "Pendentes Daniela" não existe'); };
  const p = carregarPainel('Gestao.html', ctx);
  assert.ok(!p.corpo().includes('Carregando'));
  assert.match(p.corpo(), /Pendentes Daniela.*não existe/);
});

test('demora excessiva vira aviso com o que fazer, não espera infinita', () => {
  const { ctx } = cenario();
  ctx.carregarGestao = function () { return { ok: true, pendentes: [], carteira: [], diagnostico: [] }; };
  const p = carregarPainel('Gestao.html', ctx);
  assert.ok(p.agendados.length > 0, 'o painel não arma prazo nenhum para o carregamento');
  assert.ok(p.agendados[0].ms >= 10000, 'o prazo é curto demais para uma carteira grande');
});


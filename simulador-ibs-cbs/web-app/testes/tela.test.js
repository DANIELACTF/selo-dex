// Ensaio da tela no Chromium (Playwright), com o Codigo.gs rodando sobre a
// planilha simulada. Grava capturas de tela na pasta indicada.
// Executar: NODE_PATH=$(npm root -g) node simulador-ibs-cbs/web-app/testes/tela.test.js <pasta>
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const pasta = process.argv[2] || path.join(__dirname, 'saida');
fs.mkdirSync(pasta, { recursive: true });
const arquivo = path.join(pasta, 'ensaio.html');
execFileSync(process.execPath, [path.join(__dirname, 'montar-ensaio.js'), arquivo]);

(async () => {
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', ignoreHTTPSErrors: true });
  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', (e) => erros.push(e.message));
  pg.on('console', (m) => { if(m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(m.text()); });
  let n = 0;
  const ok = (c, msg) => { n++; assert.ok(c, msg); };

  await pg.goto('file://' + arquivo);
  await pg.waitForSelector('#sims-tabela .vazio:has-text("Nenhuma simulação salva")');
  ok(await pg.isHidden('#falha-carga'), 'conectou à planilha simulada');

  // Exemplo e resultado
  await pg.click('#btn-exemplo');
  ok((await pg.$$('#ops-tabela tbody tr')).length === 12, 'exemplo com 12 operações');
  await pg.click('#btn-calcular');
  await pg.waitForSelector('#aba-resultado:not([hidden])');
  const tiles = await pg.textContent('#tiles');
  ok(tiles.includes('R$ 14.705,25'), 'carga atual do exemplo: ' + tiles);
  ok(tiles.includes('R$ 15.503,00'), 'carga de 2033 do exemplo');
  ok((await pg.$$('#grafico .g-linha')).length === 9, 'gráfico com 9 cenários');
  ok((await pg.$$('#tab-trat tbody tr')).length > 5, 'tabela por tratamento');
  await pg.click('#trat-menos');
  ok((await pg.textContent('#trat-ano')) === '2032', 'troca o ano da tabela por tratamento');
  await pg.screenshot({ path: path.join(pasta, '1-resultado.png'), fullPage: true });

  // Gravar na planilha
  const popup = pg.waitForEvent('popup').catch(() => null);
  await pg.click('#btn-gravar');
  await pg.waitForSelector('.toast:has-text("Resultado gravado")');
  await popup;
  ok(await pg.evaluate(() => !!window.__planilha.getSheetByName('Resultado')), 'aba Resultado criada');

  // Nova venda pelo formulário
  await pg.click('#tab-simular');
  await pg.click('#btn-nova-venda');
  await pg.fill('#o-desc', 'Almoços servidos');
  await pg.fill('#o-valor', 'abc');
  ok(await pg.isDisabled('#o-salvar'), 'valor inválido impede salvar');
  await pg.fill('#o-valor', '1.500,50');
  await pg.selectOption('#o-trat', 'bares40');
  ok((await pg.textContent('#o-regras')).includes('sem gorjeta'), 'mostra o que informar em Valor');
  await pg.fill('#o-icms', '3,5');
  await pg.screenshot({ path: path.join(pasta, '2-nova-operacao.png') });
  await pg.click('#o-salvar');
  ok((await pg.$$('#ops-tabela tbody tr')).length === 13, 'operação adicionada');
  ok((await pg.textContent('#ops-tabela')).includes('R$ 1.500,50'), 'valor lido no formato brasileiro');

  // Compra do Simples mostra o campo de crédito
  await pg.click('#btn-nova-compra');
  await pg.selectOption('#o-forn', 'simples');
  ok(await pg.isVisible('#o-credpct'), 'campo de crédito do Simples aparece');
  await pg.fill('#o-valor', '100');
  await pg.click('#o-salvar');

  // Excluir com a confirmação da tela
  await pg.click('#ops-tabela tbody tr:last-child [data-excluir]');
  await pg.waitForSelector('#confirma-raiz .modal');
  await pg.click('#confirma-raiz [data-r="1"]');
  ok((await pg.$$('#ops-tabela tbody tr')).length === 13, 'excluiu com confirmação');

  // Salvar, abrir e excluir simulação
  await pg.fill('#sim-nome', 'Cenário base');
  await pg.click('#btn-salvar-sim');
  await pg.waitForSelector('#sims-tabela tbody tr');
  ok((await pg.textContent('#sims-tabela')).includes('Cenário base'), 'simulação salva aparece');
  await pg.click('#btn-nova-sim');
  await pg.click('#confirma-raiz [data-r="1"]');
  ok(await pg.isVisible('#ops-tabela .vazio'), 'nova simulação limpa a tela');
  await pg.click('#sims-tabela [data-abrir]');
  await pg.waitForSelector('#ops-tabela tbody tr');
  ok((await pg.$$('#ops-tabela tbody tr')).length === 13, 'abriu a simulação salva');
  await pg.screenshot({ path: path.join(pasta, '3-simular.png'), fullPage: true });

  // Tabelas: editar o cronograma
  await pg.click('#tab-tabelas');
  const cbs2033 = '#crono-tabela input[data-i="7"][data-campo="cbs"]';
  await pg.fill(cbs2033, '9');
  await pg.dispatchEvent(cbs2033, 'change');
  ok((await pg.textContent('#crono-estado')).includes('Editado'), 'cronograma marcado como editado');
  await pg.fill('#f-busca', 'advogado');
  ok((await pg.$$('#trat-tabela tbody tr')).length === 1, 'busca no catálogo');
  await pg.fill('#f-busca', '');
  await pg.screenshot({ path: path.join(pasta, '4-tabelas.png'), fullPage: true });

  // O rascunho sobrevive a recarregar a página
  await pg.reload();
  await pg.waitForSelector('#ops-tabela tbody tr');
  ok((await pg.$$('#ops-tabela tbody tr')).length === 13, 'rascunho preservado ao recarregar');

  // Celular e tema escuro
  const cel = await navegador.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', locale: 'pt-BR', ignoreHTTPSErrors: true });
  const pc = await cel.newPage();
  pc.on('pageerror', (e) => erros.push(e.message));
  await pc.goto('file://' + arquivo);
  await pc.click('#btn-exemplo');
  await pc.screenshot({ path: path.join(pasta, '5-celular-escuro.png'), fullPage: true });
  const largura = await pc.evaluate(() => document.documentElement.scrollWidth);
  ok(largura <= 390, 'sem rolagem horizontal no celular (largura ' + largura + ')');
  await pc.click('#btn-calcular');
  await pc.screenshot({ path: path.join(pasta, '6-celular-resultado.png'), fullPage: true });

  await navegador.close();
  assert.deepStrictEqual(erros, [], 'erros no console: ' + erros.join(' | '));
  console.log(`tela: OK — ${n} verificações. Capturas em ${pasta}`);
})().catch((e) => { console.error(e); process.exit(1); });

/**
 * Dublê mínimo da API do Google Sheets, para exercitar fora do Apps Script
 * as operações que mexem em aba — distribuir, dar baixa, trocar responsável.
 *
 * Implementa só o que Planilha.gs e Gestao.gs realmente chamam. Formatação é
 * no-op encadeável: o que importa aqui é o conteúdo das células, não a cor.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const NO_OP = ['setBackground', 'setFontColor', 'setFontWeight', 'setFontSize',
  'setVerticalAlignment', 'setHorizontalAlignment', 'setWrap', 'setBorder',
  'setNumberFormat', 'setDataValidation', 'setFormula'];

function criarAba(nome, matriz) {
  const celulas = matriz.map((l) => l.slice());

  const garantir = (linha, coluna) => {
    while (celulas.length < linha) celulas.push([]);
    for (const l of celulas) while (l.length < coluna) l.push('');
  };

  const faixa = (linha, coluna, nLinhas = 1, nColunas = 1) => {
    const r = {
      getValues() {
        garantir(linha + nLinhas - 1, coluna + nColunas - 1);
        return celulas.slice(linha - 1, linha - 1 + nLinhas)
          .map((l) => l.slice(coluna - 1, coluna - 1 + nColunas));
      },
      setValues(valores) {
        garantir(linha + valores.length - 1, coluna + valores[0].length - 1);
        valores.forEach((l, i) => l.forEach((v, j) => { celulas[linha - 1 + i][coluna - 1 + j] = v; }));
        return r;
      },
      setValue(v) {
        garantir(linha, coluna);
        celulas[linha - 1][coluna - 1] = v;
        return r;
      }
    };
    for (const m of NO_OP) r[m] = () => r;
    return r;
  };

  return {
    _nome: nome,
    _celulas: celulas,
    getName: () => nome,
    getLastRow: () => celulas.length,
    getLastColumn: () => celulas.reduce((m, l) => Math.max(m, l.length), 0),
    getRange: faixa,
    appendRow(linha) { celulas.push(linha.slice()); },
    deleteRow(n) { celulas.splice(n - 1, 1); },
    setColumnWidth: () => null,
    setRowHeight: () => null,
    setFrozenRows: () => null,
    setFrozenColumns: () => null,
    hideSheet: () => null,
    getConditionalFormatRules: () => [],
    setConditionalFormatRules: () => null,
    get auto_filter() { return { ref: null }; }
  };
}

/**
 * @param {Object} dados  { 'Nome da aba': [[cabeçalho], [linha], …] }
 * @returns {{ctx: Object, aba: (nome: string) => Object}}
 */
export function planilhaFalsa(dados, arquivos = null) {
  const abas = {};

  // Relógio controlável. As consultas do app têm orçamento de tempo, e
  // testar isso esperando de verdade seria absurdo — então o teste avança o
  // relógio. Só Date.now() é falso: `new Date()` continua real, porque
  // competenciaAtual() e outras dependem dele.
  const relogio = { agora: Date.now(), avancar(ms) { this.agora += ms; } };
  const DateReal = Date;
  function DateFalso(...args) {
    return args.length ? new DateReal(...args) : new DateReal(relogio.agora);
  }
  DateFalso.now = () => relogio.agora;
  DateFalso.parse = DateReal.parse;
  DateFalso.UTC = DateReal.UTC;
  DateFalso.prototype = DateReal.prototype;
  for (const [nome, matriz] of Object.entries(dados)) abas[nome] = criarAba(nome, matriz);

  const planilha = {
    getSheetByName: (n) => abas[n] || null,
    insertSheet(n) { abas[n] = criarAba(n, []); return abas[n]; },
    getSheets: () => Object.values(abas),
    deleteSheet(a) { delete abas[a._nome]; },
    setActiveSheet: () => null,
    toast: () => null
  };

  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => planilha,
      getUi: () => ({ alert: () => null, prompt: () => null, ButtonSet: {}, Button: {} }),
      newDataValidation: () => ({
        requireValueInList() { return this; }, setAllowInvalid() { return this; },
        setHelpText() { return this; }, build: () => ({})
      }),
      newConditionalFormatRule: () => ({
        whenTextEqualTo() { return this; }, setBackground() { return this; },
        setFontColor() { return this; }, setRanges() { return this; }, build: () => ({})
      }),
      BorderStyle: { SOLID: 'SOLID' }
    },
    Session: { getActiveUser: () => ({ getEmail: () => 'daniela@moraex.com.br' }) },
    Utilities: {
      formatDate: (d, tz, f) => (f.indexOf('dd/MM') === 0 ? '15/09/2026' : '2026-09-15 10:00'),
      sleep: () => null,
      newBlob: () => ({ getAs: () => ({ setName: () => ({}) }) })
    },
    DriveApp: {}, UrlFetchApp: {}, HtmlService: {},
    Date: DateFalso
  };
  vm.createContext(ctx);

  const carregar = arquivos || fs.readdirSync('gas').filter((f) => f.endsWith('.gs')).sort();
  for (const arquivo of carregar) {
    vm.runInContext(fs.readFileSync(`gas/${arquivo}`, 'utf8'), ctx, { filename: arquivo });
  }

  return { ctx, aba: (n) => abas[n], planilha, relogio };
}

const ROTULOS = ['N° Cliente', 'Nº Cliente', 'Nome', 'CNPJ', 'Analista Responsável',
  'Sugestão Analista', 'Razão social'];

/**
 * Lê uma aba do dublê como lista de objetos {cabeçalho: valor}, procurando a
 * linha de cabeçalho da mesma forma que Planilha.gs — senão o próprio teste
 * leria um banner como cabeçalho.
 */
export function comoObjetos(aba) {
  const linhas = aba._celulas;
  if (linhas.length < 2) return [];
  let inicio = 0;
  for (let i = 0; i < Math.min(linhas.length, 10); i++) {
    if (linhas[i].some((c) => ROTULOS.includes(String(c).trim()))) { inicio = i; break; }
  }
  const cabecalho = linhas[inicio].map((c) => String(c).trim());
  return linhas.slice(inicio + 1).map((linha) => {
    const o = {};
    cabecalho.forEach((t, i) => { if (t) o[t] = linha[i] === undefined ? '' : String(linha[i]); });
    return o;
  });
}

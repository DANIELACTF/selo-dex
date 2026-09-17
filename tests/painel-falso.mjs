/**
 * Roda o JavaScript de um painel HTML do app fora do navegador.
 *
 * Extrai o <script> do arquivo e executa contra um DOM mínimo e um
 * `google.script.run` que chama de verdade as funções do servidor rodando
 * sobre o dublê da planilha. É o que permite testar "abri o painel e ele
 * carregou a lista" sem abrir o Google.
 */
import fs from 'node:fs';
import vm from 'node:vm';

function criarElemento(id) {
  return {
    id, innerHTML: '', value: '', className: '', hidden: false, checked: false,
    textContent: '', style: {},
    addEventListener() {}, closest: () => null
  };
}

/** DOM só com o que os painéis usam: getElementById e querySelector. */
export function domFalso(idsIniciais) {
  const elementos = {};
  for (const id of idsIniciais) elementos[id] = criarElemento(id);

  return {
    elementos,
    documento: {
      getElementById(id) {
        // O painel troca #corpo por HTML que contém campos novos; como não
        // há parser aqui, todo id pedido passa a existir sob demanda — o que
        // interessa é o innerHTML que foi escrito, não a árvore real.
        if (!elementos[id]) elementos[id] = criarElemento(id);
        return elementos[id];
      },
      querySelector(seletor) {
        const chave = 'querySelector:' + seletor;
        if (!elementos[chave]) elementos[chave] = criarElemento(chave);
        return elementos[chave];
      }
    }
  };
}

/**
 * @param {string} arquivo    nome do .html em gas/
 * @param {Object} ctxServidor contexto já carregado com os .gs (planilhaFalsa)
 * @returns {{dom: Object, ctx: Object, chamadas: Array}}
 */
export function carregarPainel(arquivo, ctxServidor, idsIniciais = ['corpo', 'saida',
  'btn-distribuir', 'btn-trocar', 'btn-baixar', 'texto', 'consultar', 'botao', 'resultado']) {
  const html = fs.readFileSync(`gas/${arquivo}`, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!scripts.length) throw new Error(`${arquivo} não tem <script>`);

  const dom = domFalso(idsIniciais);
  const chamadas = [];
  const erros = [];

  // google.script.run: encadeia os handlers e, no método final, executa a
  // função homônima do servidor — como o Apps Script faz.
  function criarRun(aoSucesso, aoFalhar) {
    const run = {
      withSuccessHandler(f) { return criarRun(f, aoFalhar); },
      withFailureHandler(f) { return criarRun(aoSucesso, f); },
      withUserObject() { return run; }
    };
    return new Proxy(run, {
      get(alvo, prop) {
        if (prop in alvo) return alvo[prop];
        if (typeof prop !== 'string') return undefined;
        return function (...args) {
          chamadas.push({ funcao: prop, args });
          let resultado;
          try {
            if (typeof ctxServidor[prop] !== 'function') {
              throw new Error(`função ${prop}() não existe no servidor`);
            }
            resultado = ctxServidor[prop](...args);
          } catch (e) {
            erros.push(e);
            if (aoFalhar) aoFalhar(e);
            return;
          }
          // O Apps Script serializa a resposta: objetos atravessam por JSON.
          const serializado = resultado === undefined ? undefined
            : JSON.parse(JSON.stringify(resultado));
          if (aoSucesso) aoSucesso(serializado);
        };
      }
    });
  }

  // O painel arma um prazo para não ficar preso em "Carregando…". Guardamos
  // os agendamentos em vez de executá-los: o teste decide se quer dispará-los.
  const agendados = [];

  const ctx = {
    console,
    document: dom.documento,
    window: {},
    setTimeout: (fn, ms) => { agendados.push({ fn, ms }); return agendados.length; },
    clearTimeout: () => {},
    google: { script: { run: criarRun(null, null) } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const codigo of scripts) vm.runInContext(codigo, ctx, { filename: arquivo });

  return {
    dom, ctx, chamadas, erros, agendados,
    corpo: () => dom.elementos.corpo.innerHTML,
    /** Dispara os prazos armados, para testar o caminho do "demorou demais". */
    correrOsPrazos() { agendados.splice(0).forEach(function (a) { a.fn(); }); }
  };
}

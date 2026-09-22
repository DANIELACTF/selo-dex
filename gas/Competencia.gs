/**
 * Competencia.gs — competência (MM/AAAA) e a carência de distribuição.
 *
 * Porta de onboarding/competencia.py. Regra: a empresa que entra na
 * competência X permanece em X, X+1 e X+2 — três competências — e fica
 * apta à distribuição a partir de X+3. Entrou em 08/2026 → libera em
 * 11/2026.
 *
 * Se o escritório contar de outro jeito, mude só MESES_CARENCIA em
 * Config.gs: todo o resto do app lê daqui.
 */

var _FORMATO_COMPETENCIA = /^\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/;

/** Competência do mês corrente, MM/AAAA. */
function competenciaAtual(hoje) {
  var d = hoje || new Date();
  return pad2_(d.getMonth() + 1) + '/' + d.getFullYear();
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Devolve {mes, ano} ou lança Error com mensagem em português. */
function validarCompetencia(competencia) {
  var m = _FORMATO_COMPETENCIA.exec(String(competencia == null ? '' : competencia));
  if (!m) {
    throw new Error('Competência inválida: "' + competencia + '". Use MM/AAAA, ex.: 08/2026.');
  }
  var mes = parseInt(m[1], 10);
  var ano = parseInt(m[2], 10);
  if (mes < 1 || mes > 12) {
    throw new Error('Competência inválida: "' + competencia + '". O mês precisa estar entre 01 e 12.');
  }
  return { mes: mes, ano: ano };
}

function somarMeses(competencia, meses) {
  var c = validarCompetencia(competencia);
  var total = c.ano * 12 + (c.mes - 1) + meses;
  return pad2_((total % 12) + 1) + '/' + Math.floor(total / 12);
}

/** Chave ordenável (ano*12 + mês), para comparar competências. */
function competenciaComoNumero(competencia) {
  var c = validarCompetencia(competencia);
  return c.ano * 12 + (c.mes - 1);
}

/** Competência a partir da qual a empresa pode ser distribuída. */
function competenciaLiberacao(entrada) {
  return somarMeses(entrada, MESES_CARENCIA);
}

/** A carência já venceu na competência de referência (padrão: hoje)? */
function carenciaLiberada(entrada, referencia) {
  referencia = referencia || competenciaAtual();
  return competenciaComoNumero(referencia) >= competenciaComoNumero(competenciaLiberacao(entrada));
}

/** Quantas competências ainda faltam para liberar (0 se já liberada). */
function competenciasRestantes(entrada, referencia) {
  referencia = referencia || competenciaAtual();
  var falta = competenciaComoNumero(competenciaLiberacao(entrada)) - competenciaComoNumero(referencia);
  return falta > 0 ? falta : 0;
}

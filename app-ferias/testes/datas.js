/* Datas para os testes, calculadas a partir de hoje.
   Datas fixas no código vencem: um teste escrito com "05/10/2026" passa hoje e
   quebra no ano que vem por motivo nenhum. Aqui tudo sai da data corrente. */
'use strict';
const R = require('../publico/regras.js');

/** Primeiro `diaDaSemana` (0 = domingo) a partir de `inicio`, inclusive. */
function aPartirDe(inicio, diaDaSemana){
  let d = inicio;
  while(d.getDay() !== diaDaSemana) d = R.addDias(d, 1);
  return d;
}

/* Bem à frente, para não disparar o aviso de antecedência curta. */
const base = R.addDias(R.hoje(), 45);
const segunda = aPartirDe(base, 1);

/** Dois dias antes de um feriado nacional, caindo de segunda a quinta — para o
 *  impedimento que aparecer ser o do feriado, não o do dia da semana. */
function vesperaDeFeriado(){
  for(let i = 40; i < 400; i++){
    const dia = R.addDias(R.hoje(), i);
    const f = R.feriadoEm(dia);
    if(!f || f.tipo !== 'nacional') continue;
    const dois = R.addDias(dia, -2);
    if(dois.getDay() >= 1 && dois.getDay() <= 4) return { data: R.ymd(dois), feriado: f.nome };
  }
  throw new Error('nenhum feriado nacional utilizável nos próximos 400 dias');
}

/** Um início válido logo adiante, para checar o aviso de antecedência curta. */
function logoAdiante(){
  let d = R.addDias(R.hoje(), 10);
  while([0, 5, 6].includes(d.getDay()) || R.feriadoEm(R.addDias(d, 1)) || R.feriadoEm(R.addDias(d, 2))) {
    d = R.addDias(d, 1);
  }
  return R.ymd(d);
}

const vespera = vesperaDeFeriado();

module.exports = {
  SEG:        R.ymd(segunda),              // segunda-feira, início válido
  SEG_MAIS_7: R.ymd(R.addDias(segunda, 7)),  // a segunda seguinte, pega dentro de um período de 20 dias
  SEG_LONGE:  R.ymd(R.addDias(segunda, 63)), // nove semanas depois, sem encostar nas outras
  SEX:        R.ymd(aPartirDe(base, 5)),
  SAB:        R.ymd(aPartirDe(base, 6)),
  DOM:        R.ymd(aPartirDe(base, 0)),
  VESPERA:    vespera.data,
  FERIADO:    vespera.feriado,
  PERTO:      logoAdiante(),
  PASSADO:    R.ymd(R.addDias(R.hoje(), -30)),
  /** Em dd/mm/aaaa: o próprio dia, o último do período e o do retorno. */
  dia:     iso => R.fmt(R.pd(iso)),
  fim:     (iso, dias) => R.fmt(R.addDias(R.pd(iso), dias - 1)),
  retorno: (iso, dias) => R.fmt(R.addDias(R.pd(iso), dias))
};

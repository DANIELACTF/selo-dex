/* Testes das regras de férias. Lê o motor direto do index.html para que
   o que é testado seja exatamente o que roda no app.
   Uso: node testes/regras.test.js  */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const js = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];
const corte = js.indexOf('   3. Utilitários de interface');
if (corte < 0) throw new Error('Não achei o fim do bloco de regras no index.html');
const fonte = js.slice(js.indexOf("'use strict';") + 13, js.lastIndexOf('/* =', corte));

const M = new Function(fonte + `
  return { hoje, ymd, pd, addDias, fmt, difDias, feriados, feriadoEm,
           diasDeDireito, periodos, alocar, periodoAlvo, validar, pascoa, SEMANA };
`)();

let testes = 0, falhas = 0;
function ok(cond, nome, extra){
  testes++;
  if(!cond){ falhas++; console.log('  FALHOU: ' + nome + (extra ? '  -> ' + extra : '')); }
}

const func = o => Object.assign({ id:'f1', nome:'Ana Souza Lima', setor:'Fiscal', admissao:'2025-03-11', faltas:0 }, o);
const ped  = o => Object.assign({ id:null, inicio:'', dias:30, abono:false, abonoDias:0, adiant13:false }, o);
const txt  = R => R.erros.map(e => e.t).join(' | ') || '(sem erros)';

/* --- feriados móveis --- */
ok(M.fmt(M.pascoa(2026)) === '05/04/2026', 'Páscoa de 2026 em 05/04', M.fmt(M.pascoa(2026)));
ok(M.fmt(M.pascoa(2027)) === '28/03/2027', 'Páscoa de 2027 em 28/03', M.fmt(M.pascoa(2027)));
ok(M.feriados(2026)['2026-04-03'].nome === 'Sexta-feira Santa', 'Sexta-feira Santa de 2026 em 03/04');
ok(M.feriados(2026)['2026-02-17'].tipo === 'facultativo', 'Carnaval entra como ponto facultativo');
ok(M.feriados(2026)['2026-11-20'].nome === 'Consciência Negra', 'Consciência Negra em 20/11');

/* --- art. 130: dias conforme faltas --- */
ok(M.diasDeDireito(0) === 30 && M.diasDeDireito(5) === 30,  'até 5 faltas dá 30 dias');
ok(M.diasDeDireito(6) === 24 && M.diasDeDireito(14) === 24, '6 a 14 faltas dá 24 dias');
ok(M.diasDeDireito(15) === 18 && M.diasDeDireito(23) === 18,'15 a 23 faltas dá 18 dias');
ok(M.diasDeDireito(24) === 12 && M.diasDeDireito(32) === 12,'24 a 32 faltas dá 12 dias');
ok(M.diasDeDireito(33) === 0, 'mais de 32 faltas zera o direito');

/* --- períodos aquisitivo e concessivo --- */
const ps = M.periodos('2025-03-11', M.hoje());
ok(M.fmt(ps[0].ini) === '11/03/2025' && M.fmt(ps[0].fim) === '10/03/2026', 'aquisitivo de 11/03/2025 a 10/03/2026', M.fmt(ps[0].fim));
ok(M.fmt(ps[0].concIni) === '11/03/2026' && M.fmt(ps[0].concFim) === '10/03/2027', 'concessivo de 11/03/2026 a 10/03/2027', M.fmt(ps[0].concFim));

/* --- caminho sem impedimento --- */
let R = M.validar(func(), ped({ inicio:'2026-10-05', dias:30 }), [], [], []);
ok(R.erros.length === 0, '30 dias a partir de uma segunda-feira passa', txt(R));
ok(M.fmt(R.retorno) === '04/11/2026', 'retorno em 04/11/2026', M.fmt(R.retorno));
ok(R.saldoAntes === 30 && R.saldoDepois === 0, 'saldo vai de 30 para 0', R.saldoAntes + ' -> ' + R.saldoDepois);

/* --- art. 134 §3º: dia de início --- */
ok(/não podem começar em sexta/.test(txt(M.validar(func(), ped({ inicio:'2026-10-09', dias:20 }), [], [], []))), 'início na sexta é bloqueado');
ok(/Consciência Negra/.test(txt(M.validar(func(), ped({ inicio:'2026-11-18', dias:20 }), [], [], []))), 'dois dias antes de feriado nacional é bloqueado');

/* --- art. 134 §1º: fracionamento --- */
ok(/menos de 5 dias/.test(txt(M.validar(func(), ped({ inicio:'2026-10-05', dias:4 }), [], [], []))), 'fração abaixo de 5 dias é bloqueada');

const tres = [
  { id:'a', funcionarioId:'f1', inicio:'2026-10-05', dias:14, abonoDias:0, status:'aprovada' },
  { id:'b', funcionarioId:'f1', inicio:'2026-11-09', dias:8,  abonoDias:0, status:'aprovada' },
  { id:'c', funcionarioId:'f1', inicio:'2026-12-07', dias:5,  abonoDias:0, status:'pendente' }
];
ok(/no máximo três/.test(txt(M.validar(func(), ped({ inicio:'2027-01-11', dias:3 }), tres, [], []))), 'quarto período é bloqueado');
ok(/Saldo insuficiente/.test(txt(M.validar(func(), ped({ inicio:'2027-01-11', dias:10 }), tres.slice(0,2), [], []))), 'saldo insuficiente é detectado');

const dezEdez = [
  { id:'a', funcionarioId:'f1', inicio:'2026-10-05', dias:10, abonoDias:0, status:'aprovada' },
  { id:'b', funcionarioId:'f1', inicio:'2026-11-09', dias:10, abonoDias:0, status:'aprovada' }
];
ok(/14 dias corridos/.test(txt(M.validar(func(), ped({ inicio:'2027-01-11', dias:10 }), dezEdez, [], []))), 'exige um período de ao menos 14 dias');

/* --- art. 143: abono pecuniário --- */
ok(/um terço/.test(txt(M.validar(func(), ped({ inicio:'2026-10-05', dias:18, abono:true, abonoDias:12 }), [], [], []))), 'abono acima de 1/3 é bloqueado');
ok(M.validar(func(), ped({ inicio:'2026-10-05', dias:20, abono:true, abonoDias:10 }), [], [], []).erros.length === 0, '20 dias de gozo com 10 de abono passa');
ok(/um por período/.test(txt(M.validar(func(), ped({ inicio:'2027-01-11', dias:10, abono:true, abonoDias:5 }),
  [{ id:'a', funcionarioId:'f1', inicio:'2026-10-05', dias:14, abonoDias:6, status:'aprovada' }], [], []))), 'só um abono por período aquisitivo');

/* --- arts. 130 e 137 --- */
ok(/período aquisitivo ainda não fechou/.test(txt(M.validar(func({ admissao:'2026-06-01' }), ped({ inicio:'2026-10-05', dias:30 }), [], [], []))), 'menos de 12 meses de casa é bloqueado');
ok(/não há direito a férias/.test(txt(M.validar(func({ faltas:40 }), ped({ inicio:'2026-10-05', dias:30 }), [], [], []))), 'mais de 32 faltas zera o direito');
const R24 = M.validar(func({ faltas:10 }), ped({ inicio:'2026-10-05', dias:24 }), [], [], []);
ok(R24.erros.length === 0 && R24.direito === 24, '10 faltas dá direito a 24 dias', R24.direito + ' | ' + txt(R24));
ok(/já passou/.test(txt(M.validar(func(), ped({ inicio:'2026-06-01', dias:30 }), [], [], []))), 'data no passado é bloqueada');
ok(/período concessivo venceu/.test(txt(M.validar(func({ admissao:'2023-01-09' }), ped({ inicio:'2026-10-05', dias:30 }), [], [], []))), 'concessivo vencido aponta pagamento em dobro');

/* --- sobreposições e avisos --- */
ok(/se sobrepõem/.test(txt(M.validar(func(), ped({ inicio:'2026-10-12', dias:10 }),
  [{ id:'a', funcionarioId:'f1', inicio:'2026-10-05', dias:14, abonoDias:0, status:'aprovada' }], [], []))), 'sobreposição com o próprio período é bloqueada');

const equipe = [func(), { id:'f2', nome:'Bruno Reis', setor:'Fiscal', admissao:'2024-01-08', faltas:0 }];
const doColega = [{ id:'z', funcionarioId:'f2', inicio:'2026-10-12', dias:10, abonoDias:0, status:'aprovada' }];
ok(M.validar(func(), ped({ inicio:'2026-10-05', dias:20 }), [], equipe, doColega).avisos.some(a => /mesmo setor/.test(a.t)), 'avisa sobreposição no mesmo setor');
ok(M.validar(func(), ped({ inicio:'2026-10-05', dias:30, adiant13:true }), [], [], []).avisos.some(a => /janeiro/.test(a.t)), 'avisa o prazo de janeiro do adiantamento do 13º');

let perto = M.addDias(M.hoje(), 10);
while([0,5,6].includes(perto.getDay()) || M.feriadoEm(M.addDias(perto,1)) || M.feriadoEm(M.addDias(perto,2))) perto = M.addDias(perto,1);
ok(M.validar(func(), ped({ inicio:M.ymd(perto), dias:15 }), [], [], []).avisos.some(a => /30 dias de antecedência/.test(a.t)), 'avisa antecedência menor que 30 dias');

console.log((falhas ? '\n' : '') + testes + ' testes, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);

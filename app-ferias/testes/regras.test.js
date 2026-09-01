/* Testes das regras de férias.  Uso: node testes/regras.test.js */
'use strict';
const R = require('../publico/regras.js');

let testes = 0, falhas = 0;
function ok(cond, nome, extra){
  testes++;
  if(!cond){ falhas++; console.log('  FALHOU: ' + nome + (extra ? '  -> ' + extra : '')); }
}

const func = o => Object.assign({ id:'f1', nome:'Ana Souza Lima', setor:'Fiscal', admissao:'2025-03-11', diasDireito:30 }, o);
const ped  = o => Object.assign({ id:null, inicio:'', dias:30 }, o);
const txt  = V => V.erros.map(e => e.t).join(' | ') || '(sem erros)';

/* --- feriados --- */
ok(R.fmt(R.pascoa(2026)) === '05/04/2026', 'Páscoa de 2026 em 05/04', R.fmt(R.pascoa(2026)));
ok(R.fmt(R.pascoa(2027)) === '28/03/2027', 'Páscoa de 2027 em 28/03', R.fmt(R.pascoa(2027)));
ok(R.feriados(2026)['2026-04-03'].nome === 'Sexta-feira Santa', 'Sexta-feira Santa de 2026 em 03/04');
ok(R.feriados(2026)['2026-02-17'].tipo === 'facultativo', 'Carnaval entra como ponto facultativo');
ok(R.feriados(2026)['2026-11-20'].nome === 'Consciência Negra', 'Consciência Negra em 20/11');

/* --- datas --- */
ok(R.pd('2026-02-30') === null, 'data inexistente é rejeitada');
ok(R.pd('2026-13-01') === null, 'mês inválido é rejeitado');
ok(R.fmt(R.pd('2026-10-05')) === '05/10/2026', 'converte ISO para data brasileira');

/* --- períodos --- */
const ps = R.periodos('2025-03-11', R.hoje());
ok(R.fmt(ps[0].ini) === '11/03/2025' && R.fmt(ps[0].fim) === '10/03/2026', 'aquisitivo de 11/03/2025 a 10/03/2026', R.fmt(ps[0].fim));
ok(R.fmt(ps[0].concIni) === '11/03/2026' && R.fmt(ps[0].concFim) === '10/03/2027', 'concessivo de 11/03/2026 a 10/03/2027', R.fmt(ps[0].concFim));

/* --- caminho sem impedimento --- */
let V = R.validar(func(), ped({ inicio:'2026-10-05', dias:30 }), [], [], []);
ok(V.erros.length === 0, '30 dias a partir de uma segunda-feira passa', txt(V));
ok(R.fmt(V.retorno) === '04/11/2026', 'retorno em 04/11/2026', R.fmt(V.retorno));
ok(V.saldoAntes === 30 && V.saldoDepois === 0, 'saldo vai de 30 para 0', V.saldoAntes + ' -> ' + V.saldoDepois);

/* --- art. 134, §3º --- */
ok(/não podem começar em sexta/.test(txt(R.validar(func(), ped({ inicio:'2026-10-09', dias:20 }), [], [], []))), 'início na sexta é bloqueado');
ok(/não podem começar em sábado/.test(txt(R.validar(func(), ped({ inicio:'2026-10-10', dias:20 }), [], [], []))), 'início no sábado é bloqueado');
ok(/Consciência Negra/.test(txt(R.validar(func(), ped({ inicio:'2026-11-18', dias:20 }), [], [], []))), 'dois dias antes de feriado nacional é bloqueado');

/* --- art. 134, §1º --- */
ok(/menos de 5 dias/.test(txt(R.validar(func(), ped({ inicio:'2026-10-05', dias:4 }), [], [], []))), 'fração abaixo de 5 dias é bloqueada');

const tres = [
  { id:'a', funcionarioId:'f1', inicio:'2026-10-05', dias:14, status:'aprovada' },
  { id:'b', funcionarioId:'f1', inicio:'2026-11-09', dias:8,  status:'aprovada' },
  { id:'c', funcionarioId:'f1', inicio:'2026-12-07', dias:5,  status:'pendente' }
];
ok(/no máximo três/.test(txt(R.validar(func(), ped({ inicio:'2027-01-11', dias:3 }), tres, [], []))), 'quarto período é bloqueado');
ok(/Saldo insuficiente/.test(txt(R.validar(func(), ped({ inicio:'2027-01-11', dias:10 }), tres.slice(0,2), [], []))), 'saldo insuficiente é detectado');

const dezEdez = [
  { id:'a', funcionarioId:'f1', inicio:'2026-10-05', dias:10, status:'aprovada' },
  { id:'b', funcionarioId:'f1', inicio:'2026-11-09', dias:10, status:'aprovada' }
];
ok(/14 dias corridos/.test(txt(R.validar(func(), ped({ inicio:'2027-01-11', dias:10 }), dezEdez, [], []))), 'exige um período de ao menos 14 dias');

/* --- art. 130 --- */
ok(/período aquisitivo ainda não fechou/.test(txt(R.validar(func({ admissao:'2026-06-01' }), ped({ inicio:'2026-10-05', dias:30 }), [], [], []))), 'menos de 12 meses de casa é bloqueado');
const V24 = R.validar(func({ diasDireito:24 }), ped({ inicio:'2026-10-05', dias:24 }), [], [], []);
ok(V24.erros.length === 0 && V24.direito === 24, 'direito reduzido a 24 dias é respeitado', V24.direito + ' | ' + txt(V24));
ok(/Saldo insuficiente/.test(txt(R.validar(func({ diasDireito:24 }), ped({ inicio:'2026-10-05', dias:30 }), [], [], []))), 'pedido acima do direito reduzido é bloqueado');

/* --- limites e sobreposição --- */
ok(/já passou/.test(txt(R.validar(func(), ped({ inicio:'2026-06-01', dias:30 }), [], [], []))), 'data no passado é bloqueada');
ok(/não pode passar de 30/.test(txt(R.validar(func(), ped({ inicio:'2026-10-05', dias:45 }), [], [], []))), 'mais de 30 dias é bloqueado');
ok(/se sobrepõem/.test(txt(R.validar(func(), ped({ inicio:'2026-10-12', dias:10 }),
  [{ id:'a', funcionarioId:'f1', inicio:'2026-10-05', dias:14, status:'aprovada' }], [], []))), 'sobreposição com o próprio período é bloqueada');

/* --- avisos --- */
const equipe = [func(), { id:'f2', nome:'Bruno Reis', setor:'Fiscal', admissao:'2024-01-08', diasDireito:30 }];
const doColega = [{ id:'z', funcionarioId:'f2', inicio:'2026-10-12', dias:10, status:'aprovada' }];
ok(R.validar(func(), ped({ inicio:'2026-10-05', dias:20 }), [], equipe, doColega).avisos.some(a => /mesmo setor/.test(a.t)), 'avisa sobreposição no mesmo setor');

let perto = R.addDias(R.hoje(), 10);
while([0,5,6].includes(perto.getDay()) || R.feriadoEm(R.addDias(perto,1)) || R.feriadoEm(R.addDias(perto,2))) perto = R.addDias(perto,1);
ok(R.validar(func(), ped({ inicio:R.ymd(perto), dias:15 }), [], [], []).avisos.some(a => /30 dias de antecedência/.test(a.t)), 'avisa antecedência menor que 30 dias');

/* --- saldo com histórico --- */
const ab = R.periodoAberto(func({ admissao:'2023-04-03' }), [
  { id:'h1', funcionarioId:'f1', inicio:'2024-05-06', dias:30, status:'aprovada' },
  { id:'h2', funcionarioId:'f1', inicio:'2025-05-05', dias:20, status:'aprovada' }
]);
ok(ab.saldo === 10, 'saldo de 10 dias no período parcialmente usado', String(ab.saldo));

console.log((falhas ? '\n' : '') + testes + ' testes de regras, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);

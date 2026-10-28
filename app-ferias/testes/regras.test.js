/* Testes das regras de agendamento.  Uso: node testes/regras.test.js */
'use strict';
const R = require('../publico/regras.js');
const D = require('./datas.js');

let testes = 0, falhas = 0;
function ok(cond, nome, extra){
  testes++;
  if(!cond){ falhas++; console.log('  FALHOU: ' + nome + (extra ? '  -> ' + extra : '')); }
}

const ana   = { id:'f1', nome:'Ana Souza Lima', setor:'Fiscal' };
const carla = { id:'f2', nome:'Carla Monteiro', setor:'Fiscal' };
const bruno = { id:'f3', nome:'Bruno Reis Alves', setor:'Contábil' };
const equipe = [ana, carla, bruno];
const ped = o => Object.assign({ id:null, inicio:D.SEG, dias:20 }, o);
const txt = V => V.erros.map(e => e.t).join(' | ') || '(sem erros)';
const avisos = V => V.avisos.map(a => a.t).join(' | ') || '(sem avisos)';

const sol = (id, funcId, inicio, dias, extra) => Object.assign({
  id, funcionarioId:funcId, inicio, dias, status:'autorizada', aut_gestor:'2026-01-02'
}, extra || {});

/* --- feriados: contas fixas, conferidas contra datas conhecidas --- */
ok(R.fmt(R.pascoa(2026)) === '05/04/2026', 'Páscoa de 2026 em 05/04', R.fmt(R.pascoa(2026)));
ok(R.fmt(R.pascoa(2027)) === '28/03/2027', 'Páscoa de 2027 em 28/03', R.fmt(R.pascoa(2027)));
ok(R.feriados(2026)['2026-04-03'].nome === 'Sexta-feira Santa', 'Sexta-feira Santa de 2026 em 03/04');
ok(R.feriados(2026)['2026-02-17'].tipo === 'facultativo', 'Carnaval entra como ponto facultativo');
ok(R.feriados(2027)['2027-11-20'].nome === 'Consciência Negra', 'Consciência Negra em 20/11');

/* --- datas --- */
ok(R.pd('2026-02-30') === null, 'data inexistente é rejeitada');
ok(R.fmt(R.pd('2026-10-05')) === '05/10/2026', 'converte ISO para data brasileira');
ok(R.fmt(R.fimDe({ inicio:'2026-10-05', dias:20 })) === '24/10/2026', 'último dia de férias');
ok(R.fmt(R.retornoDe({ inicio:'2026-10-05', dias:20 })) === '25/10/2026', 'dia do retorno');

/* --- não sobrou nada de período aquisitivo --- */
['periodos','alocar','periodoAlvo','periodoAberto','diasDeDireito'].forEach(nome => {
  ok(R[nome] === undefined, 'o motor não tem mais ' + nome + '()');
});

/* --- caminho sem impedimento --- */
let V = R.validar(ana, ped({ dias:20 }), [], equipe, []);
ok(V.erros.length === 0, '20 dias a partir de uma segunda-feira passa', txt(V));
ok(R.fmt(V.fim) === D.fim(D.SEG, 20) && R.fmt(V.retorno) === D.retorno(D.SEG, 20),
   'fim e retorno calculados', R.fmt(V.fim) + ' / ' + R.fmt(V.retorno));
ok(V.infos.some(i => /Ninguém do setor “Fiscal”/.test(i.t)), 'diz que o setor está livre', JSON.stringify(V.infos.map(i => i.t)));

/* --- sem saldo, pedir muito deixou de ser problema --- */
V = R.validar(ana, ped({ dias:30 }), [sol('a','f1',D.PASSADO,30)], equipe, [sol('a','f1',D.PASSADO,30)]);
ok(V.erros.length === 0, 'segundo período de 30 dias no mesmo ano é aceito', txt(V));
ok(R.validar(ana, ped({ dias:3 }), [], equipe, []).erros.length === 0, 'três dias é aceito');
ok(/não pode passar de 30/.test(txt(R.validar(ana, ped({ dias:45 }), [], equipe, []))), 'mais de 30 dias é bloqueado');

/* --- choque no setor: o motivo do quadro --- */
const daCarla = [sol('z','f2',D.SEG_MAIS_7,10)];
V = R.validar(ana, ped({ dias:20 }), [], equipe, daCarla);
ok(V.choques.length === 1 && V.choques[0].nome === 'Carla Monteiro', 'acha o colega do setor no mesmo período', JSON.stringify(V.choques));
ok(/Já tem gente do setor/.test(avisos(V)), 'avisa sobre o colega', avisos(V));
ok(V.erros.length === 0, 'choque de setor avisa, não impede', txt(V));

V = R.validar(bruno, ped({ dias:20 }), [], equipe, daCarla);
ok(V.choques.length === 0, 'colega de outro setor não conta', JSON.stringify(V.choques));

const emAnalise = [sol('z','f2',D.SEG_MAIS_7,10, { status:'pendente', aut_gestor:'' })];
ok(/ainda em análise/.test(avisos(R.validar(ana, ped({ dias:20 }), [], equipe, emAnalise))), 'pedido do colega ainda em análise também aparece');
ok(R.validar(ana, ped({ dias:20 }), [], equipe, [sol('z','f2',D.SEG_MAIS_7,10, { status:'recusada' })]).choques.length === 0, 'pedido recusado do colega não conta');
ok(R.validar(ana, ped({ dias:20 }), [], equipe, [sol('z','f2',D.SEG_MAIS_7,10, { status:'cancelada' })]).choques.length === 0, 'pedido cancelado do colega não conta');

/* --- choque com o próprio período --- */
ok(/se sobrepõem/.test(txt(R.validar(ana, ped({ inicio:D.SEG_MAIS_7, dias:10 }), [sol('a','f1',D.SEG,14)], equipe, []))),
   'sobreposição com o próprio período é bloqueada');

/* --- dia de início (art. 134, §3º) --- */
ok(/não podem começar em sexta/.test(txt(R.validar(ana, ped({ inicio:D.SEX }), [], equipe, []))), 'início na sexta é bloqueado');
ok(/não podem começar em sábado/.test(txt(R.validar(ana, ped({ inicio:D.SAB }), [], equipe, []))), 'início no sábado é bloqueado');
const vespera = txt(R.validar(ana, ped({ inicio:D.VESPERA }), [], equipe, []));
ok(vespera.indexOf(D.FERIADO) >= 0, 'dois dias antes de feriado nacional é bloqueado (' + D.FERIADO + ')', vespera);
ok(/domingo/.test(avisos(R.validar(ana, ped({ inicio:D.DOM }), [], equipe, []))), 'início no domingo só avisa');
ok(/já passou/.test(txt(R.validar(ana, ped({ inicio:D.PASSADO }), [], equipe, []))), 'data no passado é bloqueada');

/* --- antecedência --- */
ok(/pelo menos 30 dias/.test(avisos(R.validar(ana, ped({ inicio:D.PERTO, dias:15 }), [], equipe, []))), 'avisa antecedência curta');
ok(!/pelo menos 30 dias/.test(avisos(R.validar(ana, ped({ dias:15 }), [], equipe, []))), 'com folga, não avisa');

/* --- autorização --- */
ok(R.PAPEIS.length === 1 && R.PAPEIS[0].chave === 'gestor', 'só o gestor do departamento autoriza',
   R.PAPEIS.map(p => p.chave).join());
ok(R.PAPEIS[0].titulo === 'Gestor do departamento', 'título do papel');
const nova = { status:'pendente', inicio:D.SEG, dias:20, aut_gestor:'' };
ok(R.faltamAutorizacoes(nova).length === 1, 'pedido novo espera a assinatura do gestor');
ok(R.situacao(nova) === 'pendente', 'sem a assinatura, fica em análise');
const assinada = Object.assign({}, nova, { aut_gestor:'2026-01-02' });
ok(R.faltamAutorizacoes(assinada).length === 0, 'assinada não espera mais ninguém');
ok(R.situacao(assinada) === 'autorizada', 'com a assinatura vira autorizada');
ok(R.situacao(Object.assign({}, assinada, { inicio:D.PASSADO, dias:1 })) === 'gozada', 'período que já passou vira já gozada');
ok(R.situacao(Object.assign({}, nova, { status:'recusada' })) === 'recusada', 'recusada continua recusada');

/* --- quem está fora, para o quadro do setor --- */
const ini = R.pd(D.SEG), fim = R.addDias(ini, 30);
const fora = R.choquesDeSetor(ana, ini, fim, equipe, daCarla.concat([sol('w','f3',D.SEG_MAIS_7,10)]));
ok(fora.length === 1 && fora[0].nome === 'Carla Monteiro', 'quadro do setor só traz o próprio setor', JSON.stringify(fora.map(f => f.nome)));

console.log((falhas ? '\n' : '') + testes + ' testes de regras, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);

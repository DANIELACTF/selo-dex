/* Testes do servidor: banco temporário, servidor de verdade, chamadas reais.
   Uso: node testes/api.test.js */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ferias-teste-'));
process.env.FERIAS_DADOS = temp;

const { servidor } = require('../servidor.js');

let testes = 0, falhas = 0;
function ok(cond, nome, extra){
  testes++;
  if(!cond){ falhas++; console.log('  FALHOU: ' + nome + (extra ? '  -> ' + extra : '')); }
}

(async () => {
  await new Promise(r => servidor.listen(0, r));
  const base = 'http://127.0.0.1:' + servidor.address().port;

  async function chamar(rota, metodo, corpo, token){
    const resp = await fetch(base + rota, {
      method: metodo || 'GET',
      headers: Object.assign({ 'Content-Type':'application/json' }, token ? { 'X-Ferias-Token': token } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    let dados = {};
    try{ dados = await resp.json(); }catch(e){}
    return { status: resp.status, dados };
  }
  const estado = async token => (await chamar('/api/estado', 'GET', null, token)).dados;

  /* ---------- página ---------- */
  const pagina = await fetch(base + '/');
  ok(pagina.status === 200 && /Quadro de Férias/.test(await pagina.text()), 'serve a página inicial');
  ok((await fetch(base + '/regras.js')).status === 200, 'serve o regras.js compartilhado');
  ok((await fetch(base + '/../servidor.js')).status !== 200, 'não serve arquivo fora da pasta pública');

  /* ---------- antes de configurar ---------- */
  let e = await estado();
  ok(e.configurado === false && e.papel === '', 'começa sem PIN definido');
  ok((await chamar('/api/pin', 'POST', { pin:'2468' })).status === 400, 'não dá para entrar antes de definir o PIN');
  ok((await chamar('/api/funcionarios', 'POST', { nome:'Intruso' })).status === 401, 'cadastrar exige sessão');

  /* ---------- definir o PIN do gestor ---------- */
  const setup = pin => ({ gestor:{ nome:'Paulo Ribeiro', pin } });
  ok((await chamar('/api/configurar', 'POST', setup('123'))).status === 400, 'PIN curto é recusado');
  let r = await chamar('/api/configurar', 'POST', { gestor:{ nome:'', pin:'1111' } });
  ok(r.status === 400 && /nome/.test(r.dados.erro), 'exige o nome de quem autoriza');

  r = await chamar('/api/configurar', 'POST', setup('1111'));
  ok(r.status === 200 && r.dados.papel === 'gestor' && r.dados.token, 'define o PIN e entra como gestor', JSON.stringify(r.dados));
  let tk = r.dados.token;
  ok((await chamar('/api/configurar', 'POST', setup('9999'))).status === 400, 'não dá para configurar duas vezes');

  /* ---------- entrar ---------- */
  r = await chamar('/api/pin', 'POST', { pin:'1111' });
  ok(r.status === 200 && r.dados.papel === 'gestor' && r.dados.nome === 'Paulo Ribeiro', 'entra com o PIN do gestor', JSON.stringify(r.dados));
  tk = r.dados.token;
  ok((await chamar('/api/pin', 'POST', { pin:'0000' })).status === 401, 'PIN errado é recusado');
  ok((await estado(tk)).papel === 'gestor', 'o estado devolve o papel da sessão');
  ok((await estado('token-falso')).papel === '', 'token inventado não vale');

  /* ---------- cadastro, sem data de admissão ---------- */
  r = await chamar('/api/funcionarios', 'POST', { nome:'Ana Souza Lima', cargo:'Analista fiscal', setor:'Fiscal' }, tk);
  ok(r.status === 200, 'cadastra funcionário sem pedir admissão', r.dados.erro);
  const ana = r.dados.id;
  const carla = (await chamar('/api/funcionarios', 'POST', { nome:'Carla Monteiro', setor:'Fiscal' }, tk)).dados.id;
  const bruno = (await chamar('/api/funcionarios', 'POST', { nome:'Bruno Reis', setor:'Contábil' }, tk)).dados.id;
  ok((await chamar('/api/funcionarios', 'POST', { nome:'' }, tk)).status === 400, 'nome é obrigatório');
  ok((await chamar('/api/funcionarios', 'POST', { nome:'Com admissão', admissao:'2026-02-30' }, tk)).status === 200,
     'data de admissão enviada por engano é simplesmente ignorada');
  e = await estado(tk);
  ok(e.funcionarios.every(f => f.admissao === undefined), 'o cadastro não guarda mais admissão',
     JSON.stringify(Object.keys(e.funcionarios[0])));

  /* ---------- o servidor refaz a conferência ---------- */
  r = await chamar('/api/solicitacoes', 'POST', { funcionarioId: ana, inicio:'2026-10-09', dias:20 });
  ok(r.status === 400 && /sexta/.test(r.dados.erro), 'servidor recusa início na sexta', r.dados.erro);
  ok((await chamar('/api/solicitacoes', 'POST', { funcionarioId: ana, inicio:'2026-10-05', dias:45 })).status === 400, 'servidor recusa mais de 30 dias');
  ok((await chamar('/api/solicitacoes', 'POST', { funcionarioId:'nada', inicio:'2026-10-05', dias:10 })).status === 400, 'funcionário inexistente é recusado');

  /* ---------- pedido sem login ---------- */
  r = await chamar('/api/solicitacoes', 'POST', { funcionarioId: ana, inicio:'2026-10-05', dias:20, obs:'Viagem marcada.' });
  ok(r.status === 200 && r.dados.id, 'funcionário envia pedido sem login', r.dados.erro);
  const pedido = r.dados.id;
  let s = (await estado()).solicitacoes.find(x => x.id === pedido);
  ok(s && s.status === 'pendente' && s.nome === 'Ana Souza Lima' && s.setor === 'Fiscal', 'pedido gravado com nome e setor', JSON.stringify(s));
  ok(s.aut_gestor === '' && s.aut_dp === undefined && s.aut_diretor === undefined,
     'nasce sem assinatura e sem os campos de DP e diretor');
  ok((await chamar('/api/solicitacoes', 'POST', { funcionarioId: ana, inicio:'2026-12-07', dias:30 })).status === 200, 'segundo período longo é aceito');

  /* ---------- uma assinatura basta ---------- */
  ok((await chamar('/api/solicitacoes/' + pedido + '/autorizar', 'POST', {})).status === 401, 'autorizar exige sessão');
  ok((await chamar('/api/solicitacoes/' + pedido + '/autorizar', 'POST', {}, tk)).status === 200, 'gestor autoriza');
  s = (await estado()).solicitacoes.find(x => x.id === pedido);
  ok(s.status === 'autorizada', 'uma assinatura já autoriza', s.status);
  ok(s.aut_gestor_nome === 'Paulo Ribeiro' && !!s.aut_gestor, 'guarda nome e data de quem assinou', JSON.stringify({ n:s.aut_gestor_nome, d:!!s.aut_gestor }));
  ok((await chamar('/api/solicitacoes/' + pedido + '/autorizar', 'POST', {}, tk)).status === 400, 'não autoriza o que já está autorizado');

  /* ---------- recusa ---------- */
  const pCarla = (await chamar('/api/solicitacoes', 'POST', { funcionarioId: carla, inicio:'2027-02-01', dias:20 })).dados.id;
  ok((await chamar('/api/solicitacoes/' + pCarla + '/recusar', 'POST', { motivo:'' }, tk)).status === 400, 'recusar sem motivo é bloqueado');
  ok((await chamar('/api/solicitacoes/' + pCarla + '/recusar', 'POST', { motivo:'Setor descoberto.' }, tk)).status === 200, 'gestor recusa');
  s = (await estado()).solicitacoes.find(x => x.id === pCarla);
  ok(s.status === 'recusada' && s.recusadaPor === 'Paulo Ribeiro', 'registra quem recusou', s.recusadaPor);
  ok((await chamar('/api/solicitacoes/' + pCarla + '/autorizar', 'POST', {}, tk)).status === 400, 'não autoriza pedido recusado');

  /* ---------- cancelamento pelo funcionário ---------- */
  const pBruno = (await chamar('/api/solicitacoes', 'POST', { funcionarioId: bruno, inicio:'2027-03-01', dias:10 })).dados.id;
  ok((await chamar('/api/solicitacoes/' + pBruno + '/cancelar', 'POST', { funcionarioId: ana })).status === 403, 'ninguém cancela pedido alheio');
  ok((await chamar('/api/solicitacoes/' + pBruno + '/cancelar', 'POST', { funcionarioId: bruno })).status === 200, 'funcionário cancela o próprio pedido');
  ok((await chamar('/api/solicitacoes/' + pBruno + '/cancelar', 'POST', { funcionarioId: bruno })).status === 400, 'não cancela duas vezes');
  ok((await chamar('/api/solicitacoes/' + pedido + '/cancelar', 'POST', { funcionarioId: ana })).status === 400, 'não cancela pedido já autorizado');

  /* ---------- histórico e ajustes ---------- */
  ok((await chamar('/api/historico', 'POST', { funcionarioId: carla, inicio:'2025-05-05', dias:30 })).status === 401, 'histórico exige sessão');
  ok((await chamar('/api/historico', 'POST', { funcionarioId: carla, inicio:'2025-05-05', dias:30 }, tk)).status === 200, 'gestor lança férias já combinadas');
  s = (await estado()).solicitacoes.filter(x => x.funcionarioId === carla && x.status === 'autorizada')[0];
  ok(s && s.aut_gestor && s.aut_gestor_nome === 'Paulo Ribeiro', 'lançamento entra já assinado');
  ok((await chamar('/api/empresa', 'POST', { nome:'Contabilidade Selo Ltda' }, tk)).status === 200, 'grava o nome da empresa');
  ok((await estado()).empresa === 'Contabilidade Selo Ltda', 'nome da empresa volta no estado');
  ok((await estado()).nomes.gestor === 'Paulo Ribeiro', 'nome do gestor volta no estado');

  /* ---------- trocar nome e PIN ---------- */
  ok((await chamar('/api/pins', 'POST', { gestor:{ pin:'12' } }, tk)).status === 400, 'PIN novo curto é recusado');
  ok((await chamar('/api/pins', 'POST', { gestor:{ nome:'X' } })).status === 401, 'trocar PIN exige sessão');
  r = await chamar('/api/pins', 'POST', { gestor:{ nome:'Paulo R. Ribeiro', pin:'8888' } }, tk);
  ok(r.status === 200 && r.dados.trocados === 1, 'troca nome e PIN', JSON.stringify(r.dados));
  ok((await chamar('/api/pin', 'POST', { pin:'8888' })).dados.papel === 'gestor', 'entra com o PIN novo');
  ok((await chamar('/api/pin', 'POST', { pin:'1111' })).status === 401, 'o PIN antigo não vale mais');
  ok((await estado()).nomes.gestor === 'Paulo R. Ribeiro', 'nome do gestor atualizado');

  /* ---------- exclusão ---------- */
  ok((await chamar('/api/solicitacoes/' + pCarla, 'DELETE')).status === 401, 'excluir exige sessão');
  ok((await chamar('/api/solicitacoes/' + pCarla, 'DELETE', null, tk)).status === 200, 'gestor exclui registro');
  ok((await chamar('/api/funcionarios/' + bruno, 'DELETE', null, tk)).status === 200, 'gestor remove funcionário');

  /* ---------- entradas ruins ---------- */
  ok((await chamar('/api/nada')).status === 404, 'rota desconhecida devolve 404');
  const ruim = await fetch(base + '/api/pin', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{{{' });
  ok(ruim.status === 400, 'JSON malformado devolve 400');
  ok(fs.existsSync(path.join(temp, 'ferias.db')), 'banco gravado em disco');

  servidor.close();
  fs.rmSync(temp, { recursive:true, force:true });
  console.log((falhas ? '\n' : '') + testes + ' testes de API, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

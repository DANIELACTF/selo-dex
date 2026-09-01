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
  const tk = {};

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
  ok(e.configurado === false && e.papel === '', 'começa sem PINs definidos');
  ok((await chamar('/api/pin', 'POST', { pin:'2468' })).status === 400, 'não dá para entrar antes de definir os PINs');
  ok((await chamar('/api/funcionarios', 'POST', { nome:'Intruso' })).status === 401, 'cadastrar exige sessão');

  /* ---------- definir os três PINs ---------- */
  const trio = (g, d, dir) => ({ gestor:{ nome:'Paulo Ribeiro', pin:g }, dp:{ nome:'Thays Moraes', pin:d }, diretor:{ nome:'Daniela Carvalho', pin:dir } });
  ok((await chamar('/api/configurar', 'POST', trio('123','2222','3333'))).status === 400, 'PIN curto é recusado');
  ok((await chamar('/api/configurar', 'POST', trio('1111','1111','3333'))).status === 400, 'PINs iguais entre si são recusados');
  let r = await chamar('/api/configurar', 'POST', { gestor:{ nome:'', pin:'1111' }, dp:{ nome:'x', pin:'2222' }, diretor:{ nome:'y', pin:'3333' } });
  ok(r.status === 400 && /nome/.test(r.dados.erro), 'exige o nome de cada papel');

  r = await chamar('/api/configurar', 'POST', trio('1111','2222','3333'));
  ok(r.status === 200 && r.dados.papel === 'dp' && r.dados.token, 'define os três PINs e entra como DP');
  tk.dp = r.dados.token;
  ok((await chamar('/api/configurar', 'POST', trio('9','9','9'))).status === 400, 'não dá para configurar duas vezes');

  /* ---------- entrar com cada PIN ---------- */
  r = await chamar('/api/pin', 'POST', { pin:'1111' });
  ok(r.status === 200 && r.dados.papel === 'gestor' && r.dados.nome === 'Paulo Ribeiro', 'PIN do gestor entra como gestor', JSON.stringify(r.dados));
  tk.gestor = r.dados.token;
  r = await chamar('/api/pin', 'POST', { pin:'3333' });
  ok(r.status === 200 && r.dados.papel === 'diretor', 'PIN do diretor entra como diretor');
  tk.diretor = r.dados.token;
  ok((await chamar('/api/pin', 'POST', { pin:'0000' })).status === 401, 'PIN errado é recusado');
  ok((await estado(tk.gestor)).papel === 'gestor', 'o estado devolve o papel da sessão');
  ok((await estado('token-falso')).papel === '', 'token inventado não vale');

  /* ---------- cadastro: só o DP ---------- */
  ok((await chamar('/api/funcionarios', 'POST', { nome:'X', setor:'Fiscal' }, tk.gestor)).status === 403, 'gestor não cadastra funcionário');
  ok((await chamar('/api/funcionarios', 'POST', { nome:'X', setor:'Fiscal' }, tk.diretor)).status === 403, 'diretor não cadastra funcionário');
  r = await chamar('/api/funcionarios', 'POST', { nome:'Ana Souza Lima', cargo:'Analista fiscal', setor:'Fiscal' }, tk.dp);
  ok(r.status === 200, 'DP cadastra funcionário', r.dados.erro);
  const ana = r.dados.id;
  const carla = (await chamar('/api/funcionarios', 'POST', { nome:'Carla Monteiro', setor:'Fiscal' }, tk.dp)).dados.id;
  const bruno = (await chamar('/api/funcionarios', 'POST', { nome:'Bruno Reis', setor:'Contábil' }, tk.dp)).dados.id;
  ok((await chamar('/api/funcionarios', 'POST', { nome:'Sem nome vazio' }, tk.dp)).status === 200, 'admissão é opcional');
  ok((await chamar('/api/funcionarios', 'POST', { nome:'' }, tk.dp)).status === 400, 'nome é obrigatório');
  ok((await chamar('/api/funcionarios', 'POST', { nome:'Z', admissao:'2026-02-30' }, tk.dp)).status === 400, 'data de admissão inexistente é recusada');

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
  ok(s.aut_gestor === '' && s.aut_dp === '' && s.aut_diretor === '', 'nasce sem nenhuma autorização');

  /* ---------- pedir muito não é mais barrado por saldo ---------- */
  ok((await chamar('/api/solicitacoes', 'POST', { funcionarioId: ana, inicio:'2026-12-07', dias:30 })).status === 200, 'segundo período longo é aceito');

  /* ---------- a cadeia de autorizações ---------- */
  ok((await chamar('/api/solicitacoes/' + pedido + '/autorizar', 'POST', {})).status === 401, 'autorizar exige sessão');
  ok((await chamar('/api/solicitacoes/' + pedido + '/autorizar', 'POST', {}, tk.gestor)).status === 200, 'gestor autoriza');
  s = (await estado()).solicitacoes.find(x => x.id === pedido);
  ok(s.status === 'pendente' && s.aut_gestor && s.aut_gestor_nome === 'Paulo Ribeiro', 'uma assinatura não basta', JSON.stringify({ st:s.status, n:s.aut_gestor_nome }));
  ok((await chamar('/api/solicitacoes/' + pedido + '/autorizar', 'POST', {}, tk.gestor)).status === 400, 'o mesmo papel não assina duas vezes');
  ok((await chamar('/api/solicitacoes/' + pedido + '/autorizar', 'POST', {}, tk.dp)).status === 200, 'DP autoriza');
  s = (await estado()).solicitacoes.find(x => x.id === pedido);
  ok(s.status === 'pendente', 'duas de três ainda é em análise', s.status);
  ok((await chamar('/api/solicitacoes/' + pedido + '/autorizar', 'POST', {}, tk.diretor)).status === 200, 'diretor autoriza');
  s = (await estado()).solicitacoes.find(x => x.id === pedido);
  ok(s.status === 'autorizada', 'com as três vira autorizada', s.status);
  ok(s.aut_diretor_nome === 'Daniela Carvalho', 'guarda o nome de quem assinou', s.aut_diretor_nome);
  ok((await chamar('/api/solicitacoes/' + pedido + '/autorizar', 'POST', {}, tk.gestor)).status === 400, 'não dá para autorizar o que já está autorizado');

  /* ---------- recusa ---------- */
  const pCarla = (await chamar('/api/solicitacoes', 'POST', { funcionarioId: carla, inicio:'2027-02-01', dias:20 })).dados.id;
  ok((await chamar('/api/solicitacoes/' + pCarla + '/recusar', 'POST', { motivo:'' }, tk.gestor)).status === 400, 'recusar sem motivo é bloqueado');
  ok((await chamar('/api/solicitacoes/' + pCarla + '/recusar', 'POST', { motivo:'Setor descoberto.' }, tk.diretor)).status === 200, 'qualquer um dos três pode recusar');
  s = (await estado()).solicitacoes.find(x => x.id === pCarla);
  ok(s.status === 'recusada' && s.recusadaPor === 'Daniela Carvalho', 'registra quem recusou', s.recusadaPor);
  ok((await chamar('/api/solicitacoes/' + pCarla + '/autorizar', 'POST', {}, tk.gestor)).status === 400, 'não autoriza pedido recusado');

  /* ---------- cancelamento pelo funcionário ---------- */
  const pBruno = (await chamar('/api/solicitacoes', 'POST', { funcionarioId: bruno, inicio:'2027-03-01', dias:10 })).dados.id;
  ok((await chamar('/api/solicitacoes/' + pBruno + '/cancelar', 'POST', { funcionarioId: ana })).status === 403, 'ninguém cancela pedido alheio');
  ok((await chamar('/api/solicitacoes/' + pBruno + '/cancelar', 'POST', { funcionarioId: bruno })).status === 200, 'funcionário cancela o próprio pedido');
  ok((await chamar('/api/solicitacoes/' + pBruno + '/cancelar', 'POST', { funcionarioId: bruno })).status === 400, 'não cancela duas vezes');
  ok((await chamar('/api/solicitacoes/' + pedido + '/cancelar', 'POST', { funcionarioId: ana })).status === 400, 'não cancela pedido já autorizado');

  /* ---------- histórico e ajustes: só o DP ---------- */
  ok((await chamar('/api/historico', 'POST', { funcionarioId: carla, inicio:'2025-05-05', dias:30 }, tk.gestor)).status === 403, 'gestor não lança histórico');
  ok((await chamar('/api/historico', 'POST', { funcionarioId: carla, inicio:'2025-05-05', dias:30 }, tk.dp)).status === 200, 'DP lança férias já combinadas');
  s = (await estado()).solicitacoes.filter(x => x.funcionarioId === carla && x.status === 'autorizada')[0];
  ok(s && s.aut_gestor && s.aut_dp && s.aut_diretor, 'lançamento entra com as três assinaturas', JSON.stringify(!!s));
  ok((await chamar('/api/empresa', 'POST', { nome:'Contabilidade Selo Ltda' }, tk.diretor)).status === 403, 'diretor não muda os ajustes');
  ok((await chamar('/api/empresa', 'POST', { nome:'Contabilidade Selo Ltda' }, tk.dp)).status === 200, 'DP muda os ajustes');
  ok((await estado()).empresa === 'Contabilidade Selo Ltda', 'nome da empresa volta no estado');
  ok((await estado()).nomes.gestor === 'Paulo Ribeiro', 'nomes dos três papéis voltam no estado');

  /* ---------- trocar nomes e PINs ---------- */
  ok((await chamar('/api/pins', 'POST', { gestor:{ pin:'12' } }, tk.dp)).status === 400, 'PIN novo curto é recusado');
  ok((await chamar('/api/pins', 'POST', { gestor:{ nome:'Paulo R. Ribeiro' } }, tk.gestor)).status === 403, 'gestor não troca PINs');
  r = await chamar('/api/pins', 'POST', { gestor:{ nome:'Paulo R. Ribeiro', pin:'8888' }, dp:{}, diretor:{} }, tk.dp);
  ok(r.status === 200 && r.dados.trocados === 1, 'DP troca um PIN e mantém os outros', JSON.stringify(r.dados));
  ok((await chamar('/api/pin', 'POST', { pin:'8888' })).dados.papel === 'gestor', 'entra com o PIN novo do gestor');
  ok((await chamar('/api/pin', 'POST', { pin:'1111' })).status === 401, 'o PIN antigo não vale mais');
  ok((await chamar('/api/pin', 'POST', { pin:'2222' })).dados.papel === 'dp', 'o PIN do DP continua valendo');
  ok((await estado()).nomes.gestor === 'Paulo R. Ribeiro', 'nome do gestor atualizado');

  /* ---------- exclusão ---------- */
  ok((await chamar('/api/solicitacoes/' + pCarla, 'DELETE', null, tk.diretor)).status === 403, 'só o DP exclui registro');
  ok((await chamar('/api/solicitacoes/' + pCarla, 'DELETE', null, tk.dp)).status === 200, 'DP exclui registro');
  ok((await chamar('/api/funcionarios/' + bruno, 'DELETE', null, tk.dp)).status === 200, 'DP remove funcionário');

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

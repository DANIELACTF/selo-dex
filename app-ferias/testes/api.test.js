/* Testes do servidor: banco temporário, servidor de verdade, chamadas reais.
   Uso: node testes/api.test.js */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ferias-teste-'));
process.env.FERIAS_DADOS = temp;

const { servidor } = require('../servidor.js');
const R = require('../publico/regras.js');

let testes = 0, falhas = 0;
function ok(cond, nome, extra){
  testes++;
  if(!cond){ falhas++; console.log('  FALHOU: ' + nome + (extra ? '  -> ' + extra : '')); }
}

(async () => {
  await new Promise(r => servidor.listen(0, r));
  const base = 'http://127.0.0.1:' + servidor.address().port;
  let token = '';

  async function chamar(rota, metodo, corpo, comToken){
    const resp = await fetch(base + rota, {
      method: metodo || 'GET',
      headers: Object.assign({ 'Content-Type':'application/json' }, comToken ? { 'X-Ferias-Token': token } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    let dados = {};
    try{ dados = await resp.json(); }catch(e){}
    return { status: resp.status, dados };
  }

  /* ---------- página ---------- */
  const pagina = await fetch(base + '/');
  const html = await pagina.text();
  ok(pagina.status === 200 && /Quadro de Férias/.test(html), 'serve a página inicial');
  const js = await fetch(base + '/regras.js');
  ok(js.status === 200 && /Regras/.test(await js.text()), 'serve o regras.js compartilhado');
  ok((await fetch(base + '/../servidor.js')).status !== 200, 'não serve arquivo fora da pasta pública');

  /* ---------- estado inicial ---------- */
  let r = await chamar('/api/estado');
  ok(r.status === 200 && r.dados.temPin === false && r.dados.gestor === false, 'estado inicial sem PIN e sem sessão');

  /* ---------- proteção antes de entrar ---------- */
  r = await chamar('/api/funcionarios', 'POST', { nome:'Intruso', admissao:'2020-01-02' });
  ok(r.status === 401, 'cadastrar funcionário exige sessão do RH', 'status ' + r.status);

  /* ---------- define e usa o PIN ---------- */
  r = await chamar('/api/pin', 'POST', { pin:'123' });
  ok(r.status === 400, 'PIN curto demais é recusado');
  r = await chamar('/api/pin', 'POST', { pin:'2468' });
  ok(r.status === 200 && r.dados.definido === true && r.dados.token, 'primeiro acesso define o PIN');
  token = r.dados.token;
  ok((await chamar('/api/pin', 'POST', { pin:'0000' })).status === 401, 'PIN errado é recusado depois de definido');
  ok((await chamar('/api/pin', 'POST', { pin:'2468' })).status === 200, 'PIN certo entra');

  /* ---------- cadastro ---------- */
  r = await chamar('/api/funcionarios', 'POST', { nome:'Ana Souza Lima', cargo:'Analista fiscal', setor:'Fiscal', admissao:'2025-03-11' }, true);
  ok(r.status === 200 && r.dados.id, 'cadastra funcionário');
  const ana = r.dados.id;
  r = await chamar('/api/funcionarios', 'POST', { nome:'Carla Monteiro', setor:'Fiscal', admissao:'2022-04-01' }, true);
  const carla = r.dados.id;
  ok((await chamar('/api/funcionarios', 'POST', { nome:'Sem data' }, true)).status === 400, 'exige data de admissão');
  ok((await chamar('/api/funcionarios', 'POST', { nome:'Futuro', admissao:'2030-01-02' }, true)).status === 400, 'recusa admissão no futuro');

  /* ---------- o servidor refaz a validação da CLT ---------- */
  r = await chamar('/api/solicitacoes', 'POST', { funcionarioId: ana, inicio:'2026-10-09', dias:20 });
  ok(r.status === 400 && /sexta/.test(r.dados.erro), 'servidor recusa início na sexta mesmo sem passar pela tela', r.dados.erro);
  r = await chamar('/api/solicitacoes', 'POST', { funcionarioId: ana, inicio:'2026-10-05', dias:45 });
  ok(r.status === 400, 'servidor recusa mais de 30 dias');
  r = await chamar('/api/solicitacoes', 'POST', { funcionarioId:'inexistente', inicio:'2026-10-05', dias:10 });
  ok(r.status === 400, 'servidor recusa funcionário inexistente');

  /* ---------- pedido válido, sem sessão de RH ---------- */
  r = await chamar('/api/solicitacoes', 'POST', { funcionarioId: ana, inicio:'2026-10-05', dias:20, obs:'Viagem marcada.' });
  ok(r.status === 200 && r.dados.id, 'funcionário envia pedido sem precisar de login', r.dados.erro);
  const pedidoAna = r.dados.id;

  r = await chamar('/api/estado');
  const sol = r.dados.solicitacoes.find(s => s.id === pedidoAna);
  ok(sol && sol.status === 'pendente' && sol.nome === 'Ana Souza Lima', 'pedido aparece como pendente com o nome do funcionário');
  ok(sol.periodoAquisitivo === '11/03/2025 a 10/03/2026', 'período aquisitivo gravado pelo servidor', sol.periodoAquisitivo);

  /* ---------- saldo consumido ---------- */
  r = await chamar('/api/solicitacoes', 'POST', { funcionarioId: ana, inicio:'2026-12-07', dias:15 });
  ok(r.status === 400 && /Saldo insuficiente/.test(r.dados.erro), 'segundo pedido acima do saldo é recusado', r.dados.erro);
  r = await chamar('/api/solicitacoes', 'POST', { funcionarioId: ana, inicio:'2026-12-07', dias:10 });
  ok(r.status === 200, 'segundo pedido dentro do saldo passa', r.dados.erro);

  /* ---------- aprovar exige sessão ---------- */
  ok((await chamar('/api/solicitacoes/' + pedidoAna + '/decisao', 'POST', { status:'aprovada' })).status === 401, 'aprovar sem sessão é bloqueado');
  ok((await chamar('/api/solicitacoes/' + pedidoAna + '/decisao', 'POST', { status:'recusada' }, true)).status === 400, 'recusar sem motivo é bloqueado');
  ok((await chamar('/api/solicitacoes/' + pedidoAna + '/decisao', 'POST', { status:'aprovada' }, true)).status === 200, 'RH aprova o pedido');
  r = await chamar('/api/estado');
  ok(r.dados.solicitacoes.find(s => s.id === pedidoAna).status === 'aprovada', 'situação virou aprovada');

  /* ---------- cancelamento pelo próprio funcionário ---------- */
  r = await chamar('/api/solicitacoes', 'POST', { funcionarioId: carla, inicio:'2027-02-01', dias:20 });
  const pedidoCarla = r.dados.id;
  ok(r.status === 200, 'pedido da Carla criado', r.dados.erro);
  ok((await chamar('/api/solicitacoes/' + pedidoCarla + '/cancelar', 'POST', { funcionarioId: ana })).status === 403, 'ninguém cancela pedido alheio');
  ok((await chamar('/api/solicitacoes/' + pedidoCarla + '/cancelar', 'POST', { funcionarioId: carla })).status === 200, 'funcionário cancela o próprio pedido');
  ok((await chamar('/api/solicitacoes/' + pedidoCarla + '/cancelar', 'POST', { funcionarioId: carla })).status === 400, 'não cancela duas vezes');
  ok((await chamar('/api/solicitacoes/' + pedidoAna + '/cancelar', 'POST', { funcionarioId: ana })).status === 400, 'não cancela pedido já aprovado');

  /* ---------- histórico ---------- */
  ok((await chamar('/api/historico', 'POST', { funcionarioId: carla, inicio:'2023-05-08', dias:30 })).status === 401, 'lançar histórico exige sessão');
  ok((await chamar('/api/historico', 'POST', { funcionarioId: carla, inicio:'2023-05-08', dias:30 }, true)).status === 200, 'RH lança férias já gozadas');
  ok((await chamar('/api/historico', 'POST', { funcionarioId: carla, inicio:'2019-01-02', dias:30 }, true)).status === 400, 'histórico antes da admissão é recusado');

  /* ---------- empresa e PIN ---------- */
  ok((await chamar('/api/empresa', 'POST', { nome:'Contabilidade Selo Ltda' }, true)).status === 200, 'grava o nome da empresa');
  ok((await chamar('/api/estado')).dados.empresa === 'Contabilidade Selo Ltda', 'nome da empresa volta no estado');
  ok((await chamar('/api/pin/trocar', 'POST', { atual:'errado', novo:'9876' }, true)).status === 401, 'trocar PIN exige o PIN atual');
  ok((await chamar('/api/pin/trocar', 'POST', { atual:'2468', novo:'9876' }, true)).status === 200, 'troca o PIN');
  ok((await chamar('/api/pin', 'POST', { pin:'9876' })).status === 200, 'entra com o PIN novo');

  /* ---------- exclusão ---------- */
  ok((await chamar('/api/solicitacoes/' + pedidoCarla, 'DELETE')).status === 401, 'excluir exige sessão');
  ok((await chamar('/api/solicitacoes/' + pedidoCarla, 'DELETE', null, true)).status === 200, 'RH exclui registro');
  ok((await chamar('/api/funcionarios/' + carla, 'DELETE', null, true)).status === 200, 'RH remove funcionário');

  /* ---------- rotas e corpos inválidos ---------- */
  ok((await chamar('/api/nada')).status === 404, 'rota desconhecida devolve 404');
  const ruim = await fetch(base + '/api/pin', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{{{' });
  ok(ruim.status === 400, 'JSON malformado devolve 400');

  /* ---------- o banco sobreviveu ---------- */
  ok(fs.existsSync(path.join(temp, 'ferias.db')), 'banco gravado em disco');

  servidor.close();
  fs.rmSync(temp, { recursive:true, force:true });
  console.log((falhas ? '\n' : '') + testes + ' testes de API, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

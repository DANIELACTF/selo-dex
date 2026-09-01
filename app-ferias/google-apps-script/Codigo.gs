/**
 * Quadro de Férias — versão que roda dentro do Google.
 *
 * Os dados ficam nesta mesma planilha, em três abas que o próprio programa
 * cria na primeira vez: Funcionários, Solicitações e Ajustes.
 *
 * As regras da CLT vêm do arquivo regras_js.html, o mesmo que a tela usa —
 * é o que garante que a conferência do navegador e a do servidor não divirjam.
 */

var ABA_FUNC = 'Funcionários';
var ABA_SOL  = 'Solicitações';
var ABA_CFG  = 'Ajustes';

var CAB_FUNC = ['ID','Nome','Cargo','Setor','Admissão','Dias por período','Ativo'];
var CAB_SOL  = ['ID','Funcionário','Setor','Período','Dias','Situação','Observação','Motivo da recusa',
                'Período aquisitivo','Enviada em','Decidida em','Início (ISO)','ID do funcionário'];

var VALIDADE_SESSAO = 12 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ página */

function doGet(){
  return HtmlService.createTemplateFromFile('pagina')
    .evaluate()
    .setTitle('Quadro de Férias')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function incluir(nome){
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

var _motor = null;
function motor(){
  if(!_motor){
    var fonte = HtmlService.createHtmlOutputFromFile('regras_js').getContent()
      .replace(/<\/?script>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    _motor = eval(fonte + '; motorDeFerias()');
  }
  return _motor;
}

function onOpen(){
  SpreadsheetApp.getUi()
    .createMenu('Quadro de Férias')
    .addItem('Preparar as abas', 'garantirAbas')
    .addToUi();
}

/* ------------------------------------------------------------------ planilha */

function planilha(){ return SpreadsheetApp.getActive(); }

function garantirAbas(){
  var ss = planilha();
  var f = ss.getSheetByName(ABA_FUNC);
  if(!f){
    f = ss.insertSheet(ABA_FUNC);
    f.getRange(1,1,1,CAB_FUNC.length).setValues([CAB_FUNC]).setFontWeight('bold');
    f.setFrozenRows(1);
    f.getRange('E:E').setNumberFormat('@');
    f.hideColumns(1);
  }
  var s = ss.getSheetByName(ABA_SOL);
  if(!s){
    s = ss.insertSheet(ABA_SOL);
    s.getRange(1,1,1,CAB_SOL.length).setValues([CAB_SOL]).setFontWeight('bold');
    s.setFrozenRows(1);
    s.getRange('L:L').setNumberFormat('@');
    s.hideColumns(1);
    s.hideColumns(12, 2);
  }
  var c = ss.getSheetByName(ABA_CFG);
  if(!c){
    c = ss.insertSheet(ABA_CFG);
    c.getRange(1,1,1,2).setValues([['Chave','Valor']]).setFontWeight('bold');
    c.setFrozenRows(1);
    c.appendRow(['empresa', '']);
  }
  return { funcionarios:f, solicitacoes:s, ajustes:c };
}

function linhas(aba){
  var valores = aba.getDataRange().getValues();
  return valores.length > 1 ? valores.slice(1) : [];
}

function textoDe(v){ return v === null || v === undefined ? '' : String(v).trim(); }

/** Datas gravadas como texto ISO; se o Sheets converter em Date, converte de volta. */
function isoDe(v){
  if(v && Object.prototype.toString.call(v) === '[object Date]'){
    return v.getFullYear() + '-' + ('0' + (v.getMonth()+1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
  }
  return textoDe(v);
}

function lerFuncionarios(){
  var abas = garantirAbas();
  return linhas(abas.funcionarios).filter(function(l){ return textoDe(l[0]); }).map(function(l){
    return {
      id: textoDe(l[0]),
      nome: textoDe(l[1]),
      cargo: textoDe(l[2]),
      setor: textoDe(l[3]),
      admissao: isoDe(l[4]),
      diasDireito: Number(l[5]) || 30,
      ativo: textoDe(l[6]).toUpperCase() !== 'NÃO' && textoDe(l[6]).toUpperCase() !== 'NAO'
    };
  });
}

function lerSolicitacoes(){
  var abas = garantirAbas();
  return linhas(abas.solicitacoes).filter(function(l){ return textoDe(l[0]); }).map(function(l){
    return {
      id: textoDe(l[0]),
      nome: textoDe(l[1]),
      setor: textoDe(l[2]),
      dias: Number(l[4]) || 0,
      status: textoDe(l[5]).toLowerCase(),
      obs: textoDe(l[6]),
      motivo: textoDe(l[7]),
      periodoAquisitivo: textoDe(l[8]),
      criadaEm: textoDe(l[9]),
      decididaEm: textoDe(l[10]),
      inicio: isoDe(l[11]),
      funcionarioId: textoDe(l[12])
    };
  });
}

function acharLinha(aba, id, coluna){
  var col = aba.getRange(1, coluna || 1, aba.getLastRow(), 1).getValues();
  for(var i = 1; i < col.length; i++){ if(textoDe(col[i][0]) === id) return i + 1; }
  return 0;
}

function ajuste(chave, valor){
  var aba = garantirAbas().ajustes;
  var dados = linhas(aba);
  for(var i = 0; i < dados.length; i++){
    if(textoDe(dados[i][0]) === chave){
      if(valor === undefined) return textoDe(dados[i][1]);
      aba.getRange(i + 2, 2).setValue(valor);
      return valor;
    }
  }
  if(valor === undefined) return '';
  aba.appendRow([chave, valor]);
  return valor;
}

/* ------------------------------------------------------------------ acesso */

function props(){ return PropertiesService.getScriptProperties(); }

function hashPin(pin, sal){
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'quadro-ferias|' + sal + '|' + pin, Utilities.Charset.UTF_8);
  return bytes.map(function(b){ return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function definirPin_(pin){
  var sal = Utilities.getUuid();
  props().setProperty('pin_sal', sal);
  props().setProperty('pin_hash', hashPin(pin, sal));
}

function conferePin_(pin){
  var sal = props().getProperty('pin_sal');
  var esperado = props().getProperty('pin_hash');
  if(!sal || !esperado) return false;
  return hashPin(pin, sal) === esperado;
}

function tokens_(){
  try{ return JSON.parse(props().getProperty('sessoes') || '{}'); }catch(e){ return {}; }
}
function gravarTokens_(t){ props().setProperty('sessoes', JSON.stringify(t)); }

function novaSessao_(){
  var agora = Date.now();
  var t = tokens_(), limpo = {};
  Object.keys(t).forEach(function(k){ if(t[k] > agora) limpo[k] = t[k]; });
  var token = Utilities.getUuid().replace(/-/g, '');
  limpo[token] = agora + VALIDADE_SESSAO;
  gravarTokens_(limpo);
  return token;
}

function ehGestor_(token){
  if(!token) return false;
  var t = tokens_();
  return !!(t[token] && t[token] > Date.now());
}

function exigirGestor_(token){
  if(!ehGestor_(token)) throw new Error('Sua sessão expirou. Entre de novo com o PIN da gestão.');
}

/* ------------------------------------------------------------------ auxiliares */

function idNovo_(){ return Utilities.getUuid().replace(/-/g, '').slice(0, 18); }

function comTrava_(fn){
  var trava = LockService.getScriptLock();
  try{ trava.waitLock(20000); }
  catch(e){ throw new Error('O sistema está ocupado com outro pedido. Tente de novo em alguns segundos.'); }
  try{ return fn(); }
  finally{ try{ trava.releaseLock(); }catch(e){} }
}

function ativasDe_(id, todas){
  return todas.filter(function(s){
    return s.funcionarioId === id && (s.status === 'pendente' || s.status === 'aprovada');
  });
}

function periodoLegivel_(R, inicioIso, dias){
  var i = R.pd(inicioIso);
  return i ? R.fmt(i) + ' a ' + R.fmt(R.addDias(i, dias - 1)) : '';
}

/* ------------------------------------------------------------------ chamadas da tela */

function carregarEstado(token){
  return {
    funcionarios: lerFuncionarios(),
    solicitacoes: lerSolicitacoes(),
    empresa: ajuste('empresa'),
    temPin: !!props().getProperty('pin_hash'),
    gestor: ehGestor_(token)
  };
}

function entrarGestao(pin){
  pin = String(pin || '');
  if(pin.length < 4) throw new Error('O PIN precisa de pelo menos 4 caracteres.');
  return comTrava_(function(){
    if(!props().getProperty('pin_hash')){
      definirPin_(pin);
      return { token: novaSessao_(), definido: true };
    }
    if(!conferePin_(pin)) throw new Error('PIN incorreto.');
    return { token: novaSessao_(), definido: false };
  });
}

function trocarPin(token, atual, novo){
  exigirGestor_(token);
  if(!conferePin_(String(atual || ''))) throw new Error('O PIN atual não confere.');
  if(String(novo || '').length < 4) throw new Error('O novo PIN precisa de pelo menos 4 caracteres.');
  definirPin_(String(novo));
  return { ok: true };
}

function enviarSolicitacao(dados){
  var R = motor();
  return comTrava_(function(){
    var funcs = lerFuncionarios();
    var func = funcs.filter(function(f){ return f.id === String(dados.funcionarioId || ''); })[0];
    if(!func || !func.ativo) throw new Error('Funcionário não encontrado.');

    var todas = lerSolicitacoes();
    var pedido = { id:null, inicio: textoDe(dados.inicio).slice(0,10), dias: Math.round(Number(dados.dias) || 0) };
    var V = R.validar(func, pedido, ativasDe_(func.id, todas), funcs, todas);
    if(V.erros.length) throw new Error(V.erros[0].t);

    var agora = new Date().toISOString();
    garantirAbas().solicitacoes.appendRow([
      idNovo_(), func.nome, func.setor || '',
      periodoLegivel_(R, pedido.inicio, pedido.dias), pedido.dias,
      'pendente', textoDe(dados.obs).slice(0,500), '',
      V.slot ? R.fmt(V.slot.p.ini) + ' a ' + R.fmt(V.slot.p.fim) : '',
      agora, '', pedido.inicio, func.id
    ]);
    return { ok: true };
  });
}

function cancelarSolicitacao(id, funcionarioId){
  return comTrava_(function(){
    var aba = garantirAbas().solicitacoes;
    var linha = acharLinha(aba, String(id || ''));
    if(!linha) throw new Error('Solicitação não encontrada.');
    var atual = aba.getRange(linha, 1, 1, CAB_SOL.length).getValues()[0];
    if(textoDe(atual[12]) !== String(funcionarioId || '')) throw new Error('Este pedido é de outra pessoa.');
    if(textoDe(atual[5]).toLowerCase() !== 'pendente') throw new Error('Só dá para cancelar um pedido que ainda está pendente.');
    aba.getRange(linha, 6).setValue('cancelada');
    aba.getRange(linha, 11).setValue(new Date().toISOString());
    return { ok: true };
  });
}

function decidirSolicitacao(token, id, status, motivo){
  exigirGestor_(token);
  if(status !== 'aprovada' && status !== 'recusada') throw new Error('Decisão inválida.');
  motivo = textoDe(motivo).slice(0,300);
  if(status === 'recusada' && !motivo) throw new Error('Escreva o motivo da recusa.');
  return comTrava_(function(){
    var aba = garantirAbas().solicitacoes;
    var linha = acharLinha(aba, String(id || ''));
    if(!linha) throw new Error('Solicitação não encontrada.');
    aba.getRange(linha, 6).setValue(status);
    aba.getRange(linha, 8).setValue(motivo);
    aba.getRange(linha, 11).setValue(new Date().toISOString());
    return { ok: true };
  });
}

function excluirSolicitacao(token, id){
  exigirGestor_(token);
  return comTrava_(function(){
    var aba = garantirAbas().solicitacoes;
    var linha = acharLinha(aba, String(id || ''));
    if(!linha) throw new Error('Solicitação não encontrada.');
    aba.deleteRow(linha);
    return { ok: true };
  });
}

function salvarFuncionario(token, dados){
  exigirGestor_(token);
  var R = motor();
  var nome = textoDe(dados.nome).slice(0,120);
  var admissao = textoDe(dados.admissao).slice(0,10);
  if(!nome) throw new Error('O nome é obrigatório.');
  if(!R.pd(admissao)) throw new Error('Informe uma data de admissão válida.');
  if(R.pd(admissao) > R.hoje()) throw new Error('A data de admissão não pode estar no futuro.');
  var dias = Math.round(Number(dados.diasDireito) || 30);
  if(dias < 1 || dias > 30) dias = 30;

  return comTrava_(function(){
    var aba = garantirAbas().funcionarios;
    var linha = dados.id ? acharLinha(aba, String(dados.id)) : 0;
    var valores = [dados.id && linha ? String(dados.id) : idNovo_(), nome,
                   textoDe(dados.cargo).slice(0,80), textoDe(dados.setor).slice(0,80),
                   admissao, dias, dados.ativo === false ? 'Não' : 'Sim'];
    if(linha) aba.getRange(linha, 1, 1, CAB_FUNC.length).setValues([valores]);
    else aba.appendRow(valores);

    if(linha){
      var abaSol = garantirAbas().solicitacoes;
      var dadosSol = linhas(abaSol);
      for(var i = 0; i < dadosSol.length; i++){
        if(textoDe(dadosSol[i][12]) === valores[0]){
          abaSol.getRange(i + 2, 2, 1, 2).setValues([[nome, valores[3]]]);
        }
      }
    }
    return { ok: true };
  });
}

function removerFuncionario(token, id){
  exigirGestor_(token);
  return comTrava_(function(){
    var aba = garantirAbas().funcionarios;
    var linha = acharLinha(aba, String(id || ''));
    if(!linha) throw new Error('Funcionário não encontrado.');
    aba.deleteRow(linha);
    return { ok: true };
  });
}

function lancarHistorico(token, dados){
  exigirGestor_(token);
  var R = motor();
  return comTrava_(function(){
    var func = lerFuncionarios().filter(function(f){ return f.id === String(dados.funcionarioId || ''); })[0];
    if(!func) throw new Error('Funcionário não encontrado.');
    var inicio = textoDe(dados.inicio).slice(0,10);
    var dias = Math.round(Number(dados.dias) || 0);
    var dIni = R.pd(inicio);
    if(!dIni) throw new Error('Informe uma data válida.');
    if(dias < 1 || dias > 30) throw new Error('Os dias gozados precisam ficar entre 1 e 30.');
    if(dIni < R.pd(func.admissao)) throw new Error('A data é anterior à admissão.');

    var alvo = R.periodoAlvo(func, ativasDe_(func.id, lerSolicitacoes()), dIni);
    var agora = new Date().toISOString();
    garantirAbas().solicitacoes.appendRow([
      idNovo_(), func.nome, func.setor || '',
      periodoLegivel_(R, inicio, dias), dias,
      'aprovada', 'Lançamento retroativo pelo RH.', '',
      alvo.slot ? R.fmt(alvo.slot.p.ini) + ' a ' + R.fmt(alvo.slot.p.fim) : '',
      agora, agora, inicio, func.id
    ]);
    return { ok: true };
  });
}

function salvarEmpresa(token, nome){
  exigirGestor_(token);
  ajuste('empresa', textoDe(nome).slice(0,120));
  return { ok: true };
}

function linkDaPlanilha(token){
  exigirGestor_(token);
  return { url: planilha().getUrl() };
}

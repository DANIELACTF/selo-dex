/**
 * Quadro de Férias — versão que roda dentro do Google.
 *
 * Os dados ficam nesta mesma planilha, em três abas que o próprio programa
 * cria na primeira vez: Funcionários, Solicitações e Ajustes.
 *
 * Toda solicitação precisa de três autorizações — gestor do departamento,
 * departamento pessoal e diretor. Cada um entra com o seu PIN e assina só o
 * campo dele.
 *
 * As regras de agendamento vêm do arquivo regras_js.html, o mesmo que a tela
 * usa — é o que garante que a conferência do navegador e a do servidor não
 * divirjam.
 */

var ABA_FUNC = 'Funcionários';
var ABA_SOL  = 'Solicitações';
var ABA_CFG  = 'Ajustes';

var CAB_FUNC = ['ID','Nome','Cargo','Setor','Admissão','Ativo'];
var CAB_SOL  = ['ID','Funcionário','Setor','Período','Dias','Retorno','Situação',
                'Gestor','Departamento pessoal','Diretor',
                'Observação','Motivo da recusa','Recusada por','Enviada em',
                'Início (ISO)','ID do funcionário',
                'Aut. gestor (ISO)','Aut. DP (ISO)','Aut. diretor (ISO)'];

/* colunas (1 = primeira) usadas nas atualizações pontuais */
var COL = { situacao:7, nomeAut:{ gestor:8, dp:9, diretor:10 },
            motivo:12, recusadaPor:13,
            isoAut:{ gestor:17, dp:18, diretor:19 } };

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

function papeis(){ return motor().PAPEIS.map(function(p){ return p.chave; }); }

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
    s.getRange('O:O').setNumberFormat('@');
    s.hideColumns(1);
    s.hideColumns(15, 5);
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
  return linhas(garantirAbas().funcionarios).filter(function(l){ return textoDe(l[0]); }).map(function(l){
    var ativo = textoDe(l[5]).toUpperCase();
    return {
      id: textoDe(l[0]), nome: textoDe(l[1]), cargo: textoDe(l[2]),
      setor: textoDe(l[3]), admissao: isoDe(l[4]),
      ativo: ativo !== 'NÃO' && ativo !== 'NAO'
    };
  });
}

function lerSolicitacoes(){
  return linhas(garantirAbas().solicitacoes).filter(function(l){ return textoDe(l[0]); }).map(function(l){
    return {
      id: textoDe(l[0]), nome: textoDe(l[1]), setor: textoDe(l[2]),
      dias: Number(l[4]) || 0, status: textoDe(l[6]).toLowerCase(),
      aut_gestor_nome: textoDe(l[7]), aut_dp_nome: textoDe(l[8]), aut_diretor_nome: textoDe(l[9]),
      obs: textoDe(l[10]), motivo: textoDe(l[11]), recusadaPor: textoDe(l[12]),
      criadaEm: textoDe(l[13]), inicio: isoDe(l[14]), funcionarioId: textoDe(l[15]),
      aut_gestor: textoDe(l[16]), aut_dp: textoDe(l[17]), aut_diretor: textoDe(l[18])
    };
  });
}

function acharLinha(aba, id){
  var col = aba.getRange(1, 1, aba.getLastRow(), 1).getValues();
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
function definirPin_(papel, pin){
  var sal = Utilities.getUuid();
  props().setProperty('pin_' + papel + '_sal', sal);
  props().setProperty('pin_' + papel + '_hash', hashPin(pin, sal));
}
function conferePin_(papel, pin){
  var sal = props().getProperty('pin_' + papel + '_sal');
  var esperado = props().getProperty('pin_' + papel + '_hash');
  if(!sal || !esperado) return false;
  return hashPin(pin, sal) === esperado;
}
function papelDoPin_(pin){
  var lista = papeis();
  for(var i = 0; i < lista.length; i++){ if(conferePin_(lista[i], pin)) return lista[i]; }
  return null;
}
function jaConfigurado_(){
  return papeis().every(function(p){ return !!props().getProperty('pin_' + p + '_hash'); });
}

function tokens_(){
  try{ return JSON.parse(props().getProperty('sessoes') || '{}'); }catch(e){ return {}; }
}
function novaSessao_(papel){
  var agora = Date.now(), t = tokens_(), limpo = {};
  Object.keys(t).forEach(function(k){ if(t[k].ate > agora) limpo[k] = t[k]; });
  var token = Utilities.getUuid().replace(/-/g, '');
  limpo[token] = { ate: agora + VALIDADE_SESSAO, papel: papel };
  props().setProperty('sessoes', JSON.stringify(limpo));
  return token;
}
function papelDaSessao_(token){
  if(!token) return '';
  var s = tokens_()[token];
  return (s && s.ate > Date.now()) ? s.papel : '';
}
function exigir_(token, papelExigido){
  var papel = papelDaSessao_(token);
  if(!papel) throw new Error('Sua sessão expirou. Entre de novo com o seu PIN.');
  if(papelExigido && papel !== papelExigido) throw new Error('Só o departamento pessoal pode fazer isso.');
  return papel;
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

function minhasDe_(id, todas){
  return todas.filter(function(s){ return s.funcionarioId === id; });
}

function linhaSolicitacao_(R, id, func, inicio, dias, obs, status, criadaEm, autNomes, autIsos, motivo, recusadaPor){
  var i = R.pd(inicio);
  return [
    id, func.nome, func.setor || '',
    i ? R.fmt(i) + ' a ' + R.fmt(R.addDias(i, dias - 1)) : '',
    dias,
    i ? R.fmt(R.addDias(i, dias)) : '',
    status,
    autNomes.gestor || '', autNomes.dp || '', autNomes.diretor || '',
    obs, motivo || '', recusadaPor || '', criadaEm,
    inicio, func.id,
    autIsos.gestor || '', autIsos.dp || '', autIsos.diretor || ''
  ];
}

/* ------------------------------------------------------------------ chamadas da tela */

function carregarEstado(token){
  var nomes = {};
  papeis().forEach(function(p){ nomes[p] = props().getProperty('nome_' + p) || ''; });
  return {
    funcionarios: lerFuncionarios(),
    solicitacoes: lerSolicitacoes(),
    empresa: ajuste('empresa'),
    nomes: nomes,
    configurado: jaConfigurado_(),
    papel: papelDaSessao_(token)
  };
}

function configurarPins(dados){
  if(jaConfigurado_()) throw new Error('Os PINs já foram definidos. Use "Trocar nomes e PINs".');
  var lista = papeis(), pins = [];
  for(var i = 0; i < lista.length; i++){
    var d = (dados || {})[lista[i]] || {};
    var nome = textoDe(d.nome).slice(0,120);
    var pin = String(d.pin || '');
    if(!nome) throw new Error('Informe o nome de quem responde por cada papel.');
    if(pin.length < 4) throw new Error('Cada PIN precisa de pelo menos 4 caracteres.');
    pins.push({ papel: lista[i], nome: nome, pin: pin });
  }
  var soPins = pins.map(function(p){ return p.pin; });
  for(var a = 0; a < soPins.length; a++){
    for(var b = a + 1; b < soPins.length; b++){
      if(soPins[a] === soPins[b]) throw new Error('Os três PINs precisam ser diferentes entre si.');
    }
  }
  return comTrava_(function(){
    pins.forEach(function(p){
      definirPin_(p.papel, p.pin);
      props().setProperty('nome_' + p.papel, p.nome);
    });
    return { token: novaSessao_('dp'), papel: 'dp' };
  });
}

function entrarGestao(pin){
  if(!jaConfigurado_()) throw new Error('Os PINs ainda não foram definidos.');
  var papel = papelDoPin_(String(pin || ''));
  if(!papel) throw new Error('PIN incorreto.');
  return { token: novaSessao_(papel), papel: papel, nome: props().getProperty('nome_' + papel) || '' };
}

function trocarPins(token, dados){
  exigir_(token, 'dp');
  var trocados = 0;
  papeis().forEach(function(p){
    var d = (dados || {})[p] || {};
    if(d.nome !== undefined) props().setProperty('nome_' + p, textoDe(d.nome).slice(0,120));
    var pin = String(d.pin || '');
    if(pin){
      if(pin.length < 4) throw new Error('Cada PIN precisa de pelo menos 4 caracteres.');
      definirPin_(p, pin);
      trocados++;
    }
  });
  return { ok:true, trocados: trocados };
}

function enviarSolicitacao(dados){
  var R = motor();
  return comTrava_(function(){
    var funcs = lerFuncionarios();
    var func = funcs.filter(function(f){ return f.id === String(dados.funcionarioId || ''); })[0];
    if(!func || !func.ativo) throw new Error('Funcionário não encontrado.');

    var todas = lerSolicitacoes();
    var pedido = { id:null, inicio: textoDe(dados.inicio).slice(0,10), dias: Math.round(Number(dados.dias) || 0) };
    var V = R.validar(func, pedido, minhasDe_(func.id, todas), funcs, todas);
    if(V.erros.length) throw new Error(V.erros[0].t);

    garantirAbas().solicitacoes.appendRow(linhaSolicitacao_(
      R, idNovo_(), func, pedido.inicio, pedido.dias, textoDe(dados.obs).slice(0,500),
      'pendente', new Date().toISOString(), {}, {}, '', ''));
    return { ok:true };
  });
}

function cancelarSolicitacao(id, funcionarioId, token){
  return comTrava_(function(){
    var aba = garantirAbas().solicitacoes;
    var linha = acharLinha(aba, String(id || ''));
    if(!linha) throw new Error('Solicitação não encontrada.');
    var atual = aba.getRange(linha, 1, 1, CAB_SOL.length).getValues()[0];
    var ehDono = textoDe(atual[15]) === String(funcionarioId || '');
    if(!ehDono && !papelDaSessao_(token)) throw new Error('Este pedido é de outra pessoa.');
    if(textoDe(atual[6]).toLowerCase() !== 'pendente') throw new Error('Só dá para cancelar um pedido que ainda está em análise.');
    aba.getRange(linha, COL.situacao).setValue('cancelada');
    return { ok:true };
  });
}

function autorizarSolicitacao(token, id){
  var papel = exigir_(token);
  return comTrava_(function(){
    var aba = garantirAbas().solicitacoes;
    var linha = acharLinha(aba, String(id || ''));
    if(!linha) throw new Error('Solicitação não encontrada.');
    var atual = aba.getRange(linha, 1, 1, CAB_SOL.length).getValues()[0];
    if(textoDe(atual[6]).toLowerCase() !== 'pendente') throw new Error('Este pedido não está mais em análise.');
    if(textoDe(atual[COL.isoAut[papel] - 1])) throw new Error('Você já autorizou este pedido.');

    var agora = new Date().toISOString();
    var nome = props().getProperty('nome_' + papel) || papel;
    aba.getRange(linha, COL.isoAut[papel]).setValue(agora);
    aba.getRange(linha, COL.nomeAut[papel]).setValue(nome);

    var completo = papeis().every(function(p){
      return p === papel || !!textoDe(atual[COL.isoAut[p] - 1]);
    });
    if(completo) aba.getRange(linha, COL.situacao).setValue('autorizada');
    return { ok:true };
  });
}

function recusarSolicitacao(token, id, motivo){
  var papel = exigir_(token);
  motivo = textoDe(motivo).slice(0,300);
  if(!motivo) throw new Error('Escreva o motivo da recusa.');
  return comTrava_(function(){
    var aba = garantirAbas().solicitacoes;
    var linha = acharLinha(aba, String(id || ''));
    if(!linha) throw new Error('Solicitação não encontrada.');
    var atual = aba.getRange(linha, 1, 1, CAB_SOL.length).getValues()[0];
    if(textoDe(atual[6]).toLowerCase() !== 'pendente') throw new Error('Este pedido não está mais em análise.');
    aba.getRange(linha, COL.situacao).setValue('recusada');
    aba.getRange(linha, COL.motivo).setValue(motivo);
    aba.getRange(linha, COL.recusadaPor).setValue(props().getProperty('nome_' + papel) || papel);
    return { ok:true };
  });
}

function excluirSolicitacao(token, id){
  exigir_(token, 'dp');
  return comTrava_(function(){
    var aba = garantirAbas().solicitacoes;
    var linha = acharLinha(aba, String(id || ''));
    if(!linha) throw new Error('Solicitação não encontrada.');
    aba.deleteRow(linha);
    return { ok:true };
  });
}

function salvarFuncionario(token, dados){
  exigir_(token, 'dp');
  var R = motor();
  var nome = textoDe(dados.nome).slice(0,120);
  var admissao = textoDe(dados.admissao).slice(0,10);
  if(!nome) throw new Error('O nome é obrigatório.');
  if(admissao && !R.pd(admissao)) throw new Error('A data de admissão informada não existe.');

  return comTrava_(function(){
    var aba = garantirAbas().funcionarios;
    var linha = dados.id ? acharLinha(aba, String(dados.id)) : 0;
    var valores = [linha ? String(dados.id) : idNovo_(), nome,
                   textoDe(dados.cargo).slice(0,80), textoDe(dados.setor).slice(0,80),
                   admissao, dados.ativo === false ? 'Não' : 'Sim'];
    if(linha) aba.getRange(linha, 1, 1, CAB_FUNC.length).setValues([valores]);
    else aba.appendRow(valores);

    if(linha){
      var abaSol = garantirAbas().solicitacoes;
      var dadosSol = linhas(abaSol);
      for(var i = 0; i < dadosSol.length; i++){
        if(textoDe(dadosSol[i][15]) === valores[0]){
          abaSol.getRange(i + 2, 2, 1, 2).setValues([[nome, valores[3]]]);
        }
      }
    }
    return { ok:true };
  });
}

function removerFuncionario(token, id){
  exigir_(token, 'dp');
  return comTrava_(function(){
    var aba = garantirAbas().funcionarios;
    var linha = acharLinha(aba, String(id || ''));
    if(!linha) throw new Error('Funcionário não encontrado.');
    aba.deleteRow(linha);
    return { ok:true };
  });
}

function lancarHistorico(token, dados){
  exigir_(token, 'dp');
  var R = motor();
  return comTrava_(function(){
    var func = lerFuncionarios().filter(function(f){ return f.id === String(dados.funcionarioId || ''); })[0];
    if(!func) throw new Error('Funcionário não encontrado.');
    var inicio = textoDe(dados.inicio).slice(0,10);
    var dias = Math.round(Number(dados.dias) || 0);
    if(!R.pd(inicio)) throw new Error('Informe uma data válida.');
    if(dias < 1 || dias > 30) throw new Error('Os dias precisam ficar entre 1 e 30.');

    var agora = new Date().toISOString();
    var nome = props().getProperty('nome_dp') || 'Departamento pessoal';
    garantirAbas().solicitacoes.appendRow(linhaSolicitacao_(
      R, idNovo_(), func, inicio, dias, 'Lançado pelo departamento pessoal.', 'autorizada', agora,
      { gestor:nome, dp:nome, diretor:nome },
      { gestor:agora, dp:agora, diretor:agora }, '', ''));
    return { ok:true };
  });
}

function salvarEmpresa(token, nome){
  exigir_(token, 'dp');
  ajuste('empresa', textoDe(nome).slice(0,120));
  return { ok:true };
}

function linkDaPlanilha(token){
  exigir_(token);
  return { url: planilha().getUrl() };
}

/**
 * Simulador IBS/CBS — versão app, no mesmo formato do Quadro de Férias.
 *
 * A tela (pagina.html) faz todas as contas no navegador com o motor de
 * motor_js.html. Este arquivo só serve a página e guarda as simulações
 * numa planilha, em duas abas que ele mesmo cria: Simulações e Resultado.
 *
 * Dá para abrir de dois jeitos:
 *   - pelo menu "Simulador IBS/CBS > Abrir o simulador", dentro da planilha;
 *   - pelo link do app da Web (Implantar > Nova implantação > App da Web).
 */

var ABA_SIM = 'Simulações';
var ABA_RES = 'Resultado';
var CAB_SIM = ['ID', 'Nome', 'Empresa', 'Regime', 'Operações', 'Salva em'];
var COL_DADOS = CAB_SIM.length + 1;   // o JSON da simulação começa aqui
var PEDACO = 45000;                    // uma célula aceita até 50 mil caracteres
var MAX_PEDACOS = 40;
var MARCA = '~';                       // prefixo dos pedaços: impede que o Sheets os leia como número ou fórmula

/* ------------------------------------------------------------------ página */

function pagina_(){
  return HtmlService.createTemplateFromFile('pagina').evaluate()
    .setTitle('Simulador IBS/CBS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doGet(){
  return pagina_();
}

function incluir(nome){
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

function onOpen(){
  SpreadsheetApp.getUi()
    .createMenu('Simulador IBS/CBS')
    .addItem('Abrir o simulador', 'abrirSimulador')
    .addToUi();
}

function abrirSimulador(){
  SpreadsheetApp.getUi().showModalDialog(pagina_().setWidth(1200).setHeight(820), 'Simulador IBS/CBS');
}

/* ------------------------------------------------------------------ planilha */

/** A planilha do próprio script; se o script não estiver preso a uma, cria e lembra de uma. */
function planilha_(){
  var ativa = null;
  try{ ativa = SpreadsheetApp.getActiveSpreadsheet(); }catch(e){}
  if(ativa) return ativa;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('planilha_id');
  if(id){
    try{ return SpreadsheetApp.openById(id); }catch(e){}
  }
  var nova = SpreadsheetApp.create('Simulador IBS/CBS — dados');
  props.setProperty('planilha_id', nova.getId());
  return nova;
}

function abaSimulacoes_(){
  var ss = planilha_();
  var aba = ss.getSheetByName(ABA_SIM);
  if(!aba){
    aba = ss.insertSheet(ABA_SIM);
    aba.getRange(1, 1, 1, CAB_SIM.length).setValues([CAB_SIM]).setFontWeight('bold');
    aba.getRange(1, COL_DADOS).setValue('Dados (não editar)').setFontWeight('bold');
    aba.setFrozenRows(1);
    aba.hideColumns(1);
    aba.getRange(1, 1, aba.getMaxRows(), CAB_SIM.length).setNumberFormat('@');
  }
  return aba;
}

function textoDe_(v){ return v === null || v === undefined ? '' : String(v).trim(); }

/** Texto digitado pelo usuário, sem sinais que o Sheets leria como fórmula. */
function semFormula_(v){ return textoDe_(v).replace(/^[=+\-@]+/, '').trim(); }

function acharLinha_(aba, id){
  var n = aba.getLastRow();
  if(n < 2) return 0;
  var col = aba.getRange(2, 1, n - 1, 1).getValues();
  for(var i = 0; i < col.length; i++){ if(textoDe_(col[i][0]) === id) return i + 2; }
  return 0;
}

function comTrava_(fn){
  var trava = LockService.getScriptLock();
  try{ trava.waitLock(20000); }
  catch(e){ throw new Error('A planilha está ocupada. Tente de novo em alguns segundos.'); }
  try{ return fn(); }
  finally{ try{ trava.releaseLock(); }catch(e){} }
}

function listar_(){
  var aba = abaSimulacoes_();
  var n = aba.getLastRow();
  if(n < 2) return [];
  return aba.getRange(2, 1, n - 1, CAB_SIM.length).getValues()
    .filter(function(l){ return textoDe_(l[0]); })
    .map(function(l){
      return { id: textoDe_(l[0]), nome: textoDe_(l[1]), empresa: textoDe_(l[2]), regime: textoDe_(l[3]),
               operacoes: Number(l[4]) || 0, salvaEm: textoDe_(l[5]) };
    })
    .sort(function(a, b){ return a.salvaEm < b.salvaEm ? 1 : -1; });
}

function agora_(){
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

/* ------------------------------------------------------------------ chamadas da tela */

function carregarEstado(){
  return { simulacoes: listar_() };
}

function salvarSimulacao(dados){
  dados = dados || {};
  var nome = semFormula_(dados.nome).slice(0, 120);
  if(!nome) throw new Error('Dê um nome à simulação.');
  var estado = dados.estado || {};
  var json = JSON.stringify(estado);
  var pedacos = [];
  for(var i = 0; i < json.length; i += PEDACO) pedacos.push(MARCA + json.slice(i, i + PEDACO));
  if(pedacos.length > MAX_PEDACOS) throw new Error('A simulação é grande demais para gravar. Reduza o número de operações.');

  return comTrava_(function(){
    var aba = abaSimulacoes_();
    var id = textoDe_(dados.id);
    var linha = id ? acharLinha_(aba, id) : 0;
    if(!linha){
      // Mesmo nome = mesma simulação: grava por cima em vez de duplicar.
      var lista = listar_().filter(function(s){ return s.nome.toLowerCase() === nome.toLowerCase(); });
      if(lista.length){ id = lista[0].id; linha = acharLinha_(aba, id); }
    }
    if(!id) id = Utilities.getUuid().replace(/-/g, '');
    if(!linha) linha = aba.getLastRow() + 1;

    var p = estado.parametros || {};
    var meta = [id, nome, semFormula_(p.empresa).slice(0, 120), p.regime === 'presumido' ? 'Lucro Presumido' : 'Lucro Real',
                (estado.operacoes || []).length, agora_()];
    aba.getRange(linha, 1, 1, meta.length).setValues([meta]);
    var larguraAntiga = Math.max(aba.getLastColumn() - COL_DADOS + 1, 1);
    aba.getRange(linha, COL_DADOS, 1, larguraAntiga).clearContent();
    aba.getRange(linha, COL_DADOS, 1, pedacos.length).setValues([pedacos]);
    return { id: id, simulacoes: listar_() };
  });
}

function abrirSimulacao(id){
  var aba = abaSimulacoes_();
  var linha = acharLinha_(aba, textoDe_(id));
  if(!linha) throw new Error('Simulação não encontrada.');
  var largura = Math.max(aba.getLastColumn() - COL_DADOS + 1, 1);
  var json = aba.getRange(linha, COL_DADOS, 1, largura).getValues()[0].map(function(v){
    var t = v === null || v === undefined ? '' : String(v);   // sem trim: o espaço pode ser parte do JSON
    return t.charAt(0) === MARCA ? t.slice(1) : t;
  }).join('');
  var nome = textoDe_(aba.getRange(linha, 2).getValue());
  try{
    return { id: textoDe_(id), nome: nome, estado: JSON.parse(json) };
  }catch(e){
    throw new Error('Os dados desta simulação foram alterados na planilha e não puderam ser lidos.');
  }
}

function excluirSimulacao(id){
  return comTrava_(function(){
    var aba = abaSimulacoes_();
    var linha = acharLinha_(aba, textoDe_(id));
    if(!linha) throw new Error('Simulação não encontrada.');
    aba.deleteRow(linha);
    return { simulacoes: listar_() };
  });
}

/**
 * Grava o resultado numa aba, para filtrar, imprimir ou baixar em Excel.
 * blocos: [{ titulo, cabecalho: [..], linhas: [[..]], formatos: ['texto'|'moeda'|'pct', ..] }]
 */
function gravarResultado(dados){
  dados = dados || {};
  var blocos = dados.blocos || [];
  return comTrava_(function(){
    var ss = planilha_();
    var aba = ss.getSheetByName(ABA_RES) || ss.insertSheet(ABA_RES);
    aba.clear();
    var linha = 1;
    aba.getRange(linha, 1).setValue(textoDe_(dados.titulo) || 'Simulação IBS/CBS').setFontWeight('bold').setFontSize(14);
    linha++;
    if(dados.subtitulo){ aba.getRange(linha, 1).setValue(textoDe_(dados.subtitulo)).setFontColor('#595959'); linha++; }
    linha++;

    var FMT = { moeda: '"R$" #,##0.00;[Red]-"R$" #,##0.00', pct: '0.00%', texto: '@' };
    blocos.forEach(function(b){
      var cab = b.cabecalho || [];
      var linhas = b.linhas || [];
      if(!cab.length) return;
      aba.getRange(linha, 1).setValue(textoDe_(b.titulo)).setFontWeight('bold');
      linha++;
      aba.getRange(linha, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#e7eafb');
      linha++;
      if(linhas.length){
        (b.formatos || []).forEach(function(f, j){
          if(FMT[f]) aba.getRange(linha, j + 1, linhas.length, 1).setNumberFormat(FMT[f]);
        });
        aba.getRange(linha, 1, linhas.length, cab.length).setValues(linhas.map(function(l){
          return cab.map(function(_, j){ return l[j] === undefined || l[j] === null ? '' : l[j]; });
        }));
        linha += linhas.length;
      }
      linha++;
    });
    aba.autoResizeColumns(1, 15);
    return { url: ss.getUrl() + '#gid=' + aba.getSheetId() };
  });
}

function linkDaPlanilha(){
  return { url: planilha_().getUrl() };
}

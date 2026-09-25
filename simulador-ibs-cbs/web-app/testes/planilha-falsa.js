// Imitação mínima dos serviços do Apps Script usados pelo Codigo.gs
// (SpreadsheetApp, PropertiesService, LockService, Utilities, Session).
// Serve aos testes em Node e ao ensaio da tela no navegador.
'use strict';

function criarAmbiente(){
  var uuid = 0;
  function Aba(nome, id){
    this.nome = nome; this.id = id; this.dados = []; this.maxLinhas = 1000;
  }
  Aba.prototype.valor = function(l, c){ return (this.dados[l - 1] || [])[c - 1]; };
  Aba.prototype.gravar = function(l, c, v){
    while(this.dados.length < l) this.dados.push([]);
    this.dados[l - 1][c - 1] = v;
  };
  Aba.prototype.getName = function(){ return this.nome; };
  Aba.prototype.getSheetId = function(){ return this.id; };
  Aba.prototype.getMaxRows = function(){ return this.maxLinhas; };
  Aba.prototype.getLastRow = function(){
    for(var i = this.dados.length; i > 0; i--){
      if((this.dados[i - 1] || []).some(function(v){ return v !== '' && v !== undefined && v !== null; })) return i;
    }
    return 0;
  };
  Aba.prototype.getLastColumn = function(){
    var m = 0;
    this.dados.forEach(function(l){ l.forEach(function(v, j){ if(v !== '' && v !== undefined && v !== null) m = Math.max(m, j + 1); }); });
    return m;
  };
  Aba.prototype.getRange = function(l, c, nl, nc){
    if(typeof l === 'string') return new Faixa(this, 1, 1, 1, 1);
    return new Faixa(this, l, c, nl || 1, nc || 1);
  };
  Aba.prototype.setFrozenRows = function(){ return this; };
  Aba.prototype.hideColumns = function(){ return this; };
  Aba.prototype.autoResizeColumns = function(){ return this; };
  Aba.prototype.deleteRow = function(l){ this.dados.splice(l - 1, 1); return this; };
  Aba.prototype.clear = function(){ this.dados = []; return this; };

  function Faixa(aba, l, c, nl, nc){ this.aba = aba; this.l = l; this.c = c; this.nl = nl; this.nc = nc; }
  ['setFontWeight', 'setNumberFormat', 'setFontColor', 'setFontSize', 'setBackground'].forEach(function(m){
    Faixa.prototype[m] = function(){ return this; };
  });
  Faixa.prototype.getValues = function(){
    var out = [];
    for(var i = 0; i < this.nl; i++){
      var linha = [];
      for(var j = 0; j < this.nc; j++){
        var v = this.aba.valor(this.l + i, this.c + j);
        linha.push(v === undefined || v === null ? '' : v);
      }
      out.push(linha);
    }
    return out;
  };
  Faixa.prototype.getValue = function(){ return this.getValues()[0][0]; };
  Faixa.prototype.setValues = function(vs){
    if(vs.length !== this.nl || vs.some(function(l){ return l.length !== this.nc; }, this)){
      throw new Error('Tamanho dos dados não confere com o intervalo (' + this.nl + 'x' + this.nc + ').');
    }
    for(var i = 0; i < this.nl; i++) for(var j = 0; j < this.nc; j++) this.aba.gravar(this.l + i, this.c + j, vs[i][j]);
    return this;
  };
  Faixa.prototype.setValue = function(v){ this.aba.gravar(this.l, this.c, v); return this; };
  Faixa.prototype.clearContent = function(){
    for(var i = 0; i < this.nl; i++) for(var j = 0; j < this.nc; j++){
      if(this.aba.dados[this.l + i - 1]) this.aba.dados[this.l + i - 1][this.c + j - 1] = '';
    }
    return this;
  };

  var planilha = {
    abas: [],
    getSheetByName: function(n){ return this.abas.filter(function(a){ return a.nome === n; })[0] || null; },
    insertSheet: function(n){ var a = new Aba(n, this.abas.length + 1); this.abas.push(a); return a; },
    getUrl: function(){ return 'https://docs.google.com/spreadsheets/d/falsa/edit'; },
    getId: function(){ return 'falsa'; }
  };
  var props = {};

  return {
    planilha: planilha,
    SpreadsheetApp: {
      getActiveSpreadsheet: function(){ return planilha; },
      openById: function(){ return planilha; },
      create: function(){ return planilha; },
      getUi: function(){ throw new Error('Sem interface nos testes.'); }
    },
    PropertiesService: {
      getScriptProperties: function(){
        return {
          getProperty: function(k){ return k in props ? props[k] : null; },
          setProperty: function(k, v){ props[k] = String(v); }
        };
      }
    },
    LockService: { getScriptLock: function(){ return { waitLock: function(){}, releaseLock: function(){} }; } },
    Utilities: {
      getUuid: function(){ uuid++; return ('00000000-0000-0000-0000-' + ('000000000000' + uuid).slice(-12)); },
      formatDate: function(d){
        var z = function(n){ return ('0' + n).slice(-2); };
        return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
      }
    },
    Session: { getScriptTimeZone: function(){ return 'America/Sao_Paulo'; } },
    HtmlService: {}
  };
}

if(typeof module !== 'undefined') module.exports = { criarAmbiente: criarAmbiente };

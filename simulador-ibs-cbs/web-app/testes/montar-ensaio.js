// Monta uma página HTML completa para ensaiar a tela fora do Google:
// o motor entra no lugar do <?!= incluir('motor_js') ?> e o google.script.run
// é imitado chamando o Codigo.gs de verdade sobre a planilha simulada.
// Uso: node simulador-ibs-cbs/web-app/testes/montar-ensaio.js <saida.html>
'use strict';
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');

const pagina = ler('pagina.html');
if(/<(html|head|body)[\s>]/i.test(pagina.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('pagina.html não pode ter <html>, <head> ou <body>: o HtmlService monta o documento.');
if(pagina.indexOf("<?!= incluir('motor_js') ?>") < 0) throw new Error('pagina.html não inclui o motor_js.');

const googleFalso = `
<script>${ler('testes/planilha-falsa.js')}</script>
<script>
(function(){
  var amb = criarAmbiente();
  ['SpreadsheetApp','PropertiesService','LockService','Utilities','Session','HtmlService'].forEach(function(k){ window[k] = amb[k]; });
  window.__planilha = amb.planilha;
  function executor(ok, falha){
    return new Proxy({}, { get: function(_, nome){
      if(nome === 'withSuccessHandler') return function(f){ return executor(f, falha); };
      if(nome === 'withFailureHandler') return function(f){ return executor(ok, f); };
      return function(){
        var args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
        setTimeout(function(){
          try{ var r = window[nome].apply(null, args); ok && ok(JSON.parse(JSON.stringify(r === undefined ? null : r))); }
          catch(e){ falha && falha(e); }
        }, 30);
      };
    }});
  }
  window.google = { script: { run: executor(null, null) } };
})();
</script>
<script>${ler('Codigo.gs')}</script>`;

const doc = '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Simulador IBS/CBS</title>\n</head>\n<body>\n' +
  googleFalso + '\n' + pagina.replace("<?!= incluir('motor_js') ?>", ler('motor_js.html')) + '\n</body>\n</html>\n';

const saida = process.argv[2];
if(!saida) throw new Error('Informe o arquivo de saída.');
fs.writeFileSync(saida, doc);
console.log('ensaio gravado em ' + saida);

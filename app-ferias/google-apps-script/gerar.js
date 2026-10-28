#!/usr/bin/env node
/* Gera os dois arquivos da versão do Google Apps Script a partir da versão
   servidor, para que as regras e a tela tenham uma fonte só:

     publico/regras.js   ->  google-apps-script/regras_js.html
     publico/index.html  ->  google-apps-script/pagina.html

   O que muda na tela é só a camada de transporte: onde a versão servidor
   chama o servidor com fetch, a do Google chama google.script.run.

   Uso: node google-apps-script/gerar.js            grava os arquivos
        node google-apps-script/gerar.js --conferir avisa se saíram de sincronia */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const conferindo = process.argv.includes('--conferir');
const pendencias = [];

function entre(texto, ini, fim, arquivo){
  const a = texto.indexOf(ini), b = texto.indexOf(fim);
  if(a < 0 || b < 0) throw new Error('Marcadores ' + ini + '/' + fim + ' não encontrados em ' + arquivo);
  return { a, b: b + fim.length };
}
function trocar(texto, ini, fim, novo, arquivo){
  const p = entre(texto, ini, fim, arquivo);
  return texto.slice(0, p.a) + novo + texto.slice(p.b);
}
function entregar(destino, conteudo){
  const caminho = path.join(__dirname, destino);
  if(conferindo){
    const atual = fs.existsSync(caminho) ? fs.readFileSync(caminho, 'utf8') : '';
    if(atual !== conteudo) pendencias.push(destino);
    return;
  }
  fs.writeFileSync(caminho, conteudo);
  console.log('google-apps-script/' + destino + ' — ' + conteudo.split('\n').length + ' linhas');
}

const AVISO = 'GERADO POR google-apps-script/gerar.js — não edite à mão.';

/* ---------------------------------------------------------------- regras */
const regras = fs.readFileSync(path.join(raiz, 'publico', 'regras.js'), 'utf8');
const ini = regras.indexOf('/* INICIO-MOTOR');
const fim = regras.indexOf('/* FIM-MOTOR */');
if(ini < 0 || fim < 0) throw new Error('Marcadores INICIO-MOTOR/FIM-MOTOR não encontrados em publico/regras.js');
const motor = regras.slice(regras.indexOf('\n', regras.indexOf('*/', ini) + 2) + 1, fim).trimEnd();

entregar('regras_js.html',
`<!-- ${AVISO}
     A fonte é publico/regras.js. -->
<script>
${motor}
</script>
`);

/* ----------------------------------------------------------------- tela */
let pagina = fs.readFileSync(path.join(raiz, 'publico', 'index.html'), 'utf8');
const arq = 'publico/index.html';

/* as regras entram no corpo da página, não por um arquivo servido à parte */
pagina = pagina.replace('<script src="/regras.js"></script>',
  '<?!= incluir(\'regras_js\') ?>\n<script>window.Regras = motorDeFerias();</script>');

/* fetch -> google.script.run */
pagina = trocar(pagina, '/* TRANSPORTE-INICIO */', '/* TRANSPORTE-FIM */',
`/* Transporte da versão do Google: em vez de chamar um servidor pela rede,
   chama as funções do Codigo.gs por google.script.run. A assinatura é a mesma
   da versão servidor, então o resto da tela não muda. */
/* O bootstrap do Apps Script pode chegar depois deste script. Antes da
   primeira chamada, espera o google.script.run aparecer. */
function prontoGoogle(){
  return new Promise(function(ok, falha){
    var tentativas = 0;
    (function ver(){
      if(window.google && window.google.script && window.google.script.run) return ok();
      if(++tentativas > 100) return falha(new Error('A página não conseguiu falar com o Google. Recarregue a página.'));
      setTimeout(ver, 100);
    })();
  });
}

async function chamar(nome, args){
  await prontoGoogle();
  return new Promise(function(ok, falha){
    google.script.run
      .withSuccessHandler(ok)
      .withFailureHandler(function(e){
        falha(new Error((e && e.message) || 'Não foi possível concluir a operação.'));
      })[nome].apply(null, args || []);
  });
}

async function api(rota, opcoes){
  var o = opcoes || {}, c = o.corpo || {};
  var mSol = rota.match(/^\\/api\\/solicitacoes\\/([^\\/]+)(\\/cancelar|\\/autorizar|\\/recusar)?$/);
  var mFunc = rota.match(/^\\/api\\/funcionarios\\/([^\\/]+)$/);
  try{
    if(rota === '/api/estado')       return await chamar('carregarEstado', [token]);
    if(rota === '/api/configurar')   return await chamar('configurarPins', [c]);
    if(rota === '/api/pin')          return await chamar('entrarGestao', [c.pin]);
    if(rota === '/api/pins')         return await chamar('trocarPins', [token, c]);
    if(rota === '/api/historico')    return await chamar('lancarHistorico', [token, c]);
    if(rota === '/api/empresa')      return await chamar('salvarEmpresa', [token, c.nome]);
    if(rota === '/api/planilha')     return await chamar('linkDaPlanilha', [token]);
    if(rota === '/api/funcionarios') return await chamar('salvarFuncionario', [token, c]);
    if(rota === '/api/solicitacoes') return await chamar('enviarSolicitacao', [c]);
    if(mFunc && o.metodo === 'DELETE')   return await chamar('removerFuncionario', [token, mFunc[1]]);
    if(mSol && mSol[2] === '/cancelar')  return await chamar('cancelarSolicitacao', [mSol[1], c.funcionarioId, token]);
    if(mSol && mSol[2] === '/autorizar') return await chamar('autorizarSolicitacao', [token, mSol[1]]);
    if(mSol && mSol[2] === '/recusar')   return await chamar('recusarSolicitacao', [token, mSol[1], c.motivo]);
    if(mSol && o.metodo === 'DELETE')    return await chamar('excluirSolicitacao', [token, mSol[1]]);
    throw new Error('Chamada desconhecida: ' + rota);
  }catch(e){
    if(/sess[ãa]o expirou/i.test(e.message)){ esquecerSessao(); renderTudo(); }
    throw e;
  }
}`, arq);

/* a planilha faz as vezes de exportação: é dela que sai CSV, Excel e PDF */
pagina = trocar(pagina, '<!-- EXPORTAR-INICIO -->', '<!-- EXPORTAR-FIM -->',
  '<button class="btn btn-sm" type="button" id="btn-planilha">Abrir a planilha</button>', arq);

pagina = trocar(pagina, '/* EXPORTAR-JS-INICIO */', '/* EXPORTAR-JS-FIM */',
`async function abrirPlanilha(){
  try{
    var d = await api('/api/planilha');
    window.open(d.url, '_blank');
  }catch(e){ toast(e.message, true); }
}`, arq);

pagina = trocar(pagina, '/* EXPORTAR-EVENTO-INICIO */', '/* EXPORTAR-EVENTO-FIM */',
  "$('#btn-planilha').addEventListener('click', abrirPlanilha);", arq);

/* o aviso de "sem conexão" é da versão servidor */
pagina = pagina.replace(
  '    <span class="offline" id="offline" hidden><i></i>Sem conexão com o servidor</span>\n', '');
pagina = pagina.replace(/\s*\$\('#offline'\)\.hidden = (false|true);\n/g, '\n');

/* O HtmlService monta o próprio <html>/<head>/<body> e injeta o que a gente
   entrega dentro dele. Se mandarmos um documento completo, vira documento
   dentro de documento: a página renderiza duas vezes e o script quebra. Então
   aqui o invólucro é retirado e sobra só o miolo — estilo, marcação e script.
   O título e o viewport passam a vir do doGet(), via setTitle/addMetaTag. */
function desembrulhar(doc){
  const iCabeca = doc.indexOf('<head>');
  const fCabeca = doc.indexOf('</head>');
  const iCorpo = doc.indexOf('<body>');
  const fCorpo = doc.lastIndexOf('</body>');
  if(iCabeca < 0 || fCabeca < 0 || iCorpo < 0 || fCorpo < 0){
    throw new Error('publico/index.html não tem o invólucro <head>/<body> esperado');
  }
  const cabeca = doc.slice(iCabeca + 6, fCabeca)
    .replace(/[ \t]*<meta[^>]*>\n?/g, '')
    .replace(/[ \t]*<title>[\s\S]*?<\/title>\n?/g, '')
    .replace(/[ \t]*<base[^>]*>\n?/g, '')
    .trim();
  const corpo = doc.slice(iCorpo + 6, fCorpo).trim();
  return cabeca + '\n\n' + corpo + '\n';
}

entregar('pagina.html', '<!-- ' + AVISO + '\n     A fonte é publico/index.html.\n     Sem <html>, <head> ou <body> de propósito: quem monta o documento é o HtmlService. -->\n'
  + desembrulhar(pagina));

if(conferindo){
  if(pendencias.length){
    console.error('Fora de sincronia: ' + pendencias.join(', ') + ' — rode: node google-apps-script/gerar.js');
    process.exit(1);
  }
  console.log('Arquivos do Apps Script em sincronia com a versão servidor.');
}

/**
 * Fichas.gs — emite as Fichas de Abertura em PDF, direto no Drive.
 *
 * O layout é o padrão do Departamento Fiscal (mesma estrutura do
 * modelo-ficha.html da skill): barra azul-marinho, seis seções na ordem,
 * uma ficha por página A4. Não altere cores nem ordem — é documento de
 * arquivo.
 *
 * O PDF vai para a pasta do cliente no Drive (Fichas/), e o link volta
 * para a coluna "Ficha (PDF)" da aba Particularidades.
 */

/** Gera as fichas das empresas da aba Triagem que ainda não têm PDF. */
function gerarFichasPdf(refazerTodas) {
  var aba = abaObrigatoria_(ABAS.particularidades);
  var idx = indices_(aba);
  var empresas = lerObjetos_(aba).filter(function (e) { return e['N° Cliente']; });
  if (!empresas.length) return { erro: 'A aba "' + ABAS.particularidades + '" está vazia.' };

  var pendentes = empresas.filter(function (e) { return refazerTodas || !e['Ficha (PDF)']; });
  if (!pendentes.length) {
    return { erro: 'Todas as empresas já têm ficha. Marque "refazer" para emitir de novo.' };
  }

  var raiz = pastaRaiz_();
  var geradas = [];

  pendentes.forEach(function (e) {
    var pastaCliente = pastaDoCliente_(raiz, e['N° Cliente'], nomePasta(e['Razão social']));
    var pastaFichas = subpasta_(pastaCliente, 'Fichas');
    var nomeArquivo = e['N° Cliente'] + '_' + slugFicha(e['Razão social']) + '.pdf';

    // Refazendo: manda a versão anterior para a lixeira, não acumula duplicata.
    var antigos = pastaFichas.getFilesByName(nomeArquivo);
    while (antigos.hasNext()) antigos.next().setTrashed(true);

    var html = montarFichaHtml_(e);
    var pdf = Utilities.newBlob(html, 'text/html', nomeArquivo).getAs('application/pdf').setName(nomeArquivo);
    var arquivo = pastaFichas.createFile(pdf);

    if (idx['Ficha (PDF)']) {
      aba.getRange(e._linha, idx['Ficha (PDF)'])
        .setFormula('=HYPERLINK("' + arquivo.getUrl() + '";"' + nomeArquivo + '")');
    }
    geradas.push({ numero: e['N° Cliente'], nome: e['Razão social'], url: arquivo.getUrl() });
  });

  registrarLog_('Fichas', geradas.length + ' ficha(s) em PDF');
  return { geradas: geradas, pastaRaiz: raiz.getUrl() };
}

function escapar_(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function marca_(condicao) {
  return condicao ? '☑' : '☐';
}

/**
 * A ficha imprime o enquadramento completo ("Lucro Presumido — PIS/COFINS
 * cumulativo; IRPJ/CSLL trimestral"), não o regime cru que veio no e-mail.
 * Linha antiga da aba, gravada antes desta coluna existir, cai no regime
 * informado para não imprimir vazio.
 */
function enquadramentoDaFicha_(e) {
  return e['Regime / enquadramento'] || e['Regime informado'] || 'A definir';
}

/**
 * "ATIVA desde 12/05/2025 (base pública RFB)" — situação, data de abertura
 * e de onde veio, como na ficha real. Sem situação consultada, fica vazio:
 * a coluna é do analista.
 */
function situacaoRfbDaFicha_(e) {
  var situacao = String(e['Situação cadastral'] || '').trim();
  if (!situacao) return '';

  var texto = situacao;
  var abertura = String(e['Abertura'] || '').trim();
  if (abertura && abertura !== '-') texto += ' desde ' + abertura;

  var fonte = String(e['Fonte dos dados'] || '').trim();
  if (fonte === 'BrasilAPI' || fonte === 'ReceitaWS') texto += ' (base pública RFB)';
  return texto;
}

function montarFichaHtml_(e) {
  var certificadoOk = String(e['Certificado A1']).trim() === 'recebido';
  var senhaOk = String(e['Senha (cofre)']).trim() === 'arquivada';
  var simplesTexto = e['Divergência']
    ? 'ATENÇÃO: ' + e['Divergência']
    : (e['Simples (RFB)'] === 'Sim' ? 'Optante pelo Simples Nacional (confirmado na Receita).'
      : e['Simples (RFB)'] === 'Não' ? 'Não optante pelo Simples Nacional (confirmado na Receita).'
        : '(não consultado) — a base pública não informa a opção e a consulta ' +
          'oficial não respondeu; conferir no PGDAS-D.');
  var simplesOk = e['Simples (RFB)'] === 'Sim' || e['Simples (RFB)'] === 'Não';

  var bullets = String(e['Particularidades'] || '').split('\n').filter(String);
  var lis = bullets.length
    ? bullets.map(function (b) {
      var atencao = /^ATENÇÃO/i.test(b.trim());
      return '<li' + (atencao ? ' class="atencao"' : '') + '>' + escapar_(b) + '</li>';
    }).join('')
    : '<li>—</li>';

  return [
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">',
    '<title>Ficha ', escapar_(e['N° Cliente']), '</title><style>',
    'body{font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:#111;margin:0}',
    '.cabecalho{background:#1B3A5C;color:#fff;text-align:center;padding:9px 10px 10px}',
    '.cabecalho .titulo{font-size:16px;font-weight:700}',
    '.cabecalho .sub{font-size:11px;opacity:.92;margin-top:1px}',
    '.secao{background:#1B3A5C;color:#fff;font-size:11.5px;font-weight:700;padding:4px 8px}',
    'table.grade,table.orgaos{width:100%;border-collapse:collapse}',
    'table.grade th,table.grade td,table.orgaos th,table.orgaos td',
    '{border:1px solid #9AA3AC;padding:5px 8px;vertical-align:top;font-size:12px;text-align:left}',
    'table.grade th,table.orgaos thead th{background:#EAEDF0;font-weight:700}',
    'table.grade th{width:21%}table.grade td.par{width:29%}',
    'table.orgaos td.ok{text-align:center;width:42px}table.orgaos .oque{color:#5A6470}',
    'ul.particularidades{list-style:none;margin:0;padding:0}',
    'ul.particularidades li{border:1px solid #9AA3AC;border-top:none;padding:4px 8px;font-size:12px}',
    'ul.particularidades li:first-child{border-top:1px solid #9AA3AC}',
    'ul.particularidades li::before{content:"• ";color:#1B3A5C;font-weight:700}',
    'ul.particularidades li.atencao::before{content:"▲ ";color:#A32020}',
    'ul.particularidades li.atencao{color:#A32020}',
    '.linhas-livres{border:1px solid #9AA3AC;border-top:none;padding:10px 8px 4px}',
    '.linhas-livres div{border-bottom:1px solid #9AA3AC;height:21px}',
    '.rodape-ficha{font-size:12px;margin-top:14px}.rodape-ficha span{margin-right:20px}',
    '.assinatura{color:#5A6470;text-align:center;font-size:10.5px;margin-top:16px}',
    '@page{size:A4;margin:12mm}',
    '</style></head><body>',

    '<div class="cabecalho"><div class="titulo">FICHA DE ABERTURA — ONBOARDING FISCAL</div>',
    '<div class="sub">Moraex Consultoria Empresarial · Departamento Fiscal</div></div>',

    '<div class="secao">1 · IDENTIFICAÇÃO</div><table class="grade">',
    '<tr><th>N° Cliente</th><td class="par">', escapar_(e['N° Cliente']),
    '</td><th>Recebido em</th><td class="par">', escapar_(e['Processado em']), '</td></tr>',
    '<tr><th>Razão social</th><td colspan="3">', escapar_(e['Razão social']), '</td></tr>',
    '<tr><th>CNPJ</th><td class="par">', escapar_(e['CNPJ']),
    '</td><th>Tipo</th><td class="par">', escapar_(e['Tipo']), '</td></tr>',
    '<tr><th>Abertura</th><td class="par">', escapar_(e['Abertura'] || '-'),
    '</td><th>Porte</th><td class="par">', escapar_(e['Porte'] || '-'), '</td></tr>',
    '<tr><th>Município / UF</th><td class="par">', escapar_(e['Município / UF'] || '-'),
    '</td><th>Grupo econômico</th><td class="par">', escapar_(e['Grupo econômico'] || '—'), '</td></tr>',
    '<tr><th>E-mail do cliente</th><td colspan="3">',
    escapar_(e['E-mail do cliente'] || '(não informado)'), '</td></tr></table>',

    '<div class="secao">2 · ATIVIDADE E REGIME</div><table class="grade">',
    '<tr><th>CNAE principal</th><td colspan="3">', escapar_(e['CNAE principal'] || '-'), '</td></tr>',
    '<tr><th>CNAEs secundários</th><td colspan="3">',
    escapar_(e['CNAEs secundários'] || 'Não informada'), '</td></tr>',
    '<tr><th>Regime / enquadramento</th><td colspan="3">',
    escapar_(enquadramentoDaFicha_(e)), '</td></tr></table>',

    '<div class="secao">3 · DOCUMENTOS, CERTIFICADO E PROCURAÇÃO</div><table class="grade">',
    '<tr><th>Certificado A1 (.pfx)</th><td class="par">', marca_(certificadoOk), ' ',
    escapar_(e['Certificado A1'] || 'pendente'),
    '</td><th>Senha (cofre)</th><td class="par">', marca_(senhaOk), ' ',
    escapar_(e['Senha (cofre)'] || 'pendente'), '</td></tr>',
    '<tr><th>Procuração e-CAC</th><td class="par">☐ pendente</td>',
    '<th>Validade do cert.</th><td class="par">-</td></tr></table>',

    '<div class="secao">4 · CONSULTAS PRELIMINARES DE SITUAÇÃO FISCAL (ÓRGÃOS)</div>',
    '<table class="orgaos"><thead><tr><th>Órgão / Sistema</th><th>O que consultar</th>',
    '<th>Situação encontrada</th><th class="ok">OK</th></tr></thead><tbody>',
    '<tr><td>RFB / e-CAC</td><td class="oque">Situação cadastral, pendências, DTE (caixa postal), parcelamentos</td>',
    '<td>', escapar_(situacaoRfbDaFicha_(e)), '</td><td class="ok">☐</td></tr>',
    '<tr><td>Simples Nacional</td><td class="oque">Opção/optante (PGDAS/DAS), débitos, exclusão, sublimite</td>',
    '<td>', escapar_(simplesTexto), '</td><td class="ok">', marca_(simplesOk), '</td></tr>',
    '<tr><td>SEFAZ-RJ</td><td class="oque">Inscrição estadual, situação, DeC-RJ, débitos de ICMS</td>',
    '<td></td><td class="ok">☐</td></tr>',
    '<tr><td>Prefeitura / Município</td><td class="oque">Inscrição municipal, ISS, situação cadastral, débitos</td>',
    '<td></td><td class="ok">☐</td></tr></tbody></table>',

    '<div class="secao">5 · PARTICULARIDADES ANOTADAS NO E-MAIL / IDENTIFICADAS</div>',
    '<ul class="particularidades">', lis, '</ul>',

    '<div class="secao">6 · PARTICULARIDADES A LEVANTAR — REUNIÃO COM O PAULO</div>',
    '<div class="linhas-livres"><div></div><div></div><div></div><div></div><div></div></div>',

    '<div class="rodape-ficha"><span>Responsável: ______________________</span>',
    '<span>Data da consulta: ____/____/______</span><span>Onboarding concluído: ☐</span></div>',
    '<div class="assinatura">Moraex Consultoria Empresarial — Ficha de Onboarding Fiscal</div>',
    '</body></html>'
  ].join('');
}

/**
 * Pastas.gs — a estrutura de pastas do cliente.
 *
 * Duas saídas, porque o escritório tem dois lugares:
 *
 *   criarPastasDrive()  — cria as pastas no Google Drive, onde este app
 *                         vive e onde as fichas em PDF são gravadas.
 *   exportarCsvPastas() — gera o CSV `Numero,Nome` do lote para o script
 *                         PowerShell rodar no drive de rede, que este app
 *                         não alcança.
 *
 * Estrutura, igual à da rede:
 *   <N°> - <NOME>/
 *       Apuracao/<ano>/01 Janeiro ... 12 Dezembro
 *       Certificado/
 *       Fichas/
 */

function pastaRaiz_() {
  var existentes = DriveApp.getFoldersByName(PASTA_RAIZ_NOME);
  return existentes.hasNext() ? existentes.next() : DriveApp.createFolder(PASTA_RAIZ_NOME);
}

function subpasta_(pai, nome) {
  var existentes = pai.getFoldersByName(nome);
  return existentes.hasNext() ? existentes.next() : pai.createFolder(nome);
}

function pastaDoCliente_(raiz, numero, nome) {
  return subpasta_(raiz, numero + ' - ' + nome);
}

/** Cria (ou completa) a estrutura no Drive. Seguro para rodar de novo. */
function criarPastasDrive(ano) {
  ano = ano || new Date().getFullYear();
  var aba = abaObrigatoria_(ABAS.particularidades);
  var empresas = lerObjetos_(aba).filter(function (e) { return e['N° Cliente'] && e['Razão social']; });
  if (!empresas.length) {
    return { erro: 'A aba "' + ABAS.particularidades + '" está vazia — gere-a antes.' };
  }

  var raiz = pastaRaiz_();
  var criadas = [];
  empresas.forEach(function (e) {
    var pasta = pastaDoCliente_(raiz, e['N° Cliente'], nomePasta(e['Razão social']));
    var apuracao = subpasta_(subpasta_(pasta, 'Apuracao'), String(ano));
    MESES_PASTA.forEach(function (mes) { subpasta_(apuracao, mes); });
    subpasta_(pasta, 'Certificado');
    subpasta_(pasta, 'Fichas');
    criadas.push({ nome: pasta.getName(), url: pasta.getUrl() });
  });

  registrarLog_('Pastas (Drive)', criadas.length + ' pasta(s) de cliente, ano ' + ano);
  return { criadas: criadas, raiz: raiz.getUrl(), ano: ano };
}

/**
 * CSV do lote para o PowerShell da rede. Grava na raiz do Drive e devolve
 * o link — a pessoa baixa e roda `criar-pastas-cliente.ps1` no servidor.
 */
function exportarCsvPastas() {
  var aba = abaObrigatoria_(ABAS.particularidades);
  var empresas = lerObjetos_(aba).filter(function (e) { return e['N° Cliente'] && e['Razão social']; });
  if (!empresas.length) {
    return { erro: 'A aba "' + ABAS.particularidades + '" está vazia — gere-a antes.' };
  }

  var linhas = ['Numero,Nome'].concat(empresas.map(function (e) {
    return e['N° Cliente'] + ',' + nomePasta(e['Razão social']);
  }));
  var nome = 'clientes-novos-' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd') + '.csv';
  var arquivo = pastaRaiz_().createFile(
    Utilities.newBlob('﻿' + linhas.join('\n'), 'text/csv', nome));

  registrarLog_('CSV de pastas', empresas.length + ' cliente(s)');
  return {
    url: arquivo.getUrl(),
    nome: nome,
    total: empresas.length,
    comando: '.\\criar-pastas-cliente.ps1 -Raiz "<caminho da rede>" -Lote .\\' + nome
  };
}

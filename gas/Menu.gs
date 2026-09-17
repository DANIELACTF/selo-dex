/**
 * Menu.gs — o menu do app e o que cada item faz.
 *
 * Disparo manual, como o escritório pediu: nada roda sozinho. A pessoa
 * abre a planilha e escolhe a etapa no menu "Onboarding Fiscal".
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏢 Onboarding Fiscal')
    .addItem('1 · Processar e-mail "EMPRESA NOVA"…', 'abrirBarraTriagem')
    .addItem('2 · Gerar planilha de particularidades', 'menuGerarParticularidades')
    .addSeparator()
    .addItem('3 · Emitir Fichas de Abertura (PDF)', 'menuGerarFichas')
    .addItem('4 · Criar pastas do cliente no Drive', 'menuCriarPastas')
    .addItem('5 · Alimentar a Carteira (carência)', 'menuAlimentarCarteira')
    .addSeparator()
    .addItem('👤 Distribuir cliente para um analista…', 'abrirDistribuir')
    .addItem('🔁 Trocar responsável…', 'abrirTrocar')
    .addItem('📕 Dar baixa no cliente…', 'abrirBaixar')
    .addSeparator()
    .addItem('📊 Status da carência', 'menuStatusCarencia')
    .addItem('📄 Exportar CSV das pastas da rede', 'menuExportarCsv')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Configurar · v' + VERSAO_APP)
      .addItem('Conferir instalação', 'menuConferirInstalacao')
      .addItem('Criar/conferir abas', 'menuInstalar')
      .addItem('Sobre este app', 'menuSobre'))
    .addToUi();
}

// --------------------------------------------------------------- etapa 1

function abrirBarraTriagem() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Onboarding Fiscal — etapa 1')
    .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Chamado pela barra lateral. */
function processarEmailDaBarra(texto, consultar) {
  try {
    return processarEmail(texto, consultar !== false);
  } catch (e) {
    return { erro: String(e && e.message ? e.message : e) };
  }
}

function menuGerarParticularidades() {
  var ui = SpreadsheetApp.getUi();
  var padrao = competenciaAtual();
  var resposta = ui.prompt('Planilha de particularidades',
    'Competência de entrada do lote (MM/AAAA).\n\n' +
    'É ela que conta a carência de ' + MESES_CARENCIA + ' competências.\n' +
    'Deixe como está para usar a competência atual (' + padrao + ').',
    ui.ButtonSet.OK_CANCEL);
  if (resposta.getSelectedButton() !== ui.Button.OK) return;

  var competencia = resposta.getResponseText().trim() || padrao;
  try {
    var r = gerarParticularidades(competencia);
    if (r.erro) { alerta_('Nada a fazer', r.erro); return; }
    ss_().setActiveSheet(abaObrigatoria_(ABAS.particularidades));
    alerta_('Planilha de particularidades',
      r.criadas + ' empresa(s) adicionada(s) na aba "' + r.aba + '".\n\n' +
      'As células amarelas são de preenchimento manual. Na reunião com o Paulo, ' +
      'cada definição vai em uma coluna "Particularidade N (Paulo)".\n\n' +
      'Competência de entrada: ' + r.competencia + ' → libera em ' + r.liberaEm + '.\n\n' +
      'Preencher "Responsável (analista)" NÃO antecipa a distribuição.');
  } catch (e) {
    alerta_('Erro', String(e && e.message ? e.message : e));
  }
}

// --------------------------------------------------------------- etapa 2

function menuGerarFichas() {
  var ui = SpreadsheetApp.getUi();
  var refazer = ui.alert('Emitir Fichas de Abertura',
    'Emitir as fichas em PDF na pasta do cliente no Drive.\n\n' +
    'SIM = refaz todas, inclusive as que já têm ficha.\n' +
    'NÃO = só as que ainda não têm.',
    ui.ButtonSet.YES_NO_CANCEL);
  if (refazer === ui.Button.CANCEL) return;

  toast_('Gerando fichas…');
  try {
    var r = gerarFichasPdf(refazer === ui.Button.YES);
    if (r.erro) { alerta_('Nada a fazer', r.erro); return; }
    alerta_('Fichas emitidas',
      r.geradas.length + ' ficha(s) em PDF.\n\n' +
      r.geradas.map(function (g) { return '• N°' + g.numero + ' ' + g.nome; }).join('\n') +
      '\n\nEstão na pasta de cada cliente, em Fichas/. O link ficou na coluna ' +
      '"Ficha (PDF)" da aba Triagem.');
  } catch (e) {
    alerta_('Erro', String(e && e.message ? e.message : e));
  }
}

function menuCriarPastas() {
  var ui = SpreadsheetApp.getUi();
  var ano = new Date().getFullYear();
  var resposta = ui.prompt('Pastas do cliente no Drive',
    'Ano da subpasta de apuração.\n\nDeixe como está para ' + ano + '.',
    ui.ButtonSet.OK_CANCEL);
  if (resposta.getSelectedButton() !== ui.Button.OK) return;

  var escolhido = parseInt(resposta.getResponseText().trim(), 10) || ano;
  toast_('Criando pastas no Drive…');
  try {
    var r = criarPastasDrive(escolhido);
    if (r.erro) { alerta_('Nada a fazer', r.erro); return; }
    alerta_('Pastas criadas',
      r.criadas.length + ' pasta(s) de cliente em "' + PASTA_RAIZ_NOME + '", ano ' + r.ano + '.\n\n' +
      r.criadas.map(function (c) { return '• ' + c.nome; }).join('\n') +
      '\n\nCada uma com Apuracao/' + r.ano + '/<meses>, Certificado/ e Fichas/.\n' +
      'Rodar de novo não duplica nada: pasta que já existe é mantida.\n\n' +
      'Para as pastas do drive de REDE, use "Exportar CSV das pastas da rede".');
  } catch (e) {
    alerta_('Erro', String(e && e.message ? e.message : e));
  }
}

function menuAlimentarCarteira() {
  var ui = SpreadsheetApp.getUi();
  var padrao = competenciaAtual();
  var resposta = ui.prompt('Alimentar a Carteira Tributária Fiscal',
    'Competência de referência (MM/AAAA) — é a data em que o app "está" ' +
    'para decidir quem já cumpriu a carência.\n\nDeixe como está para ' + padrao + '.',
    ui.ButtonSet.OK_CANCEL);
  if (resposta.getSelectedButton() !== ui.Button.OK) return;

  toast_('Atualizando a carteira…');
  try {
    var r = alimentarCarteira(resposta.getResponseText().trim() || padrao);
    if (r.erro) { alerta_('Nada a fazer', r.erro); return; }

    var partes = ['Competência de referência: ' + r.referencia +
      ' | carência: ' + MESES_CARENCIA + ' competências'];
    partes.push(bloco_('Entraram em carência (Pendentes Daniela)', r.entraramCarencia));
    partes.push(bloco_('Distribuídas para a carteira do analista', r.distribuidas));
    partes.push(bloco_('Ainda em carência', r.emCarencia));
    partes.push(bloco_('Carência vencida, mas SEM responsável definido', r.liberadasSemResponsavel));
    partes.push(bloco_('Já estavam na carteira, ignoradas', r.jaNaCarteira));
    partes.push(bloco_('Competência inválida — corrija na planilha', r.competenciaInvalida));
    partes.push('\nO "Resumo Equipe" recalcula sozinho: é COUNTIF sobre a Carteira Completa.');
    alerta_('Carteira atualizada', partes.filter(String).join('\n'));
  } catch (e) {
    alerta_('Erro', String(e && e.message ? e.message : e));
  }
}

function bloco_(titulo, itens) {
  if (!itens || !itens.length) return '';
  return '\n' + titulo + ' (' + itens.length + '):\n' +
    itens.map(function (i) { return '  • ' + i; }).join('\n');
}

// --------------------------------------------------------------- consulta

function menuStatusCarencia() {
  var ui = SpreadsheetApp.getUi();
  var padrao = competenciaAtual();
  var resposta = ui.prompt('Status da carência',
    'Competência de referência (MM/AAAA).\n\nDeixe como está para ' + padrao + '.',
    ui.ButtonSet.OK_CANCEL);
  if (resposta.getSelectedButton() !== ui.Button.OK) return;

  try {
    var r = situacaoCarencia(resposta.getResponseText().trim() || padrao);
    if (!r.total) {
      alerta_('Status da carência', 'Nenhuma empresa em "' + ABAS.pendentes + '".');
      return;
    }
    var partes = ['Referência ' + r.referencia + ' — carência de ' + MESES_CARENCIA + ' competências'];
    partes.push(bloco_('PRONTAS PARA DISTRIBUIR (carência vencida)', r.liberadas.map(function (i) {
      return 'N°' + i.numero + ' ' + i.nome + ' — entrou ' + i.entrada +
        (i.sugestao ? ', sugestão: ' + i.sugestao : ', sem sugestão de analista');
    })));
    partes.push(bloco_('Em carência', r.emCarencia.map(function (i) {
      return 'N°' + i.numero + ' ' + i.nome + ' — libera em ' + i.liberaEm +
        ' (' + i.faltam + ' competência' + (i.faltam > 1 ? 's' : '') + ')';
    })));
    partes.push(bloco_('Sem competência de entrada registrada — não dá para calcular',
      r.semCompetencia.map(function (i) { return 'N°' + i.numero + ' ' + i.nome; })));
    if (r.liberadas.length) {
      partes.push('\nDistribuir é decisão de gente: defina o responsável na aba ' +
        'Particularidades e rode "5 · Alimentar a Carteira".');
    }
    alerta_('Status da carência', partes.filter(String).join('\n'));
  } catch (e) {
    alerta_('Erro', String(e && e.message ? e.message : e));
  }
}

function menuExportarCsv() {
  try {
    var r = exportarCsvPastas();
    if (r.erro) { alerta_('Nada a fazer', r.erro); return; }
    alerta_('CSV das pastas da rede',
      r.total + ' cliente(s) em ' + r.nome + '.\n\n' +
      'Está na pasta "' + PASTA_RAIZ_NOME + '" do seu Drive:\n' + r.url + '\n\n' +
      'Baixe, coloque junto do script e rode no PowerShell do servidor:\n\n' + r.comando);
  } catch (e) {
    alerta_('Erro', String(e && e.message ? e.message : e));
  }
}

// --------------------------------------------------- gestão de carteira

function abrirPainelGestao_(titulo) {
  var html = HtmlService.createHtmlOutputFromFile('Gestao')
    .setTitle(titulo)
    .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
}

function abrirDistribuir() { abrirPainelGestao_('Distribuir cliente'); }
function abrirTrocar() { abrirPainelGestao_('Trocar responsável'); }
function abrirBaixar() { abrirPainelGestao_('Dar baixa no cliente'); }

/** Chamados pelo painel. Erro vira mensagem, não exceção na cara da pessoa. */
function distribuirDoPainel(numero, analista, nivel, antecipar) {
  try {
    return distribuirCliente(numero, analista, nivel, antecipar);
  } catch (e) {
    return { erro: String(e && e.message ? e.message : e) };
  }
}

function trocarDoPainel(numero, analista, nivel, motivo, observacao) {
  try {
    return trocarResponsavel(numero, analista, nivel, motivo, observacao);
  } catch (e) {
    return { erro: String(e && e.message ? e.message : e) };
  }
}

function baixarDoPainel(numero, motivo, observacao) {
  try {
    return baixarCliente(numero, motivo, observacao);
  } catch (e) {
    return { erro: String(e && e.message ? e.message : e) };
  }
}

function menuSobre() {
  alerta_('Onboarding Fiscal — Moraex',
    'App do Departamento Fiscal para o onboarding de cliente novo.\n' +
    'Versão ' + VERSAO_APP + '\n\n' +
    'ETAPA 1 (chega o e-mail da Thays)\n' +
    '  1 · Processar e-mail → preenche a aba Triagem\n' +
    '  2 · Gerar planilha de particularidades → o formulário da reunião\n\n' +
    '— reunião com o Paulo; a planilha é preenchida à mão —\n\n' +
    'ETAPA 2 (implantação)\n' +
    '  3 · Emitir Fichas de Abertura em PDF no Drive\n' +
    '  4 · Criar as pastas do cliente no Drive\n' +
    '  5 · Alimentar a Carteira respeitando a carência\n\n' +
    'GESTÃO DA CARTEIRA, a qualquer momento\n' +
    '  👤 Distribuir — diz para qual analista o pendente vai\n' +
    '  🔁 Trocar responsável — passa o cliente de um analista para outro\n' +
    '  📕 Dar baixa — tira o cliente da carteira, guardando o motivo\n\n' +
    'A CARÊNCIA\n' +
    'Empresa nova não vai direto para a carteira do analista: cumpre ' +
    MESES_CARENCIA + ' competências sob a Gestão Fiscal, em "' + ABAS.pendentes +
    '", e só depois é distribuída. Entrou em 08/2026 → libera em 11/2026.\n\n' +
    'Nada roda sozinho — só pelo menu. Tudo que o app faz fica registrado ' +
    'na aba "' + ABAS.log + '".');
}

/**
 * Diz o que está instalado e o que ficou para trás.
 *
 * O app é copiado arquivo a arquivo para o Apps Script, então a falha mais
 * comum é um arquivo velho convivendo com os novos — e o sintoma disso é um
 * item de menu que não aparece ou um erro na hora do clique. Este item
 * confere, arquivo por arquivo, o que o projeto carregou.
 */
function menuConferirInstalacao() {
  // Uma função conhecida de cada arquivo. Se ela não existe, o arquivo não
  // foi colado — ou foi colado com outro nome.
  var ESPERADO = [
    ['Config', 'ABAS'], ['Competencia', 'competenciaLiberacao'], ['Parser', 'parseEmail'],
    ['Regras', 'certificadoPresente'], ['Consultas', 'consultarCnpj'], ['Planilha', 'lerObjetos_'],
    ['Triagem', 'processarEmail'], ['Particularidades', 'gerarParticularidades'],
    ['Fichas', 'gerarFichasPdf'], ['Pastas', 'criarPastasDrive'], ['Carteira', 'alimentarCarteira'],
    ['Gestao', 'distribuirCliente'], ['Menu', 'onOpen'], ['Instalar', 'instalarAbas']
  ];

  var faltando = [];
  ESPERADO.forEach(function (par) {
    var existe;
    try {
      existe = typeof globalThis[par[1]] !== 'undefined';
    } catch (e) {
      existe = false;
    }
    if (!existe) faltando.push(par[0]);
  });

  var abasFaltando = [];
  Object.keys(ABAS).forEach(function (chave) {
    if (!aba_(ABAS[chave], false)) abasFaltando.push(ABAS[chave]);
  });

  var painelGestao = true;
  try {
    HtmlService.createHtmlOutputFromFile('Gestao');
  } catch (e) {
    painelGestao = false;
  }
  var painelTriagem = true;
  try {
    HtmlService.createHtmlOutputFromFile('Sidebar');
  } catch (e) {
    painelTriagem = false;
  }

  var partes = ['Versão instalada: ' + VERSAO_APP, NOVIDADES_DA_VERSAO, ''];

  if (!faltando.length && painelGestao && painelTriagem) {
    partes.push('Todos os 14 arquivos de código e os 2 painéis estão no lugar.');
  } else {
    partes.push('FALTA COLAR NO APPS SCRIPT:');
    faltando.forEach(function (n) { partes.push('  • ' + n + '.gs'); });
    if (!painelTriagem) partes.push('  • Sidebar.html');
    if (!painelGestao) partes.push('  • Gestao.html');
    partes.push('');
    partes.push('Cole o que falta, salve, e RECARREGUE a planilha (F5) — o menu ' +
      'só é reconstruído quando a planilha abre.');
  }

  partes.push('');
  if (abasFaltando.length) {
    partes.push('Abas que ainda não existem: ' + abasFaltando.join(', '));
    partes.push('Use "Criar/conferir abas" para criá-las.');
  } else {
    partes.push('Todas as abas do app existem.');
  }

  partes.push('');
  partes.push('O menu não mudou depois de colar código novo? Recarregue a ' +
    'planilha. Colar no editor não atualiza o menu da aba já aberta.');

  alerta_('Conferir instalação', partes.join('\n'));
}

function menuInstalar() {
  try {
    var r = instalarAbas();
    alerta_('Abas conferidas',
      (r.criadas.length ? 'Criadas: ' + r.criadas.join(', ') + '\n' : '') +
      (r.jaExistiam.length ? 'Já existiam: ' + r.jaExistiam.join(', ') : '') +
      '\n\nA planilha está pronta para o menu Onboarding Fiscal.');
  } catch (e) {
    alerta_('Erro', String(e && e.message ? e.message : e));
  }
}

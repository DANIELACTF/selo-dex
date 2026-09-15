/**
 * Instalar.gs — deixa a planilha pronta na primeira vez.
 *
 * Cria só o que falta. Se a Carteira Tributária Fiscal já foi importada
 * do .xlsx, as abas "Carteira Completa", "Pendentes Daniela" e "Resumo
 * Equipe" já existem com os dados do escritório — e não são tocadas.
 */

function instalarAbas() {
  var r = { criadas: [], jaExistiam: [] };

  function garantir(nome, montar) {
    var aba = aba_(nome, false);
    if (aba) { r.jaExistiam.push(nome); return aba; }
    aba = ss_().insertSheet(nome);
    if (montar) montar(aba);
    r.criadas.push(nome);
    return aba;
  }

  garantir(ABAS.instrucoes, montarInstrucoes_);
  garantir(ABAS.triagem, function (aba) {
    escreverCabecalho_(aba, COLS_TRIAGEM);
    aba.setColumnWidth(1, 80);
    aba.setColumnWidth(2, 280);
    aba.setColumnWidth(3, 140);
    aba.setColumnWidth(15, 380);
    aba.setFrozenColumns(2);
  });
  garantir(ABAS.particularidades, montarCabecalhoParticularidades_);

  // A carteira costuma vir do .xlsx importado; só criamos o esqueleto se
  // não existir, para o app ter onde escrever.
  garantir(ABAS.carteira, function (aba) {
    escreverCabecalho_(aba, ['N° Cliente', 'Nome', 'CNPJ', 'Regime Tributário',
      'Segmento', 'Analista Responsável', 'Nível', 'Status']);
  });
  garantir(ABAS.pendentes, function (aba) {
    escreverCabecalho_(aba, ['N° Cliente', 'Nome', 'CNPJ', 'Regime Tributário',
      'Segmento', 'Sugestão Analista', 'Origem', 'Observação',
      COL_COMPETENCIA, COL_LIBERA]);
  });
  garantir(ABAS.listas, montarListas_);
  garantir(ABAS.log, function (aba) {
    escreverCabecalho_(aba, ['Quando', 'Quem', 'Ação', 'Detalhe']);
  });

  // Aba em branco que o Google cria junto com a planilha, se sobrou vazia.
  var padrao = ss_().getSheetByName('Página1') || ss_().getSheetByName('Sheet1');
  if (padrao && ss_().getSheets().length > 1 && padrao.getLastRow() === 0) {
    ss_().deleteSheet(padrao);
  }
  return r;
}

function montarInstrucoes_(aba) {
  aba.setColumnWidth(1, 760);
  var linhas = [
    ['ONBOARDING FISCAL — Moraex Consultoria Empresarial', true],
    ['', false],
    ['Este app vive nesta planilha. Nada roda sozinho: tudo é pelo menu', false],
    ['"🏢 Onboarding Fiscal", na barra de cima.', false],
    ['', false],
    ['ETAPA 1 — chega o e-mail "EMPRESA NOVA" da Thays', true],
    ['1 · Processar e-mail: abre a barra lateral, você cola o corpo do e-mail', false],
    ['    (inclusive a linha "N anexos (...)", que é de onde sai a checagem de', false],
    ['    certificado) e o app preenche a aba Triagem, consulta a Receita e', false],
    ['    aponta certificado faltante e divergência de regime.', false],
    ['2 · Gerar planilha de particularidades: cria a aba do formulário que você', false],
    ['    leva para a reunião com o Paulo.', false],
    ['', false],
    ['— reunião com o Paulo; a aba Particularidades é preenchida à mão —', false],
    ['', false],
    ['ETAPA 2 — implantação', true],
    ['3 · Emitir Fichas de Abertura em PDF, na pasta do cliente no Drive.', false],
    ['4 · Criar as pastas do cliente no Drive (Apuracao/<ano>/<meses>,', false],
    ['    Certificado/, Fichas/). Para as pastas do drive de REDE, use', false],
    ['    "Exportar CSV das pastas da rede" e rode o PowerShell no servidor.', false],
    ['5 · Alimentar a Carteira Tributária Fiscal.', false],
    ['', false],
    ['A CARÊNCIA DE TRÊS COMPETÊNCIAS', true],
    ['Empresa nova NÃO vai direto para a carteira do analista. Ela cumpre três', false],
    ['competências sob a Gestão Fiscal, na aba "Pendentes Daniela", e só depois', false],
    ['é distribuída. Entrou em 08/2026 → libera em 11/2026.', false],
    ['', false],
    ['Preencher "Responsável (analista)" não antecipa a distribuição: enquanto a', false],
    ['carência corre, o nome fica como "Sugestão Analista" e a empresa não conta', false],
    ['para ninguém no "Resumo Equipe" — ela ainda não é de ninguém.', false],
    ['', false],
    ['Carência vencida não distribui sozinha: sem responsável definido, a empresa', false],
    ['permanece onde está e isso é apontado. Distribuir é decisão de gente.', false],
    ['', false],
    ['Use "📊 Status da carência" a qualquer momento para ver quem já liberou.', false],
    ['', false],
    ['O QUE O APP NÃO FAZ', true],
    ['Não envia e-mail para a Thays nem para o cliente: ele monta o texto de', false],
    ['cobrança e deixa o envio com você.', false],
    ['Não preenche por dedução: campo sem fonte fica em branco ou "(não', false],
    ['consultado)", com o registro no alerta.', false],
    ['Não decide enquadramento: quem responde é o contador responsável (CRC).', false],
    ['', false],
    ['Tudo que o app faz fica registrado na aba "Log".', false]
  ];
  linhas.forEach(function (l, i) {
    var celula = aba.getRange(i + 1, 1);
    celula.setValue(l[0])
      .setFontWeight(l[1] ? 'bold' : 'normal')
      .setFontSize(i === 0 ? 13 : 10)
      .setFontColor(l[1] ? CORES.navy : '#000000')
      .setVerticalAlignment('top');
  });
  aba.setFrozenRows(1);
}

function montarListas_(aba) {
  var conjuntos = [
    ['Analistas', ANALISTAS], ['Níveis', NIVEIS], ['Situações', SITUACOES],
    ['Segmentos', SEGMENTOS], ['Regimes', REGIMES], ['Certificado', SIM_PENDENTE],
    ['Senha', SENHA_STATUS], ['Procuração', PROCURACAO]
  ];
  conjuntos.forEach(function (conjunto, c) {
    aba.getRange(1, c + 1).setValue(conjunto[0]).setFontWeight('bold');
    aba.setColumnWidth(c + 1, Math.max(110, conjunto[0].length * 9 + 40));
    conjunto[1].forEach(function (v, i) { aba.getRange(i + 2, c + 1).setValue(v); });
  });
  aba.hideSheet();
}

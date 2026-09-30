/**
 * Config.gs — tudo que o escritório muda sem mexer em lógica.
 *
 * App de onboarding do Dep. Fiscal da Moraex, hospedado na própria
 * planilha do Google. Nada roda na máquina de ninguém: o código fica no
 * Apps Script da planilha e é disparado pelo menu.
 */

/**
 * Versão do código instalado no Apps Script.
 *
 * O app é distribuído por copiar-e-colar, então é fácil ficar com um
 * arquivo atualizado e outro velho. A versão aparece no menu: se ela não
 * bater com a do guia, algum arquivo ficou para trás. Suba este número
 * sempre que mudar qualquer .gs ou .html.
 */
var VERSAO_APP = '2.5';

/** O que esta versão trouxe — mostrado em "Conferir instalação". */
var NOVIDADES_DA_VERSAO = 'A baixa move o cliente para a aba de inativos que já existe, em vez de criar uma paralela.';

/** Carência antes de distribuir a empresa para um analista. */
var MESES_CARENCIA = 3;

/** Nomes das abas — batem com a Carteira Tributária Fiscal já existente. */
var ABAS = {
  instrucoes: 'Instruções',
  particularidades: 'Particularidades',
  pendentes: 'Pendentes Daniela',
  carteira: 'Carteira Completa',
  resumo: 'Resumo Equipe',
  listas: 'Listas',
  inativos: 'Clientes Inativos',
  movimentacoes: 'Movimentações',
  log: 'Log'
};

/** Equipe do Dep. Fiscal — conferido contra a aba "Resumo Equipe". */
var ANALISTAS = [
  'Ana Carolina Giordano', 'Matheus Telles', 'Thayane Sabia', 'Dulce Neves',
  'Alexandre Sabino', 'Monica Oliveira', 'Wellington', 'Daniela Carvalho'
];
var NIVEIS = ['Sênior', 'Júnior', 'Auxiliar', 'Gestão Fiscal'];
var SITUACOES = ['Pendente distribuição', 'Distribuído', 'Em implantação', 'Ativo'];
var SEGMENTOS = ['Comércio', 'Serviço', 'Indústria', 'Misto'];
var REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI', '⚠ A confirmar'];
var SIM_PENDENTE = ['recebido', 'pendente'];
var SENHA_STATUS = ['arquivada', 'pendente'];
var PROCURACAO = ['obtida', 'pendente'];

/** Por que um cliente sai da carteira. */
var MOTIVOS_BAIXA = [
  'Encerramento de contrato (cliente pediu)',
  'Encerramento de contrato (escritório pediu)',
  'Baixa do CNPJ na Receita',
  'Transferência para outro escritório',
  'Inadimplência',
  'Empresa inativa / sem movimento',
  'Outro (descrever na observação)'
];

/** Por que um cliente troca de analista. */
var MOTIVOS_TROCA = [
  'Redistribuição de carga',
  'Saída do analista',
  'Entrada de analista novo',
  'Especialização (regime ou segmento)',
  'Pedido do cliente',
  'Férias / afastamento',
  'Outro (descrever na observação)'
];

/**
 * Nomes possíveis da aba de clientes inativos.
 *
 * O app NÃO cria essa aba: ela já existe na carteira do escritório, e criar
 * uma paralela só espalha a informação. Procuramos pelos nomes abaixo, sem
 * diferenciar maiúsculas nem acento, e usamos a primeira que existir.
 * Se a sua tiver outro nome, acrescente aqui — na frente da lista.
 */
var ALIASES_INATIVOS = [
  'Clientes Inativos', 'Clientes inativos', 'Inativos', 'Inativas',
  'Clientes Baixados', 'Baixados', 'Encerrados', 'Clientes Encerrados'
];

/**
 * Colunas que a baixa preenche na aba de inativos, quando existirem lá.
 * Coluna que a aba do escritório não tem é simplesmente ignorada — o app
 * não reescreve o layout dela.
 */
var COLS_BAIXA = [
  'Motivo', 'Motivo da baixa', 'Observação', 'Competência da baixa',
  'Baixado em', 'Baixado por', 'Último responsável', 'Saiu de'
];

/** Histórico de todas as movimentações de carteira — eventos, não estado. */
var COLS_MOVIMENTACOES = [
  'Quando', 'Quem', 'Operação', 'N° Cliente', 'Nome', 'De', 'Para',
  'Motivo / observação', 'Competência'
];

/** MEI normalmente não usa e-CNPJ na rotina; mude para true se mudar. */
var MEI_EXIGE_CERTIFICADO = false;

/** Colunas da aba Triagem (saída da etapa 1). */
/**
 * A aba Particularidades é a única do fluxo: recebe o que a triagem apurou
 * e o que a reunião com o Paulo definir.
 *
 * Três blocos, nesta ordem:
 *   1-18  o que o app preenche a partir do e-mail e da Receita (fundo cinza)
 *   19-30 o que a pessoa preenche à mão, com lista suspensa (fundo amarelo)
 *   31-33 controle do app (fonte do dado, ficha emitida, data)
 */
var COLS_PARTICULARIDADES = [
  // ---- identificação e Receita: preenchido pelo app ----
  { titulo: 'N° Cliente', largura: 80, lista: null, manual: false },
  { titulo: 'Razão social', largura: 300, lista: null, manual: false },
  { titulo: 'CNPJ', largura: 140, lista: null, manual: false },
  { titulo: 'Tipo', largura: 70, lista: null, manual: false },
  { titulo: 'Nome fantasia', largura: 170, lista: null, manual: false },
  { titulo: 'Abertura', largura: 90, lista: null, manual: false },
  { titulo: 'Porte', largura: 80, lista: null, manual: false },
  { titulo: 'Município / UF', largura: 180, lista: null, manual: false },
  { titulo: 'Grupo econômico', largura: 170, lista: null, manual: false },
  { titulo: 'E-mail do cliente', largura: 200, lista: null, manual: false },
  { titulo: 'CNAE principal', largura: 320, lista: null, manual: false },
  { titulo: 'CNAEs secundários', largura: 280, lista: null, manual: false },
  { titulo: 'Regime informado', largura: 140, lista: null, manual: false },
  { titulo: 'Regime / enquadramento', largura: 300, lista: null, manual: false },
  { titulo: 'Simples (RFB)', largura: 100, lista: null, manual: false },
  { titulo: 'Situação cadastral', largura: 130, lista: null, manual: false },
  { titulo: 'Particularidades', largura: 360, lista: null, manual: false },
  { titulo: 'Divergência', largura: 260, lista: null, manual: false },

  // ---- preenchimento manual: documentos e decisões da reunião ----
  { titulo: 'Inscrição Estadual', largura: 140, lista: null, manual: true },
  { titulo: 'Inscrição Municipal', largura: 140, lista: null, manual: true },
  { titulo: 'Certificado A1', largura: 110, lista: SIM_PENDENTE, manual: true },
  { titulo: 'Validade do cert.', largura: 110, lista: null, manual: true },
  { titulo: 'Senha (cofre)', largura: 110, lista: SENHA_STATUS, manual: true },
  { titulo: 'Procuração e-CAC', largura: 120, lista: PROCURACAO, manual: true },
  { titulo: 'Particularidade 1 (Paulo)', largura: 320, lista: null, manual: true },
  { titulo: 'Particularidade 2 (Paulo)', largura: 320, lista: null, manual: true },
  { titulo: 'Particularidade 3 (Paulo)', largura: 320, lista: null, manual: true },
  { titulo: 'Particularidade 4 (Paulo)', largura: 320, lista: null, manual: true },
  { titulo: 'Responsável (analista)', largura: 160, lista: ANALISTAS, manual: true },
  { titulo: 'Nível / equipe', largura: 110, lista: NIVEIS, manual: true },
  { titulo: 'Situação', largura: 150, lista: SITUACOES, manual: true },
  { titulo: 'Backup / apoio', largura: 150, lista: ANALISTAS, manual: true },
  { titulo: 'Segmento', largura: 100, lista: SEGMENTOS, manual: true },
  { titulo: 'Regime confirmado', largura: 140, lista: REGIMES, manual: true },
  { titulo: 'Obs. para a carteira', largura: 280, lista: null, manual: true },

  // ---- controle do app ----
  { titulo: 'Competência entrada', largura: 130, lista: null, manual: false },
  { titulo: 'Fonte dos dados', largura: 130, lista: null, manual: false },
  { titulo: 'Ficha (PDF)', largura: 180, lista: null, manual: false },
  { titulo: 'Processado em', largura: 110, lista: null, manual: false }
];

/** Colunas 1-3 vêm da triagem e não são reescritas à mão. */
var COLS_IDENTIFICACAO = 3;

var COL_COMPETENCIA = 'Competência entrada';
var COL_LIBERA = 'Libera em';
var STATUS_NOVO = '🆕 Novo';
var ORIGEM_ONBOARDING = '🆕 Onboarding';

/** Cores do padrão do Dep. Fiscal. */
var CORES = {
  navy: '#1b3a5c',
  cabecalho: '#eaedf0',
  preencher: '#fff7e0',
  borda: '#b8bec6',
  atencao: '#b3261e'
};

/** Pasta raiz no Drive onde as pastas de cliente são criadas. */
var PASTA_RAIZ_NOME = 'Clientes — Dep. Fiscal';

var MESES_PASTA = [
  '01 Janeiro', '02 Fevereiro', '03 Marco', '04 Abril', '05 Maio', '06 Junho',
  '07 Julho', '08 Agosto', '09 Setembro', '10 Outubro', '11 Novembro', '12 Dezembro'
];

var URL_BRASILAPI = 'https://brasilapi.com.br/api/cnpj/v1/';

// Segunda fonte, para quando a BrasilAPI devolve 404. Ela serve o dump de
// dados abertos da RFB, que atrasa semanas — empresa recém-aberta ainda não
// está lá, que é justamente o caso do cliente novo. A ReceitaWS consulta por
// outro caminho e costuma ter a empresa antes.
// Plano gratuito: 3 consultas por minuto. Por isso ela só é acionada quando
// a primeira falha, com pausa entre as chamadas.
var URL_RECEITAWS = 'https://receitaws.com.br/v1/cnpj/';
var USAR_RECEITAWS = true;
var PAUSA_RECEITAWS_MS = 21000;

/**
 * Orçamento de tempo de uma execução.
 *
 * O Apps Script mata a execução aos 6 minutos. Como as consultas vinham
 * todas antes de qualquer escrita, estourar o limite significava perder o
 * lote inteiro — nem Triagem, nem Pendentes — e a barra lateral ficava em
 * "Processando…" para sempre.
 *
 * Agora as consultas têm prazo: vencido o orçamento, as empresas que
 * faltarem ficam com "(não consultado)" e a gravação acontece do mesmo
 * jeito. Nada se perde, e o resumo diz quem ficou para uma segunda passada.
 */
var ORCAMENTO_CONSULTAS_MS = 200000;   // ~3min20 dos 6 min disponíveis

/** Custo estimado de uma consulta à segunda fonte (pausa + requisição). */
var CUSTO_SEGUNDA_FONTE_MS = 25000;

/** Teto de arquivos convertidos por execução — OCR é caro. */
var MAX_PDFS_POR_EXECUCAO = 6;
var URL_SIMPLES_RFB = 'https://www8.receita.fazenda.gov.br/simplesnacional/aplicacoes.aspx?id=21';

/**
 * De qual arquivo vem cada função e constante do app.
 *
 * O app é instalado copiando arquivo por arquivo para o Apps Script, e
 * esquecer um produz um erro cru — "pastaRaiz_ is not defined" — que não
 * diz o que fazer. Com este mapa, o erro vira "falta colar o arquivo
 * Pastas.gs".
 *
 * Mantido em dia por teste: tests/test_gas.mjs confere que todo símbolo de
 * topo dos .gs está aqui.
 */
var DONO_DO_SIMBOLO = {
  Carteira: ['alimentarCarteira', 'situacaoCarencia'],
  Competencia: ['_FORMATO_COMPETENCIA', 'carenciaLiberada', 'competenciaAtual', 'competenciaComoNumero', 'competenciaLiberacao', 'competenciasRestantes', 'pad2_', 'somarMeses', 'validarCompetencia'],
  Comprovante: ['MARCAS_COMPROVANTE', 'PORTES', 'RE_CEP', 'RE_CNAE_OCR', 'RE_DATA_BR', 'RE_MUNICIPIO_UF', 'RE_NATUREZA', 'RE_ROTULO_DO_DOC', 'RE_SITUACAO', 'UFS', 'acharCnaes_', 'acharMunicipioUf_', 'acharPorte_', 'cnpjValido', 'lerComprovante', 'limparValor_', 'temComprovante'],
  Config: ['ABAS', 'ALIASES_INATIVOS', 'ANALISTAS', 'COLS_BAIXA', 'COLS_IDENTIFICACAO', 'COLS_MOVIMENTACOES', 'COLS_PARTICULARIDADES', 'COL_COMPETENCIA', 'COL_LIBERA', 'CORES', 'CUSTO_SEGUNDA_FONTE_MS', 'DONO_DO_SIMBOLO', 'MAX_PDFS_POR_EXECUCAO', 'MEI_EXIGE_CERTIFICADO', 'MESES_CARENCIA', 'MESES_PASTA', 'MOTIVOS_BAIXA', 'MOTIVOS_TROCA', 'NIVEIS', 'NOVIDADES_DA_VERSAO', 'ORCAMENTO_CONSULTAS_MS', 'ORIGEM_ONBOARDING', 'PASTA_RAIZ_NOME', 'PAUSA_RECEITAWS_MS', 'PROCURACAO', 'REGIMES', 'SEGMENTOS', 'SENHA_STATUS', 'SIM_PENDENTE', 'SITUACOES', 'STATUS_NOVO', 'URL_BRASILAPI', 'URL_RECEITAWS', 'URL_SIMPLES_RFB', 'USAR_RECEITAWS', 'VERSAO_APP'],
  Consultas: ['consultarBrasilApi_', 'consultarCnpj', 'consultarOptanteSimples', 'consultarReceitaWs_', 'dadosCadastraisVazios_', 'descobrirBotao_', 'descobrirCampoCnpj_', 'detalheDaResposta_', 'extrairInputs_', 'formatarDataIso_', 'interpretarResultadoSimples_', 'montarEnderecoReceitaWs_', 'montarEndereco_'],
  Etapa1: ['abrirLote', 'competenciaDoEmail_', 'consultarEmpresaDoLote', 'entrarEmPendentes_', 'gravarLote', 'montarTextoCobranca_', 'numerosJaCadastrados_', 'observacaoDaTriagem_'],
  Fichas: ['enquadramentoDaFicha_', 'escapar_', 'gerarFichasPdf', 'marca_', 'montarFichaHtml_', 'situacaoRfbDaFicha_'],
  Gestao: ['acharEmQualquerAba_', 'acharLinha_', 'baixarCliente', 'carregarGestao', 'diagnosticarAbas_', 'distribuirCliente', 'montarMovimentacoes_', 'quemEsta_', 'registrarMovimentacao_', 'trocarResponsavel'],
  Instalar: ['instalarAbas', 'montarInstrucoes_', 'montarListas_'],
  Menu: ['abrirBaixar', 'abrirBarraTriagem', 'abrirDistribuir', 'abrirPainelGestao_', 'abrirTrocar', 'baixarDoPainel', 'bloco_', 'distribuirDoPainel', 'explicarErro_', 'menuAlimentarCarteira', 'menuConferirInstalacao', 'menuCriarPastas', 'menuExportarCsv', 'menuGerarFichas', 'menuInstalar', 'menuSobre', 'menuStatusCarencia', 'onOpen', 'trocarDoPainel'],
  Parser: ['ANEXOS_BLOCO_RE', 'BLOCO_HEADER_RE', 'CELULAR_RE', 'DATA_EMAIL_ISO_RE', 'DATA_EMAIL_RE', 'EMAIL_RE', 'GRUPO_RE', 'OBS_RE', 'REGIME_PATTERNS', 'RE_NOME_ARQUIVO', 'SENHA_RE', 'extrairAnexos', 'extrairDataEmail', 'limparNome_', 'parseEmail'],
  Particularidades: ['aplicarFormatoParticularidades_', 'montarCabecalhoParticularidades_', 'regimeParaLista_'],
  Pastas: ['criarPastasDrive', 'exportarCsvPastas', 'pastaDoCliente_', 'pastaRaiz_', 'subpasta_'],
  PdfTexto: ['IDIOMA_OCR', 'MIME_DOC_GOOGLE', 'TIPOS_CONVERSIVEIS', 'URL_DRIVE_EXPORT', 'URL_DRIVE_UPLOAD', 'detalheDoDrive_', 'exportarComoTexto_', 'pdfParaTexto', 'pdfsParaTexto', 'subirParaConversao_', 'subirPelaApiRest_', 'subirPeloServicoAvancado_', 'tipoDoArquivo_'],
  Planilha: ['LINHAS_PROCURA_CABECALHO', 'ROTULOS_CONHECIDOS', 'abaObrigatoria_', 'aba_', 'acharAbaPorAliases_', 'acrescentarLinhas_', 'agoraIso_', 'alerta_', 'competenciaDaCaixa_', 'escreverCabecalho_', 'formatarCabecalho_', 'garantirColunas_', 'hojeBr_', 'indices_', 'lerObjetos_', 'linhaDoCabecalho_', 'nomesDasAbas_', 'registrarLog_', 'ss_', 'toast_', 'valoresColuna_'],
  Regras: ['PALAVRAS_GENERICAS', 'PALAVRAS_SERVICO_FATOR_R', 'SUFIXOS_SOCIETARIOS', 'SUFIXO_REGIME', 'anexosNaoIdentificados', 'apenasDigitos_', 'certificadoPresente', 'checarDivergencia', 'detectarGrupoEconomico', 'formatarCnaePrincipal', 'formatarCnaesSecundarios', 'formatarCodigoCnae', 'nomeGrupoDaObservacao_', 'nomePasta', 'normalizarLivre_', 'normalizar_', 'optanteSimplesResolvido', 'particularidades', 'raizCnpj_', 'regimeEnquadramento', 'slugFicha', 'tipoEstabelecimento']
};

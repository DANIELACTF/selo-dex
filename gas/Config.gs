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
var VERSAO_APP = '2.2';

/** O que esta versão trouxe — mostrado em "Conferir instalação". */
var NOVIDADES_DA_VERSAO = 'Parser ajustado ao PDF real do Outlook e ao OCR; a consulta passa à frente do comprovante escaneado.';

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
  baixados: 'Baixados',
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

/** Registro de quem saiu da carteira — estado, não histórico. */
var COLS_BAIXADOS = [
  'N° Cliente', 'Nome', 'CNPJ', 'Regime Tributário', 'Segmento',
  'Último responsável', 'Saiu de', 'Motivo', 'Observação',
  'Competência da baixa', 'Baixado em', 'Baixado por'
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

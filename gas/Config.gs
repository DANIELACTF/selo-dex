/**
 * Config.gs — tudo que o escritório muda sem mexer em lógica.
 *
 * App de onboarding do Dep. Fiscal da Moraex, hospedado na própria
 * planilha do Google. Nada roda na máquina de ninguém: o código fica no
 * Apps Script da planilha e é disparado pelo menu.
 */

/** Carência antes de distribuir a empresa para um analista. */
var MESES_CARENCIA = 3;

/** Nomes das abas — batem com a Carteira Tributária Fiscal já existente. */
var ABAS = {
  instrucoes: 'Instruções',
  triagem: 'Triagem',
  particularidades: 'Particularidades',
  pendentes: 'Pendentes Daniela',
  carteira: 'Carteira Completa',
  resumo: 'Resumo Equipe',
  listas: 'Listas',
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

/** MEI normalmente não usa e-CNPJ na rotina; mude para true se mudar. */
var MEI_EXIGE_CERTIFICADO = false;

/** Colunas da aba Triagem (saída da etapa 1). */
// Na ordem em que aparecem na Ficha de Abertura — conferido contra a ficha
// real 1099_THAIS_REIS. Toda coluna daqui é impressa na ficha; quem não é
// impresso (Divergência, Fonte dos dados) vem depois, para conferência.
var COLS_TRIAGEM = [
  'N° Cliente', 'Razão social', 'CNPJ', 'Tipo', 'Abertura', 'Porte',
  'Município / UF', 'Grupo econômico', 'E-mail do cliente',
  'CNAE principal', 'CNAEs secundários', 'Regime informado',
  'Regime / enquadramento', 'Simples (RFB)', 'Situação cadastral',
  'Certificado', 'Senha (cofre)', 'Particularidades',
  'Divergência', 'Fonte dos dados', 'Ficha (PDF)', 'Processado em'
];

/** Colunas da aba Particularidades (formulário da reunião com o Paulo). */
var COLS_PARTICULARIDADES = [
  { titulo: 'N° Cliente', largura: 80, lista: null },
  { titulo: 'Razão social', largura: 300, lista: null },
  { titulo: 'CNPJ', largura: 140, lista: null },
  { titulo: 'Nome fantasia', largura: 170, lista: null },
  { titulo: 'Município / UF', largura: 180, lista: null },
  { titulo: 'Inscrição Estadual', largura: 140, lista: null },
  { titulo: 'Inscrição Municipal', largura: 140, lista: null },
  { titulo: 'Certificado A1', largura: 100, lista: SIM_PENDENTE },
  { titulo: 'Validade do cert.', largura: 110, lista: null },
  { titulo: 'Senha (cofre)', largura: 100, lista: SENHA_STATUS },
  { titulo: 'Procuração e-CAC', largura: 120, lista: PROCURACAO },
  { titulo: 'Particularidade 1 (Paulo)', largura: 320, lista: null },
  { titulo: 'Particularidade 2 (Paulo)', largura: 320, lista: null },
  { titulo: 'Particularidade 3 (Paulo)', largura: 320, lista: null },
  { titulo: 'Particularidade 4 (Paulo)', largura: 320, lista: null },
  { titulo: 'Responsável (analista)', largura: 160, lista: ANALISTAS },
  { titulo: 'Nível / equipe', largura: 110, lista: NIVEIS },
  { titulo: 'Situação', largura: 150, lista: SITUACOES },
  { titulo: 'Backup / apoio', largura: 150, lista: ANALISTAS },
  { titulo: 'Segmento', largura: 100, lista: SEGMENTOS },
  { titulo: 'Regime confirmado', largura: 140, lista: REGIMES },
  { titulo: 'Competência entrada', largura: 130, lista: null },
  { titulo: 'Obs. para a carteira', largura: 280, lista: null }
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
var URL_SIMPLES_RFB = 'https://www8.receita.fazenda.gov.br/simplesnacional/aplicacoes.aspx?id=21';

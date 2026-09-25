/**
 * ============================================================================
 *  SIMULADOR IBS / CBS — EMPRESAS DO REGIME REGULAR (Lucro Real / Presumido)
 * ============================================================================
 *
 *  Simula o impacto da Reforma Tributária do consumo (EC 132/2023,
 *  LC 214/2025 e LC 227/2026) comparando a carga atual (ICMS, ISS, IPI, PIS e
 *  COFINS) com a carga em cada ano da transição (2026 a 2033).
 *
 *  Considera, por operação:
 *    - Tratamento de IBS/CBS por atividade: reduções de 30%, 40%, 50%, 60%,
 *      70% e alíquota zero, regimes específicos (bares e restaurantes,
 *      hotelaria, turismo, transporte coletivo, imóveis, planos de saúde,
 *      serviços financeiros, combustíveis) e exportação.
 *    - Vedação de crédito ao adquirente nos regimes em que a lei a prevê.
 *    - Tipo de fornecedor nas compras: regime regular, Simples Nacional
 *      (crédito do valor pago no DAS) e produtor rural não contribuinte
 *      (crédito presumido).
 *    - Situação atual do PIS/COFINS: regime, cumulativo no Lucro Real,
 *      monofásico/alíquota zero, isento/suspenso.
 *    - Imposto Seletivo (a partir de 2027), que integra a base do IBS/CBS.
 *
 *  Como usar:
 *    1. Extensões > Apps Script > cole este arquivo > salve.
 *    2. Recarregue a planilha. Aparecerá o menu "Simulador IBS/CBS".
 *    3. Simulador IBS/CBS > Configurar planilha.
 *    4. Preencha "Parâmetros" e "Operações" (ou insira o exemplo).
 *    5. Simulador IBS/CBS > Calcular simulação.
 *
 *  Premissas principais (editáveis nas abas Parâmetros, Cronograma e
 *  Tratamentos):
 *    - O valor da operação é mantido constante em todos os anos (preço
 *      constante). ICMS, ISS, PIS e COFINS são "por dentro"; IPI, IS, IBS e
 *      CBS são "por fora".
 *    - Na transição, ICMS, ISS, PIS e COFINS não integram a base do IBS/CBS.
 *    - As alíquotas de referência de IBS e CBS ainda serão fixadas; os
 *      valores padrão são estimativas e devem ser revisados.
 *
 *  Resultado meramente estimativo. Não substitui a análise de um profissional.
 * ============================================================================
 */

var SIM = {
  ABA_PARAM: 'Parâmetros',
  ABA_CRONO: 'Cronograma',
  ABA_TRAT: 'Tratamentos',
  ABA_OPS: 'Operações',
  ABA_RES: 'Resultado',
  REGIME_REAL: 'Lucro Real (não cumulativo)',
  REGIME_PRESUMIDO: 'Lucro Presumido (cumulativo)',
  ESPECIAL_FINANCEIRO: 'Serviços financeiros',
  PC_PADRAO: 'Padrão do regime',
  PC_CUMULATIVO: 'Cumulativo (0,65% + 3%)',
  PC_MONOFASICO: 'Monofásico / alíquota zero',
  PC_ISENTO: 'Isento / suspenso / não incide',
  FORN_REGULAR: 'Regime regular',
  FORN_SIMPLES: 'Simples Nacional',
  FORN_RURAL: 'Produtor rural não contribuinte',
  FORN_SEM_CREDITO: 'Sem crédito (PF / não contribuinte)',
  LINHAS_OPS: 500,
  FMT_MOEDA: '"R$" #,##0.00;[Red]-"R$" #,##0.00',
  FMT_PCT: '0.00%',
  COR_TITULO: '#1f4e78',
  COR_CABECALHO: '#d9e2f3',
  COR_ENTRADA: '#fff2cc'
};

// Parâmetros gerais. Cada valor fica num intervalo nomeado (P_<chave>).
var PARAMETROS = [
  { chave: 'EMPRESA', rotulo: 'Empresa', valor: 'Minha Empresa Ltda', fmt: '@' },
  { chave: 'CNPJ', rotulo: 'CNPJ', valor: '', fmt: '@' },
  { chave: 'REGIME', rotulo: 'Regime de apuração do PIS/COFINS',
    valor: SIM.REGIME_REAL, lista: [SIM.REGIME_REAL, SIM.REGIME_PRESUMIDO],
    nota: 'Lucro Real: PIS/COFINS não cumulativos (com créditos). Lucro Presumido: cumulativos (sem créditos). IBS/CBS são não cumulativos em ambos.' },
  { chave: 'ALIQ_PIS', rotulo: 'Alíquota do PIS',
    formula: '=IF(P_REGIME="' + SIM.REGIME_REAL + '",0.0165,0.0065)', fmt: SIM.FMT_PCT,
    nota: 'Calculada pelo regime (1,65% ou 0,65%). Pode ser sobrescrita.' },
  { chave: 'ALIQ_COFINS', rotulo: 'Alíquota da COFINS',
    formula: '=IF(P_REGIME="' + SIM.REGIME_REAL + '",0.076,0.03)', fmt: SIM.FMT_PCT,
    nota: 'Calculada pelo regime (7,6% ou 3%). Pode ser sobrescrita.' },
  { chave: 'EXCL_ICMS_PC', rotulo: 'Excluir ICMS da base do PIS/COFINS?', valor: 'Sim',
    lista: ['Sim', 'Não'], nota: 'Tema 69 do STF.' },
  { chave: 'CBS_REF', rotulo: 'Alíquota de referência da CBS', valor: 0.088, fmt: SIM.FMT_PCT,
    nota: 'Estimativa. Revise quando a alíquota de referência for publicada.' },
  { chave: 'IBS_REF', rotulo: 'Alíquota de referência do IBS (UF + Município)', valor: 0.177,
    fmt: SIM.FMT_PCT, nota: 'Estimativa. Revise conforme as alíquotas do seu estado e município.' },
  { chave: 'EXCL_TRIB_BASE', rotulo: 'Excluir ICMS/ISS/PIS/COFINS da base do IBS/CBS?', valor: 'Sim',
    lista: ['Sim', 'Não'], nota: 'Regra de transição da LC 214/2025 (2026 a 2032).' },
  { chave: 'CRED_SIMPLES', rotulo: 'Crédito de compras do Simples Nacional (IBS+CBS, % do valor)',
    valor: 0.03, fmt: SIM.FMT_PCT,
    nota: 'O adquirente só se credita do IBS/CBS pago pelo fornecedor no DAS, que depende do anexo e da faixa. ' +
      'Estimativa para o modelo definitivo, escalonada na transição. Pode ser informado por compra.' },
  { chave: 'CRED_RURAL', rotulo: 'Crédito presumido — produtor rural não contribuinte (% do valor)',
    valor: 0, fmt: SIM.FMT_PCT,
    nota: 'Percentual fixado anualmente em ato conjunto (Ministério da Fazenda e Comitê Gestor do IBS). Informe quando publicado.' },
  { chave: 'PERIODO', rotulo: 'Período dos valores informados', valor: 'Mensal',
    lista: ['Mensal', 'Trimestral', 'Anual'], nota: 'Apenas informativo: o resultado segue o mesmo período.' }
];

// Cronograma de transição. Colunas: Ano, CBS, IBS, fator ICMS/ISS,
// PIS/COFINS vigente, IPI vigente, IS vigente, IBS/CBS recolhido,
// alíquota IBS+CBS dos serviços financeiros, observação.
var CRONOGRAMA = [
  [2026, 0.009, 0.001, 1, 'Sim', 'Sim', 'Não', 'Não', 0.01,
    'Ano-teste: CBS 0,9% e IBS 0,1% destacados, compensáveis com PIS/COFINS (sem custo adicional).'],
  [2027, '=P_CBS_REF-0.001', 0.001, 1, 'Não', 'Não', 'Sim', 'Sim', 0.1085,
    'CBS plena (-0,1 p.p.); PIS/COFINS extintos; IPI zerado (exceto ZFM); IBS 0,1%; início do Imposto Seletivo.'],
  [2028, '=P_CBS_REF-0.001', 0.001, 1, 'Não', 'Não', 'Sim', 'Sim', 0.1085, 'Mesmas regras de 2027.'],
  [2029, '=P_CBS_REF', '=P_IBS_REF*0.1', 0.9, 'Não', 'Não', 'Sim', 'Sim', 0.11, 'ICMS/ISS a 90%; IBS a 10% (estimativa).'],
  [2030, '=P_CBS_REF', '=P_IBS_REF*0.2', 0.8, 'Não', 'Não', 'Sim', 'Sim', 0.1115, 'ICMS/ISS a 80%; IBS a 20% (estimativa).'],
  [2031, '=P_CBS_REF', '=P_IBS_REF*0.3', 0.7, 'Não', 'Não', 'Sim', 'Sim', 0.113, 'ICMS/ISS a 70%; IBS a 30% (estimativa).'],
  [2032, '=P_CBS_REF', '=P_IBS_REF*0.4', 0.6, 'Não', 'Não', 'Sim', 'Sim', 0.115, 'ICMS/ISS a 60%; IBS a 40% (estimativa).'],
  [2033, '=P_CBS_REF', '=P_IBS_REF', 0, 'Não', 'Não', 'Sim', 'Sim', 0.125, 'Modelo definitivo: ICMS e ISS extintos.']
];

// Catálogo de tratamentos de IBS/CBS. Colunas: Tratamento, Grupo, Redução,
// Alíquota específica, Crédito para o adquirente?, Exportação?,
// O que informar em "Valor", Fundamento / observações.
var TRATAMENTOS = [
  ['Padrão (tributação integral)', 'Geral', 0, '', 'Sim', 'Não', 'Valor da operação',
    'Alíquota de referência. Inclui bebidas alcoólicas vendidas por bares e restaurantes.'],
  ['Profissões intelectuais regulamentadas (-30%)', 'Redução de 30%', 0.3, '', 'Sim', 'Não', 'Valor do serviço',
    'LC 214/2025, art. 127: administradores, advogados, arquitetos e urbanistas, assistentes sociais, bibliotecários, ' +
    'biólogos, contabilistas, economistas, economistas domésticos, profissionais de educação física, engenheiros e ' +
    'agrônomos, estatísticos, médicos veterinários e zootecnistas, museólogos, químicos, profissionais de relações ' +
    'públicas, técnicos industriais e técnicos agrícolas. Serviço prestado por PF ou sociedade de profissionais ' +
    'habilitados e fiscalizados por conselho.'],
  ['Serviços de educação (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não', 'Valor do serviço',
    'Serviços de ensino listados em anexo da LC 214/2025.'],
  ['Serviços de saúde humana (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não', 'Valor do serviço',
    'Serviços de saúde listados em anexo da LC 214/2025.'],
  ['Dispositivos médicos (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não', 'Valor da operação',
    'Itens listados em anexo. Alguns têm alíquota zero: use o tratamento de alíquota zero.'],
  ['Dispositivos de acessibilidade para PcD (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não', 'Valor da operação',
    'Itens listados em anexo. Alguns têm alíquota zero.'],
  ['Medicamentos (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não', 'Valor da operação',
    'Medicamentos registrados na Anvisa ou manipulados. Os da lista específica têm alíquota zero.'],
  ['Alimentos para consumo humano (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não', 'Valor da operação',
    'Alimentos listados em anexo que não estão na Cesta Básica Nacional.'],
  ['Higiene pessoal e limpeza (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não', 'Valor da operação',
    'Produtos majoritariamente consumidos por famílias de baixa renda, listados em anexo.'],
  ['Produtos agropecuários, pesqueiros e florestais in natura (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não',
    'Valor da operação', 'Produtos agropecuários, aquícolas, pesqueiros, florestais e extrativistas vegetais in natura.'],
  ['Insumos agropecuários e aquícolas (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não', 'Valor da operação',
    'Insumos listados em anexo da LC 214/2025.'],
  ['Produções artísticas, culturais, jornalísticas e audiovisuais nacionais (-60%)', 'Redução de 60%', 0.6, '',
    'Sim', 'Não', 'Valor da operação', 'Inclui eventos culturais conforme a LC 214/2025.'],
  ['Comunicação institucional (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não', 'Valor do serviço', ''],
  ['Atividades desportivas (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não', 'Valor da operação', ''],
  ['Soberania, segurança nacional, da informação e cibernética (-60%)', 'Redução de 60%', 0.6, '', 'Sim', 'Não',
    'Valor da operação', ''],
  ['Cesta Básica Nacional (alíquota zero)', 'Alíquota zero', 1, '', 'Sim', 'Não', 'Valor da operação',
    'Produtos listados em anexo da LC 214/2025.'],
  ['Hortícolas, frutas e ovos (alíquota zero)', 'Alíquota zero', 1, '', 'Sim', 'Não', 'Valor da operação', ''],
  ['Medicamentos e dispositivos da lista de alíquota zero', 'Alíquota zero', 1, '', 'Sim', 'Não',
    'Valor da operação', 'Somente os itens listados nos anexos de alíquota zero.'],
  ['Transporte público coletivo urbano e metropolitano (alíquota zero)', 'Alíquota zero', 1, '', 'Sim', 'Não',
    'Valor do serviço', 'Transporte rodoviário e metroviário urbano, semiurbano e metropolitano.'],
  ['Bares e restaurantes (-40%)', 'Regime específico', 0.4, '', 'Não', 'Não',
    'Valor da alimentação, sem gorjeta', 'Alimentação e bebidas não alcoólicas preparadas no local. ' +
    'Bebidas alcoólicas: use Padrão. O adquirente não se credita.'],
  ['Hotelaria, parques de diversão e temáticos (-40%)', 'Regime específico', 0.4, '', 'Não', 'Não',
    'Valor da operação', 'O adquirente não se credita.'],
  ['Agências de turismo (-40%)', 'Regime específico', 0.4, '', 'Sim', 'Não', 'Valor da intermediação',
    'A base é o valor da intermediação, não o total do pacote.'],
  ['Transporte coletivo intermunicipal/interestadual de passageiros (-40%)', 'Regime específico', 0.4, '', 'Sim',
    'Não', 'Valor do serviço', 'Rodoviário, ferroviário e hidroviário. Confira o direito de crédito do adquirente.'],
  ['Operações com bens imóveis (-50%)', 'Regime específico', 0.5, '', 'Sim', 'Não',
    'Valor da operação menos o redutor de ajuste', 'Alienação, construção e demais operações com imóveis. ' +
    'Informe a base já líquida do redutor de ajuste (e do redutor social, se houver).'],
  ['Locação, cessão onerosa e arrendamento de imóveis (-70%)', 'Regime específico', 0.7, '', 'Sim', 'Não',
    'Aluguel menos o redutor social', 'Na locação residencial, desconte o redutor social por imóvel.'],
  ['Planos de assistência à saúde (-60%)', 'Regime específico', 0.6, '', 'Não', 'Não',
    'Receitas menos indenizações', 'Base: receitas dos planos menos as indenizações pagas. ' +
    'Planos contratados para empregados podem gerar crédito ao empregador; confira.'],
  ['Serviços financeiros (alíquota específica)', 'Regime específico', 0, SIM.ESPECIAL_FINANCEIRO, 'Não', 'Não',
    'Base do regime (spread, receitas menos deduções)', 'Alíquota total de IBS+CBS por ano na aba Cronograma ' +
    '(10,85% em 2027 até 12,5% em 2033). Serviços sujeitos a ISS têm redução em pontos percentuais na transição, ' +
    'não simulada.'],
  ['Combustíveis — revenda (monofásico)', 'Regime específico', 1, '', 'Não', 'Não', 'Valor da operação',
    'IBS/CBS monofásicos, com alíquota por unidade (ad rem) cobrada na produção ou importação. ' +
    'Revenda sem débito. A cobrança ad rem não é simulada.'],
  ['Exportação (imune, mantém créditos)', 'Imunidade', 1, '', 'Não', 'Sim', 'Valor da operação',
    'Sem ICMS, ISS, IPI, PIS/COFINS, IBS e CBS. Os créditos das aquisições são mantidos.'],
  ['Isento / imune / não incidência', 'Não tributado', 1, '', 'Não', 'Não', 'Valor da operação',
    'Pode exigir estorno de créditos das aquisições relacionadas (não simulado).']
];

var CABECALHO_OPS = [
  'Tipo', 'Descrição', 'Valor da operação (R$)', 'Tratamento IBS/CBS',
  'ICMS (%)', 'ISS (%)', 'IPI (%)', 'Imposto Seletivo (%)', 'PIS/COFINS hoje',
  'Fornecedor (compras)', 'Crédito IBS/CBS? (compras)', 'Crédito PIS/COFINS? (compras)',
  'Crédito ICMS/IPI? (compras)', 'Crédito informado (%) (Simples / produtor rural)'
];

var C = { // índices das colunas de Operações (base 0)
  TIPO: 0, DESC: 1, VALOR: 2, TRAT: 3, ICMS: 4, ISS: 5, IPI: 6, IS: 7, PC: 8,
  FORN: 9, CRED_IBS: 10, CRED_PC: 11, CRED_ICMS: 12, CRED_PCT: 13
};

var EXEMPLO_OPS = [
  ['Venda', 'Mercadorias em geral', 100000, 'Padrão (tributação integral)', 0.18, 0, 0, 0, '', '', '', '', '', ''],
  ['Venda', 'Alimentos (fora da cesta básica)', 20000, 'Alimentos para consumo humano (-60%)', 0.12, 0, 0, 0, '', '', '', '', '', ''],
  ['Venda', 'Produtos da Cesta Básica Nacional', 10000, 'Cesta Básica Nacional (alíquota zero)', 0.07, 0, 0, 0, SIM.PC_MONOFASICO, '', '', '', '', ''],
  ['Venda', 'Consultoria de engenharia', 30000, 'Profissões intelectuais regulamentadas (-30%)', 0, 0.05, 0, 0, SIM.PC_CUMULATIVO, '', '', '', '', ''],
  ['Venda', 'Exportação de mercadorias', 40000, 'Exportação (imune, mantém créditos)', 0, 0, 0, 0, '', '', '', '', '', ''],
  ['Venda', 'Locação de sala comercial', 6000, 'Locação, cessão onerosa e arrendamento de imóveis (-70%)', 0, 0, 0, 0, '', '', '', '', '', ''],
  ['Compra', 'Mercadorias para revenda', 60000, 'Padrão (tributação integral)', 0.18, 0, 0, 0, '', SIM.FORN_REGULAR, 'Sim', 'Sim', 'Sim', ''],
  ['Compra', 'Mercadorias de fornecedor do Simples', 15000, 'Padrão (tributação integral)', 0, 0, 0, 0, '', SIM.FORN_SIMPLES, 'Sim', 'Sim', 'Não', ''],
  ['Compra', 'Energia elétrica', 5000, 'Padrão (tributação integral)', 0.18, 0, 0, 0, '', SIM.FORN_REGULAR, 'Sim', 'Sim', 'Sim', ''],
  ['Compra', 'Serviços contábeis e jurídicos', 8000, 'Profissões intelectuais regulamentadas (-30%)', 0, 0.05, 0, 0, '', SIM.FORN_REGULAR, 'Sim', 'Sim', 'Não', ''],
  ['Compra', 'Refeições de clientes em restaurante', 2000, 'Bares e restaurantes (-40%)', 0.035, 0, 0, 0, '', SIM.FORN_REGULAR, 'Sim', 'Não', 'Não', ''],
  ['Compra', 'Tarifas bancárias', 1000, 'Serviços financeiros (alíquota específica)', 0, 0.05, 0, 0, SIM.PC_CUMULATIVO, SIM.FORN_REGULAR, 'Sim', 'Não', 'Não', '']
];

// ---------------------------------------------------------------------------
//  Menu
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Simulador IBS/CBS')
    .addItem('1. Configurar planilha', 'configurarPlanilha')
    .addItem('2. Calcular simulação', 'calcularSimulacao')
    .addSeparator()
    .addItem('Inserir operações de exemplo', 'inserirExemplo')
    .addItem('Limpar operações', 'limparOperacoes')
    .addSeparator()
    .addItem('Sobre / premissas', 'mostrarSobre')
    .addToUi();
}

function configurarPlanilha() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  if (ss.getSheetByName(SIM.ABA_PARAM) || ss.getSheetByName(SIM.ABA_CRONO)) {
    var resp = ui.alert('Configurar planilha',
      'As abas "Parâmetros", "Cronograma", "Tratamentos" e "Resultado" serão recriadas com os valores padrão. ' +
      'A aba "Operações" será mantida. Continuar?', ui.ButtonSet.YES_NO);
    if (resp !== ui.Button.YES) return;
  }
  montarParametros_(ss);
  montarCronograma_(ss);
  montarTratamentos_(ss);
  var renomeada = preservarOperacoesAntigas_(ss);
  montarOperacoes_(ss);
  obterAbaLimpa_(ss, SIM.ABA_RES);
  ss.setActiveSheet(ss.getSheetByName(SIM.ABA_PARAM));
  ui.alert('Planilha configurada. Preencha "Parâmetros" e "Operações" e depois use ' +
    '"Simulador IBS/CBS > Calcular simulação".' +
    (renomeada ? '\n\nA aba de operações anterior tinha outro layout e foi renomeada para "' + renomeada +
      '". Copie os dados para a nova aba "Operações".' : ''));
}

function inserirExemplo() {
  var ss = SpreadsheetApp.getActive();
  var aba = ss.getSheetByName(SIM.ABA_OPS) || montarOperacoes_(ss);
  var ultima = ultimaLinhaComDados_(aba);
  aba.getRange(ultima + 1, 1, EXEMPLO_OPS.length, CABECALHO_OPS.length).setValues(EXEMPLO_OPS);
  ss.setActiveSheet(aba);
}

function limparOperacoes() {
  var ui = SpreadsheetApp.getUi();
  var aba = SpreadsheetApp.getActive().getSheetByName(SIM.ABA_OPS);
  if (!aba) return;
  if (ui.alert('Limpar operações', 'Apagar todas as operações lançadas?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  aba.getRange(2, 1, SIM.LINHAS_OPS, CABECALHO_OPS.length).clearContent();
}

function mostrarSobre() {
  SpreadsheetApp.getUi().alert('Simulador IBS/CBS — Regime Regular',
    'Compara a carga atual (ICMS, ISS, IPI, PIS, COFINS) com a de cada ano da transição (2026–2033).\n\n' +
    '• Cada operação recebe um tratamento (aba Tratamentos): reduções de 30/40/50/60/70%, alíquota zero, ' +
    'regimes específicos, exportação.\n' +
    '• Compras: crédito conforme o fornecedor (regular, Simples, produtor rural) e vedações dos regimes específicos.\n' +
    '• Preço constante: o valor da operação é o mesmo em todos os anos.\n' +
    '• ICMS, ISS, PIS e COFINS "por dentro"; IPI, IS, IBS e CBS "por fora".\n' +
    '• 2026: IBS/CBS destacados apenas para teste (compensáveis com PIS/COFINS).\n' +
    '• 2027: CBS plena, fim do PIS/COFINS, IPI zerado (exceto ZFM), início do Imposto Seletivo.\n' +
    '• 2029–2032: ICMS/ISS reduzidos a 90/80/70/60%; IBS sobe na proporção.\n' +
    '• 2033: ICMS e ISS extintos.\n' +
    '• Valores negativos no resultado indicam saldo credor.\n' +
    '• Não simula: alíquotas ad rem, redutores de imóveis (informe a base líquida), estorno de créditos, ' +
    'split payment, benefícios da ZFM nem efeitos no IRPJ/CSLL.\n\n' +
    'As alíquotas de referência são estimativas e podem ser editadas.\n' +
    'Resultado estimativo; confirme com seu contador.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// ---------------------------------------------------------------------------
//  Montagem das abas
// ---------------------------------------------------------------------------

function obterAbaLimpa_(ss, nome) {
  var aba = ss.getSheetByName(nome) || ss.insertSheet(nome);
  aba.getCharts().forEach(function (g) { aba.removeChart(g); });
  aba.clear();
  aba.getRange(1, 1, aba.getMaxRows(), aba.getMaxColumns()).breakApart().clearDataValidations();
  return aba;
}

function titulo_(aba, texto, colunas) {
  aba.getRange(1, 1, 1, colunas).merge()
    .setValue(texto).setFontSize(14).setFontWeight('bold')
    .setFontColor('#ffffff').setBackground(SIM.COR_TITULO);
}

function cabecalho_(range) {
  range.setFontWeight('bold').setBackground(SIM.COR_CABECALHO)
    .setWrap(true).setVerticalAlignment('middle');
}

function listaValidacao_(valores) {
  return SpreadsheetApp.newDataValidation().requireValueInList(valores, true).build();
}

function montarParametros_(ss) {
  var aba = obterAbaLimpa_(ss, SIM.ABA_PARAM);
  titulo_(aba, 'Parâmetros da simulação', 3);
  cabecalho_(aba.getRange(2, 1, 1, 3).setValues([['Parâmetro', 'Valor', 'Observação']]));

  PARAMETROS.forEach(function (p, i) {
    var linha = i + 3;
    aba.getRange(linha, 1).setValue(p.rotulo);
    var cel = aba.getRange(linha, 2).setBackground(SIM.COR_ENTRADA);
    ss.setNamedRange('P_' + p.chave, cel);
    if (p.fmt) cel.setNumberFormat(p.fmt);
    if (p.lista) cel.setDataValidation(listaValidacao_(p.lista));
    aba.getRange(linha, 3).setValue(p.nota || '');
  });
  // Fórmulas depois dos intervalos nomeados existirem.
  PARAMETROS.forEach(function (p, i) {
    var cel = aba.getRange(i + 3, 2);
    if (p.formula) cel.setFormula(p.formula); else cel.setValue(p.valor);
  });

  aba.setColumnWidth(1, 400).setColumnWidth(2, 240).setColumnWidth(3, 560);
  aba.getRange(3, 1, PARAMETROS.length, 3).setWrap(true).setVerticalAlignment('middle');
  aba.getRange(3, 3, PARAMETROS.length, 1).setFontColor('#595959');
  aba.setFrozenRows(2);
  return aba;
}

function montarCronograma_(ss) {
  var aba = obterAbaLimpa_(ss, SIM.ABA_CRONO);
  var nCol = 10;
  titulo_(aba, 'Cronograma de transição (EC 132/2023, LC 214/2025 e LC 227/2026) — editável', nCol);
  cabecalho_(aba.getRange(2, 1, 1, nCol).setValues([[
    'Ano', 'Alíquota CBS', 'Alíquota IBS', 'Fator ICMS/ISS (100% = integral)',
    'PIS/COFINS vigentes?', 'IPI vigente?', 'Imposto Seletivo vigente?', 'IBS/CBS recolhidos? (entram na carga)',
    'Serviços financeiros (IBS+CBS)', 'Observação'
  ]]));

  var n = CRONOGRAMA.length;
  CRONOGRAMA.forEach(function (linha, i) {
    linha.forEach(function (v, j) {
      var cel = aba.getRange(i + 3, j + 1);
      if (typeof v === 'string' && v.charAt(0) === '=') cel.setFormula(v); else cel.setValue(v);
    });
  });

  aba.getRange(3, 2, n, 3).setNumberFormat(SIM.FMT_PCT).setBackground(SIM.COR_ENTRADA);
  aba.getRange(3, 5, n, 4).setBackground(SIM.COR_ENTRADA).setDataValidation(listaValidacao_(['Sim', 'Não']));
  aba.getRange(3, 9, n, 1).setNumberFormat(SIM.FMT_PCT).setBackground(SIM.COR_ENTRADA);
  aba.getRange(3, 10, n, 1).setWrap(true).setFontColor('#595959');
  aba.setColumnWidth(1, 70);
  for (var c = 2; c <= 9; c++) aba.setColumnWidth(c, 130);
  aba.setColumnWidth(10, 520);
  aba.setRowHeight(2, 60);
  aba.setFrozenRows(2);
  return aba;
}

function montarTratamentos_(ss) {
  var aba = obterAbaLimpa_(ss, SIM.ABA_TRAT);
  var nCol = 8;
  titulo_(aba, 'Tratamentos de IBS/CBS por atividade (LC 214/2025) — editável; novas linhas podem ser incluídas', nCol);
  cabecalho_(aba.getRange(2, 1, 1, nCol).setValues([[
    'Tratamento', 'Grupo', 'Redução de alíquota', 'Alíquota específica',
    'Crédito para o adquirente?', 'Exportação?', 'O que informar em "Valor"', 'Fundamento / observações'
  ]]));
  var n = TRATAMENTOS.length;
  aba.getRange(3, 1, n, nCol).setValues(TRATAMENTOS);
  aba.getRange(3, 3, SIM.LINHAS_OPS, 1).setNumberFormat('0%');
  aba.getRange(3, 4, SIM.LINHAS_OPS, 1).setDataValidation(listaValidacao_([SIM.ESPECIAL_FINANCEIRO]));
  aba.getRange(3, 5, SIM.LINHAS_OPS, 2).setDataValidation(listaValidacao_(['Sim', 'Não']));
  aba.getRange(3, 1, n, nCol).setWrap(true).setVerticalAlignment('top');
  aba.getRange(3, 8, n, 1).setFontColor('#595959');
  aba.setColumnWidth(1, 330).setColumnWidth(2, 130).setColumnWidth(3, 90).setColumnWidth(4, 150)
    .setColumnWidth(5, 100).setColumnWidth(6, 90).setColumnWidth(7, 220).setColumnWidth(8, 520);
  aba.setRowHeight(2, 48);
  aba.setFrozenRows(2);
  return aba;
}

/** Renomeia uma aba "Operações" com layout antigo para não misturar colunas. */
function preservarOperacoesAntigas_(ss) {
  var aba = ss.getSheetByName(SIM.ABA_OPS);
  if (!aba || aba.getLastRow() < 1) return null;
  var atual = aba.getRange(1, 1, 1, CABECALHO_OPS.length).getValues()[0];
  var igual = atual.every(function (v, i) { return String(v) === CABECALHO_OPS[i]; });
  if (igual) return null;
  var nome = SIM.ABA_OPS + ' (antiga ' +
    Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HHmm') + ')';
  aba.setName(nome);
  return nome;
}

function montarOperacoes_(ss) {
  var aba = ss.getSheetByName(SIM.ABA_OPS) || ss.insertSheet(SIM.ABA_OPS);
  var nCol = CABECALHO_OPS.length;
  var total = SIM.LINHAS_OPS;
  if (aba.getMaxRows() < total + 1) aba.insertRowsAfter(aba.getMaxRows(), total + 1 - aba.getMaxRows());
  if (aba.getMaxColumns() < nCol) aba.insertColumnsAfter(aba.getMaxColumns(), nCol - aba.getMaxColumns());

  cabecalho_(aba.getRange(1, 1, 1, nCol).setValues([CABECALHO_OPS]));
  aba.setRowHeight(1, 60);
  aba.setFrozenRows(1);

  var simNao = listaValidacao_(['Sim', 'Não']);
  aba.getRange(2, C.TIPO + 1, total, 1).setDataValidation(listaValidacao_(['Venda', 'Compra']));
  aba.getRange(2, C.VALOR + 1, total, 1).setNumberFormat(SIM.FMT_MOEDA);
  var trat = ss.getSheetByName(SIM.ABA_TRAT);
  if (trat) {
    aba.getRange(2, C.TRAT + 1, total, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInRange(trat.getRange(3, 1, total, 1), true).setAllowInvalid(true).build());
  }
  aba.getRange(2, C.ICMS + 1, total, 4).setNumberFormat(SIM.FMT_PCT);
  aba.getRange(2, C.PC + 1, total, 1).setDataValidation(
    listaValidacao_([SIM.PC_PADRAO, SIM.PC_CUMULATIVO, SIM.PC_MONOFASICO, SIM.PC_ISENTO]));
  aba.getRange(2, C.FORN + 1, total, 1).setDataValidation(
    listaValidacao_([SIM.FORN_REGULAR, SIM.FORN_SIMPLES, SIM.FORN_RURAL, SIM.FORN_SEM_CREDITO]));
  aba.getRange(2, C.CRED_IBS + 1, total, 3).setDataValidation(simNao);
  aba.getRange(2, C.CRED_PCT + 1, total, 1).setNumberFormat(SIM.FMT_PCT);

  var notas = {};
  notas[C.TRAT] = 'Tratamento de IBS/CBS da aba Tratamentos. Em branco = Padrão. ' +
    'Também aceita um percentual de redução (ex.: 60%). Nas compras, define o IBS/CBS cobrado pelo fornecedor ' +
    'e se o crédito é permitido.';
  notas[C.ICMS] = 'Alíquota efetiva de ICMS hoje (já com reduções de base). Venda com ICMS-ST: informe 0% e não tome crédito na compra.';
  notas[C.IS] = 'Imposto Seletivo (bens prejudiciais à saúde ou ao meio ambiente), a partir de 2027. Integra a base do IBS/CBS.';
  notas[C.PC] = 'Como o PIS/COFINS incide hoje. Em branco = padrão do regime. ' +
    '"Cumulativo" para receitas que seguem cumulativas mesmo no Lucro Real. ' +
    '"Monofásico / alíquota zero" para revenda de produtos monofásicos, cesta básica etc.';
  notas[C.FORN] = 'Compras. Em branco = regime regular. Simples: crédito limitado ao IBS/CBS pago no DAS. ' +
    'Produtor rural não contribuinte: crédito presumido.';
  notas[C.CRED_IBS] = 'Compras. Em branco = Sim. Informe Não para uso e consumo pessoal e outros casos sem direito a crédito.';
  notas[C.CRED_PC] = 'Compras. Gera crédito de PIS/COFINS hoje? Só se aplica ao Lucro Real (não cumulativo).';
  notas[C.CRED_ICMS] = 'Compras. Gera crédito de ICMS/IPI hoje?';
  notas[C.CRED_PCT] = 'Opcional. Crédito de IBS+CBS em % do valor da compra no modelo definitivo, para fornecedor do ' +
    'Simples ou produtor rural. Em branco = valor da aba Parâmetros.';
  Object.keys(notas).forEach(function (k) { aba.getRange(1, Number(k) + 1).setNote(notas[k]); });

  aba.setColumnWidth(1, 80).setColumnWidth(2, 280).setColumnWidth(3, 150).setColumnWidth(4, 320);
  for (var c = 5; c <= nCol; c++) aba.setColumnWidth(c, 120);
  aba.setColumnWidth(C.PC + 1, 190).setColumnWidth(C.FORN + 1, 200);
  return aba;
}

function ultimaLinhaComDados_(aba) {
  var n = aba.getLastRow();
  if (n < 2) return 1;
  var col = aba.getRange(2, 1, n - 1, 1).getValues();
  for (var i = col.length - 1; i >= 0; i--) if (col[i][0] !== '') return i + 2;
  return 1;
}

// ---------------------------------------------------------------------------
//  Leitura dos dados
// ---------------------------------------------------------------------------

function pct_(v) {
  var n = Number(v) || 0;
  return n > 1 ? n / 100 : n; // aceita "18" ou "18%"
}

function sim_(v) {
  return String(v).trim().toLowerCase().charAt(0) === 's';
}

function chave_(texto) {
  return String(texto).trim().toLowerCase();
}

function lerParametros_(ss) {
  function val(chave) {
    var r = ss.getRangeByName('P_' + chave);
    if (!r) throw new Error('Parâmetro "' + chave + '" não encontrado. Execute "Configurar planilha".');
    return r.getValue();
  }
  return {
    empresa: val('EMPRESA'),
    cnpj: val('CNPJ'),
    regime: val('REGIME'),
    naoCumulativo: val('REGIME') === SIM.REGIME_REAL,
    aliqPis: pct_(val('ALIQ_PIS')),
    aliqCofins: pct_(val('ALIQ_COFINS')),
    excluiIcmsPC: sim_(val('EXCL_ICMS_PC')),
    excluiTribBase: sim_(val('EXCL_TRIB_BASE')),
    cbsRef: pct_(val('CBS_REF')),
    ibsRef: pct_(val('IBS_REF')),
    credSimples: pct_(val('CRED_SIMPLES')),
    credRural: pct_(val('CRED_RURAL')),
    periodo: val('PERIODO')
  };
}

function lerCronograma_(ss) {
  var aba = ss.getSheetByName(SIM.ABA_CRONO);
  if (!aba) throw new Error('Aba "' + SIM.ABA_CRONO + '" não encontrada. Execute "Configurar planilha".');
  var n = aba.getLastRow() - 2;
  if (n < 1) return [];
  return aba.getRange(3, 1, n, 9).getValues()
    .filter(function (l) { return l[0] !== ''; })
    .map(linhaCronograma_);
}

function linhaCronograma_(l) {
  return {
    rotulo: String(l[0]),
    cbs: pct_(l[1]),
    ibs: pct_(l[2]),
    fator: pct_(l[3]),
    pisCofins: sim_(l[4]),
    ipi: sim_(l[5]),
    is: sim_(l[6]),
    efetivo: sim_(l[7]),
    financeiro: pct_(l[8])
  };
}

function cenarioAtual_() {
  return {
    rotulo: 'Atual', cbs: 0, ibs: 0, fator: 1, pisCofins: true, ipi: true, is: false,
    efetivo: false, financeiro: 0
  };
}

function lerTratamentos_(ss) {
  var aba = ss.getSheetByName(SIM.ABA_TRAT);
  if (!aba) throw new Error('Aba "' + SIM.ABA_TRAT + '" não encontrada. Execute "Configurar planilha".');
  var n = aba.getLastRow() - 2;
  return n < 1 ? {} : indexarTratamentos_(aba.getRange(3, 1, n, 6).getValues());
}

/** Monta o mapa nome (minúsculo) -> tratamento a partir das linhas da aba. */
function indexarTratamentos_(linhas) {
  var mapa = {};
  linhas.forEach(function (l) {
    if (String(l[0]).trim() === '') return;
    mapa[chave_(l[0])] = {
      nome: String(l[0]).trim(),
      reducao: Math.min(pct_(l[2]), 1),
      especial: String(l[3]).trim(),
      creditoAdquirente: sim_(l[4]),
      exportacao: sim_(l[5])
    };
  });
  return mapa;
}

function tratamentoPadrao_() {
  return { nome: 'Padrão (tributação integral)', reducao: 0, especial: '', creditoAdquirente: true, exportacao: false };
}

/** Resolve a célula "Tratamento": nome do catálogo, percentual de redução ou vazio. */
function resolverTratamento_(celula, tratamentos, linha) {
  if (celula === '' || celula === null) {
    return tratamentos[chave_(tratamentoPadrao_().nome)] || tratamentoPadrao_();
  }
  if (typeof celula === 'number') {
    var red = Math.min(pct_(celula), 1);
    return { nome: 'Redução de ' + Math.round(red * 100) + '%', reducao: red, especial: '',
      creditoAdquirente: true, exportacao: false };
  }
  var t = tratamentos[chave_(celula)];
  if (!t) throw new Error('Linha ' + linha + ' de "' + SIM.ABA_OPS + '": tratamento "' + celula +
    '" não existe na aba "' + SIM.ABA_TRAT + '".');
  return t;
}

function lerOperacoes_(ss, tratamentos) {
  var aba = ss.getSheetByName(SIM.ABA_OPS);
  if (!aba || aba.getLastRow() < 2) return [];
  var ops = [];
  aba.getRange(2, 1, aba.getLastRow() - 1, CABECALHO_OPS.length).getValues().forEach(function (l, i) {
    var op = linhaOperacao_(l, tratamentos, i + 2);
    if (op) ops.push(op);
  });
  return ops;
}

function linhaOperacao_(l, tratamentos, linha) {
  var tipo = String(l[C.TIPO]).trim();
  var valor = Number(l[C.VALOR]) || 0;
  if ((tipo !== 'Venda' && tipo !== 'Compra') || valor === 0) return null;
  return {
    tipo: tipo,
    descricao: l[C.DESC],
    valor: valor,
    trat: resolverTratamento_(l[C.TRAT], tratamentos, linha),
    icms: pct_(l[C.ICMS]),
    iss: pct_(l[C.ISS]),
    ipi: pct_(l[C.IPI]),
    is: pct_(l[C.IS]),
    pisCofins: String(l[C.PC]).trim() || SIM.PC_PADRAO,
    fornecedor: String(l[C.FORN]).trim() || SIM.FORN_REGULAR,
    credIbsCbs: String(l[C.CRED_IBS]).trim() === '' ? true : sim_(l[C.CRED_IBS]),
    credPisCofins: sim_(l[C.CRED_PC]),
    credIcmsIpi: sim_(l[C.CRED_ICMS]),
    credPct: l[C.CRED_PCT] === '' ? null : pct_(l[C.CRED_PCT])
  };
}

// ---------------------------------------------------------------------------
//  Cálculo (funções puras — sem acesso à planilha)
// ---------------------------------------------------------------------------

/** Alíquotas de PIS e COFINS de uma operação, conforme a situação atual. */
function aliquotasPisCofins_(op, p) {
  if (op.trat.exportacao || op.pisCofins === SIM.PC_MONOFASICO || op.pisCofins === SIM.PC_ISENTO) {
    return { pis: 0, cofins: 0 };
  }
  // Créditos do não cumulativo usam sempre as alíquotas do regime.
  if (op.pisCofins === SIM.PC_CUMULATIVO && op.tipo === 'Venda') return { pis: 0.0065, cofins: 0.03 };
  return { pis: p.aliqPis, cofins: p.aliqCofins };
}

/** Alíquotas de CBS e IBS de um tratamento em um cenário. */
function aliquotasIbsCbs_(trat, c) {
  if (trat.exportacao) return { cbs: 0, ibs: 0 };
  if (trat.especial === SIM.ESPECIAL_FINANCEIRO) {
    // Alíquota total do regime financeiro, repartida na proporção CBS/IBS do ano.
    var soma = c.cbs + c.ibs;
    var parteCbs = soma ? c.cbs / soma : 0;
    return { cbs: c.financeiro * parteCbs, ibs: c.financeiro * (1 - parteCbs) };
  }
  return { cbs: c.cbs * (1 - trat.reducao), ibs: c.ibs * (1 - trat.reducao) };
}

/**
 * Crédito de IBS/CBS de uma compra de fornecedor do Simples ou de produtor
 * rural: percentual do modelo definitivo, escalonado pela alíquota do ano.
 */
function creditoPercentual_(op, p, c, pctPadrao) {
  var pct = op.credPct !== null ? op.credPct : pctPadrao;
  var ref = p.cbsRef + p.ibsRef;
  var soma = c.cbs + c.ibs;
  if (!pct || !ref || !soma) return { cbs: 0, ibs: 0 };
  var total = op.valor * pct * Math.min(soma / ref, 1);
  return { cbs: total * c.cbs / soma, ibs: total * c.ibs / soma };
}

/**
 * Calcula os tributos de todas as operações em um cenário (ano).
 * @param {Object[]} ops Operações (ver linhaOperacao_).
 * @param {Object} p Parâmetros (ver lerParametros_).
 * @param {Object} c Linha do cronograma (ver linhaCronograma_).
 * @return {Object} Totais do cenário.
 */
function calcularCenario_(ops, p, c) {
  var r = {
    rotulo: c.rotulo, faturamento: 0, icms: 0, iss: 0, ipi: 0, pis: 0, cofins: 0, is: 0,
    cbsDebito: 0, cbsCredito: 0, ibsDebito: 0, ibsCredito: 0, porTratamento: {}
  };

  ops.forEach(function (op) {
    var venda = op.tipo === 'Venda';
    var exp = op.trat.exportacao;
    var icms = exp ? 0 : op.valor * op.icms * c.fator;
    var iss = exp ? 0 : op.valor * op.iss * c.fator;
    var ipi = c.ipi && !exp ? op.valor * op.ipi : 0;
    var isv = c.is && !exp ? op.valor * op.is : 0;
    var apc = aliquotasPisCofins_(op, p);
    var basePisCofins = op.valor - (p.excluiIcmsPC ? icms : 0);
    var pis = c.pisCofins ? basePisCofins * apc.pis : 0;
    var cofins = c.pisCofins ? basePisCofins * apc.cofins : 0;
    var baseIbsCbs = op.valor - (p.excluiTribBase ? icms + iss + pis + cofins : 0) + isv;
    var aliq = aliquotasIbsCbs_(op.trat, c);
    var cbs = baseIbsCbs * aliq.cbs;
    var ibs = baseIbsCbs * aliq.ibs;

    var t = r.porTratamento[op.trat.nome] || (r.porTratamento[op.trat.nome] = {
      reducao: op.trat.reducao, especial: op.trat.especial,
      vendas: 0, debito: 0, compras: 0, credito: 0
    });

    if (venda) {
      r.faturamento += op.valor;
      r.icms += icms;
      r.iss += iss;
      r.ipi += ipi;
      r.is += isv;
      r.pis += pis;
      r.cofins += cofins;
      r.cbsDebito += cbs;
      r.ibsDebito += ibs;
      t.vendas += op.valor;
      t.debito += cbs + ibs;
      return;
    }

    if (op.credIcmsIpi) {
      r.icms -= icms;
      r.ipi -= ipi;
    }
    if (op.credPisCofins && p.naoCumulativo) {
      r.pis -= pis;
      r.cofins -= cofins;
    }
    var cred = { cbs: 0, ibs: 0 };
    if (op.credIbsCbs && op.fornecedor !== SIM.FORN_SEM_CREDITO) {
      if (op.fornecedor === SIM.FORN_SIMPLES) {
        cred = creditoPercentual_(op, p, c, p.credSimples);
      } else if (op.fornecedor === SIM.FORN_RURAL) {
        cred = creditoPercentual_(op, p, c, p.credRural);
      } else if (op.trat.creditoAdquirente) {
        cred = { cbs: cbs, ibs: ibs };
      }
    }
    r.cbsCredito += cred.cbs;
    r.ibsCredito += cred.ibs;
    t.compras += op.valor;
    t.credito += cred.cbs + cred.ibs;
  });

  r.cbs = r.cbsDebito - r.cbsCredito;
  r.ibs = r.ibsDebito - r.ibsCredito;
  r.efetivo = c.efetivo;
  r.cargaAtuais = r.icms + r.iss + r.ipi + r.pis + r.cofins;
  r.carga = r.cargaAtuais + r.is + (c.efetivo ? r.cbs + r.ibs : 0);
  r.cargaPct = r.faturamento ? r.carga / r.faturamento : 0;
  return r;
}

/** Calcula o cenário atual e todos os anos do cronograma. */
function simular_(ops, p, cronograma) {
  var cenarios = [cenarioAtual_()].concat(cronograma);
  var resultados = cenarios.map(function (c) { return calcularCenario_(ops, p, c); });
  var base = resultados[0].carga;
  resultados.forEach(function (r) {
    r.variacao = r.carga - base;
    r.variacaoPct = base ? r.variacao / Math.abs(base) : 0;
  });
  return resultados;
}

// ---------------------------------------------------------------------------
//  Execução e saída
// ---------------------------------------------------------------------------

function calcularSimulacao() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  try {
    var p = lerParametros_(ss);
    var ops = lerOperacoes_(ss, lerTratamentos_(ss));
    if (!ops.length) {
      ui.alert('Nenhuma operação válida em "' + SIM.ABA_OPS + '". Informe Tipo (Venda/Compra) e Valor.');
      return;
    }
    var resultados = simular_(ops, p, lerCronograma_(ss));
    escreverResultado_(ss, p, ops, resultados);
    ss.setActiveSheet(ss.getSheetByName(SIM.ABA_RES));
    ss.toast('Simulação concluída (' + ops.length + ' operações).', 'Simulador IBS/CBS', 5);
  } catch (e) {
    ui.alert('Erro na simulação', e.message, ui.ButtonSet.OK);
  }
}

function escreverResultado_(ss, p, ops, res) {
  var aba = obterAbaLimpa_(ss, SIM.ABA_RES);
  var n = res.length;
  var nCol = 15;

  titulo_(aba, 'Simulação IBS/CBS — ' + p.empresa + (p.cnpj ? ' (' + p.cnpj + ')' : ''), nCol);
  aba.getRange(2, 1, 1, nCol).merge().setValue(
    'Regime: ' + p.regime + ' | Valores: ' + p.periodo + ' | Operações: ' + ops.length +
    ' | Gerado em ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm'))
    .setFontColor('#595959');

  // Tabela 1 — carga por cenário
  var lin1 = 4;
  cabecalho_(aba.getRange(lin1, 1, 1, nCol).setValues([[
    'Cenário', 'Faturamento', 'ICMS', 'ISS', 'IPI', 'PIS', 'COFINS', 'Imposto Seletivo', 'CBS', 'IBS',
    'IBS/CBS na carga?', 'Carga total', 'Carga / faturamento', 'Variação vs atual (R$)', 'Variação vs atual (%)'
  ]]));
  aba.getRange(lin1 + 1, 1, n, 1).setNumberFormat('@'); // anos como rótulo (texto) no gráfico
  aba.getRange(lin1 + 1, 1, n, nCol).setValues(res.map(function (r) {
    return [r.rotulo, r.faturamento, r.icms, r.iss, r.ipi, r.pis, r.cofins, r.is, r.cbs, r.ibs,
      r.rotulo === 'Atual' ? '—' : (r.efetivo ? 'Sim' : 'Não (teste)'),
      r.carga, r.cargaPct, r.variacao, r.variacaoPct];
  }));
  aba.getRange(lin1 + 1, 2, n, 9).setNumberFormat(SIM.FMT_MOEDA);
  aba.getRange(lin1 + 1, 12, n, 1).setNumberFormat(SIM.FMT_MOEDA).setFontWeight('bold');
  aba.getRange(lin1 + 1, 13, n, 1).setNumberFormat(SIM.FMT_PCT);
  aba.getRange(lin1 + 1, 14, n, 1).setNumberFormat(SIM.FMT_MOEDA);
  aba.getRange(lin1 + 1, 15, n, 1).setNumberFormat('+0.00%;[Red]-0.00%;0.00%');
  aba.getRange(lin1 + 1, 1, 1, nCol).setBackground('#f2f2f2');
  aba.getRange(lin1 + 1, 1, n, 1).setFontWeight('bold').setHorizontalAlignment('left');
  aba.getRange(lin1 + 1, 11, n, 1).setHorizontalAlignment('center');

  // Tabela 2 — débitos e créditos de IBS/CBS
  var lin2 = lin1 + n + 3;
  aba.getRange(lin2 - 1, 1).setValue('Débitos e créditos de IBS/CBS').setFontWeight('bold').setFontSize(12);
  cabecalho_(aba.getRange(lin2, 1, 1, 9).setValues([[
    'Cenário', 'Débito CBS', 'Crédito CBS', 'Saldo CBS', 'Débito IBS', 'Crédito IBS', 'Saldo IBS',
    'Saldo IBS + CBS', 'Alíquota efetiva IBS+CBS s/ faturamento'
  ]]));
  var res2 = res.slice(1);
  aba.getRange(lin2 + 1, 1, res2.length, 1).setNumberFormat('@');
  aba.getRange(lin2 + 1, 1, res2.length, 9).setValues(res2.map(function (r) {
    return [r.rotulo, r.cbsDebito, r.cbsCredito, r.cbs, r.ibsDebito, r.ibsCredito, r.ibs,
      r.cbs + r.ibs, r.faturamento ? (r.cbs + r.ibs) / r.faturamento : 0];
  }));
  aba.getRange(lin2 + 1, 2, res2.length, 7).setNumberFormat(SIM.FMT_MOEDA);
  aba.getRange(lin2 + 1, 9, res2.length, 1).setNumberFormat(SIM.FMT_PCT);
  aba.getRange(lin2 + 1, 1, res2.length, 1).setFontWeight('bold').setHorizontalAlignment('left');

  // Tabela 3 — IBS/CBS por tratamento no último ano (modelo definitivo)
  var ultimo = res[res.length - 1];
  var nomes = Object.keys(ultimo.porTratamento);
  var lin3 = lin2 + res2.length + 3;
  aba.getRange(lin3 - 1, 1).setValue('IBS/CBS por tratamento — ' + ultimo.rotulo)
    .setFontWeight('bold').setFontSize(12);
  cabecalho_(aba.getRange(lin3, 1, 1, 8).setValues([[
    'Tratamento', 'Redução', 'Vendas', 'Débito IBS+CBS', 'Alíquota efetiva s/ vendas',
    'Compras', 'Crédito IBS+CBS', 'Crédito / compras'
  ]]));
  aba.getRange(lin3 + 1, 1, nomes.length, 8).setValues(nomes.map(function (nome) {
    var t = ultimo.porTratamento[nome];
    return [nome, t.especial ? t.especial : t.reducao, t.vendas, t.debito,
      t.vendas ? t.debito / t.vendas : 0, t.compras, t.credito, t.compras ? t.credito / t.compras : 0];
  }));
  aba.getRange(lin3 + 1, 2, nomes.length, 1).setNumberFormat('0%');
  aba.getRange(lin3 + 1, 3, nomes.length, 2).setNumberFormat(SIM.FMT_MOEDA);
  aba.getRange(lin3 + 1, 5, nomes.length, 1).setNumberFormat(SIM.FMT_PCT);
  aba.getRange(lin3 + 1, 6, nomes.length, 2).setNumberFormat(SIM.FMT_MOEDA);
  aba.getRange(lin3 + 1, 8, nomes.length, 1).setNumberFormat(SIM.FMT_PCT);
  aba.getRange(lin3 + 1, 1, nomes.length, 1).setWrap(true);

  // Observações
  var lin4 = lin3 + nomes.length + 2;
  var notas = [
    ['Observações'],
    ['• Preço constante: o valor de cada operação é o mesmo em todos os cenários; a variação mostra o efeito sobre a carga.'],
    ['• ICMS, ISS, PIS e COFINS "por dentro"; IPI, Imposto Seletivo, IBS e CBS "por fora".'],
    ['• 2026: IBS/CBS apenas destacados (compensáveis com PIS/COFINS), por isso não entram na carga total.'],
    ['• Compras de bares/restaurantes, hotelaria e planos de saúde não geram crédito; Simples e produtor rural geram crédito limitado/presumido.'],
    ['• Valores negativos indicam saldo credor (créditos maiores que débitos).'],
    ['• Não simula: alíquotas ad rem de combustíveis, redutores de imóveis (informe a base líquida), estorno de créditos, split payment, ZFM, IRPJ/CSLL.'],
    ['• Alíquotas de referência estimadas — ajuste em "Parâmetros", "Cronograma" e "Tratamentos". Resultado meramente estimativo.']
  ];
  aba.getRange(lin4, 1, notas.length, 1).setValues(notas).setFontColor('#595959');
  aba.getRange(lin4, 1).setFontWeight('bold').setFontColor('#000000');

  aba.setColumnWidth(1, 260);
  for (var c = 2; c <= nCol; c++) aba.setColumnWidth(c, 125);
  aba.setRowHeight(lin1, 48);
  aba.setRowHeight(lin2, 48);
  aba.setRowHeight(lin3, 48);
  aba.setFrozenRows(lin1);

  // Gráfico da carga total por cenário
  var grafico = aba.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(aba.getRange(lin1, 1, n + 1, 1))
    .addRange(aba.getRange(lin1, 12, n + 1, 1))
    .setNumHeaders(1)
    .setOption('title', 'Carga tributária total por cenário')
    .setOption('legend', { position: 'none' })
    .setOption('vAxis', { format: 'currency' })
    .setPosition(lin4 + notas.length + 1, 1, 0, 0)
    .setOption('width', 900)
    .setOption('height', 360)
    .build();
  aba.insertChart(grafico);
}

// ---------------------------------------------------------------------------
//  Funções personalizadas (uso direto em células)
// ---------------------------------------------------------------------------

/**
 * Retorna a alíquota de CBS ou IBS de um ano, conforme as abas Cronograma e Tratamentos.
 *
 * @param {number} ano Ano de 2026 a 2033.
 * @param {string} tributo "CBS" ou "IBS".
 * @param {string|number} [tratamento] Nome do tratamento (aba Tratamentos) ou percentual de redução (ex.: 60%).
 * @return {number} Alíquota aplicável.
 * @customfunction
 */
function ALIQUOTA_IBSCBS(ano, tributo, tratamento) {
  var t = String(tributo || '').trim().toUpperCase();
  if (t !== 'CBS' && t !== 'IBS') throw new Error('Tributo deve ser "CBS" ou "IBS".');
  var ss = SpreadsheetApp.getActive();
  var trat = resolverTratamento_(tratamento === undefined ? '' : tratamento, lerTratamentos_(ss), 'fórmula');
  var aliq = aliquotasIbsCbs_(trat, buscarAno_(ss, ano));
  return t === 'CBS' ? aliq.cbs : aliq.ibs;
}

/**
 * Calcula o valor de CBS sobre uma base de cálculo em um ano.
 *
 * @param {number} base Base de cálculo (valor sem IBS/CBS).
 * @param {number} ano Ano de 2026 a 2033.
 * @param {string|number} [tratamento] Nome do tratamento ou percentual de redução.
 * @return {number} Valor da CBS.
 * @customfunction
 */
function CBS_SIMULADA(base, ano, tratamento) {
  return (Number(base) || 0) * ALIQUOTA_IBSCBS(ano, 'CBS', tratamento);
}

/**
 * Calcula o valor de IBS sobre uma base de cálculo em um ano.
 *
 * @param {number} base Base de cálculo (valor sem IBS/CBS).
 * @param {number} ano Ano de 2026 a 2033.
 * @param {string|number} [tratamento] Nome do tratamento ou percentual de redução.
 * @return {number} Valor do IBS.
 * @customfunction
 */
function IBS_SIMULADO(base, ano, tratamento) {
  return (Number(base) || 0) * ALIQUOTA_IBSCBS(ano, 'IBS', tratamento);
}

function buscarAno_(ss, ano) {
  var alvo = String(Number(ano));
  var linhas = lerCronograma_(ss);
  for (var i = 0; i < linhas.length; i++) {
    if (linhas[i].rotulo === alvo) return linhas[i];
  }
  throw new Error('Ano ' + ano + ' não encontrado na aba Cronograma.');
}

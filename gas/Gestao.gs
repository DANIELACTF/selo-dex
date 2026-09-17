/**
 * Gestao.gs — as três operações de carteira feitas cliente a cliente.
 *
 *   distribuirCliente()   — manda o pendente para a carteira de um analista
 *   baixarCliente()       — tira o cliente da carteira (saiu do escritório)
 *   trocarResponsavel()   — passa o cliente de um analista para outro
 *
 * Diferem de `alimentarCarteira()` (Carteira.gs), que roda o lote inteiro
 * pela regra da carência. Aqui é decisão pontual, tomada por uma pessoa —
 * e por isso tudo fica registrado na aba "Movimentações", com quem fez,
 * quando, de quem para quem e por quê.
 *
 * Nenhuma das três apaga informação: a baixa move o cliente para a aba
 * "Baixados" com o motivo, em vez de sumir com a linha.
 */

/** Dados para o painel: quem está pendente, quem está na carteira, as listas. */
function carregarGestao() {
  var referencia = competenciaAtual();
  var pendentes = [];
  var carteira = [];

  var abaPend = aba_(ABAS.pendentes, false);
  if (abaPend) {
    lerObjetos_(abaPend).forEach(function (l) {
      var numero = String(l['N° Cliente'] || '').trim();
      if (!numero) return;
      var entrada = competenciaDaCaixa_(l[COL_COMPETENCIA]);
      var item = {
        numero: numero,
        nome: l['Nome'] || '',
        cnpj: l['CNPJ'] || '',
        regime: l['Regime Tributário'] || '',
        sugestao: l['Sugestão Analista'] || '',
        entrada: entrada || '',
        liberaEm: '', faltam: null, liberada: false, semCompetencia: !entrada
      };
      if (entrada) {
        try {
          validarCompetencia(entrada);
          item.liberaEm = competenciaLiberacao(entrada);
          item.liberada = carenciaLiberada(entrada, referencia);
          item.faltam = competenciasRestantes(entrada, referencia);
        } catch (e) {
          item.semCompetencia = true;
        }
      }
      pendentes.push(item);
    });
  }

  var abaCart = aba_(ABAS.carteira, false);
  if (abaCart) {
    lerObjetos_(abaCart).forEach(function (l) {
      var numero = String(l['N° Cliente'] || '').trim();
      if (!numero) return;
      carteira.push({
        numero: numero,
        nome: l['Nome'] || '',
        cnpj: l['CNPJ'] || '',
        regime: l['Regime Tributário'] || '',
        analista: l['Analista Responsável'] || '(sem responsável)',
        nivel: l['Nível'] || ''
      });
    });
  }

  return {
    ok: true,
    diagnostico: diagnosticarAbas_(),
    pendentes: pendentes,
    carteira: carteira,
    analistas: ANALISTAS,
    niveis: NIVEIS,
    motivosBaixa: MOTIVOS_BAIXA,
    motivosTroca: MOTIVOS_TROCA,
    competencia: referencia,
    mesesCarencia: MESES_CARENCIA
  };
}

/**
 * O que o app enxerga nas duas abas de carteira.
 *
 * Quando o painel abre vazio, a pergunta é sempre a mesma: a aba existe? o
 * cabeçalho foi encontrado? as colunas têm o nome esperado? Em vez de deixar
 * a pessoa adivinhar, respondemos as três.
 */
function diagnosticarAbas_() {
  var COLUNAS_ESSENCIAIS = {};
  COLUNAS_ESSENCIAIS[ABAS.pendentes] = ['N° Cliente', 'Nome', COL_COMPETENCIA];
  COLUNAS_ESSENCIAIS[ABAS.carteira] = ['N° Cliente', 'Nome', 'Analista Responsável'];

  return [ABAS.pendentes, ABAS.carteira].map(function (nome) {
    var aba = aba_(nome, false);
    if (!aba) {
      return { aba: nome, existe: false, linhaCabecalho: null, linhas: 0,
        colunas: [], faltando: COLUNAS_ESSENCIAIS[nome] };
    }
    var idx = indices_(aba);
    var colunas = Object.keys(idx);
    var faltando = COLUNAS_ESSENCIAIS[nome].filter(function (c) { return !idx[c]; });
    var linhaCab = linhaDoCabecalho_(aba);
    return {
      aba: nome, existe: true, linhaCabecalho: linhaCab,
      linhas: Math.max(0, aba.getLastRow() - linhaCab),
      colunas: colunas, faltando: faltando
    };
  });
}

// -------------------------------------------------------------- 1. distribuir

/**
 * Manda o cliente pendente para a carteira de um analista.
 *
 * Com a carência vencida, move na hora. Com a carência correndo, o padrão é
 * só anotar o destino ("Sugestão Analista") e deixar a empresa onde está —
 * `antecipar` força a distribuição, e isso fica registrado como antecipação.
 */
function distribuirCliente(numero, analista, nivel, antecipar) {
  numero = String(numero || '').trim();
  if (!numero) return { erro: 'Escolha o cliente.' };
  if (!analista) return { erro: 'Escolha o analista que vai assumir.' };

  var abaPend = abaObrigatoria_(ABAS.pendentes);
  var abaCart = abaObrigatoria_(ABAS.carteira);
  var idxPend = garantirColunas_(abaPend, [COL_COMPETENCIA, COL_LIBERA]);
  var linha = acharLinha_(abaPend, numero);
  if (!linha) return { erro: 'N°' + numero + ' não está em "' + ABAS.pendentes + '".' };

  var referencia = competenciaAtual();
  var entrada = competenciaDaCaixa_(linha[COL_COMPETENCIA]);
  var rotulo = analista + (nivel ? ' (' + nivel + ')' : '');

  if (!entrada) {
    return { erro: 'N°' + numero + ' não tem competência de entrada registrada — ' +
      'sem ela não dá para saber se a carência venceu. Preencha a coluna "' +
      COL_COMPETENCIA + '" na aba "' + ABAS.pendentes + '".' };
  }
  try {
    validarCompetencia(entrada);
  } catch (e) {
    return { erro: 'N°' + numero + ': ' + e.message };
  }

  var liberada = carenciaLiberada(entrada, referencia);

  // Carência correndo e sem ordem de antecipar: anota o destino e para.
  if (!liberada && !antecipar) {
    if (idxPend['Sugestão Analista']) {
      abaPend.getRange(linha._linha, idxPend['Sugestão Analista']).setValue(rotulo);
    }
    var faltam = competenciasRestantes(entrada, referencia);
    registrarMovimentacao_('Destino definido', numero, linha['Nome'],
      linha['Sugestão Analista'] || '(sem sugestão)', rotulo,
      'Carência até ' + competenciaLiberacao(entrada), referencia);
    return {
      agendado: true, numero: numero, nome: linha['Nome'], analista: rotulo,
      liberaEm: competenciaLiberacao(entrada), faltam: faltam
    };
  }

  // Move para a carteira.
  var idxCart = indices_(abaCart);
  var registro = {};
  registro['N° Cliente'] = numero;
  registro['Nome'] = linha['Nome'] || '';
  registro['CNPJ'] = linha['CNPJ'] || '';
  registro['Regime Tributário'] = linha['Regime Tributário'] || '';
  registro['Segmento'] = linha['Segmento'] || '';
  registro['Analista Responsável'] = analista;
  registro['Nível'] = nivel || '';
  registro['Status'] = STATUS_NOVO;
  acrescentarLinhas_(abaCart, idxCart, [registro]);
  abaPend.deleteRow(linha._linha);

  var antecipado = !liberada;
  registrarMovimentacao_(antecipado ? 'Distribuição antecipada' : 'Distribuição',
    numero, linha['Nome'], ABAS.pendentes, rotulo,
    antecipado
      ? 'ANTECIPADA — a carência só venceria em ' + competenciaLiberacao(entrada)
      : 'Carência cumprida (entrou em ' + entrada + ')',
    referencia);

  return {
    distribuido: true, numero: numero, nome: linha['Nome'], analista: rotulo,
    antecipado: antecipado, liberaEm: competenciaLiberacao(entrada), entrada: entrada
  };
}

// ------------------------------------------------------------------ 2. baixa

/**
 * Tira o cliente da carteira. A linha não é apagada: vai para a aba
 * "Baixados" com motivo, data e quem deu baixa, porque saída de cliente é
 * informação que se consulta depois.
 */
function baixarCliente(numero, motivo, observacao) {
  numero = String(numero || '').trim();
  if (!numero) return { erro: 'Escolha o cliente.' };
  if (!motivo) return { erro: 'Escolha o motivo da baixa.' };

  var encontrado = acharEmQualquerAba_(numero);
  if (!encontrado) {
    return { erro: 'N°' + numero + ' não está nem em "' + ABAS.carteira +
      '" nem em "' + ABAS.pendentes + '".' };
  }

  var linha = encontrado.linha;
  var referencia = competenciaAtual();
  var responsavel = linha['Analista Responsável'] || linha['Sugestão Analista'] ||
    '(sem responsável — estava em carência)';

  var abaBaixados = aba_(ABAS.baixados, true);
  if (abaBaixados.getLastRow() === 0) montarBaixados_(abaBaixados);
  var idx = garantirColunas_(abaBaixados, COLS_BAIXADOS);

  var registro = {};
  registro['N° Cliente'] = numero;
  registro['Nome'] = linha['Nome'] || '';
  registro['CNPJ'] = linha['CNPJ'] || '';
  registro['Regime Tributário'] = linha['Regime Tributário'] || '';
  registro['Segmento'] = linha['Segmento'] || '';
  registro['Último responsável'] = responsavel;
  registro['Saiu de'] = encontrado.aba;
  registro['Motivo'] = motivo;
  registro['Observação'] = observacao || '';
  registro['Competência da baixa'] = referencia;
  registro['Baixado em'] = hojeBr_();
  registro['Baixado por'] = quemEsta_();
  acrescentarLinhas_(abaBaixados, idx, [registro]);

  encontrado.aba_obj.deleteRow(linha._linha);

  registrarMovimentacao_('Baixa', numero, linha['Nome'], responsavel, ABAS.baixados,
    motivo + (observacao ? ' — ' + observacao : ''), referencia);

  return {
    baixado: true, numero: numero, nome: linha['Nome'], de: encontrado.aba,
    responsavel: responsavel, motivo: motivo, competencia: referencia
  };
}

// ------------------------------------------------------------- 3. troca

/**
 * Passa o cliente de um analista para outro. Funciona também para quem está
 * em carência — lá o que muda é a sugestão, não o responsável, porque quem
 * responde nesse período é a Gestão Fiscal.
 */
function trocarResponsavel(numero, novoAnalista, novoNivel, motivo, observacao) {
  numero = String(numero || '').trim();
  if (!numero) return { erro: 'Escolha o cliente.' };
  if (!novoAnalista) return { erro: 'Escolha o novo responsável.' };
  if (!motivo) return { erro: 'Escolha o motivo da troca.' };

  var encontrado = acharEmQualquerAba_(numero);
  if (!encontrado) {
    return { erro: 'N°' + numero + ' não está nem em "' + ABAS.carteira +
      '" nem em "' + ABAS.pendentes + '".' };
  }

  var linha = encontrado.linha;
  var referencia = competenciaAtual();
  var idx = indices_(encontrado.aba_obj);
  var emCarencia = encontrado.aba === ABAS.pendentes;
  var rotulo = novoAnalista + (novoNivel ? ' (' + novoNivel + ')' : '');
  var anterior;

  if (emCarencia) {
    anterior = linha['Sugestão Analista'] || '(sem sugestão)';
    if (!idx['Sugestão Analista']) {
      return { erro: 'A aba "' + ABAS.pendentes + '" não tem a coluna "Sugestão Analista".' };
    }
    encontrado.aba_obj.getRange(linha._linha, idx['Sugestão Analista']).setValue(rotulo);
  } else {
    anterior = linha['Analista Responsável'] || '(sem responsável)';
    if (!idx['Analista Responsável']) {
      return { erro: 'A aba "' + ABAS.carteira + '" não tem a coluna "Analista Responsável".' };
    }
    encontrado.aba_obj.getRange(linha._linha, idx['Analista Responsável']).setValue(novoAnalista);
    if (idx['Nível'] && novoNivel) {
      encontrado.aba_obj.getRange(linha._linha, idx['Nível']).setValue(novoNivel);
    }
  }

  if (anterior === rotulo || anterior === novoAnalista) {
    return { erro: 'N°' + numero + ' já está com ' + novoAnalista + '.' };
  }

  registrarMovimentacao_(emCarencia ? 'Troca de sugestão' : 'Troca de responsável',
    numero, linha['Nome'], anterior, rotulo,
    motivo + (observacao ? ' — ' + observacao : ''), referencia);

  return {
    trocado: true, numero: numero, nome: linha['Nome'],
    anterior: anterior, novo: rotulo, emCarencia: emCarencia, motivo: motivo
  };
}

// ------------------------------------------------------------------ apoio

function acharLinha_(aba, numero) {
  var achadas = lerObjetos_(aba).filter(function (l) {
    return String(l['N° Cliente'] || '').trim() === numero;
  });
  return achadas.length ? achadas[0] : null;
}

/** Procura o cliente na carteira e, se não achar, entre os pendentes. */
function acharEmQualquerAba_(numero) {
  var candidatos = [
    { nome: ABAS.carteira, obj: aba_(ABAS.carteira, false) },
    { nome: ABAS.pendentes, obj: aba_(ABAS.pendentes, false) }
  ];
  for (var i = 0; i < candidatos.length; i++) {
    if (!candidatos[i].obj) continue;
    var linha = acharLinha_(candidatos[i].obj, numero);
    if (linha) return { aba: candidatos[i].nome, aba_obj: candidatos[i].obj, linha: linha };
  }
  return null;
}

function quemEsta_() {
  try {
    return Session.getActiveUser().getEmail() || '(não identificado)';
  } catch (e) {
    return '(não identificado)';
  }
}

/** Uma linha por operação, para responder "o que aconteceu com o N°X?". */
function registrarMovimentacao_(operacao, numero, nome, de, para, motivo, competencia) {
  var aba = aba_(ABAS.movimentacoes, true);
  if (aba.getLastRow() === 0) montarMovimentacoes_(aba);
  var idx = garantirColunas_(aba, COLS_MOVIMENTACOES);

  var registro = {};
  registro['Quando'] = agoraIso_();
  registro['Quem'] = quemEsta_();
  registro['Operação'] = operacao;
  registro['N° Cliente'] = numero;
  registro['Nome'] = nome || '';
  registro['De'] = de || '';
  registro['Para'] = para || '';
  registro['Motivo / observação'] = motivo || '';
  registro['Competência'] = competencia || '';
  acrescentarLinhas_(aba, idx, [registro]);
}

function montarBaixados_(aba) {
  escreverCabecalho_(aba, COLS_BAIXADOS);
  aba.setColumnWidth(1, 80);
  aba.setColumnWidth(2, 260);
  aba.setColumnWidth(3, 140);
  aba.setColumnWidth(8, 240);
  aba.setColumnWidth(9, 280);
}

function montarMovimentacoes_(aba) {
  escreverCabecalho_(aba, COLS_MOVIMENTACOES);
  aba.setColumnWidth(1, 130);
  aba.setColumnWidth(2, 190);
  aba.setColumnWidth(3, 160);
  aba.setColumnWidth(5, 240);
  aba.setColumnWidth(6, 170);
  aba.setColumnWidth(7, 170);
  aba.setColumnWidth(8, 300);
}

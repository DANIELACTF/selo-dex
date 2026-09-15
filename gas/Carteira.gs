/**
 * Carteira.gs — a carência de três competências e a distribuição.
 *
 * Porta de onboarding/alimentar_carteira.py. Dois movimentos numa passada:
 *
 *   1. Entrada em carência — empresa da aba Particularidades que ainda não
 *      está em lugar nenhum entra em "Pendentes Daniela", com a competência
 *      de entrada e a de liberação.
 *   2. Distribuição — empresa cuja carência venceu E que tenha responsável
 *      definido sai de pendentes e entra na "Carteira Completa".
 *
 * Aqui não existe "gravar em arquivo novo" como no Python: a planilha é
 * viva. Em compensação, o Sheets guarda histórico de versões — e antes de
 * mexer o app tira uma cópia de segurança das duas abas quando pedido.
 *
 * O "Resumo Equipe" é COUNTIF sobre a Carteira Completa: recalcula sozinho.
 * Empresa em carência não conta para nenhum analista, que é o certo — ela
 * ainda não é de ninguém.
 */

function alimentarCarteira(referencia) {
  referencia = referencia || competenciaAtual();
  validarCompetencia(referencia);

  var abaPart = abaObrigatoria_(ABAS.particularidades);
  var abaCart = abaObrigatoria_(ABAS.carteira);
  var abaPend = abaObrigatoria_(ABAS.pendentes);

  var empresas = lerObjetos_(abaPart).filter(function (e) { return e['N° Cliente']; });
  if (!empresas.length) {
    return { erro: 'A aba "' + ABAS.particularidades + '" está vazia.' };
  }
  var porNumero = {};
  empresas.forEach(function (e) { porNumero[String(e['N° Cliente'])] = e; });

  var idxCart = indices_(abaCart);
  var idxPend = garantirColunas_(abaPend, [COL_COMPETENCIA, COL_LIBERA]);

  var jaNaCarteira = valoresColuna_(abaCart, idxCart['N° Cliente']);
  var jaEmPendentes = valoresColuna_(abaPend, idxPend['N° Cliente']);

  var r = {
    referencia: referencia, entraramCarencia: [], distribuidas: [], emCarencia: [],
    liberadasSemResponsavel: [], jaNaCarteira: [], competenciaInvalida: []
  };

  // ---- 1. entrada em carência -------------------------------------
  var novasPendentes = [];
  empresas.forEach(function (e) {
    var numero = String(e['N° Cliente']);
    if (jaNaCarteira.indexOf(numero) !== -1) { r.jaNaCarteira.push(numero); return; }
    if (jaEmPendentes.indexOf(numero) !== -1) return;

    var competencia = competenciaDaCaixa_(e[COL_COMPETENCIA]) || referencia;
    try {
      validarCompetencia(competencia);
    } catch (err) {
      r.competenciaInvalida.push(numero + ': ' + err.message);
      return;
    }

    var analista = e['Responsável (analista)'] || '';
    var nivel = e['Nível / equipe'] || '';
    var reg = {};
    reg['N° Cliente'] = numero;
    reg['Nome'] = e['Razão social'] || '';
    reg['CNPJ'] = e['CNPJ'] || '';
    reg['Regime Tributário'] = e['Regime confirmado'] || '⚠ A confirmar';
    reg['Segmento'] = e['Segmento'] || '';
    reg['Sugestão Analista'] = analista && nivel ? analista + ' (' + nivel + ')' : analista;
    reg['Origem'] = ORIGEM_ONBOARDING;
    reg['Observação'] = e['Obs. para a carteira'] || '';
    reg[COL_COMPETENCIA] = competencia;
    reg[COL_LIBERA] = competenciaLiberacao(competencia);

    novasPendentes.push(reg);
    jaEmPendentes.push(numero);
    r.entraramCarencia.push(numero + ' (libera em ' + reg[COL_LIBERA] + ')');
  });
  acrescentarLinhas_(abaPend, idxPend, novasPendentes);

  // ---- 2. distribuição de quem venceu a carência -------------------
  // Varre de cima para baixo para a carteira sair na mesma ordem dos
  // pendentes; só depois apaga as linhas, de baixo para cima, para os
  // índices não escorregarem durante a remoção.
  var aDistribuir = [];
  lerObjetos_(abaPend).forEach(function (linha) {
    var numero = String(linha['N° Cliente'] || '').trim();
    if (!numero) return;

    var entrada = competenciaDaCaixa_(linha[COL_COMPETENCIA]);
    if (!entrada) return;  // linha antiga, sem controle de carência: não mexe
    try {
      validarCompetencia(entrada);
    } catch (err) {
      r.competenciaInvalida.push(numero + ': ' + err.message);
      return;
    }

    if (!carenciaLiberada(entrada, referencia)) {
      var faltam = competenciasRestantes(entrada, referencia);
      r.emCarencia.push(numero + ' (libera em ' + competenciaLiberacao(entrada) + ', ' +
        (faltam > 1 ? 'faltam ' : 'falta ') + faltam + ' competência' + (faltam > 1 ? 's' : '') + ')');
      return;
    }

    var emp = porNumero[numero];
    if (!emp || !emp['Responsável (analista)']) {
      r.liberadasSemResponsavel.push(numero + ' (liberada desde ' + competenciaLiberacao(entrada) + ')');
      return;
    }
    aDistribuir.push({ linha: linha._linha, empresa: emp });
  });

  acrescentarLinhas_(abaCart, idxCart, aDistribuir.map(function (d) {
    var e = d.empresa;
    var reg = {};
    reg['N° Cliente'] = String(e['N° Cliente']);
    reg['Nome'] = e['Razão social'] || '';
    reg['CNPJ'] = e['CNPJ'] || '';
    reg['Regime Tributário'] = e['Regime confirmado'] || '⚠ A confirmar';
    reg['Segmento'] = e['Segmento'] || '';
    reg['Analista Responsável'] = e['Responsável (analista)'];
    reg['Nível'] = e['Nível / equipe'] || '';
    reg['Status'] = STATUS_NOVO;
    return reg;
  }));

  aDistribuir.slice().reverse().forEach(function (d) {
    abaPend.deleteRow(d.linha);
    r.distribuidas.push(String(d.empresa['N° Cliente']));
  });
  r.distribuidas.reverse();

  registrarLog_('Carteira', 'ref ' + referencia + ' | ' + r.entraramCarencia.length +
    ' em carência, ' + r.distribuidas.length + ' distribuída(s)');
  return r;
}

/**
 * Relatório somente-leitura: quem está em carência e quem já pode ser
 * distribuído. Não escreve nada.
 */
function situacaoCarencia(referencia) {
  referencia = referencia || competenciaAtual();
  validarCompetencia(referencia);

  var abaPend = abaObrigatoria_(ABAS.pendentes);
  var r = { referencia: referencia, liberadas: [], emCarencia: [], semCompetencia: [] };

  lerObjetos_(abaPend).forEach(function (linha) {
    var numero = String(linha['N° Cliente'] || '').trim();
    if (!numero) return;

    var item = { numero: numero, nome: linha['Nome'] || '', sugestao: linha['Sugestão Analista'] || '' };
    var entrada = competenciaDaCaixa_(linha[COL_COMPETENCIA]);
    if (!entrada) { r.semCompetencia.push(item); return; }
    try {
      validarCompetencia(entrada);
    } catch (err) {
      r.semCompetencia.push(item);
      return;
    }

    item.entrada = entrada;
    item.liberaEm = competenciaLiberacao(entrada);
    if (carenciaLiberada(entrada, referencia)) {
      r.liberadas.push(item);
    } else {
      item.faltam = competenciasRestantes(entrada, referencia);
      r.emCarencia.push(item);
    }
  });

  r.total = r.liberadas.length + r.emCarencia.length + r.semCompetencia.length;
  return r;
}

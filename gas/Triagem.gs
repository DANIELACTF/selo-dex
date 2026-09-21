/**
 * Triagem.gs — etapa 1: o e-mail da Thays vira fichas e lista de pendentes.
 *
 * Porta de onboarding/pipeline.py. Escreve na aba "Triagem" e devolve um
 * resumo para a barra lateral mostrar.
 */

/**
 * Processa o texto colado na barra lateral.
 * @param {string} texto  corpo do e-mail "EMPRESA NOVA"
 * @param {boolean} consultar  false pula Receita/BrasilAPI (offline/teste)
 * @return {Object} resumo para a UI
 */
function processarEmail(texto, consultar, textoComprovantes) {
  var empresas = parseEmail(texto);
  if (!empresas.length) {
    return { erro: 'Nenhuma empresa encontrada no texto. Confira se o e-mail foi colado inteiro, ' +
      'com as linhas "<EMPRESA> CNPJ: ... N°####".' };
  }

  var anexos = extrairAnexos(texto);
  var recebidoEm = extrairDataEmail(texto) || hojeBr_();
  var todosNumeros = empresas.map(function (e) { return e.numero; });

  // O comprovante de inscrição que a Thays manda traz os mesmos dados
  // cadastrais que a BrasilAPI — e traz para a empresa recém-aberta, que é
  // justamente a que a base pública ainda não tem. Lemos o corpo do e-mail
  // e, se vieram PDFs convertidos, o texto deles também.
  var comprovantes = lerComprovantesDoTexto(texto);
  if (textoComprovantes) {
    var extras = lerComprovantesDoTexto(textoComprovantes);
    Object.keys(extras).forEach(function (cnpj) {
      if (!comprovantes[cnpj]) comprovantes[cnpj] = extras[cnpj];
    });
  }

  // 1ª passada: consultas e tipo, necessários para detectar grupo econômico.
  var lista = empresas.map(function (e) {
    // Ordem de preferência para os dados cadastrais: comprovante (documento
    // oficial, sempre atual) → consulta → nada. A opção pelo Simples é a
    // única coisa que o comprovante não informa, então ela é consultada de
    // qualquer jeito.
    var doComprovante = comprovantes[apenasDigitos_(e.cnpj)] || null;
    var dados;
    if (doComprovante) {
      dados = doComprovante;
    } else if (consultar) {
      dados = consultarCnpj(e.cnpj);
    } else {
      dados = dadosVazios_(e.cnpj, 'Sem comprovante no e-mail e consulta desabilitada nesta execução');
    }

    return {
      raw: e,
      tipo: tipoEstabelecimento(e.cnpj),
      dados: dados,
      simples: consultar ? consultarOptanteSimples(e.cnpj)
        : { cnpj: e.cnpj, optante: null, mensagem: null, erro: 'Consulta desabilitada nesta execução' }
    };
  });
  var tipos = lista.map(function (x) { return x.tipo; });

  var aba = abaObrigatoria_(ABAS.triagem);
  // Aditivo: planilha instalada antes destas colunas ganha as que faltam sem
  // perder o que já tem.
  var idx = garantirColunas_(aba, COLS_TRIAGEM);
  var jaNaAba = valoresColuna_(aba, idx['N° Cliente']);

  var registros = [];
  var resumo = {
    processadas: [], jaExistiam: [], alertasCertificado: [], divergencias: [],
    consultasFalhas: [], certificadosSemDono: [], viaSegundaFonte: [],
    viaComprovante: [], comprovantesSemEmpresa: []
  };
  var anexosUsados = [];

  lista.forEach(function (x, i) {
    var raw = x.raw;
    var cert = certificadoPresente(raw.nome, raw.cnpj, anexos);
    if (cert.arquivo) anexosUsados.push(cert.arquivo);

    var alertaCert = (raw.regimeInformado === 'MEI' && !MEI_EXIGE_CERTIFICADO) ? false : !cert.ok;
    var divergencia = checarDivergencia(raw.regimeInformado, x.dados, x.simples);
    var grupo = detectarGrupoEconomico(i, empresas, tipos);
    var bullets = particularidades(raw, x.dados, grupo, divergencia, cert.ok, todosNumeros);
    var optante = optanteSimplesResolvido(x.dados, x.simples);

    if (jaNaAba.indexOf(String(raw.numero)) !== -1) {
      resumo.jaExistiam.push('N°' + raw.numero + ' ' + raw.nome);
      return;
    }

    var registro = {};
    registro['N° Cliente'] = raw.numero;
    registro['Razão social'] = x.dados.razaoSocial || raw.nome;
    registro['CNPJ'] = raw.cnpj;
    registro['Tipo'] = x.tipo;
    registro['Abertura'] = x.dados.dataInicioAtividade || '-';
    registro['Porte'] = x.dados.porte || '-';
    registro['Regime informado'] = raw.regimeInformado || '(não informado)';
    registro['Regime / enquadramento'] = regimeEnquadramento(raw.regimeInformado, x.dados);
    registro['Simples (RFB)'] = optante === true ? 'Sim' : optante === false ? 'Não' : '?';
    registro['Divergência'] = divergencia || '';
    registro['Situação cadastral'] = x.dados.situacaoCadastral || '';
    registro['Fonte dos dados'] = x.dados.fonte || '(não consultado)';
    registro['CNAE principal'] = formatarCnaePrincipal(x.dados);
    registro['CNAEs secundários'] = formatarCnaesSecundarios(x.dados);
    registro['Município / UF'] = (x.dados.municipio && x.dados.uf)
      ? x.dados.municipio + '/' + x.dados.uf : '-';
    registro['Grupo econômico'] = grupo;
    registro['Certificado'] = cert.ok ? 'recebido' : 'pendente';
    registro['Senha (cofre)'] = raw.senhaCertificado ? 'arquivada' : 'pendente';
    registro['E-mail do cliente'] = raw.emailContato.join('; ');
    registro['Particularidades'] = bullets.join('\n');
    registro['Ficha (PDF)'] = '';
    registro['Processado em'] = recebidoEm;
    registros.push(registro);

    resumo.processadas.push({
      numero: raw.numero, nome: registro['Razão social'], cnpj: raw.cnpj,
      certificado: cert.ok, regime: registro['Regime informado'],
      simples: registro['Simples (RFB)']
    });
    if (alertaCert) {
      resumo.alertasCertificado.push(raw.nome + ' (N°' + raw.numero + ', CNPJ ' + raw.cnpj + ')');
    }
    if (divergencia) resumo.divergencias.push(raw.nome + ' (N°' + raw.numero + '): ' + divergencia);
    if (x.dados.erro || x.simples.erro) {
      resumo.consultasFalhas.push(raw.nome + ': ' + (x.dados.erro || x.simples.erro));
    }
    if (x.dados.fonte === 'ReceitaWS') {
      resumo.viaSegundaFonte.push(raw.nome + ' (N°' + raw.numero + ')');
    }
    if (x.dados.fonte === 'Comprovante RFB') {
      resumo.viaComprovante.push(raw.nome + ' (N°' + raw.numero + ')');
    }
  });

  acrescentarLinhas_(aba, idx, registros);
  formatarTriagem_(aba);

  // Comprovante de CNPJ que não bate com nenhuma empresa do e-mail: ou a
  // Thays mandou a mais, ou o N°/CNPJ do texto está diferente. Vale avisar.
  var cnpjsDoLote = empresas.map(function (e) { return apenasDigitos_(e.cnpj); });
  Object.keys(comprovantes).forEach(function (cnpj) {
    if (cnpjsDoLote.indexOf(cnpj) === -1) {
      resumo.comprovantesSemEmpresa.push(comprovantes[cnpj].razaoSocial + ' (' + comprovantes[cnpj].cnpj + ')');
    }
  });

  resumo.certificadosSemDono = anexosNaoIdentificados(anexos, anexosUsados);
  resumo.textoCobranca = montarTextoCobranca_(resumo.alertasCertificado, resumo.certificadosSemDono);

  // A empresa entra em carência na hora em que chega, não depois da reunião
  // com o Paulo: é o e-mail da Thays que marca a entrada dela no escritório.
  entrarEmPendentes_(registros, competenciaDoEmail_(recebidoEm), resumo);

  registrarLog_('Triagem', registros.length + ' empresa(s) do e-mail de ' + recebidoEm);
  return resumo;
}

/** Competência da data do e-mail (DD/MM/AAAA), ou a atual se não der. */
function competenciaDoEmail_(recebidoEm) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(recebidoEm || '').trim());
  return m ? m[2] + '/' + m[3] : competenciaAtual();
}

/**
 * Põe as empresas recém-triadas em "Pendentes Daniela", já com a competência
 * de entrada e a de liberação.
 *
 * É o passo que faltava no fluxo: antes, a empresa só aparecia em pendentes
 * quando a carteira era alimentada, depois da reunião — e a carência, que
 * conta da entrada, começava tarde. Alimentar a carteira continua funcionando
 * e simplesmente não reinsere quem já está aqui.
 */
function entrarEmPendentes_(registros, competencia, resumo) {
  resumo.entraramPendentes = [];
  resumo.competenciaEntrada = competencia;
  resumo.liberaEm = null;

  if (!registros.length) return;

  var abaPend = aba_(ABAS.pendentes, false);
  if (!abaPend) {
    resumo.avisoPendentes = 'A aba "' + ABAS.pendentes + '" não existe, então as empresas ' +
      'ficaram só na Triagem. Use Configurar → Criar/conferir abas e processe de novo.';
    return;
  }

  try {
    validarCompetencia(competencia);
  } catch (e) {
    resumo.avisoPendentes = 'Competência de entrada inválida (' + competencia + ') — ' +
      'as empresas ficaram só na Triagem.';
    return;
  }

  var idxPend = garantirColunas_(abaPend, [COL_COMPETENCIA, COL_LIBERA]);
  var jaEmPendentes = valoresColuna_(abaPend, idxPend['N° Cliente']);

  var abaCart = aba_(ABAS.carteira, false);
  var jaNaCarteira = abaCart ? valoresColuna_(abaCart, indices_(abaCart)['N° Cliente']) : [];

  var liberaEm = competenciaLiberacao(competencia);
  var novas = [];

  registros.forEach(function (r) {
    var numero = String(r['N° Cliente']);
    if (jaEmPendentes.indexOf(numero) !== -1 || jaNaCarteira.indexOf(numero) !== -1) return;

    var linha = {};
    linha['N° Cliente'] = numero;
    linha['Nome'] = r['Razão social'] || '';
    linha['CNPJ'] = r['CNPJ'] || '';
    linha['Regime Tributário'] = r['Regime informado'] || '⚠ A confirmar';
    linha['Origem'] = ORIGEM_ONBOARDING;
    linha['Observação'] = observacaoDaTriagem_(r);
    linha[COL_COMPETENCIA] = competencia;
    linha[COL_LIBERA] = liberaEm;

    novas.push(linha);
    jaEmPendentes.push(numero);
    resumo.entraramPendentes.push('N°' + numero + ' ' + linha['Nome']);
  });

  acrescentarLinhas_(abaPend, idxPend, novas);
  if (novas.length) {
    resumo.liberaEm = liberaEm;
    registrarLog_('Entrada em carência', novas.length + ' empresa(s) em "' + ABAS.pendentes +
      '", competência ' + competencia + ', liberam em ' + liberaEm);
  }
}

/** O que a triagem já sabe e a carteira precisa ver de relance. */
function observacaoDaTriagem_(registro) {
  var partes = [];
  if (registro['Divergência']) partes.push('⚠ ' + registro['Divergência']);
  if (registro['Certificado'] === 'pendente') partes.push('Certificado A1 pendente');
  if (registro['Grupo econômico'] && registro['Grupo econômico'] !== '—') {
    partes.push('Grupo: ' + registro['Grupo econômico']);
  }
  return partes.join(' · ');
}

function dadosVazios_(cnpj, motivo) {
  return dadosCadastraisVazios_(cnpj, motivo);
}

/** Texto pronto para o usuário copiar e mandar para a Thays. */
function montarTextoCobranca_(faltantes, semDono) {
  if (!faltantes.length && !semDono.length) return '';
  var linhas = ['Oi, Thays! Tudo bem?', ''];
  if (faltantes.length) {
    linhas.push('Para fechar o cadastro das empresas novas, faltou o certificado digital A1 de:');
    faltantes.forEach(function (f) { linhas.push('  • ' + f); });
    linhas.push('');
    linhas.push('Consegue nos enviar o .pfx (e a senha) dessas?');
  }
  if (semDono.length) {
    linhas.push('');
    linhas.push('Também veio anexo sem identificação — não deu para saber de qual empresa é:');
    semDono.forEach(function (a) { linhas.push('  • ' + a); });
    linhas.push('');
    linhas.push('Pode confirmar a qual empresa pertence?');
  }
  linhas.push('');
  linhas.push('Obrigada!');
  return linhas.join('\n');
}

function formatarTriagem_(aba) {
  var ultima = aba.getLastRow();
  if (ultima < 2) return;
  var idx = indices_(aba);

  aba.getRange(2, 1, ultima - 1, aba.getLastColumn())
    .setVerticalAlignment('top').setWrap(true).setFontSize(9);

  // Divergência em vermelho: é o que precisa saltar aos olhos.
  if (idx['Divergência']) {
    aba.getRange(2, idx['Divergência'], ultima - 1, 1).setFontColor(CORES.atencao).setFontWeight('bold');
  }
  if (idx['Certificado']) {
    var regra = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('pendente')
      .setBackground('#fce8e6').setFontColor(CORES.atencao)
      .setRanges([aba.getRange(2, idx['Certificado'], ultima - 1, 1)])
      .build();
    var regras = aba.getConditionalFormatRules();
    regras.push(regra);
    aba.setConditionalFormatRules(regras);
  }
}

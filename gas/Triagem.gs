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
  registrarLog_('Triagem', registros.length + ' empresa(s) do e-mail de ' + recebidoEm);
  return resumo;
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

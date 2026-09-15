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
function processarEmail(texto, consultar) {
  var empresas = parseEmail(texto);
  if (!empresas.length) {
    return { erro: 'Nenhuma empresa encontrada no texto. Confira se o e-mail foi colado inteiro, ' +
      'com as linhas "<EMPRESA> CNPJ: ... N°####".' };
  }

  var anexos = extrairAnexos(texto);
  var recebidoEm = extrairDataEmail(texto) || hojeBr_();
  var todosNumeros = empresas.map(function (e) { return e.numero; });

  // 1ª passada: consultas e tipo, necessários para detectar grupo econômico.
  var lista = empresas.map(function (e) {
    return {
      raw: e,
      tipo: tipoEstabelecimento(e.cnpj),
      dados: consultar ? consultarCnpj(e.cnpj) : dadosVazios_(e.cnpj, 'Consulta desabilitada nesta execução'),
      simples: consultar ? consultarOptanteSimples(e.cnpj)
        : { cnpj: e.cnpj, optante: null, mensagem: null, erro: 'Consulta desabilitada nesta execução' }
    };
  });
  var tipos = lista.map(function (x) { return x.tipo; });

  var aba = abaObrigatoria_(ABAS.triagem);
  var idx = indices_(aba);
  var jaNaAba = valoresColuna_(aba, idx['N° Cliente']);

  var registros = [];
  var resumo = {
    processadas: [], jaExistiam: [], alertasCertificado: [],
    divergencias: [], consultasFalhas: [], certificadosSemDono: []
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
    registro['Regime informado'] = raw.regimeInformado || '(não informado)';
    registro['Simples (RFB)'] = optante === true ? 'Sim' : optante === false ? 'Não' : '?';
    registro['Divergência'] = divergencia || '';
    registro['Situação cadastral'] = x.dados.situacaoCadastral || '';
    registro['CNAE principal'] = formatarCnaePrincipal(x.dados);
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
  });

  acrescentarLinhas_(aba, idx, registros);
  formatarTriagem_(aba);

  resumo.certificadosSemDono = anexosNaoIdentificados(anexos, anexosUsados);
  resumo.textoCobranca = montarTextoCobranca_(resumo.alertasCertificado, resumo.certificadosSemDono);
  registrarLog_('Triagem', registros.length + ' empresa(s) do e-mail de ' + recebidoEm);
  return resumo;
}

function dadosVazios_(cnpj, motivo) {
  return {
    cnpj: cnpj, razaoSocial: null, nomeFantasia: null, situacaoCadastral: null,
    dataInicioAtividade: null, cnaeCodigo: null, cnaeDescricao: null, cnaesSecundarios: [],
    naturezaJuridica: null, porte: null, municipio: null, uf: null, bairro: null,
    endereco: null, optanteSimples: null, optanteMei: null, erro: motivo
  };
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

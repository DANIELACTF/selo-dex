/**
 * Etapa1.gs — a triagem, em chamadas curtas.
 *
 * O e-mail "EMPRESA NOVA" chega como PDF (impresso do Outlook, com os
 * comprovantes de inscrição junto). O app converte, lê e consulta.
 *
 * Por que em etapas: uma chamada só, consultando o lote inteiro, estourava
 * os 6 minutos do Apps Script e o lote se perdia. Aqui a barra lateral
 * conduz o trabalho:
 *
 *   1.  abrirLote(arquivos)          converte os PDFs e lista as empresas
 *   2.  consultarEmpresaDoLote(...)  uma empresa por chamada — a barra anda
 *   3.  gravarLote(...)              escreve em Particularidades e Pendentes
 *
 * Cada chamada leva segundos, não minutos. O limite deixa de existir, e a
 * pessoa vê o progresso em vez de uma tela parada.
 */

/**
 * Passo 1 — converte os PDFs, lê o e-mail e devolve o que encontrou, sem
 * consultar nada ainda.
 */
function abrirLote(arquivos) {
  try {
    if (!arquivos || !arquivos.length) {
      return { erro: 'Anexe o PDF do e-mail "EMPRESA NOVA" antes de processar.' };
    }

    var conversao = pdfsParaTexto(arquivos);
    if (!conversao.texto) {
      return {
        erro: 'Não consegui ler nenhum dos PDFs anexados.',
        pdfsComFalha: conversao.falharam
      };
    }

    var texto = conversao.texto;
    var empresas = parseEmail(texto);
    if (!empresas.length) {
      return {
        erro: 'Li o PDF, mas não encontrei nenhuma empresa nele. O texto precisa ter ' +
          'as linhas no formato "<EMPRESA> CNPJ: 00.000.000/0000-00 N°1234".',
        pdfsLidos: conversao.lidos,
        pdfsComFalha: conversao.falharam,
        amostraDoTexto: texto.slice(0, 600)
      };
    }

    var comprovantes = lerComprovantesDoTexto(texto);
    var anexos = extrairAnexos(texto);
    var recebidoEm = extrairDataEmail(texto) || hojeBr_();
    var tipos = empresas.map(function (e) { return tipoEstabelecimento(e.cnpj); });

    var jaCadastradas = numerosJaCadastrados_();

    var itens = empresas.map(function (e, i) {
      var cert = certificadoPresente(e.nome, e.cnpj, anexos);
      var doComprovante = comprovantes[apenasDigitos_(e.cnpj)] || null;
      return {
        indice: i,
        numero: e.numero,
        nome: e.nome,
        cnpj: e.cnpj,
        cnpjValido: cnpjValido(e.cnpj),
        tipo: tipos[i],
        regimeInformado: e.regimeInformado,
        emailContato: e.emailContato,
        temSenha: !!e.senhaCertificado,
        certificado: cert.ok,
        certificadoArquivo: cert.arquivo,
        grupo: detectarGrupoEconomico(i, empresas, tipos),
        comprovante: doComprovante,
        jaCadastrada: jaCadastradas.indexOf(String(e.numero)) !== -1
      };
    });

    var usados = itens.map(function (x) { return x.certificadoArquivo; }).filter(String);
    var cnpjsDoLote = empresas.map(function (e) { return apenasDigitos_(e.cnpj); });

    return {
      ok: true,
      recebidoEm: recebidoEm,
      competencia: competenciaDoEmail_(recebidoEm),
      empresas: itens,
      anexosSemDono: anexosNaoIdentificados(anexos, usados),
      comprovantesSemEmpresa: Object.keys(comprovantes)
        .filter(function (c) { return cnpjsDoLote.indexOf(c) === -1; })
        .map(function (c) { return (comprovantes[c].razaoSocial || '?') + ' (' + comprovantes[c].cnpj + ')'; }),
      pdfsLidos: conversao.lidos,
      pdfsComFalha: conversao.falharam
    };
  } catch (e) {
    return { erro: String(e && e.message ? e.message : e) };
  }
}

/** N° de cliente que já está em qualquer aba do fluxo. */
function numerosJaCadastrados_() {
  var numeros = [];
  [ABAS.particularidades, ABAS.pendentes, ABAS.carteira].forEach(function (nome) {
    var aba = aba_(nome, false);
    if (!aba) return;
    var col = indices_(aba)['N° Cliente'];
    if (col) numeros = numeros.concat(valoresColuna_(aba, col));
  });
  return numeros;
}

/**
 * Passo 2 — consulta UMA empresa. A barra lateral chama em sequência, e é
 * isso que faz a barra de progresso andar.
 *
 * @param {Object} item  um elemento de `empresas` devolvido por abrirLote
 * @param {boolean} consultar  false pula a Receita (teste rápido / offline)
 */
function consultarEmpresaDoLote(item, consultar) {
  try {
    var dados;
    if (item.comprovante) {
      // O comprovante é documento oficial e traz tudo menos o Simples.
      dados = item.comprovante;
    } else if (consultar) {
      dados = consultarCnpj(item.cnpj, { permitirSegundaFonte: true });
    } else {
      dados = dadosCadastraisVazios_(item.cnpj, 'consulta desabilitada nesta execução');
    }

    var simples = consultar
      ? consultarOptanteSimples(item.cnpj)
      : { cnpj: item.cnpj, optante: null, mensagem: null, erro: 'consulta desabilitada nesta execução' };

    var divergencia = checarDivergencia(item.regimeInformado, dados, simples);
    var optante = optanteSimplesResolvido(dados, simples);

    return {
      ok: true,
      indice: item.indice,
      numero: item.numero,
      nome: dados.razaoSocial || item.nome,
      dados: dados,
      simples: optante === true ? 'Sim' : optante === false ? 'Não' : '?',
      divergencia: divergencia,
      erroConsulta: dados.erro || simples.erro || null
    };
  } catch (e) {
    return {
      ok: false, indice: item.indice, numero: item.numero, nome: item.nome,
      erro: String(e && e.message ? e.message : e)
    };
  }
}

/**
 * Passo 3 — grava o lote inteiro: uma linha por empresa em Particularidades
 * e a entrada em carência em Pendentes Daniela.
 *
 * @param {Object} lote        o que abrirLote devolveu
 * @param {Array}  resultados  um por empresa, de consultarEmpresaDoLote
 */
function gravarLote(lote, resultados) {
  try {
    var aba = aba_(ABAS.particularidades, true);
    if (aba.getLastRow() === 0) montarCabecalhoParticularidades_(aba);
    var idx = garantirColunas_(aba, COLS_PARTICULARIDADES.map(function (c) { return c.titulo; }));

    var jaNaAba = valoresColuna_(aba, idx['N° Cliente']);
    var porIndice = {};
    (resultados || []).forEach(function (r) { porIndice[r.indice] = r; });

    var todosNumeros = lote.empresas.map(function (e) { return e.numero; });
    var registros = [];
    var resumo = {
      ok: true, gravadas: [], jaExistiam: [], alertasCertificado: [], divergencias: [],
      consultasFalhas: [], viaComprovante: [], cnpjSuspeito: [],
      competencia: lote.competencia, liberaEm: competenciaLiberacao(lote.competencia)
    };

    lote.empresas.forEach(function (item, i) {
      if (jaNaAba.indexOf(String(item.numero)) !== -1 || item.jaCadastrada) {
        resumo.jaExistiam.push('N°' + item.numero + ' ' + item.nome);
        return;
      }

      var r = porIndice[item.indice] || {};
      var dados = r.dados || dadosCadastraisVazios_(item.cnpj, 'não consultado');
      var alertaCert = (item.regimeInformado === 'MEI' && !MEI_EXIGE_CERTIFICADO)
        ? false : !item.certificado;

      var bullets = particularidades(
        { numero: item.numero, regimeInformado: item.regimeInformado, emailContato: item.emailContato },
        dados, item.grupo, r.divergencia || null, item.certificado, todosNumeros
      );
      if (!item.cnpjValido) {
        bullets.unshift('ATENÇÃO: o CNPJ lido (' + item.cnpj + ') não passa no dígito ' +
          'verificador — confira no PDF antes de seguir.');
        resumo.cnpjSuspeito.push('N°' + item.numero + ' ' + item.nome + ' — ' + item.cnpj);
      }

      var linha = {};
      linha['N° Cliente'] = item.numero;
      linha['Razão social'] = dados.razaoSocial || item.nome;
      linha['CNPJ'] = item.cnpj;
      linha['Tipo'] = item.tipo;
      linha['Nome fantasia'] = dados.nomeFantasia || '';
      linha['Abertura'] = dados.dataInicioAtividade || '-';
      linha['Porte'] = dados.porte || '-';
      linha['Município / UF'] = (dados.municipio && dados.uf) ? dados.municipio + '/' + dados.uf : '-';
      linha['Grupo econômico'] = item.grupo;
      linha['E-mail do cliente'] = (item.emailContato || []).join('; ');
      linha['CNAE principal'] = formatarCnaePrincipal(dados);
      linha['CNAEs secundários'] = formatarCnaesSecundarios(dados);
      linha['Regime informado'] = item.regimeInformado || '(não informado)';
      linha['Regime / enquadramento'] = regimeEnquadramento(item.regimeInformado, dados);
      linha['Simples (RFB)'] = r.simples || '?';
      linha['Situação cadastral'] = dados.situacaoCadastral || '';
      linha['Particularidades'] = bullets.join('\n');
      linha['Divergência'] = r.divergencia || '';
      linha['Certificado A1'] = item.certificado ? 'recebido' : 'pendente';
      linha['Senha (cofre)'] = item.temSenha ? 'arquivada' : 'pendente';
      linha['Regime confirmado'] = regimeParaLista_(item.regimeInformado);
      linha['Situação'] = 'Pendente distribuição';
      linha['Competência entrada'] = lote.competencia;
      linha['Fonte dos dados'] = dados.fonte || '(não consultado)';
      linha['Processado em'] = lote.recebidoEm;

      registros.push(linha);
      jaNaAba.push(String(item.numero));
      resumo.gravadas.push({ numero: item.numero, nome: linha['Razão social'], certificado: item.certificado });

      if (alertaCert) {
        resumo.alertasCertificado.push(item.nome + ' (N°' + item.numero + ', CNPJ ' + item.cnpj + ')');
      }
      if (r.divergencia) resumo.divergencias.push(item.nome + ' (N°' + item.numero + '): ' + r.divergencia);
      if (r.erroConsulta) resumo.consultasFalhas.push(item.nome + ': ' + r.erroConsulta);
      if (dados.fonte === 'Comprovante RFB') {
        resumo.viaComprovante.push(item.nome + ' (N°' + item.numero + ')');
      }
    });

    var primeira = aba.getLastRow() + 1;
    acrescentarLinhas_(aba, idx, registros);
    aplicarFormatoParticularidades_(aba, primeira, aba.getLastRow());

    resumo.anexosSemDono = lote.anexosSemDono || [];
    resumo.comprovantesSemEmpresa = lote.comprovantesSemEmpresa || [];
    resumo.textoCobranca = montarTextoCobranca_(resumo.alertasCertificado, resumo.anexosSemDono);

    entrarEmPendentes_(registros, lote.competencia, resumo);
    registrarLog_('Etapa 1', registros.length + ' empresa(s) do e-mail de ' + lote.recebidoEm);
    return resumo;
  } catch (e) {
    return { erro: String(e && e.message ? e.message : e) };
  }
}

// ---------------------------------------------------------- apoio

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
  if (registro['Certificado A1'] === 'pendente') partes.push('Certificado A1 pendente');
  if (registro['Grupo econômico'] && registro['Grupo econômico'] !== '—') {
    partes.push('Grupo: ' + registro['Grupo econômico']);
  }
  return partes.join(' · ');
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

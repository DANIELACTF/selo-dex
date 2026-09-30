/**
 * Regras.gs — as regras de negócio da ficha, sem tocar em planilha.
 *
 * Porta de onboarding/pipeline.py. Tudo aqui é função pura, o que permite
 * rodar os mesmos testes fora do Apps Script (node tests/test_gas.mjs).
 */

var PALAVRAS_GENERICAS = ['E', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'LTDA', 'EIRELI', 'ME',
  'EPP', 'MEI', 'SA', 'S', 'A', 'COMERCIO', 'SERVICOS', 'SERVICO', 'COMERCIAL'];

var SUFIXO_REGIME = {
  'Lucro Real': 'PIS/COFINS não-cumulativo; apuração IRPJ/CSLL',
  'Lucro Presumido': 'PIS/COFINS cumulativo; IRPJ/CSLL trimestral',
  'MEI': 'DAS-MEI fixo mensal'
};

var PALAVRAS_SERVICO_FATOR_R = ['escritorio', 'administrativ', 'intermediac', 'agenciamento',
  'consultoria', 'assessoria', 'ensino', 'treinamento', 'advocacia', 'engenharia',
  'auditoria', 'corretagem', 'representacao comercial'];

var SUFIXOS_SOCIETARIOS = ['LTDA', 'EIRELI', 'ME', 'EPP', 'MEI', 'S/A', 'SA', 'S.A.'];

/** Remove acento e deixa só letras e dígitos, em maiúsculas. */
function normalizar_(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Remove acento e deixa minúsculo, preservando espaços. */
function normalizarLivre_(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function apenasDigitos_(texto) {
  return String(texto || '').replace(/\D/g, '');
}

/** Dígitos 9 a 12 do CNPJ iguais a 0001 → Matriz; senão Filial. */
function tipoEstabelecimento(cnpj) {
  return apenasDigitos_(cnpj).slice(8, 12) === '0001' ? 'Matriz' : 'Filial';
}

function raizCnpj_(cnpj) {
  return apenasDigitos_(cnpj).slice(0, 8);
}

/**
 * Casa a empresa com um dos .pfx anexados: primeiro pelos dígitos do CNPJ
 * dentro do nome do arquivo, depois por prefixo do nome da empresa (os
 * nomes vêm truncados ou com sufixos cortados).
 * @return {{ok: boolean, arquivo: ?string}}
 */
function certificadoPresente(nomeEmpresa, cnpj, anexos) {
  var nomeNorm = normalizar_(nomeEmpresa);
  var digitos = apenasDigitos_(cnpj);
  var prefixo = nomeNorm.slice(0, Math.max(6, Math.floor(nomeNorm.length * 0.6)));

  for (var i = 0; i < anexos.length; i++) {
    var anexoNorm = normalizar_(anexos[i]);
    if (digitos && anexoNorm.indexOf(digitos) !== -1) return { ok: true, arquivo: anexos[i] };
    if (prefixo && anexoNorm.indexOf(prefixo) !== -1) return { ok: true, arquivo: anexos[i] };
  }
  return { ok: false, arquivo: null };
}

/** Anexos .pfx que não foram atribuídos a nenhuma empresa do lote. */
function anexosNaoIdentificados(anexos, usados) {
  return anexos.filter(function (a) {
    return /\.pfx$/i.test(a) && usados.indexOf(a) === -1;
  });
}

/** A consulta oficial tem prioridade; a BrasilAPI é a resposta alternativa. */
function optanteSimplesResolvido(dados, simples) {
  if (simples && simples.optante !== null && simples.optante !== undefined) return simples.optante;
  return dados ? dados.optanteSimples : null;
}

/** Divergência entre o regime que a Thays informou e o que consta na Receita. */
function checarDivergencia(regimeInformado, dados, simples) {
  if (!regimeInformado) return null;
  var optante = optanteSimplesResolvido(dados, simples);
  if (optante === null || optante === undefined) return null;

  if (regimeInformado === 'Simples Nacional' && optante === false) {
    return 'Thays informou Simples Nacional, mas a Receita não confirma opção pelo Simples';
  }
  if ((regimeInformado === 'Lucro Presumido' || regimeInformado === 'Lucro Real') && optante === true) {
    return 'Thays informou ' + regimeInformado + ', mas a empresa consta como optante pelo Simples Nacional';
  }
  if (regimeInformado === 'MEI' && dados && dados.optanteMei === false) {
    return 'Thays informou MEI, mas a Receita não confirma opção pelo MEI';
  }
  return null;
}

function nomeGrupoDaObservacao_(observacao) {
  if (!observacao) return null;
  var m = /mesmo grupo\s+d[aoe]s?\s+(.+)/i.exec(observacao);
  return m ? m[1].replace(/[\s.]+$/, '') : null;
}

/**
 * Grupo econômico: a observação da Thays manda; senão, empresas do mesmo
 * lote que dividem a raiz do CNPJ formam grupo.
 */
function detectarGrupoEconomico(idx, empresas, tipos) {
  var obs = nomeGrupoDaObservacao_(empresas[idx].observacao);
  if (obs) return obs;

  var raiz = raizCnpj_(empresas[idx].cnpj);
  var irmaos = [];
  for (var j = 0; j < empresas.length; j++) {
    if (j !== idx && raizCnpj_(empresas[j].cnpj) === raiz) irmaos.push(j);
  }
  if (!irmaos.length) return '—';

  var primeira = empresas[idx].nome.split(' ')[0];
  primeira = primeira.charAt(0).toUpperCase() + primeira.slice(1).toLowerCase();
  var temMatriz = irmaos.concat([idx]).some(function (j) { return tipos[j] === 'Matriz'; });
  return primeira + (temMatriz ? ' (matriz+filial)' : ' (rede)');
}

function formatarCodigoCnae(codigo) {
  var d = apenasDigitos_(codigo);
  while (d.length < 7) d = '0' + d;
  return d.slice(0, 2) + '.' + d.slice(2, 4) + '-' + d.slice(4, 5) + '-' + d.slice(5, 7);
}

function formatarCnaePrincipal(dados) {
  if (dados.erro) return '(não consultado — falha ao acessar a Receita)';
  if (!dados.cnaeCodigo) return '-';
  var codigo = formatarCodigoCnae(dados.cnaeCodigo);
  return dados.cnaeDescricao ? codigo + ' — ' + dados.cnaeDescricao : codigo;
}

function formatarCnaesSecundarios(dados) {
  if (dados.erro) return '(não consultado)';
  var s = dados.cnaesSecundarios || [];
  if (!s.length) return 'Não informada';
  if (s.length === 1) return formatarCodigoCnae(s[0].codigo) + ' — ' + s[0].descricao;
  return s.map(function (c) { return formatarCodigoCnae(c.codigo); }).join('; ');
}

/** Regime informado + a observação padrão do Dep. Fiscal. */
function regimeEnquadramento(regimeInformado, dados) {
  if (!regimeInformado) return 'A definir — definir regime (não informado no e-mail)';
  if (regimeInformado === 'Simples Nacional') {
    var cnae = normalizarLivre_(dados && dados.cnaeDescricao);
    var fatorR = PALAVRAS_SERVICO_FATOR_R.some(function (p) { return cnae.indexOf(p) !== -1; });
    return fatorR
      ? 'Simples Nacional — avaliar Fator R → Anexo III (folha ≥ 28% RBT12)'
      : 'Simples Nacional — confirmar anexo pela atividade';
  }
  var sufixo = SUFIXO_REGIME[regimeInformado];
  return sufixo ? regimeInformado + ' — ' + sufixo : regimeInformado;
}

/** Até 5 bullets, os mais relevantes. Prefixo "ATENÇÃO:" marca risco. */
function particularidades(empresa, dados, grupo, divergencia, certificadoOk, todosNumeros) {
  var b = [];

  if (dados.naoEncontrado) {
    // Empresa recém-aberta ainda não entrou no dump de dados abertos da RFB.
    // Não é falha de consulta — é defasagem da base, e o dado existe no
    // comprovante de inscrição que costuma vir no próprio e-mail.
    b.push('Empresa ainda não consta nas bases públicas de CNPJ — normal em ' +
      'empresa recém-aberta. CNAE, endereço e situação cadastral a preencher pelo ' +
      'comprovante de inscrição (e-mail da Thays) ou pelo e-CAC.');
  } else if (dados.erro) {
    b.push('CNAE, endereço e situação cadastral não confirmados automaticamente (falha ao ' +
      'consultar a Receita: ' + dados.erro + ') — conferir manualmente.');
  }
  if (dados.naturezaJuridica && /individual/i.test(dados.naturezaJuridica)) {
    b.push('EMPRESÁRIO INDIVIDUAL — não é sociedade; cadastro/procuração próprios do EI.');
  }
  if (grupo !== '—') b.push('Mesmo grupo: ' + grupo + '.');
  if (divergencia) b.push('ATENÇÃO: ' + divergencia + '.');
  if (dados.uf && dados.uf.toUpperCase() !== 'RJ') {
    b.push('ATENÇÃO: estabelecimento em ' + dados.municipio + '/' + dados.uf +
      ' — ISS/IM local, não no RJ (checar SEFAZ do estado correspondente).');
  }
  if (!dados.erro && dados.cnaeDescricao) {
    var cnae = normalizarLivre_(dados.cnaeDescricao);
    var comercio = ['comerc', 'varejista', 'atacadista'].some(function (p) { return cnae.indexOf(p) !== -1; });
    var fatorR = PALAVRAS_SERVICO_FATOR_R.some(function (p) { return cnae.indexOf(p) !== -1; });
    if (comercio) {
      b.push('Atividade de comércio — atenção a ICMS (e possível ST, conforme NCM).');
    } else if (empresa.regimeInformado === 'Simples Nacional' && fatorR) {
      b.push('Atividade de serviço — ISS/NFS-e; avaliar Fator R.');
    } else if (cnae.indexOf('servi') !== -1) {
      b.push('Atividade de serviço — ISS/NFS-e.');
    }
  }
  var n = parseInt(empresa.numero, 10);
  if (!isNaN(n) && n < 1000) {
    var outrosAltos = todosNumeros.some(function (o) {
      return o !== empresa.numero && parseInt(o, 10) >= 1000;
    });
    if (outrosAltos) {
      b.push('N° de cliente ' + empresa.numero +
        ' fora da série atual — confirmar se é reativação/registro antigo.');
    }
  }
  if (certificadoOk) b.push('Certificado A1 (.pfx) anexado — validar titularidade e validade.');
  if (empresa.emailContato.length && b.length < 2) {
    b.push('Contato: ' + empresa.emailContato.join('; ') + '.');
  }
  return b.slice(0, 5);
}

/** Nome do arquivo da ficha: 2 primeiras palavras significativas. */
function slugFicha(razaoSocial) {
  var palavras = (String(razaoSocial).toUpperCase().match(/[A-ZÀ-Ü0-9&]+/g) || []);
  var significativas = palavras.filter(function (p) {
    return PALAVRAS_GENERICAS.indexOf(normalizar_(p)) === -1;
  });
  var escolhidas = (significativas.length ? significativas : palavras).slice(0, 2);
  var slug = normalizar_(escolhidas.join('_'));
  // normalizar_ come o "_": remonta a partir das palavras já normalizadas
  slug = escolhidas.map(normalizar_).filter(String).join('_');
  return slug || 'EMPRESA';
}

/** Nome da pasta do cliente: sem acento, maiúsculas, sem sufixo societário. */
function nomePasta(razaoSocial) {
  var texto = String(razaoSocial).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ').toUpperCase();
  var palavras = texto.split(/\s+/).filter(function (p) {
    return p && SUFIXOS_SOCIETARIOS.indexOf(p.replace(/^[.\-]+|[.\-]+$/g, '')) === -1;
  });
  return palavras.join(' ').replace(/^[\s.\-]+|[\s.\-]+$/g, '') || texto.trim();
}

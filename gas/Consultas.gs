/**
 * Consultas.gs — Receita Federal, via UrlFetchApp.
 *
 * Duas fontes, como no Python:
 *   a) BrasilAPI  — dados cadastrais (razão social, CNAE, endereço, porte).
 *   b) Consulta oficial do Simples Nacional — a fonte que o escritório já
 *      usa; tem prioridade sobre o campo opcao_pelo_simples da BrasilAPI.
 *
 * Nenhuma consulta que falha vira dado inventado: o erro sobe no objeto e
 * a ficha imprime "(não consultado)" com o registro no alerta.
 */

/** Consulta cadastral na BrasilAPI. Nunca lança: devolve .erro preenchido. */
function consultarCnpj(cnpj) {
  var digitos = apenasDigitos_(cnpj);
  var vazio = {
    cnpj: cnpj, razaoSocial: null, nomeFantasia: null, situacaoCadastral: null,
    dataInicioAtividade: null, cnaeCodigo: null, cnaeDescricao: null,
    cnaesSecundarios: [], naturezaJuridica: null, porte: null, municipio: null,
    uf: null, bairro: null, endereco: null, optanteSimples: null, optanteMei: null,
    erro: null
  };

  if (digitos.length !== 14) {
    vazio.erro = 'CNPJ com ' + digitos.length + ' dígitos — esperado 14';
    return vazio;
  }

  try {
    var resposta = UrlFetchApp.fetch(URL_BRASILAPI + digitos, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true
    });
    var codigo = resposta.getResponseCode();
    if (codigo !== 200) {
      vazio.erro = 'BrasilAPI respondeu HTTP ' + codigo;
      return vazio;
    }
    var d = JSON.parse(resposta.getContentText());
    return {
      cnpj: cnpj,
      razaoSocial: d.razao_social || null,
      nomeFantasia: d.nome_fantasia || null,
      situacaoCadastral: d.descricao_situacao_cadastral || null,
      dataInicioAtividade: formatarDataIso_(d.data_inicio_atividade),
      cnaeCodigo: d.cnae_fiscal ? String(d.cnae_fiscal) : null,
      cnaeDescricao: d.cnae_fiscal_descricao || null,
      cnaesSecundarios: (d.cnaes_secundarios || [])
        .filter(function (c) { return c && c.codigo; })
        .map(function (c) { return { codigo: String(c.codigo), descricao: c.descricao || '' }; }),
      naturezaJuridica: d.natureza_juridica || null,
      porte: d.porte || null,
      municipio: d.municipio || null,
      uf: d.uf || null,
      bairro: d.bairro || null,
      endereco: montarEndereco_(d),
      optanteSimples: typeof d.opcao_pelo_simples === 'boolean' ? d.opcao_pelo_simples : null,
      optanteMei: typeof d.opcao_pelo_mei === 'boolean' ? d.opcao_pelo_mei : null,
      erro: null
    };
  } catch (e) {
    vazio.erro = String(e && e.message ? e.message : e);
    return vazio;
  }
}

function formatarDataIso_(valor) {
  if (!valor) return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(valor);
}

function montarEndereco_(d) {
  var partes = [d.logradouro, d.numero, d.complemento, d.bairro, d.municipio, d.uf, d.cep];
  return partes.filter(String).join(', ') || null;
}

/**
 * Consulta oficial de opção pelo Simples Nacional.
 *
 * A página é um ASP.NET WebForms clássico: precisa devolver os campos
 * ocultos (__VIEWSTATE e companhia) no POST. Em vez de fixar os nomes dos
 * campos "na marra", descobrimos o campo do CNPJ, o botão e os ocultos no
 * próprio HTML a cada consulta — assim uma mudança de layout degrada para
 * "não consultado" em vez de devolver resposta errada.
 *
 * @return {{cnpj, optante: ?boolean, mensagem: ?string, erro: ?string}}
 */
function consultarOptanteSimples(cnpj) {
  var r = { cnpj: cnpj, optante: null, mensagem: null, erro: null };
  var digitos = apenasDigitos_(cnpj);
  if (digitos.length !== 14) {
    r.erro = 'CNPJ inválido para a consulta oficial';
    return r;
  }

  try {
    var get = UrlFetchApp.fetch(URL_SIMPLES_RFB, { muteHttpExceptions: true, followRedirects: true });
    if (get.getResponseCode() !== 200) {
      r.erro = 'A página da Receita respondeu HTTP ' + get.getResponseCode();
      return r;
    }
    var html = get.getContentText();
    var cookies = (get.getAllHeaders()['Set-Cookie'] || []);
    if (typeof cookies === 'string') cookies = [cookies];

    var inputs = extrairInputs_(html);
    var campoCnpj = descobrirCampoCnpj_(inputs);
    if (!campoCnpj) {
      r.erro = 'Não consegui identificar o campo de CNPJ na página da Receita';
      return r;
    }

    var payload = {};
    Object.keys(inputs).forEach(function (nome) {
      if (/^__/.test(nome)) payload[nome] = inputs[nome];      // __VIEWSTATE etc.
    });
    payload[campoCnpj] = digitos;
    var botao = descobrirBotao_(html);
    if (botao) payload[botao.nome] = botao.valor;

    var post = UrlFetchApp.fetch(URL_SIMPLES_RFB, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        Cookie: cookies.map(function (c) { return c.split(';')[0]; }).join('; '),
        Referer: URL_SIMPLES_RFB
      }
    });
    if (post.getResponseCode() !== 200) {
      r.erro = 'A consulta respondeu HTTP ' + post.getResponseCode();
      return r;
    }
    return interpretarResultadoSimples_(post.getContentText(), r);
  } catch (e) {
    r.erro = String(e && e.message ? e.message : e);
    return r;
  }
}

function extrairInputs_(html) {
  var inputs = {};
  var re = /<input\b[^>]*>/gi;
  var tag;
  while ((tag = re.exec(html)) !== null) {
    var nome = /name\s*=\s*["']([^"']+)["']/i.exec(tag[0]);
    if (!nome) continue;
    var valor = /value\s*=\s*["']([^"']*)["']/i.exec(tag[0]);
    inputs[nome[1]] = valor ? valor[1] : '';
  }
  return inputs;
}

function descobrirCampoCnpj_(inputs) {
  var nomes = Object.keys(inputs).filter(function (n) { return !/^__/.test(n); });
  var porNome = nomes.filter(function (n) { return /cnpj/i.test(n); });
  if (porNome.length) return porNome[0];
  // Sem "cnpj" no nome: o primeiro campo de texto costuma ser ele.
  return nomes.length ? nomes[0] : null;
}

function descobrirBotao_(html) {
  var re = /<input\b[^>]*type\s*=\s*["'](?:submit|button)["'][^>]*>/gi;
  var tag;
  while ((tag = re.exec(html)) !== null) {
    var nome = /name\s*=\s*["']([^"']+)["']/i.exec(tag[0]);
    if (nome) {
      var valor = /value\s*=\s*["']([^"']*)["']/i.exec(tag[0]);
      return { nome: nome[1], valor: valor ? valor[1] : '' };
    }
  }
  return null;
}

function interpretarResultadoSimples_(html, r) {
  var texto = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');
  var semAcento = normalizarLivre_(texto);

  if (/nao optante pelo simples|nao e optante pelo simples|nao consta como optante/.test(semAcento)) {
    r.optante = false;
    r.mensagem = 'Não optante pelo Simples Nacional (confirmado na Receita).';
    return r;
  }
  if (/optante pelo simples nacional|e optante pelo simples/.test(semAcento)) {
    r.optante = true;
    r.mensagem = 'Optante pelo Simples Nacional (confirmado na Receita).';
    return r;
  }
  if (/nao existe|nao foi encontrado|inexistente/.test(semAcento)) {
    r.erro = 'A Receita não encontrou esse CNPJ na consulta do Simples';
    return r;
  }
  r.erro = 'Não consegui interpretar o resultado da consulta oficial';
  return r;
}

/**
 * Comprovante.gs — lê o "COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL"
 * da Receita (o Cartão CNPJ).
 *
 * Por que existe: a BrasilAPI serve o dump de dados abertos da RFB, que
 * atrasa semanas, e devolve 404 justamente para a empresa recém-aberta que
 * a Thays acabou de mandar. O comprovante que ela envia junto tem os mesmos
 * campos, é documento oficial e não depende de rede nenhuma.
 *
 * O que ele NÃO traz é a opção pelo Simples Nacional — essa continua sendo
 * consulta (Consultas.gs).
 *
 * Como o parsing funciona: o documento é uma sequência de rótulos em caixa
 * alta, cada um seguido do seu valor. Em vez de contar linhas — que variam
 * conforme o PDF é convertido em texto —, localizamos os rótulos conhecidos
 * e tomamos como valor tudo que existe entre um rótulo e o próximo. Assim
 * tanto faz o valor estar na linha seguinte ou logo após o rótulo.
 */

/** Rótulos do documento, na ordem em que aparecem. */
var ROTULOS_COMPROVANTE = [
  'NÚMERO DE INSCRIÇÃO',
  'COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL',
  'DATA DE ABERTURA',
  'NOME EMPRESARIAL',
  'TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)',
  'PORTE',
  'CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL',
  'CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS',
  'CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA',
  'LOGRADOURO',
  'NÚMERO',
  'COMPLEMENTO',
  'CEP',
  'BAIRRO/DISTRITO',
  'MUNICÍPIO',
  'UF',
  'ENDEREÇO ELETRÔNICO',
  'TELEFONE',
  'ENTE FEDERATIVO RESPONSÁVEL (EFR)',
  'SITUAÇÃO CADASTRAL',
  'DATA DA SITUAÇÃO CADASTRAL',
  'MOTIVO DE SITUAÇÃO CADASTRAL',
  'SITUAÇÃO ESPECIAL',
  'DATA DA SITUAÇÃO ESPECIAL'
];

/** Marca de "não informado" usada pela Receita no próprio documento. */
var VAZIO_RFB = /^[*\-\s]*$/;

var RE_CNPJ_COMPROVANTE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
var RE_DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;
var RE_CNAE = /(\d{2}\.\d{2}-\d-\d{2})\s*[-–]?\s*(.*)/;

/**
 * O CNPJ é válido pelos dígitos verificadores?
 *
 * Existe por causa do OCR: o comprovante da Thays vem como imagem, e o
 * reconhecimento troca 8 por B, 0 por O, 1 por 7. Um CNPJ lido errado viraria
 * ficha errada, pasta errada e linha errada na carteira. O dígito verificador
 * pega quase toda troca de um algarismo — e o que ele não pegar, pega o
 * confronto com o CNPJ que a Thays digitou no corpo do e-mail.
 */
function cnpjValido(cnpj) {
  var d = apenasDigitos_(cnpj);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;  // 00000000000000 e afins

  function digito(ate) {
    var peso = ate - 7;
    var soma = 0;
    for (var i = 0; i < ate; i++) {
      soma += parseInt(d.charAt(i), 10) * peso;
      peso--;
      if (peso < 2) peso = 9;
    }
    var resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  return digito(12) === parseInt(d.charAt(12), 10) &&
    digito(13) === parseInt(d.charAt(13), 10);
}

/** Um texto contém um comprovante? */
function temComprovante(texto) {
  var t = normalizarLivre_(texto);
  return t.indexOf('comprovante de inscricao') !== -1 ||
    (t.indexOf('numero de inscricao') !== -1 && t.indexOf('situacao cadastral') !== -1);
}

function limparValor_(valor) {
  var v = String(valor || '').replace(/\s+/g, ' ').trim();
  // Colado no e-mail o rótulo vem como "PORTE: EPP"; o separador não é valor.
  v = v.replace(/^[:\-–—]\s*/, '').trim();
  return VAZIO_RFB.test(v) ? '' : v;
}

/**
 * Corta o texto nos rótulos conhecidos.
 * @return {Object} {rótulo: valor bruto}
 */
function fatiarPorRotulos_(texto) {
  var achados = [];
  ROTULOS_COMPROVANTE.forEach(function (rotulo) {
    // Rótulo com acento inconsistente entre conversores: comparamos sem acento.
    var alvo = normalizarLivre_(rotulo);
    var corpo = normalizarLivre_(texto);
    var de = 0;
    while (true) {
      var pos = corpo.indexOf(alvo, de);
      if (pos === -1) break;
      achados.push({ rotulo: rotulo, inicio: pos, fim: pos + alvo.length });
      de = pos + alvo.length;
    }
  });

  // Vários rótulos contêm outros: "SITUAÇÃO CADASTRAL" está dentro de "DATA
  // DA SITUAÇÃO CADASTRAL" e de "MOTIVO DE SITUAÇÃO CADASTRAL"; "NÚMERO"
  // está dentro de "NÚMERO DE INSCRIÇÃO". Sem tratar isso, o rótulo curto
  // casa no lugar do longo e o valor sai errado — ou vazio. Quando dois
  // achados se sobrepõem, vence o mais longo.
  achados.sort(function (a, b) {
    return a.inicio - b.inicio || (b.fim - b.inicio) - (a.fim - a.inicio);
  });
  achados = achados.filter(function (a) {
    return !achados.some(function (outro) {
      return outro !== a && outro.inicio <= a.inicio && outro.fim >= a.fim &&
        (outro.fim - outro.inicio) > (a.fim - a.inicio);
    });
  });

  var campos = {};
  achados.forEach(function (a, i) {
    var ate = i + 1 < achados.length ? achados[i + 1].inicio : texto.length;
    // Só o primeiro valor de cada rótulo interessa; repetição vem de rodapé.
    if (campos[a.rotulo] === undefined) {
      campos[a.rotulo] = texto.slice(a.fim, ate);
    }
  });
  return campos;
}

function separarCnae_(bruto) {
  var linhas = String(bruto || '').split(/[\n;]/).map(function (l) { return l.trim(); });
  var saida = [];
  linhas.forEach(function (linha) {
    var m = RE_CNAE.exec(linha);
    if (m) saida.push({ codigo: apenasDigitos_(m[1]), descricao: limparValor_(m[2]) });
  });
  return saida;
}

/**
 * Lê um comprovante e devolve o mesmo formato de `consultarCnpj()`, para
 * que o resto do app não precise saber de onde o dado veio.
 *
 * @param {string} texto  o comprovante, do corpo do e-mail ou de um PDF
 * @return {?Object} null se o texto não for um comprovante
 */
function lerComprovante(texto) {
  if (!texto || !temComprovante(texto)) return null;

  var campos = fatiarPorRotulos_(texto);
  var mCnpj = RE_CNPJ_COMPROVANTE.exec(campos['NÚMERO DE INSCRIÇÃO'] || texto);
  if (!mCnpj) return null;

  // Campos que o OCR costuma estragar: conferimos o formato e avisamos, em
  // vez de gravar um valor que parece certo e não é.
  var avisos = [];
  if (!cnpjValido(mCnpj[0])) {
    avisos.push('o CNPJ lido (' + mCnpj[0] + ') não passa no dígito verificador — ' +
      'provável erro de leitura da imagem');
  }

  var principal = separarCnae_(campos['CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL'])[0];
  var municipio = limparValor_(campos['MUNICÍPIO']);
  var uf = limparValor_(campos['UF']).toUpperCase().slice(0, 2);

  var endereco = [
    limparValor_(campos['LOGRADOURO']), limparValor_(campos['NÚMERO']),
    limparValor_(campos['COMPLEMENTO']), limparValor_(campos['BAIRRO/DISTRITO']),
    municipio, uf, limparValor_(campos['CEP'])
  ].filter(String).join(', ');

  var abertura = limparValor_(campos['DATA DE ABERTURA']) || null;
  if (abertura && !RE_DATA_BR.test(abertura)) {
    avisos.push('data de abertura ilegível ("' + abertura + '")');
    abertura = null;
  }
  var dataSituacao = limparValor_(campos['DATA DA SITUAÇÃO CADASTRAL']) || null;
  if (dataSituacao && !RE_DATA_BR.test(dataSituacao)) dataSituacao = null;

  var razao = limparValor_(campos['NOME EMPRESARIAL']) || null;
  if (!razao) avisos.push('não consegui ler o nome empresarial');
  if (!principal) avisos.push('não consegui ler o CNAE principal');

  return {
    cnpj: mCnpj[0],
    cnpjValido: cnpjValido(mCnpj[0]),
    avisos: avisos,
    razaoSocial: razao,
    nomeFantasia: limparValor_(campos['TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)']) || null,
    situacaoCadastral: limparValor_(campos['SITUAÇÃO CADASTRAL']) || null,
    dataSituacaoCadastral: dataSituacao,
    dataInicioAtividade: abertura,
    cnaeCodigo: principal ? principal.codigo : null,
    cnaeDescricao: principal ? principal.descricao : null,
    cnaesSecundarios: separarCnae_(campos['CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS']),
    naturezaJuridica: limparValor_(campos['CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA']) || null,
    porte: limparValor_(campos['PORTE']) || null,
    municipio: municipio || null,
    uf: uf || null,
    bairro: limparValor_(campos['BAIRRO/DISTRITO']) || null,
    endereco: endereco || null,
    // O comprovante NÃO informa opção pelo Simples nem pelo MEI. Deixar
    // null é o que faz a consulta oficial continuar valendo.
    optanteSimples: null,
    optanteMei: null,
    fonte: 'Comprovante RFB',
    naoEncontrado: false,
    erro: null
  };
}

/**
 * Acha todos os comprovantes de um texto — a Thays cola um por empresa na
 * mesma mensagem.
 * @return {Object} {cnpj só dígitos: dados}
 */
function lerComprovantesDoTexto(texto) {
  var porCnpj = {};
  if (!texto) return porCnpj;

  // Cada comprovante começa no cabeçalho do documento; cortamos ali para
  // que os rótulos de um não sejam lidos como valores do anterior.
  var marcas = [];
  var corpo = normalizarLivre_(texto);
  var alvo = 'numero de inscricao';
  var de = 0;
  while (true) {
    var pos = corpo.indexOf(alvo, de);
    if (pos === -1) break;
    marcas.push(pos);
    de = pos + alvo.length;
  }

  marcas.forEach(function (inicio, i) {
    var fim = i + 1 < marcas.length ? marcas[i + 1] : texto.length;
    var dados = lerComprovante(texto.slice(inicio, fim));
    if (dados) {
      var chave = apenasDigitos_(dados.cnpj);
      if (!porCnpj[chave]) porCnpj[chave] = dados;
    }
  });
  return porCnpj;
}

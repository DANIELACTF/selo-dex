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
var RE_CNAE = /(\d{2}\.\d{2}-\d-\d{2})\s*[-–]?\s*(.*)/;

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

  var principal = separarCnae_(campos['CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL'])[0];
  var municipio = limparValor_(campos['MUNICÍPIO']);
  var uf = limparValor_(campos['UF']).toUpperCase().slice(0, 2);

  var endereco = [
    limparValor_(campos['LOGRADOURO']), limparValor_(campos['NÚMERO']),
    limparValor_(campos['COMPLEMENTO']), limparValor_(campos['BAIRRO/DISTRITO']),
    municipio, uf, limparValor_(campos['CEP'])
  ].filter(String).join(', ');

  return {
    cnpj: mCnpj[0],
    razaoSocial: limparValor_(campos['NOME EMPRESARIAL']) || null,
    nomeFantasia: limparValor_(campos['TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)']) || null,
    situacaoCadastral: limparValor_(campos['SITUAÇÃO CADASTRAL']) || null,
    dataSituacaoCadastral: limparValor_(campos['DATA DA SITUAÇÃO CADASTRAL']) || null,
    dataInicioAtividade: limparValor_(campos['DATA DE ABERTURA']) || null,
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

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

/**
 * Marcas que denunciam um comprovante, mesmo com o OCR estragando tudo em
 * volta. Comparamos sem acento e em minúsculas, e aceitamos pedaços: o OCR
 * entrega coisas como "COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO! osmazoz".
 */
var MARCAS_COMPROVANTE = ['comprovante de inscricao', 'situacao cadastral',
  'atividade economica principal', 'natureza juridica'];

/**
 * CNAE. O OCR troca hífen por ponto à vontade — "68.10-2.01" no lugar de
 * "68.10-2-01" —, então os separadores são todos opcionais entre - e .
 */
var RE_CNAE_OCR = /(\d{2})\s*[.\-]\s*(\d{2})\s*[.\-]\s*(\d)\s*[.\-]\s*(\d{2})\s*[-–]?\s*([^\n]*)/g;

/** Natureza jurídica: "206-2 - Sociedade Empresária Limitada". */
var RE_NATUREZA = /\b(\d{3})\s*[-.]\s*(\d)\s*[-–]\s*([^\n]{4,80})/;

/** CEP: "25.260-440". */
var RE_CEP = /\b(\d{2}\.\d{3}\s*-\s*\d{3})\b/;

/** UF no fim de uma linha de endereço: "... DUQUE DE CAXIAS RJ". */
var RE_MUNICIPIO_UF = /([A-ZÀ-Ü][A-ZÀ-Ü\s'´`^~.-]{3,40}?)\s+([A-Z]{2})\s*$/m;

var UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

var PORTES = ['DEMAIS', 'ME', 'EPP', 'MEI'];

var RE_DATA_BR = /\b(\d{2}\/\d{2}\/\d{4})\b/;
var RE_SITUACAO = /\b(ATIVA|BAIXADA|SUSPENSA|INAPTA|NULA)\b/;

/** Linha que é rótulo do documento ou do e-mail, não conteúdo. */
var RE_ROTULO_DO_DOC = new RegExp([
  'comprovante', 'inscricao', 'cadastral', 'empresarial', 'estabelecimento',
  'fantasia', 'atividade', 'economica', 'natureza', 'juridica', 'logradouro',
  'numero', 'complemento', 'bairro', 'municipio', 'porte', 'matriz', 'filial',
  'e mail', 'cnpj', 'republica', 'federativa', 'telefone', 'ente federativo',
  'situacao', 'distrito', 'outlook'
].join('|'));

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

/**
 * Um texto contém um comprovante?
 *
 * Duas marcas bastam: uma sozinha pode ser coincidência do e-mail, e exigir
 * todas quebraria com o OCR comendo pedaços.
 */
function temComprovante(texto) {
  var t = normalizarLivre_(texto).replace(/\s+/g, ' ');
  var achadas = MARCAS_COMPROVANTE.filter(function (m) { return t.indexOf(m) !== -1; });
  return achadas.length >= 2;
}

function limparValor_(valor) {
  var v = String(valor || '').replace(/\s+/g, ' ').trim();
  v = v.replace(/^[:\-–—|\[\]]+\s*/, '').replace(/[\[\]|]+$/, '').trim();
  // "********" e variações que o OCR produz a partir delas.
  return /^[*\-_.\s]*$/.test(v) || /^e{3,}/i.test(v) ? '' : v;
}

/** Todos os CNAEs do trecho, na ordem em que aparecem. */
function acharCnaes_(texto) {
  var achados = [];
  var m;
  RE_CNAE_OCR.lastIndex = 0;
  while ((m = RE_CNAE_OCR.exec(texto)) !== null) {
    var descricao = limparValor_(m[5]);
    // Descrição vazia costuma ser cabeçalho ou lixo de OCR, não atividade.
    if (descricao.length < 4) continue;
    achados.push({ codigo: m[1] + m[2] + m[3] + m[4], descricao: descricao });
  }
  return achados;
}

/**
 * Lê o que dá para aproveitar de um comprovante escaneado.
 *
 * ATENÇÃO ao que isto é e ao que não é. Medido contra o OCR real de um
 * e-mail da Thays (fixtures/ocr/), o reconhecimento entrega bem os códigos
 * de CNAE — que são quase só dígitos — e, com sorte, natureza jurídica e
 * município. Rótulos e nomes saem destruídos: "NOME EMPRESARIAL" vira
 * "NOME LMIMESANIAL", e uma linha de endereço pode passar por razão social.
 *
 * Por isso este leitor é PISTA, não fonte: vem depois da consulta à Receita,
 * nunca por cima dela, não devolve razão social, e todo resultado carrega o
 * aviso de que precisa de conferência.
 *
 * Reconhece por PADRÃO, não por rótulo: o comprovante da Thays vem como
 * imagem dentro do PDF, e o OCR estraga os rótulos ("NOME EMPRESARIAL" vira
 * "NOME LMIMESANIAL", "NATUREZA JURÍDICA" vira "NATUNEZA JUNIUICA"). Códigos
 * de CNAE, natureza jurídica, CEP e UF sobrevivem porque são quase só
 * dígitos — e é neles que nos apoiamos.
 *
 * O CNPJ NÃO sai daqui: ele vem da linha do e-mail, que é texto de verdade e
 * passa pelo dígito verificador. Aqui o que importa é o resto.
 *
 * @param {string} texto  o trecho do documento referente a UMA empresa
 * @param {string=} cnpjDaEmpresa  o CNPJ já conhecido, do e-mail
 * @return {?Object} null se o trecho não for um comprovante
 */
function lerComprovante(texto, cnpjDaEmpresa) {
  if (!texto || !temComprovante(texto)) return null;

  var avisos = [];
  var cnaes = acharCnaes_(texto);
  var principal = cnaes.length ? cnaes[0] : null;
  var secundarios = cnaes.slice(1);
  if (!principal) avisos.push('não consegui ler o CNAE no comprovante');

  var mNatureza = RE_NATUREZA.exec(texto);
  var mCep = RE_CEP.exec(texto);
  var mSituacao = RE_SITUACAO.exec(texto.toUpperCase());
  var mData = RE_DATA_BR.exec(texto);

  var local = acharMunicipioUf_(texto);

  // Tudo que sai daqui veio de OCR de uma imagem e precisa de conferência —
  // dizer isso é parte do resultado, não um detalhe.
  avisos.push('dados lidos por OCR do comprovante — conferir antes de usar');

  return {
    cnpj: cnpjDaEmpresa || '',
    cnpjValido: cnpjDaEmpresa ? cnpjValido(cnpjDaEmpresa) : false,
    avisos: avisos,
    // A razão social NÃO sai do OCR: a linha do e-mail já traz o nome, é
    // texto de verdade, e uma leitura errada aqui contaminaria ficha, pasta
    // e carteira.
    razaoSocial: null,
    nomeFantasia: null,
    situacaoCadastral: mSituacao ? mSituacao[1] : null,
    dataSituacaoCadastral: mData ? mData[1] : null,
    dataInicioAtividade: mData ? mData[1] : null,
    cnaeCodigo: principal ? principal.codigo : null,
    cnaeDescricao: principal ? principal.descricao : null,
    cnaesSecundarios: secundarios,
    naturezaJuridica: mNatureza
      ? mNatureza[1] + '-' + mNatureza[2] + ' - ' + limparValor_(mNatureza[3]) : null,
    porte: acharPorte_(texto),
    municipio: local.municipio,
    uf: local.uf,
    bairro: null,
    endereco: mCep ? mCep[1].replace(/\s/g, '') +
      (local.municipio ? ', ' + local.municipio : '') + (local.uf ? ', ' + local.uf : '') : null,
    // O comprovante NÃO informa opção pelo Simples nem pelo MEI.
    optanteSimples: null,
    optanteMei: null,
    fonte: 'Comprovante RFB (OCR)',
    naoEncontrado: false,
    erro: null
  };
}

function acharMunicipioUf_(texto) {
  var m = RE_MUNICIPIO_UF.exec(texto);
  if (m && UFS.indexOf(m[2]) !== -1) {
    var municipio = limparValor_(m[1]);
    // O trecho antes da UF costuma trazer CEP e bairro grudados; fica a
    // última sequência de palavras, que é o município.
    var partes = municipio.split(/\s{2,}/);
    return { municipio: limparValor_(partes[partes.length - 1]) || null, uf: m[2] };
  }
  return { municipio: null, uf: null };
}

function acharPorte_(texto) {
  var linhas = String(texto).toUpperCase().split('\n');
  for (var i = 0; i < linhas.length; i++) {
    var limpa = limparValor_(linhas[i]);
    if (PORTES.indexOf(limpa) !== -1) return limpa === 'DEMAIS' ? 'DEMAIS' : limpa;
  }
  return null;
}

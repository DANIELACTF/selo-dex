/**
 * Testa a leitura do "COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL".
 *
 *   node --test tests/test_comprovante.mjs
 *
 * As amostras de fixtures/comprovantes/ são RECONSTRUÍDAS a partir do layout
 * padrão da Receita, com os dados reais da ficha 1099_THAIS_REIS. Ao receber
 * um comprovante de verdade, salve-o lá e rode isto: se algum rótulo tiver
 * mudado, o teste diz qual campo parou de sair.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const gas = { console };
vm.createContext(gas);
for (const arquivo of ['Config.gs', 'Competencia.gs', 'Parser.gs', 'Regras.gs', 'Comprovante.gs']) {
  vm.runInContext(fs.readFileSync(`gas/${arquivo}`, 'utf8'), gas, { filename: arquivo });
}

const planos = (v) => JSON.parse(JSON.stringify(v));
const amostra = (nome) => fs.readFileSync(`fixtures/comprovantes/${nome}.txt`, 'utf8');

const FORMATOS = ['1099-THAIS-REIS-linhas', '1099-THAIS-REIS-inline'];

// O que a ficha real 1099_THAIS_REIS traz — é o gabarito.
const ESPERADO = {
  cnpj: '60.772.067/0001-76',
  razaoSocial: 'THAIS REIS DESIGN LTDA',
  nomeFantasia: null,
  dataInicioAtividade: '12/05/2025',
  porte: 'EPP',
  situacaoCadastral: 'ATIVA',
  dataSituacaoCadastral: '12/05/2025',
  cnaeCodigo: '8230001',
  cnaeDescricao: 'Serviços de organização de feiras, congressos, exposições e festas',
  naturezaJuridica: '206-2 - Sociedade Empresária Limitada',
  municipio: 'DUQUE DE CAXIAS',
  uf: 'RJ',
  bairro: 'CENTRO',
  fonte: 'Comprovante RFB'
};

for (const formato of FORMATOS) {
  test(`lê todos os campos — ${formato}`, () => {
    const d = gas.lerComprovante(amostra(formato));
    assert.ok(d, 'não reconheceu o comprovante');
    for (const [campo, valor] of Object.entries(ESPERADO)) {
      assert.equal(d[campo], valor, `campo ${campo}`);
    }
  });

  test(`lê os CNAEs secundários — ${formato}`, () => {
    const d = gas.lerComprovante(amostra(formato));
    assert.deepEqual(planos(d.cnaesSecundarios), [
      { codigo: '7820500', descricao: 'Locação de mão-de-obra temporária' },
      { codigo: '8230002', descricao: 'Casas de festas e eventos' }
    ]);
  });

  test(`monta o endereço completo — ${formato}`, () => {
    const d = gas.lerComprovante(amostra(formato));
    assert.equal(d.endereco,
      'R ALMIRANTE BARROSO, 31, CENTRO, DUQUE DE CAXIAS, RJ, 25.010-000');
  });
}

test('os dois formatos produzem exatamente o mesmo resultado', () => {
  assert.deepEqual(planos(gas.lerComprovante(amostra(FORMATOS[0]))),
    planos(gas.lerComprovante(amostra(FORMATOS[1]))));
});

// ------------------------------------------------- o que ele não inventa

test('não afirma opção pelo Simples — o comprovante não informa isso', () => {
  const d = gas.lerComprovante(amostra(FORMATOS[0]));
  assert.equal(d.optanteSimples, null);
  assert.equal(d.optanteMei, null);
});

test('asteriscos da Receita viram campo vazio, não texto', () => {
  const d = gas.lerComprovante(amostra(FORMATOS[0]));
  assert.equal(d.nomeFantasia, null, 'o "********" do fantasia deveria virar vazio');
  assert.ok(!/\*/.test(d.endereco), 'o complemento vazio não pode entrar no endereço');
});

test('texto que não é comprovante devolve null', () => {
  assert.equal(gas.lerComprovante('Segue novas empresas para cadastrar.'), null);
  assert.equal(gas.lerComprovante(''), null);
  assert.equal(gas.lerComprovante(null), null);
});

test('comprovante sem CNPJ legível devolve null, em vez de dado pela metade', () => {
  const sem = amostra(FORMATOS[0]).replace('60.772.067/0001-76', '(ilegível)');
  assert.equal(gas.lerComprovante(sem), null);
});

// -------------------------------------- rótulos que contêm outros rótulos

test('SITUAÇÃO CADASTRAL não é confundida com DATA DA SITUAÇÃO CADASTRAL', () => {
  const d = gas.lerComprovante(amostra(FORMATOS[0]));
  assert.equal(d.situacaoCadastral, 'ATIVA');
  assert.equal(d.dataSituacaoCadastral, '12/05/2025');
});

test('NÚMERO não engole NÚMERO DE INSCRIÇÃO', () => {
  const d = gas.lerComprovante(amostra(FORMATOS[0]));
  assert.equal(d.cnpj, '60.772.067/0001-76');
  assert.match(d.endereco, /BARROSO, 31,/);
});

// -------------------------------------------------- vários no mesmo texto

test('separa um comprovante por empresa na mesma mensagem', () => {
  const primeiro = amostra(FORMATOS[0]);
  const segundo = primeiro
    .replace('60.772.067/0001-76', '11.222.333/0001-44')
    .replace('THAIS REIS DESIGN LTDA', 'SEGUNDA EMPRESA LTDA')
    .replace('DUQUE DE CAXIAS', 'RIO DE JANEIRO')
    .replace('EPP', 'ME');

  const achados = gas.lerComprovantesDoTexto(primeiro + '\n\n' + segundo);
  assert.deepEqual(planos(Object.keys(achados)).sort(),
    ['11222333000144', '60772067000176']);
  assert.equal(achados['60772067000176'].razaoSocial, 'THAIS REIS DESIGN LTDA');
  assert.equal(achados['11222333000144'].razaoSocial, 'SEGUNDA EMPRESA LTDA');
  // o segundo não pode herdar município do primeiro
  assert.equal(achados['11222333000144'].municipio, 'RIO DE JANEIRO');
  assert.equal(achados['11222333000144'].porte, 'ME');
});

test('texto sem comprovante nenhum devolve mapa vazio', () => {
  assert.deepEqual(planos(gas.lerComprovantesDoTexto('EMPRESA NOVA\n\nSegue lista.')), {});
  assert.deepEqual(planos(gas.lerComprovantesDoTexto('')), {});
});

// ---------------------------------------------- o formato que a ficha usa

test('o resultado tem a mesma forma que o de uma consulta', () => {
  const doComprovante = gas.lerComprovante(amostra(FORMATOS[0]));
  const daConsulta = gas.dadosCadastraisVazios_ ? null : null;  // Consultas.gs não é carregado aqui
  for (const campo of ['cnpj', 'razaoSocial', 'nomeFantasia', 'situacaoCadastral',
    'dataInicioAtividade', 'cnaeCodigo', 'cnaeDescricao', 'cnaesSecundarios',
    'naturezaJuridica', 'porte', 'municipio', 'uf', 'bairro', 'endereco',
    'optanteSimples', 'optanteMei', 'fonte', 'naoEncontrado', 'erro']) {
    assert.ok(campo in doComprovante, `falta o campo ${campo}`);
  }
  assert.equal(doComprovante.erro, null);
  assert.equal(doComprovante.naoEncontrado, false);
});

test('o CNAE sai no formato que a ficha imprime', () => {
  const d = gas.lerComprovante(amostra(FORMATOS[0]));
  assert.equal(gas.formatarCodigoCnae(d.cnaeCodigo), '82.30-0-01');
  assert.equal(gas.formatarCnaePrincipal(d),
    '82.30-0-01 — Serviços de organização de feiras, congressos, exposições e festas');
  assert.equal(gas.formatarCnaesSecundarios(d), '78.20-5-00; 82.30-0-02');
});

test('a particularidade de empresa fora do RJ continua saindo', () => {
  const d = gas.lerComprovante(amostra(FORMATOS[0]));
  const b = gas.particularidades(
    { numero: '1099', regimeInformado: 'Lucro Presumido', emailContato: [] },
    d, '—', null, false, ['1099']
  );
  // Duque de Caxias é RJ, então não há alerta de UF; o que precisa sair é o
  // enquadramento correto a partir do CNAE lido do comprovante.
  assert.equal(gas.regimeEnquadramento('Lucro Presumido', d),
    'Lucro Presumido — PIS/COFINS cumulativo; IRPJ/CSLL trimestral');
  assert.ok(!b.some((x) => /não consta nas bases públicas/.test(x)),
    'com comprovante lido não deve haver aviso de base defasada');
});

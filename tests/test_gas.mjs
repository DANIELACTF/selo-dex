/**
 * Testa a lógica pura do app do Google Sheets (gas/*.gs) fora do Apps Script.
 *
 * Os arquivos .gs são JavaScript comum: dá para carregá-los num contexto de
 * VM do Node e rodar os mesmos casos que o pytest roda sobre o Python. O
 * teste mais forte aqui é o de paridade: o parser em JS tem que extrair
 * exatamente as mesmas empresas que o parser em Python extrai dos 5 e-mails
 * reais da Thays em fixtures/.
 *
 *   node --test tests/test_gas.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

// Consultas.gs entra aqui porque só toca UrlFetchApp dentro das funções: as
// partes puras (montagem da mensagem de erro, objeto vazio) são testáveis.
const ARQUIVOS = ['Config.gs', 'Competencia.gs', 'Parser.gs', 'Regras.gs', 'Consultas.gs'];
const gas = { console };
vm.createContext(gas);
for (const arquivo of ARQUIVOS) {
  vm.runInContext(fs.readFileSync(`gas/${arquivo}`, 'utf8'), gas, { filename: arquivo });
}

const FIXTURES = fs.readdirSync('fixtures').filter((f) => f.endsWith('.txt')).sort();

// ------------------------------------------------------------ competência

test('somar meses vira o ano', () => {
  assert.equal(gas.somarMeses('11/2026', 3), '02/2027');
  assert.equal(gas.somarMeses('12/2026', 1), '01/2027');
});

test('liberação é três competências depois da entrada', () => {
  assert.equal(gas.competenciaLiberacao('08/2026'), '11/2026');
  assert.equal(gas.MESES_CARENCIA, 3);
});

test('carência não vence antes da terceira competência', () => {
  assert.equal(gas.carenciaLiberada('08/2026', '10/2026'), false);
  assert.equal(gas.carenciaLiberada('08/2026', '11/2026'), true);
  assert.equal(gas.carenciaLiberada('08/2026', '12/2026'), true);
});

test('competências restantes zera depois de liberar', () => {
  assert.equal(gas.competenciasRestantes('08/2026', '09/2026'), 2);
  assert.equal(gas.competenciasRestantes('08/2026', '11/2026'), 0);
  assert.equal(gas.competenciasRestantes('08/2026', '12/2026'), 0);
});

for (const valor of ['13/2026', '2026/08', 'agosto', '', null]) {
  test(`competência inválida recusada: ${JSON.stringify(valor)}`, () => {
    assert.throws(() => gas.validarCompetencia(valor), /Competência inválida/);
  });
}

// ------------------------------------------------- paridade com o Python

function empresasPython(caminho) {
  const script = `
import json, sys
from onboarding.parser import parse_email, extrair_anexos_email, extrair_data_email
texto = open(sys.argv[1], encoding="utf-8").read()
print(json.dumps({
    "empresas": [
        {"numero": e.numero, "nome": e.nome, "cnpj": e.cnpj,
         "regime": e.regime_informado, "emails": e.email_contato,
         "senha": e.senha_certificado, "obs": e.observacao}
        for e in parse_email(texto)
    ],
    "anexos": extrair_anexos_email(texto),
    "data": extrair_data_email(texto),
}, ensure_ascii=False))`;
  return JSON.parse(execFileSync('python3', ['-c', script, caminho], { encoding: 'utf8' }));
}

// Objetos criados dentro do contexto da VM têm outro Object.prototype, e o
// deepStrictEqual compara protótipo. Passar por JSON iguala os realms sem
// afrouxar a comparação dos valores.
function planos(valor) {
  return JSON.parse(JSON.stringify(valor));
}

function empresasJs(caminho) {
  const texto = fs.readFileSync(caminho, 'utf8');
  return {
    empresas: gas.parseEmail(texto).map((e) => ({
      numero: e.numero, nome: e.nome, cnpj: e.cnpj,
      regime: e.regimeInformado, emails: e.emailContato,
      senha: e.senhaCertificado, obs: e.observacao
    })),
    anexos: gas.extrairAnexos(texto),
    data: gas.extrairDataEmail(texto)
  };
}

for (const nome of FIXTURES) {
  test(`parser JS bate com o parser Python — ${nome}`, () => {
    const caminho = `fixtures/${nome}`;
    assert.deepEqual(planos(empresasJs(caminho)), empresasPython(caminho));
  });
}

test('todos os e-mails reais produzem pelo menos uma empresa', () => {
  for (const nome of FIXTURES) {
    assert.ok(gas.parseEmail(fs.readFileSync(`fixtures/${nome}`, 'utf8')).length > 0, nome);
  }
});

// ------------------------------------------------------------ regras

test('matriz e filial pelos dígitos 9 a 12', () => {
  assert.equal(gas.tipoEstabelecimento('68.717.251/0001-25'), 'Matriz');
  assert.equal(gas.tipoEstabelecimento('68.717.251/0002-06'), 'Filial');
});

test('certificado casa pelo CNPJ no nome do arquivo', () => {
  const anexos = ['ENTRECARROS COMERCIO LTDA31909608000167.pfx', '170226042238ff60.pfx'];
  const r = gas.certificadoPresente('ENTRECARROS COMERCIO', '31.909.608/0001-67', anexos);
  assert.equal(r.ok, true);
  assert.equal(r.arquivo, anexos[0]);
});

test('certificado casa por prefixo quando o nome vem truncado', () => {
  const r = gas.certificadoPresente('MONTE BELVEDERE ENFESTA LTDA', '68.497.893/0001-66',
    ['MONTE BELVEDERE ENFESTA LTDA 2026-2027.pfx']);
  assert.equal(r.ok, true);
});

test('anexo de nome opaco fica sem dono', () => {
  const anexos = ['GA MITTELSTAEDT ESTETICA LTDA - senha 12345678.pfx', '170226042238ff60.pfx'];
  const r = gas.certificadoPresente('SONZEIRA PRODUCOES DE EVENTOS LTDA', '64.851.960/0001-48', anexos);
  assert.equal(r.ok, false);
  assert.deepEqual(planos(gas.anexosNaoIdentificados(anexos, [anexos[0]])), [anexos[1]]);
});

test('grupo econômico por raiz de CNPJ, com matriz no lote', () => {
  const empresas = [
    { nome: 'TATY COMERCIO LTDA', cnpj: '11.111.111/0001-11', observacao: null },
    { nome: 'TATY COMERCIO LTDA', cnpj: '11.111.111/0002-92', observacao: null }
  ];
  const tipos = ['Matriz', 'Filial'];
  assert.equal(gas.detectarGrupoEconomico(0, empresas, tipos), 'Taty (matriz+filial)');
});

test('grupo econômico só com filiais vira rede', () => {
  const empresas = [
    { nome: 'ERFOLG SERVICOS LTDA', cnpj: '22.222.222/0002-11', observacao: null },
    { nome: 'ERFOLG SERVICOS LTDA', cnpj: '22.222.222/0003-02', observacao: null }
  ];
  assert.equal(gas.detectarGrupoEconomico(0, empresas, ['Filial', 'Filial']), 'Erfolg (rede)');
});

test('observação da Thays manda no grupo', () => {
  const empresas = [{ nome: 'X LTDA', cnpj: '33.333.333/0001-33', observacao: 'Obs. mesmo grupo da ERFOLG.' }];
  assert.equal(gas.detectarGrupoEconomico(0, empresas, ['Matriz']), 'ERFOLG');
});

test('empresa sozinha não tem grupo', () => {
  const empresas = [{ nome: 'X LTDA', cnpj: '33.333.333/0001-33', observacao: null }];
  assert.equal(gas.detectarGrupoEconomico(0, empresas, ['Matriz']), '—');
});

test('regime de serviço sujeito a Fator R vira lembrete de conferência', () => {
  const dados = { cnaeDescricao: 'Atividades de consultoria em gestão empresarial' };
  assert.match(gas.regimeEnquadramento('Simples Nacional', dados), /Fator R/);
});

test('regime de comércio no Simples pede confirmação de anexo', () => {
  const dados = { cnaeDescricao: 'Comércio varejista de bebidas' };
  assert.equal(gas.regimeEnquadramento('Simples Nacional', dados), 'Simples Nacional — confirmar anexo pela atividade');
});

test('MEI não duplica a palavra regime', () => {
  assert.equal(gas.regimeEnquadramento('MEI', {}), 'MEI — DAS-MEI fixo mensal');
});

test('regime não informado vira A definir', () => {
  assert.match(gas.regimeEnquadramento(null, {}), /^A definir/);
});

test('divergência: informou Presumido mas consta no Simples', () => {
  const d = gas.checarDivergencia('Lucro Presumido', { optanteSimples: true }, null);
  assert.match(d, /consta como optante pelo Simples/);
});

test('divergência: informou Simples mas a Receita não confirma', () => {
  const d = gas.checarDivergencia('Simples Nacional', { optanteSimples: false }, null);
  assert.match(d, /não confirma/);
});

test('consulta oficial tem prioridade sobre a BrasilAPI', () => {
  const dados = { optanteSimples: false };
  const simples = { optante: true };
  assert.equal(gas.optanteSimplesResolvido(dados, simples), true);
  assert.match(gas.checarDivergencia('Lucro Real', dados, simples), /optante pelo Simples/);
});

test('sem dado nenhum não inventa divergência', () => {
  assert.equal(gas.checarDivergencia('Lucro Real', { optanteSimples: null }, null), null);
  assert.equal(gas.checarDivergencia(null, { optanteSimples: true }, null), null);
});

test('particularidades marcam ATENÇÃO fora do RJ e no máximo 5 bullets', () => {
  const empresa = { numero: '1091', regimeInformado: 'Simples Nacional', emailContato: ['a@b.com'] };
  const dados = { municipio: 'São Paulo', uf: 'SP', cnaeDescricao: 'Comércio varejista',
    naturezaJuridica: 'Empresário (Individual)', erro: null };
  const b = gas.particularidades(empresa, dados, 'Taty (matriz+filial)', 'divergiu', true, ['1091']);
  assert.ok(b.length <= 5);
  assert.ok(b.some((x) => /ATENÇÃO/.test(x) && /SP/.test(x)));
  assert.ok(b.some((x) => /EMPRESÁRIO INDIVIDUAL/.test(x)));
});

test('N° fora da série atual é apontado', () => {
  const empresa = { numero: '717', regimeInformado: null, emailContato: [] };
  const b = gas.particularidades(empresa, { erro: null }, '—', null, false, ['717', '1091']);
  assert.ok(b.some((x) => /fora da série atual/.test(x)));
});

test('falha de consulta entra nas particularidades em vez de inventar dado', () => {
  const empresa = { numero: '1091', regimeInformado: null, emailContato: [] };
  const b = gas.particularidades(empresa, { erro: 'timeout' }, '—', null, false, ['1091']);
  assert.match(b[0], /não confirmados automaticamente/);
});

// ------------------------------------------------------------ nomes

test('CNAE sai formatado como na ficha', () => {
  assert.equal(gas.formatarCodigoCnae('4723700'), '47.23-7-00');
});

test('slug da ficha ignora palavras genéricas', () => {
  assert.equal(gas.slugFicha('C LORENA DISTRIBUIDORA DE BEBIDAS LTDA'), 'C_LORENA');
  assert.equal(gas.slugFicha('GRÁFICA SQUARE SERVIÇOS LTDA'), 'GRAFICA_SQUARE');
});

test('nome da pasta sem acento e sem sufixo societário', () => {
  assert.equal(gas.nomePasta('INJECT PHARMA MANIPULAÇÃO EIRELI'), 'INJECT PHARMA MANIPULACAO');
  assert.equal(gas.nomePasta('C LORENA DISTRIBUIDORA LTDA'), 'C LORENA DISTRIBUIDORA');
});

// ------------------------------------------- integridade do projeto GAS

/**
 * Carrega TODOS os .gs num contexto com dublês dos serviços do Google, só
 * para provar que o projeto é sintaticamente válido e que todo item de
 * menu aponta para uma função que existe. Um `addItem` com nome errado só
 * daria erro na cara do usuário, no clique.
 */
function carregarProjetoCompleto() {
  const itensDeMenu = [];
  const menuFalso = {
    addItem: (rotulo, funcao) => { itensDeMenu.push({ rotulo, funcao }); return menuFalso; },
    addSeparator: () => menuFalso,
    addSubMenu: () => menuFalso,
    addToUi: () => menuFalso
  };
  const ctx = {
    console,
    SpreadsheetApp: {
      getUi: () => ({ createMenu: () => menuFalso, alert: () => {}, prompt: () => {}, ButtonSet: {}, Button: {} }),
      getActiveSpreadsheet: () => ({}),
      newDataValidation: () => ({}),
      newConditionalFormatRule: () => ({}),
      BorderStyle: { SOLID: 'SOLID' }
    },
    DriveApp: {}, UrlFetchApp: {}, Utilities: {}, HtmlService: {}, Session: {}
  };
  vm.createContext(ctx);
  for (const arquivo of fs.readdirSync('gas').filter((f) => f.endsWith('.gs')).sort()) {
    vm.runInContext(fs.readFileSync(`gas/${arquivo}`, 'utf8'), ctx, { filename: arquivo });
  }
  ctx.onOpen();
  return { ctx, itensDeMenu };
}

test('todo arquivo .gs é JavaScript válido e carrega junto', () => {
  const { itensDeMenu } = carregarProjetoCompleto();
  assert.ok(itensDeMenu.length >= 7, 'o menu deveria ter as etapas 1 a 5 mais as consultas');
});

test('todo item de menu aponta para uma função que existe', () => {
  const { ctx, itensDeMenu } = carregarProjetoCompleto();
  for (const item of itensDeMenu) {
    assert.equal(typeof ctx[item.funcao], 'function',
      `o item "${item.rotulo}" chama ${item.funcao}(), que não existe`);
  }
});

test('a barra lateral chama uma função que existe', () => {
  const { ctx } = carregarProjetoCompleto();
  const html = fs.readFileSync('gas/Sidebar.html', 'utf8');
  // Percorre a cadeia iniciada em google.script.run contando parênteses e
  // chaves: só conta como elo o ".nome(" que aparece com profundidade zero.
  // Assim o corpo multilinha de um handler (com .replace(), getElementById()
  // e afins lá dentro) não é confundido com chamada ao servidor.
  const WRAPPERS = ['withSuccessHandler', 'withFailureHandler', 'withUserObject'];
  const chamadas = [];
  let inicio = html.indexOf('google.script.run');
  while (inicio !== -1) {
    let profundidade = 0;
    for (let i = inicio + 'google.script.run'.length; i < html.length; i++) {
      const c = html[i];
      if (c === '(' || c === '{') profundidade++;
      else if (c === ')' || c === '}') profundidade--;
      else if (profundidade === 0 && c === ';') break;
      else if (profundidade === 0 && c === '.') {
        const elo = /^\.(\w+)\s*\(/.exec(html.slice(i));
        if (elo && !WRAPPERS.includes(elo[1])) chamadas.push(elo[1]);
      }
    }
    inicio = html.indexOf('google.script.run', inicio + 1);
  }
  assert.ok(chamadas.length > 0, 'a barra lateral não chama nada no servidor');
  for (const nome of chamadas) {
    assert.equal(typeof ctx[nome], 'function', `Sidebar.html chama ${nome}(), que não existe`);
  }
});

test('o appsscript.json declara os escopos que o app usa', () => {
  const manifesto = JSON.parse(fs.readFileSync('gas/appsscript.json', 'utf8'));
  for (const escopo of ['drive', 'script.external_request', 'script.container.ui']) {
    assert.ok(manifesto.oauthScopes.some((s) => s.includes(escopo)), `falta o escopo ${escopo}`);
  }
  assert.equal(manifesto.runtimeVersion, 'V8');
});

test('a carência do app bate com a do Python', () => {
  const py = execFileSync('python3',
    ['-c', 'from onboarding.competencia import MESES_CARENCIA; print(MESES_CARENCIA)'],
    { encoding: 'utf8' }).trim();
  assert.equal(String(gas.MESES_CARENCIA), py);
});

test('a equipe do app bate com a do Python', () => {
  const py = JSON.parse(execFileSync('python3',
    ['-c', 'import json; from onboarding.planilha_particularidades import ANALISTAS; print(json.dumps(ANALISTAS))'],
    { encoding: 'utf8' }));
  assert.deepEqual(planos(gas.ANALISTAS), py);
});

test('as colunas do formulário batem com as do Python', () => {
  const py = JSON.parse(execFileSync('python3',
    ['-c', 'import json; from onboarding.planilha_particularidades import COLUNAS; print(json.dumps([c[0] for c in COLUNAS]))'],
    { encoding: 'utf8' }));
  assert.deepEqual(planos(gas.COLS_PARTICULARIDADES.map((c) => c.titulo)), py);
});

// --------------------------------------- CNPJ não encontrado nas bases

test('404 da BrasilAPI é tratado como base defasada, não como falha', () => {
  const dados = gas.dadosCadastraisVazios_('68.497.893/0001-66', null);
  dados.naoEncontrado = true;
  const b = gas.particularidades(
    { numero: '1077', regimeInformado: 'Lucro Presumido', emailContato: [] },
    dados, '—', null, false, ['1077']
  );
  assert.match(b[0], /ainda não consta nas bases públicas/);
  assert.match(b[0], /comprovante de inscrição/);
  assert.doesNotMatch(b[0], /falha ao consultar/);
});

test('erro que não é 404 continua sendo reportado como falha', () => {
  const dados = gas.dadosCadastraisVazios_('68.497.893/0001-66', 'BrasilAPI respondeu HTTP 500');
  const b = gas.particularidades(
    { numero: '1077', regimeInformado: null, emailContato: [] },
    dados, '—', null, false, ['1077']
  );
  assert.match(b[0], /falha ao consultar a Receita: BrasilAPI respondeu HTTP 500/);
});

test('o objeto vazio tem todos os campos que a ficha lê', () => {
  const dados = gas.dadosCadastraisVazios_('11.111.111/0001-11', 'motivo');
  for (const campo of ['razaoSocial', 'situacaoCadastral', 'dataInicioAtividade', 'cnaeCodigo',
    'cnaeDescricao', 'cnaesSecundarios', 'naturezaJuridica', 'porte', 'municipio', 'uf',
    'optanteSimples', 'optanteMei', 'fonte', 'naoEncontrado', 'erro']) {
    assert.ok(campo in dados, `falta o campo ${campo}`);
  }
  assert.deepEqual(planos(dados.cnaesSecundarios), []);
  assert.equal(dados.naoEncontrado, false);
});

test('a mensagem de erro da própria API é aproveitada', () => {
  const resposta = { getContentText: () => JSON.stringify({ message: 'CNPJ 68497893000166 não encontrado.' }) };
  assert.match(gas.detalheDaResposta_(resposta), /CNPJ 68497893000166 não encontrado/);
});

test('resposta sem JSON não quebra a montagem do erro', () => {
  const resposta = { getContentText: () => '<html>502 Bad Gateway</html>' };
  assert.equal(gas.detalheDaResposta_(resposta), '');
});

test('a aba Triagem registra de onde veio o dado', () => {
  assert.ok(gas.COLS_TRIAGEM.includes('Fonte dos dados'));
});

# App de Onboarding Fiscal — Google Sheets

A mesma rotina do `moraex.py`, só que hospedada **dentro de uma planilha do
Google**. Ninguém instala nada: o código fica no Apps Script da planilha e
é disparado pelo menu. Funciona no navegador e no app do Sheets no celular
(o menu aparece em ⋮ → Automação de macros, mas a barra lateral pede
computador).

## O que o app faz

| Menu | O que faz | Onde escreve |
|---|---|---|
| 1 · Processar e-mail "EMPRESA NOVA" | Lê o e-mail colado, consulta a Receita, confere certificado e regime | aba `Triagem` |
| 2 · Gerar planilha de particularidades | Cria o formulário da reunião com o Paulo, com listas suspensas | aba `Particularidades` |
| 3 · Emitir Fichas de Abertura (PDF) | Ficha no padrão do Dep. Fiscal, uma por página A4 | Drive, em `<cliente>/Fichas/` |
| 4 · Criar pastas do cliente no Drive | `Apuracao/<ano>/<meses>`, `Certificado/`, `Fichas/` | Drive |
| 5 · Alimentar a Carteira (carência) | Entrada em carência e distribuição de quem venceu | abas `Pendentes Daniela` e `Carteira Completa` |
| 📊 Status da carência | Quem já liberou, quem ainda espera | nada — só lê |
| 📄 Exportar CSV das pastas da rede | CSV `Numero,Nome` + comando do PowerShell | Drive |

Nada roda sozinho — só pelo menu, como o escritório pediu. Tudo que o app
faz fica registrado na aba `Log`, com data e usuário.

## Instalar (uns 10 minutos, uma vez só)

> Guia com os arquivos prontos para copiar, um a um, e marcação de
> progresso: [Onboarding Fiscal no Sheets](https://claude.ai/artifact/6C8XjRMp8hJJgCKTHN4ngo).
> O passo a passo abaixo é o mesmo, em texto.

### 1. A planilha

Comece pela carteira que já existe, para não refazer nada:

1. Drive → **Novo → Upload de arquivo** → `Carteira_Tributaria_Fiscal.xlsx`.
2. Abra o arquivo enviado → **Arquivo → Salvar como Planilhas Google**.
   Isso converte para o formato nativo, que é o que o Apps Script edita.
   As fórmulas `COUNTIF` do "Resumo Equipe" sobrevivem à conversão.
3. Renomeie para algo como `Onboarding Fiscal — Moraex`.

> Não dá para rodar o app direto no `.xlsx`: o Apps Script só edita
> planilhas no formato do Google.

### 2. O código

1. Na planilha: **Extensões → Apps Script**.
2. Apague o `Código.gs` que vem de exemplo.
3. Para cada arquivo desta pasta (`.gs` e `.html`), clique no **+** ao lado
   de "Arquivos", escolha o tipo, use **o mesmo nome sem a extensão** e cole
   o conteúdo:

   | Criar como | Arquivos |
   |---|---|
   | Script | `Config`, `Competencia`, `Parser`, `Regras`, `Consultas`, `Planilha`, `Triagem`, `Particularidades`, `Fichas`, `Pastas`, `Carteira`, `Menu`, `Instalar` |
   | HTML | `Sidebar` |

4. **Configurações do projeto** → marque *"Mostrar arquivo de manifesto
   appsscript.json"* → abra o `appsscript.json` que aparece e substitua pelo
   desta pasta (é ele que declara os escopos de Drive e de acesso externo).
5. **Salvar** (💾).

> Ordem dos arquivos não importa: o Apps Script carrega todos antes de
> executar qualquer coisa.

### 3. Primeira execução

1. Volte para a planilha e **recarregue a página**. O menu
   **🏢 Onboarding Fiscal** aparece na barra de cima.
2. **Configurar → Criar/conferir abas.** O Google vai pedir autorização —
   é a primeira execução. Em "Este app não foi verificado", clique em
   **Avançado → Acessar (não seguro)**: "não verificado" aqui significa que
   o app é seu e não passou pela revisão pública do Google, não que tenha
   algo errado. As permissões pedidas são:

   | Permissão | Para quê |
   |---|---|
   | Ver e gerenciar esta planilha | escrever nas abas |
   | Ver e gerenciar arquivos do Drive | criar as pastas de cliente e gravar os PDFs |
   | Conectar a um serviço externo | consultar CNPJ e Simples Nacional na Receita |
   | Exibir e executar conteúdo de terceiros | a barra lateral onde você cola o e-mail |

3. Pronto. Teste com **1 · Processar e-mail** colando um dos exemplos de
   `fixtures/` do repositório.

## Testar sem gastar consulta

Na barra lateral, desmarque **"Consultar a Receita"**. O app faz todo o
resto — parsing, certificado, grupo econômico, fichas — e marca os campos
da Receita como `(não consultado)`, sem inventar dado.

## Manutenção

Quem muda o quê, sem precisar mexer em lógica — tudo em `Config.gs`:

| Mudou | Ajuste |
|---|---|
| Equipe do Dep. Fiscal | `ANALISTAS` |
| Níveis, situações, segmentos, regimes | as listas correspondentes |
| Nome de alguma aba | `ABAS` |
| Pasta raiz no Drive | `PASTA_RAIZ_NOME` |
| **A carência de três competências** | `MESES_CARENCIA` — e avise, porque no repositório ela também vive em `onboarding/competencia.py` |
| MEI passar a exigir certificado | `MEI_EXIGE_CERTIFICADO` |

Depois de editar, salve no Apps Script; a planilha pega a mudança na
próxima execução do menu.

## Testes

A lógica pura (competência, parser, regras da ficha) é JavaScript comum e
roda fora do Apps Script:

```bash
node --test tests/test_gas.mjs
```

O teste mais forte é o de **paridade**: o parser em JS tem que extrair
exatamente as mesmas empresas que o parser em Python extrai dos 5 e-mails
reais da Thays em `fixtures/`. Também conferem que todo item de menu aponta
para uma função existente, que a barra lateral chama uma função que existe,
e que a carência, a equipe e as colunas do formulário batem com as do
Python — as duas implementações não podem divergir em silêncio.

O que **não** dá para testar aqui: as chamadas a `SpreadsheetApp`,
`DriveApp` e `UrlFetchApp`, que só existem dentro do Google. Essas são
exercitadas na primeira execução real.

## Limitações conhecidas

- **A consulta oficial do Simples Nacional não pôde ser testada ao vivo.**
  A página da Receita é um ASP.NET WebForms e o ambiente de
  desenvolvimento bloqueia `receita.fazenda.gov.br`. Em vez de fixar os
  nomes dos campos "na marra", o `Consultas.gs` descobre o campo de CNPJ,
  o botão e os campos ocultos no próprio HTML a cada consulta — assim uma
  mudança de layout degrada para "não consultado" em vez de devolver
  resposta errada. Confira o resultado das primeiras consultas reais.
- **A BrasilAPI também não pôde ser testada ao vivo** pelo mesmo motivo. O
  código segue o formato documentado e estável da API.
- **O e-mail ainda é colado à mão.** A caixa `secretaria@moraex.com.br` é
  Microsoft 365 e não está conectada. Se a Thays passar a encaminhar para
  uma conta Google, dá para trocar a barra lateral por uma busca no
  `GmailApp` — a lógica de `Triagem.gs` não muda.
- **O drive de rede continua fora do alcance.** As pastas no Google Drive
  são criadas pelo app; as da rede saem pelo CSV + PowerShell.
- **Cota do Apps Script:** 20 000 chamadas externas por dia em conta
  gratuita e 6 minutos por execução. Um lote de 5 empresas gasta 10
  chamadas e alguns segundos — longe do limite.

## Relação com o `moraex.py`

Os dois fazem a mesma coisa e seguem a mesma regra de negócio; mudam o
lugar onde rodam.

| | `moraex.py` | App do Sheets |
|---|---|---|
| Onde roda | máquina com Python | navegador, no Google |
| Quem instala | quem tem o repositório | ninguém |
| Carteira | `.xlsx` preservado em arquivo novo | a própria planilha, com histórico de versões do Google |
| Fichas | PDF em `fichas/` | PDF na pasta do cliente no Drive |
| Uso em lote | sim, vários e-mails de uma vez | uma colagem por vez |

Se a regra de carência mudar, mude nos dois — `onboarding/competencia.py` e
`Config.gs`. Um teste em `tests/test_gas.mjs` quebra se eles divergirem.

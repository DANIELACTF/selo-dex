# Automação de Onboarding — Moraex

Processa o e-mail "EMPRESA NOVA" que a Thays (secretaria@moraex.com.br)
envia sempre que a Moraex fecha um cliente novo, e automatiza os passos 2 a
5 do fluxo de onboarding:

1. ~~Receber os e-mails da Thays~~ — **manual por enquanto** (veja
   [Limitações](#limitações-conhecidas)).
2. Conferir os dados do CNPJ na Receita Federal (BrasilAPI) e se a empresa
   é optante pelo Simples Nacional — via a mesma [Consulta Optante do
   Simples Nacional](https://www8.receita.fazenda.gov.br/simplesnacional/aplicacoes.aspx?id=21)
   oficial que uma automação do Cowork já usa — comparando com o que a
   Thays informou.
3. Conferir se o certificado digital (.pfx) veio anexado ao e-mail; se não
   veio, gera um alerta para cobrar a emissão.
4. Gerar a **"Ficha de Abertura — Onboarding Fiscal"** de cada empresa, no
   padrão real do Departamento Fiscal da Moraex (PDF + Markdown).
5. Atualizar a lista de empresas pendentes de distribuição
   (`data/empresas_pendentes_distribuicao.csv`), sem duplicar empresas já
   cadastradas.

Disparo **manual**: você roda o comando quando quiser processar um e-mail
novo da Thays, não fica rodando sozinho em segundo plano.

## Como usar — dentro do Claude, sem instalar nada

Este é o caminho recomendado para o dia a dia: **não precisa de Python,
nem clonar o repositório, nem rodar comando.**

1. Numa sessão do Claude, digite `/ficha-abertura-fiscal` (ou peça "processa essa
   empresa nova").
2. Cole o corpo do e-mail "EMPRESA NOVA" da Thays — incluindo a linha de
   anexos, que é de onde sai a checagem de certificado.
3. O Claude lê o e-mail, consulta a Receita, monta as fichas e devolve uma
   página pronta com todas elas + os alertas + a lista de pendentes de
   distribuição. A página já vem formatada para A4: imprimir ou salvar em
   PDF é direto pelo navegador.

A skill fica em `.claude/skills/ficha-abertura-fiscal/` — `SKILL.md` tem o
procedimento e as regras de negócio, `modelo-ficha.html` é o gabarito
visual da ficha. Para usar no app do Claude/Cowork (fora do Claude Code),
basta subir essa pasta como skill.

Exemplo do resultado:
[Fichas de Onboarding Fiscal — lote de 20/08/2026](https://claude.ai/code/artifact/5e543225-3f21-45de-90db-3bde1a2b0ed5)

## Três jeitos de rodar a mesma rotina

| Onde | Para quem | Instala algo? |
|---|---|---|
| **Skills do Claude** | quem já usa o Claude e quer conversar com a rotina | não |
| **App no Google Sheets** (`gas/`) | quem quer a rotina dentro da planilha, com menu | não |
| **`moraex.py`** | uso em lote e automação própria | Python 3.10+ |

Os três seguem a mesma regra de negócio — inclusive a carência de três
competências —, e há teste conferindo que as implementações não divergem.

## App no Google Sheets

A rotina inteira hospedada numa planilha do Google, disparada pelo menu
**🏢 Onboarding Fiscal**: processa o e-mail da Thays, emite as fichas em
PDF no Drive, cria as pastas do cliente, alimenta a carteira respeitando a
carência e mostra o status da carência. Ninguém instala nada.

O código e o passo a passo de instalação estão em
[`gas/README.md`](gas/README.md). A lógica pura é JavaScript comum e roda
fora do Apps Script:

```bash
node --test tests/test_gas.mjs
```

O teste mais forte é o de paridade: o parser em JS extrai exatamente as
mesmas empresas que o parser em Python extrai dos 5 e-mails reais da Thays.

## O script único: `moraex.py`

Toda a rotina passa por **um comando só**, com subcomandos na ordem do
fluxo. Requer Python 3.10+ e as dependências de `requirements.txt`:

```bash
pip install -r requirements.txt
python moraex.py --help
```

| Comando | O que faz | Quando |
|---|---|---|
| `triagem --email <txt>` | Fichas de Abertura + lista de pendentes | Chegou o e-mail da Thays |
| `planilha` | Formulário de particularidades (.xlsx) | Antes da reunião com o Paulo |
| `etapa1 --email <txt>` | As duas acima, de uma vez | — |
| `pastas --planilha <xlsx>` | CSV do lote + comando do PowerShell | Depois da reunião |
| `carteira --planilha <xlsx> --carteira <xlsx>` | Alimenta a Carteira respeitando a carência | Depois da reunião |
| `etapa2 --planilha <xlsx> --carteira <xlsx>` | As duas acima, de uma vez | — |
| `status --carteira <xlsx>` | Quem está em carência, quem já libera | A qualquer momento |
| `skills [--empacotar]` | Valida e empacota as skills para upload | Antes de subir no claude.ai |

Cada comando termina dizendo qual é o próximo passo. Todos aceitam
`--json`, para quando a saída for lida por programa (é o que o Claude usa)
em vez de por gente.

### Etapa 1 — a triagem

1. Copie o corpo do e-mail "EMPRESA NOVA" (texto puro do Outlook) para um
   arquivo `.txt`.
2. Rode:

   ```bash
   python moraex.py etapa1 --email caminho/para/email_da_thays.txt
   ```

3. Confira:
   - no terminal: empresas processadas, status do certificado e os alertas
     (certificado ausente, divergência de regime, consulta que falhou);
   - em `fichas/<nº cliente>_<NOME>.pdf` (e o `.md` equivalente, mais fácil
     de conferir rápido): a Ficha de Abertura de cada empresa;
   - em `data/empresas_pendentes_distribuicao.csv`: a lista atualizada;
   - em `data/particularidades-<data>.xlsx`: o formulário da reunião.

Para testar offline (sem consultar a Receita), use `--sem-consulta`. Os
e-mails reais que serviram para desenvolver o parser estão em `fixtures/`:

```bash
python moraex.py etapa1 --email fixtures/exemplo_thays_2026-08-25.txt --sem-consulta
```

### Etapa 2 — a implantação

Com a planilha preenchida à mão depois da reunião:

```bash
python moraex.py etapa2 \
    --planilha data/particularidades-2026-08-28.xlsx \
    --carteira data/Carteira_Tributaria_Fiscal.xlsx
```

Sai o CSV do lote de pastas (com o comando do PowerShell para rodar na
rede) e a carteira atualizada **em arquivo novo**. As Fichas Cadastrais
definitivas e o cadastro no G-Click continuam sendo feitos pelo Claude e
pela pessoa — o script diz isso no fim.

### Conferir a carência sem gerar nada

```bash
python moraex.py status --carteira data/Carteira_Tributaria_Fiscal.xlsx
```

Lê a aba "Pendentes Daniela" e separa quem já venceu a carência (com a
sugestão de analista, quando houver), quem ainda espera — e em que
competência libera — e as linhas antigas sem competência registrada, que
não dá para calcular. Não escreve nada.

### Validar as skills antes de subir

```bash
python moraex.py skills --empacotar
```

Confere o que o uploader do claude.ai recusa — `description` acima de 1024
caracteres, `SKILL.md` sem frontmatter, `:` sem aspas no YAML, `name` que
não bate com a pasta — e gera os zips em `dist/skills/` com o `SKILL.md`
na **raiz** do arquivo, que é como o uploader espera. As duas recusas que
aconteceram de verdade viraram teste.

### Rodando os testes

```bash
pip install -r requirements.txt pytest
pytest tests/ -v
```

`tests/test_parser.py` valida o parser e a checagem de certificado contra
os 5 e-mails reais da Thays em `fixtures/`. `tests/test_ficha.py` valida a
lógica de geração da ficha (tipo Matriz/Filial, regime/enquadramento,
detecção de grupo econômico, particularidades) — inclusive reproduzindo os
casos reais das 12 fichas de exemplo (TATY matriz+filial, ERFOLG rede,
JOAO PEDRO BARROS N° fora da série). `tests/test_implantacao.py` cobre a
carência e a carteira; `tests/test_moraex.py`, o encadeamento das etapas,
o relatório de carência e a validação das skills.

O comando antigo (`python cli.py --input ...`) continua funcionando como
atalho para `moraex.py triagem`.

## Parte 2 — implantação, depois da reunião com o Paulo

A triagem acima é a **primeira** etapa. A segunda começa quando as
definições da reunião estão prontas, e é coberta pela skill
`implantacao-cliente-fiscal`:

1. **Planilha de particularidades** — o formulário que o Dep. Fiscal
   preenche à mão, já com N°/razão social/CNPJ vindos da triagem e listas
   suspensas nos campos de decisão.

   ```bash
   python moraex.py planilha
   ```

2. **Ficha Cadastral definitiva** — o documento da pasta do cliente, com
   campos que a Ficha de Abertura não tem (nome fantasia, natureza
   jurídica, IE/IM, responsável pela carteira) e as particularidades em
   dois níveis: ▶ da reunião, • herdadas do onboarding.
3. **Pastas na rede** — `moraex.py pastas` gera o CSV do lote; quem cria as
   pastas é o PowerShell de `estrutura-pastas/`, rodando no drive de rede.
4. **Cadastro no G-Click** — `roteiro-gclick.md`.
5. **Carteira Tributária Fiscal**:

   ```bash
   python moraex.py carteira --planilha data/particularidades.xlsx \
       --carteira data/carteira.xlsx [--competencia MM/AAAA]
   ```

### A carência de três competências

Empresa nova **não** vai direto para a carteira do analista: cumpre três
competências sob a Gestão Fiscal, na aba "Pendentes Daniela", e só depois
é distribuída. Entrou em 08/2026 → libera em 11/2026.

A regra vive em `onboarding/competencia.py` (`MESES_CARENCIA`), e a
contagem adotada é: a empresa permanece nas competências X, X+1 e X+2, e
fica apta a partir de X+3. Se o escritório contar de outro jeito, mude só
esse módulo — todo o resto lê de lá.

Consequências no código, todas cobertas por teste:

- Preencher o analista na planilha **não antecipa** a distribuição; ele
  fica como "Sugestão Analista" enquanto a carência corre.
- Carência vencida sem responsável definido: a empresa fica onde está e é
  listada — distribuir é decisão de gente, não do script.
- Linha antiga de "Pendentes Daniela" sem competência registrada não é
  tocada: sem data de entrada não há como saber quando vence.
- Empresa em carência não conta para nenhum analista no "Resumo Equipe" —
  ela ainda não é de ninguém. O resumo é COUNTIF sobre a "Carteira
  Completa" e recalcula sozinho ao abrir no Excel; a rotina preserva
  essas fórmulas e grava sempre em arquivo novo.

## O padrão da ficha

A "Ficha de Abertura — Onboarding Fiscal" (`onboarding/ficha_template.py`)
foi reconstruída a partir de **12 fichas reais** fornecidas pelo
Departamento Fiscal (não é mais uma proposta genérica). Estrutura fixa:

1. **Identificação** — Nº cliente, recebido em, razão social, CNPJ, tipo
   (Matriz/Filial, calculado a partir do CNPJ), abertura, porte,
   município/UF, grupo econômico, e-mail.
2. **Atividade e regime** — CNAE principal/secundários (Receita), regime
   tributário informado + observação padrão por regime (ex: Simples
   Nacional em atividade de serviço → "avaliar Fator R → Anexo III").
3. **Documentos, certificado e procuração** — status do certificado A1,
   senha (cofre), procuração e-CAC (sempre "pendente", não é
   automatizável a partir do e-mail).
4. **Consultas preliminares de situação fiscal** — tabela fixa (RFB/e-CAC,
   Simples Nacional, SEFAZ-RJ, Prefeitura). A linha **Simples Nacional** é
   preenchida automaticamente com o resultado da consulta oficial
   (`onboarding/simples_rfb.py`) e marcada como conferida quando a consulta
   funciona; as outras três continuam em branco/não marcadas — é o
   checklist manual do analista, sem fonte automatizada plugada ainda.
5. **Particularidades anotadas** — bullets gerados por heurística: grupo
   econômico, divergência de regime, empresário individual, UF fora do
   Rio de Janeiro, Nº de cliente fora da série do lote, certificado
   recebido (pede validação), CNAE de comércio/serviço.
6. **Particularidades a levantar / reunião com o Paulo** — sempre em
   branco, preenchimento manual.

Grupo econômico é detectado de duas formas: (a) quando a Thays escreve
"mesmo grupo da/do X" no e-mail; (b) automaticamente, quando duas empresas
do mesmo lote compartilham a raiz do CNPJ (8 primeiros dígitos) — vira
"Nome (matriz+filial)" se uma delas for matriz, ou "Nome (rede)" se todas
forem filiais (replica os casos reais TATY e ERFOLG vistos nos exemplos).

O nome do arquivo (`<nº>_<SLUG>.pdf`) é uma aproximação automática (2
primeiras palavras significativas da razão social, sem sufixos como LTDA) —
o padrão real observado tem escolhas mais "humanas" (ex: usar o bairro da
filial, ou LTDA/EIRELI para desambiguar matriz+filial); ajuste manualmente
se precisar bater 100% com o nome que o time usaria.

## Limitações conhecidas

- **Passo 1 (receber os e-mails) ainda não está automatizado de verdade.**
  A caixa `secretaria@moraex.com.br` é Outlook/Microsoft 365 e não está
  conectada nesta sessão de desenvolvimento — só havia acesso a um Gmail
  pessoal. Para automatizar de fato, é preciso conectar essa caixa (ou uma
  regra de encaminhamento automático para uma caixa que o Claude possa ler)
  e então plugar essa leitura na função `processar_email()` de
  `onboarding/pipeline.py`, no lugar de ler um `.txt` manualmente.
- **A consulta de CNPJ (`onboarding/cnpj_api.py`) usa a BrasilAPI
  (gratuita, sem chave) mas não pôde ser testada ao vivo** durante o
  desenvolvimento — o ambiente onde isso foi escrito bloqueia acesso a
  domínios externos. O código segue o formato de resposta documentado e
  estável da BrasilAPI; rode `python -m onboarding.cnpj_api <cnpj>` na
  primeira execução real para confirmar, especialmente os campos
  `opcao_pelo_simples`/`opcao_pelo_mei` e a lista `cnaes_secundarios`.
- **A consulta oficial de Simples Nacional (`onboarding/simples_rfb.py`)
  também não pôde ser testada ao vivo** — mesmo bloqueio de rede do
  sandbox, agora para `receita.fazenda.gov.br`. A página é um formulário
  ASP.NET WebForms clássico; em vez de fixar os nomes dos campos "na
  marra" (arriscado sem poder testar), o módulo descobre o campo de CNPJ,
  o botão e os campos ocultos direto do HTML a cada consulta. Rode
  `python -m onboarding.simples_rfb <cnpj> --debug` na primeira execução
  real — se `optante` vier `None` com erro de "não consegui identificar"
  ou "não consegui interpretar o resultado", o `--debug` mostra o que a
  página realmente devolveu para eu ajustar `_descobrir_campo_cnpj`,
  `_descobrir_botao` ou os regexes de `_interpretar_resultado`. Quando
  essa consulta funciona, ela tem prioridade sobre o campo
  `opcao_pelo_simples` da BrasilAPI (que serve de resposta alternativa se
  a consulta oficial falhar) — ver `_optante_simples_resolvido()` em
  `onboarding/pipeline.py`.
- **A reprodução visual do PDF é uma aproximação fiel, não um clone
  byte-a-byte** — não tínhamos acesso a um arquivo-fonte editável do
  template, só aos PDFs finais. As fontes DejaVu Sans usadas para os
  checkboxes (☐/☑) e acentuação estão embutidas em `onboarding/fonts/`
  para funcionar em qualquer máquina.
- **Parsing do e-mail da Thays é por heurística de regex**, não NLP —
  cobre bem os 5 formatos de e-mail vistos até agora (com/sem "CNPJ:",
  com/sem bullet, "N°"/"n°"), mas se a Thays mudar o padrão de digitação,
  os testes em `tests/test_parser.py` vão pegar a quebra — ajuste
  `onboarding/parser.py` e rode `pytest` de novo.
- **As "particularidades" (seção 5) são geradas por regras simples**, não
  reproduzem o julgamento fiscal completo de um analista (ex: ST, FECP-RJ,
  itens específicos da lista de ISS não são cobertos) — é um ponto de
  partida para a seção 6 ("a levantar"), não um substituto da análise
  humana.
- **MEI não gera alerta de certificado ausente por padrão** (constante
  `MEI_EXIGE_CERTIFICADO` em `onboarding/pipeline.py`) — assumi que MEI não
  costuma precisar de e-CNPJ no dia a dia do escritório. Mude para `True`
  se não for o caso.

## Estrutura

```
moraex.py               # <- ENTRADA ÚNICA do caminho Python: todos os subcomandos
cli.py                  # atalho do comando antigo -> moraex.py triagem
gas/                    # <- APP DO GOOGLE SHEETS (mesma rotina, sem Python)
  appsscript.json       # manifesto: escopos de Drive, rede e UI
  Config.gs             # equipe, listas, nomes de aba, carência, cores
  Competencia.gs        # porta de onboarding/competencia.py
  Parser.gs             # porta de onboarding/parser.py
  Regras.gs             # porta das regras de onboarding/pipeline.py
  Consultas.gs          # BrasilAPI + Simples Nacional via UrlFetchApp
  Planilha.gs           # utilidades de aba, cabeçalho e escrita
  Triagem.gs            # etapa 1 -> aba Triagem
  Particularidades.gs   # o formulário da reunião, como aba
  Fichas.gs             # Ficha de Abertura em PDF, na pasta do cliente
  Pastas.gs             # pastas no Drive + CSV para o PowerShell da rede
  Carteira.gs           # carência e distribuição
  Menu.gs               # o menu e o que cada item faz
  Instalar.gs           # cria as abas na primeira execução
  Sidebar.html          # onde o e-mail da Thays é colado
  README.md             # instalação passo a passo
.claude/skills/ficha-abertura-fiscal/       # etapa 1, caminho sem Python
  SKILL.md              # procedimento + regras de negócio
  modelo-ficha.html     # gabarito visual da ficha, no padrão do Dep. Fiscal
.claude/skills/implantacao-cliente-fiscal/  # etapa 2, depois da reunião
  SKILL.md
  modelo-ficha-cadastral.html
onboarding/             # ---- os módulos que o moraex.py chama ----
  parser.py             # extrai empresas do texto do e-mail da Thays
  competencia.py        # aritmética de competências e a carência de distribuição
  cnpj_api.py           # consulta dados cadastrais do CNPJ na BrasilAPI
  simples_rfb.py        # consulta oficial de opção pelo Simples Nacional (Receita)
  ficha_template.py     # modelo de dados + renderização da ficha (PDF/Markdown)
  pipeline.py           # etapa 1: parse -> CNPJ -> certificado -> ficha -> pendentes
  planilha_particularidades.py  # gera o formulário pós-reunião (.xlsx)
  pastas.py             # etapa 2: CSV do lote + comando do PowerShell
  alimentar_carteira.py # etapa 2: carência + distribuição na Carteira Fiscal
  skills_pack.py        # valida e empacota as skills para o uploader do claude.ai
  fonts/                # DejaVu Sans embutida (checkboxes/acentuação no PDF)
estrutura-pastas/       # convenção de pastas do cliente + script PowerShell
roteiro-gclick.md       # checklist de cadastro no G-Click
projeto-rotinas-escritorio/  # kit para montar o Projeto no claude.ai
fixtures/               # 5 e-mails reais da Thays usados para validar o parser
tests/                  # testes automatizados contra os exemplos reais
  test_gas.mjs          # testa o app do Sheets (node --test)
fichas/                 # saída: uma ficha .pdf + .md por empresa (gerado, git-ignored)
data/                   # saídas .csv/.xlsx (gerado, git-ignored)
dist/skills/            # zips das skills (gerado por `moraex.py skills --empacotar`)
```

Os módulos de `onboarding/` continuam importáveis isoladamente — o
`moraex.py` é a casca que dá a eles uma convenção só de argumento, de
saída e de "próximo passo".

## Próximos passos sugeridos

- Conectar a caixa da Thays (Outlook/Microsoft 365) como conector desta
  sessão para automatizar de fato o passo 1.
- Confirmar com o Departamento Fiscal se as regras da seção "Regime /
  enquadramento" e "Particularidades" (`onboarding/pipeline.py`) batem com
  o critério real deles — em especial a heurística de Fator R por
  palavra-chave de CNAE.
- Decidir onde a lista de pendentes deve realmente morar em produção
  (planilha compartilhada, Google Sheets, etc.) em vez do CSV local —
  trocar `_atualizar_pendentes_csv` em `onboarding/pipeline.py` pela
  integração escolhida.
- Subir a skill para o projeto **Rotinas de Escritório** (ver abaixo), para
  ficar junto das demais rotinas do escritório.

## Incorporando ao projeto "Rotinas de Escritório"

A skill foi escrita no mesmo padrão das outras rotinas do escritório
(`onboarding-cliente`, `apuracao-simples-nacional`, `fechamento-mensal`…):
descrição com gatilhos `Use proativamente quando…`, exclusões
`NÃO use para… (chame X)` e seção `Entrega obrigatória final`.

Ela cobre a etapa de **triagem fiscal** — o e-mail do administrativo vira
ficha e lista de pendências. É a etapa anterior ao `onboarding-cliente`
(contrato, procuração e-CAC, pasta digital, cadastro no software), e as
duas se referenciam para não competirem pelo mesmo gatilho.

Encadeamento previsto na skill:

| Momento | Skill |
|---|---|
| E-mail "EMPRESA NOVA" chega → ficha + distribuição | `ficha-abertura-fiscal` |
| Empresa distribuída → formalização do cliente | `onboarding-cliente` |
| Dúvida de enquadramento (Fator R, anexo, regime) | `analise-tributaria-regime` |
| Empresa na rotina → DAS mensal | `apuracao-simples-nacional` |

Para subir: pegue a pasta `.claude/skills/ficha-abertura-fiscal/`
(`SKILL.md` + `modelo-ficha.html`) e adicione como skill na conta/projeto.
Se a biblioteca usar prefixo numérico, renomeie a pasta com o próximo
número da sequência (ex.: `21-ficha-abertura-fiscal`) e ajuste o campo
`name:` do `SKILL.md` para bater com o nome da pasta.

# App de Onboarding Fiscal — Google Sheets

A mesma rotina do `moraex.py`, só que hospedada **dentro de uma planilha do
Google**. Ninguém instala nada: o código fica no Apps Script da planilha e
é disparado pelo menu. Funciona no navegador e no app do Sheets no celular
(o menu aparece em ⋮ → Automação de macros, mas a barra lateral pede
computador).

## O que o app faz

| Menu | O que faz | Onde escreve |
|---|---|---|
| 1 · Processar e-mail "EMPRESA NOVA" (PDF) | Lê o PDF do e-mail, extrai as empresas, consulta a Receita e grava — com barra de progresso | abas `Particularidades` e `Pendentes Daniela` |
| 2 · Emitir Fichas de Abertura (PDF) | Ficha no padrão do Dep. Fiscal, uma por página A4 | Drive, em `<cliente>/Fichas/` |
| 3 · Criar pastas do cliente no Drive | `Apuracao/<ano>/<meses>`, `Certificado/`, `Fichas/` | Drive |
| 4 · Alimentar a Carteira (carência) | Distribuição de quem venceu a carência | abas `Pendentes Daniela` e `Carteira Completa` |
| 📊 Status da carência | Quem já liberou, quem ainda espera | nada — só lê |
| 📄 Exportar CSV das pastas da rede | CSV `Numero,Nome` + comando do PowerShell | Drive |
| 👤 Distribuir cliente para um analista | Diz para qual carteira o pendente vai | `Pendentes Daniela` → `Carteira Completa` |
| 🔁 Trocar responsável | Passa o cliente de um analista para outro | a aba em que ele estiver |
| 📕 Dar baixa no cliente | Tira o cliente da carteira, guardando o motivo | aba `Baixados` |

### Gestão da carteira, cliente a cliente

O item 5 roda o lote inteiro pela regra da carência. As três operações
abaixo são pontuais, tomadas por uma pessoa, e abrem o mesmo painel lateral
com os três modos.

**👤 Distribuir.** Escolhe o cliente pendente e o analista que vai assumir.
Com a carência já vencida, move na hora. Com a carência correndo, o padrão é
**anotar o destino** em "Sugestão Analista" e deixar a empresa onde está —
há uma caixa para **antecipar**, e a antecipação fica registrada como tal.

**🔁 Trocar responsável.** Para quem está na carteira, troca o "Analista
Responsável". Para quem ainda está em carência, troca a **sugestão** — nesse
período quem responde pela empresa é a Gestão Fiscal, não o analista.

**📕 Dar baixa.** Tira o cliente da carteira (ou dos pendentes). A linha não
é apagada: vai para a aba **`Baixados`** com o último responsável, de onde
saiu, motivo, observação, competência, data e quem deu baixa.

As três escrevem uma linha na aba **`Movimentações`** — quem fez, quando,
de quem para quem e por quê. É essa aba que responde "o que aconteceu com o
N°1091?".

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

4. O **`appsscript.json` é a exceção: ele já existe, e não se cria arquivo
   novo para ele.** Vá em **Configurações do projeto**, marque *"Mostrar
   arquivo de manifesto appsscript.json no editor"*, volte ao Editor, abra o
   arquivo que apareceu e substitua o conteúdo pelo desta pasta (é ele que
   declara os escopos de Drive e de acesso externo).

   > Criar um Script chamado `appsscript.json` produz `appsscript..gs` e o
   > editor tenta ler JSON como JavaScript:
   > `SyntaxError: Unexpected token ':'` na linha 2. Se aconteceu, apague
   > esse arquivo (⋮ → Excluir) e siga o passo acima.
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

## A etapa 1, em três passos curtos

O e-mail chega como **PDF** — no Outlook, Imprimir → Salvar como PDF, com os
comprovantes de inscrição junto. Não há mais campo de texto para colar.

A barra lateral conduz o trabalho em chamadas curtas, e é isso que move a
barra de progresso:

| Passo | Função | O que faz |
|---|---|---|
| 1 | `abrirLote(arquivos)` | Converte os PDFs, extrai as empresas, casa os comprovantes e os `.pfx`. **Não consulta nada.** |
| 2 | `consultarEmpresaDoLote(item, consultar)` | **Uma empresa por chamada.** É o que faz a barra andar. |
| 3 | `gravarLote(lote, resultados)` | Escreve a aba Particularidades e a entrada em carência. |

Cada chamada leva segundos, não minutos, então o teto de 6 minutos do Apps
Script deixa de ser um problema — o que antes derrubava o lote inteiro. Uma
empresa que falha na consulta não derruba as outras: ela é marcada e o lote
segue.

## Uma aba só: Particularidades

A aba `Triagem` deixou de existir. Tudo que ela guardava foi consolidado em
`Particularidades`, que passou a ser a única aba do fluxo:

- **colunas cinza** — o que o app apurou do e-mail e da Receita: identificação,
  tipo, abertura, porte, município, grupo econômico, CNAEs, regime, Simples,
  situação cadastral, particularidades, divergência, fonte do dado;
- **colunas amarelas** — o que a pessoa preenche: inscrições estadual e
  municipal, procuração, as quatro "Particularidade (Paulo)", responsável,
  nível, situação, backup, segmento e regime confirmado.

Quem já tem a aba `Triagem` de uma versão anterior pode apagá-la: o app não
escreve mais nela.

## O limite de 6 minutos do Apps Script

Cada empresa consultada custa até **quatro requisições** (BrasilAPI, a
ReceitaWS com sua pausa de 21 s, e o GET + POST da consulta do Simples).
Com a Receita lenta, cinco empresas passam dos 6 minutos que o Apps Script
permite — e, como a gravação vinha depois de todas as consultas, estourar o
limite significava **perder o lote inteiro**.

Agora as consultas têm orçamento (`ORCAMENTO_CONSULTAS_MS`, 3 min 20 s dos
6 min). Vencido o prazo:

- as empresas restantes ficam **sem consulta**, marcadas como
  `(não consultado — o tempo da execução acabou)`;
- a gravação na Triagem e em Pendentes Daniela **acontece do mesmo jeito**;
- a barra lateral lista quem ficou de fora.

Reprocessar o mesmo e-mail depois pula quem já está na Triagem, então a
segunda passada cuida só de quem faltou.

A segunda fonte (ReceitaWS) só é acionada enquanto sobram mais de 50 s de
orçamento, porque a pausa dela sozinha come 21 s. A conversão de PDF tem
teto de `MAX_PDFS_POR_EXECUCAO` por vez.

**Se mesmo assim travar:** processe menos empresas por vez, ou desmarque
"Consultar a Receita". Com o comprovante anexado, os dados cadastrais saem
dele e só a opção pelo Simples fica faltando — que é uma requisição por
empresa em vez de quatro.

## A carência conta da chegada do e-mail

A empresa entra em "Pendentes Daniela" **no passo 1**, assim que o e-mail da
Thays é processado — não depois da reunião com o Paulo. É o e-mail que marca
a entrada dela no escritório, e é dele que saem as três competências.

A **competência de entrada é a da data do e-mail** (`Data: Qui, 27/08/2026`
→ `08/2026`), não a do dia em que você processou. Lote guardado uma semana
não perde a semana. Sem data legível no e-mail, cai na competência atual.

A observação da linha já leva o que a triagem descobriu: divergência de
regime, certificado pendente e grupo econômico.

O passo 5 (**Alimentar a Carteira**) continua existindo e não muda: ele
simplesmente não reinsere quem já está em pendentes, e cuida da distribuição
quando a carência vence.

## O comprovante de inscrição dispensa a consulta de CNPJ

O "COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL" (Cartão CNPJ) traz razão
social, nome fantasia, data de abertura, porte, CNAE principal e secundários,
natureza jurídica, endereço e situação cadastral — tudo que o app buscaria na
BrasilAPI, e **para a empresa recém-aberta que a base pública ainda não tem**.

Por isso a ordem de preferência dos dados cadastrais é: **comprovante →
consulta → nada**. Quando o comprovante é lido, a coluna "Fonte dos dados" da
aba Triagem marca `Comprovante RFB` e nenhuma consulta de cadastro é feita.

**A opção pelo Simples Nacional o comprovante não informa** — essa continua
sendo consulta, e é a única que resta.

Dois caminhos, nesta ordem de preferência:

1. **Colado no corpo do e-mail.** Não precisa de nada: o app varre o texto
   colado, acha um comprovante por empresa e casa pelo CNPJ. É o caminho
   barato e o que funciona sem configuração nenhuma.
2. **Anexado em PDF.** A barra lateral tem um campo de arquivo. Requer o
   **serviço avançado do Drive** ligado no projeto (Editor do Apps Script →
   Serviços → + → Drive API), que é quem converte o PDF em texto, com OCR
   quando o PDF é imagem escaneada. Sem o serviço, o app avisa e segue com o
   resto.

Comprovante cujo CNPJ não bate com nenhuma empresa do e-mail é listado à
parte — ou a Thays mandou a mais, ou o CNPJ do texto está diferente.

## Testar sem gastar consulta

Na barra lateral, desmarque **"Consultar a Receita"**. O app faz todo o
resto — parsing, certificado, grupo econômico, fichas — e marca os campos
da Receita como `(não consultado)`, sem inventar dado.

## Quando o painel de gestão abre vazio

Ele não fica mais em "Carregando clientes…": mostra o que encontrou em cada
aba — se ela existe, em que linha achou o cabeçalho, quantas linhas de dados
tem e quais colunas essenciais faltam, com a lista do que existe no lugar.
A partir daí o conserto costuma ser renomear uma coluna ou usar
**Configurar → Criar/conferir abas**.

O cabeçalho não precisa estar na linha 1: carteira importada de `.xlsx`
costuma ter título e data antes dos rótulos, e o app procura nas dez
primeiras linhas a que traz `N° Cliente`, `Nome`, `CNPJ` ou
`Analista Responsável`. Não achando nenhuma, assume a linha 1.

## Atualizando o app

O app é instalado por copiar-e-colar, então a falha mais comum é um arquivo
velho convivendo com os novos. Duas regras evitam quase tudo:

1. **Item novo no menu significa que o `Menu.gs` mudou junto.** Ele é quem
   monta o menu; as funções ficam nos outros arquivos. É o arquivo mais
   esquecido nas atualizações — o sintoma é o item simplesmente não aparecer.
2. **Recarregue a planilha (F5) depois de colar.** `onOpen()` só roda quando
   a planilha abre; colar código no editor não mexe no menu da aba aberta.

Para conferir: **Configurar · v&lt;versão&gt; → Conferir instalação**. Ele
percorre arquivo por arquivo e diz qual não foi colado, além de listar as
abas que ainda faltam. A versão aparece no próprio rótulo do submenu, então
dá para comparar com a do guia sem clicar em nada.

Ao mudar qualquer `.gs` ou `.html`, suba `VERSAO_APP` em `Config.gs`.

## Manutenção

Quem muda o quê, sem precisar mexer em lógica — tudo em `Config.gs`:

| Mudou | Ajuste |
|---|---|
| Equipe do Dep. Fiscal | `ANALISTAS` |
| Níveis, situações, segmentos, regimes | as listas correspondentes |
| Motivos de baixa e de troca de responsável | `MOTIVOS_BAIXA`, `MOTIVOS_TROCA` |
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
node --test tests/test_gas.mjs tests/test_gestao.mjs tests/test_comprovante.mjs
```

`tests/test_gestao.mjs` exercita distribuir, dar baixa e trocar responsável
contra um dublê da API do Sheets (`tests/planilha-falsa.mjs`): verifica para
onde a linha foi, o que ficou registrado e quando a operação é recusada.
Desligar a guarda da carência quebra dois testes.

O mesmo arquivo roda o JavaScript do painel fora do navegador
(`tests/painel-falso.mjs`): extrai o `<script>` do `.html` e executa contra
um DOM mínimo e um `google.script.run` que chama de verdade as funções do
servidor. É o que garante que o painel nunca fica preso em "Carregando" —
há teste para servidor mudo, servidor com erro, `Gestao.gs` desatualizado e
abas sem as colunas esperadas.

O teste mais forte é o de **paridade**: o parser em JS tem que extrair
exatamente as mesmas empresas que o parser em Python extrai dos 5 e-mails
reais da Thays em `fixtures/`. Também conferem que todo item de menu aponta
para uma função existente, que a barra lateral chama uma função que existe,
e que a carência, a equipe e as colunas do formulário batem com as do
Python — as duas implementações não podem divergir em silêncio.

A Ficha de Abertura tem teste de fidelidade próprio: `FICHA_1099` reproduz
a linha da aba Triagem da ficha real `fixtures/fichas-reais/1099_THAIS_REIS.pdf`
e confere as seis seções, os rótulos e os valores. Perder um campo do padrão
— como a linha Abertura/Porte ou os CNAEs secundários — quebra o teste.

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
- **As amostras de comprovante são reconstruídas.** As de
  `fixtures/comprovantes/` seguem o layout padrão da Receita e usam os dados
  reais da ficha `1099_THAIS_REIS`, mas nenhuma saiu de um comprovante de
  verdade. Ao receber o primeiro real, salve-o lá e rode
  `node --test tests/test_comprovante.mjs`: se algum rótulo tiver mudado, o
  teste diz qual campo parou de sair.
- **A conversão de PDF não pôde ser testada ao vivo**, porque depende do
  Drive. A leitura do texto convertido, sim — é a mesma função que lê o
  comprovante colado no e-mail, e essa tem 18 testes.
- **CNPJ recém-aberto costuma dar 404 na BrasilAPI.** Ela serve o dump de
  dados abertos da RFB, republicado periodicamente e com semanas de atraso —
  a empresa que a Thays acabou de mandar ainda não está lá. Não é falha de
  configuração. O app trata esse caso à parte: tenta a **ReceitaWS** como
  segunda fonte (`USAR_RECEITAWS` em `Config.gs`) e, se ela também não tiver,
  registra na ficha que o dado vem do comprovante de inscrição ou do e-CAC,
  em vez de reportar um erro de HTTP. A coluna **"Fonte dos dados"** da aba
  Triagem diz de onde veio cada linha.
- **A ReceitaWS tem limite de 3 consultas por minuto** no plano gratuito, e
  por isso só é acionada para as empresas que a BrasilAPI não tinha, com
  pausa de 21 s entre chamadas. Um lote com muitas empresas fora da base
  pode passar dos 6 minutos de execução do Apps Script; nesse caso, processe
  o e-mail em duas colagens. Ela também não pôde ser testada ao vivo daqui.
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

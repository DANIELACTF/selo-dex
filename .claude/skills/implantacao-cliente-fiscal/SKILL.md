---
name: implantacao-cliente-fiscal
description: Especialista na implantação do cliente novo no Dep. Fiscal depois da reunião com o Paulo — gera a planilha de particularidades para preenchimento manual, emite a Ficha Cadastral definitiva (documento da pasta do cliente na rede) a partir dela, monta a estrutura de pastas Apuracao/Certificado, produz o roteiro de cadastro no G-Click e alimenta a Carteira Tributária Fiscal respeitando a carência de três competências em Pendentes Daniela antes da distribuição aos analistas. Use proativamente quando o usuário (a) disser que a reunião com o Paulo aconteceu ou que vai lançar as particularidades das empresas, (b) pedir a ficha definitiva, ficha cadastral ou o documento da pasta do cliente, (c) enviar a planilha de particularidades preenchida, (d) precisar criar as pastas do cliente na rede, cadastrar no G-Click, atualizar a carteira ou distribuir empresas cuja carência de três competências já venceu. NÃO use para a triagem do e-mail "EMPRESA NOVA", que é a etapa anterior (chame ficha-abertura-fiscal), nem para o onboarding formal — contrato e procuração (chame onboarding-cliente). Entrega obrigatória final: planilha de particularidades OU, se ela já vier preenchida, as Fichas Cadastrais definitivas (HTML pronto para A4) + CSV para criar as pastas na rede + roteiro de G-Click por empresa + carteira atualizada em arquivo novo, com quem entrou em carência, quem foi distribuído e quem ainda aguarda + lista do que ficou pendente.
---

# Implantação do cliente no Dep. Fiscal (Moraex)

Segunda etapa do onboarding. A primeira (`ficha-abertura-fiscal`) produz a
**Ficha de Abertura** a partir do e-mail da Thays e a lista de pendentes.
Esta aqui pega essa lista, recebe as decisões da **reunião com o Paulo** e
fecha a implantação: ficha definitiva, pastas, G-Click e carteira.

Rode o Python do repositório para as planilhas (é o que preserva as
fórmulas da carteira). O usuário não instala nada — você executa.

## Qual dos dois momentos é este?

**Momento A — antes da reunião:** o usuário quer o formulário para
anotar as definições. → Gere a planilha (passo 1) e pare.

**Momento B — depois da reunião:** o usuário traz a planilha preenchida.
→ Faça os passos 2 a 5.

Na dúvida, pergunte qual dos dois.

## 1. Gerar a planilha de particularidades

```bash
python -m onboarding.planilha_particularidades \
    data/empresas_pendentes_distribuicao.csv \
    data/particularidades-<data>.xlsx
```

Sai uma linha por empresa pendente, com N°/razão social/CNPJ já
preenchidos e as demais colunas em amarelo para preenchimento manual, com
lista suspensa nos campos de decisão (analista, nível, situação, segmento,
regime, certificado).

Entregue o arquivo ao usuário e diga o essencial: as colunas
**"Particularidade 1 a 4 (Paulo)"** são as definições da reunião, uma por
coluna; **"Competência entrada"** já vem com a competência do lote e é ela
que conta a carência; e **"Responsável (analista)"** é quem vai assumir a
empresa **quando a carência vencer** — preencher não antecipa a
distribuição.

## 2. Emitir as Fichas Cadastrais definitivas

Leia a planilha preenchida e monte uma ficha por empresa usando
`modelo-ficha-cadastral.html` (nesta pasta). Publique como Artifact
(favicon `🗂️`), pronto para A4 — uma ficha por página.

Regras próprias desta ficha, além das da Ficha de Abertura:

- **Cabeçalho "Pasta na rede"**: `<NOME> (N° <número>)`, o mesmo nome da
  pasta que o passo 3 cria. "Atualizado em" é a data de hoje.
- **Seção 4** — a coluna "O que foi consultado" é **adaptada à empresa**,
  não é o texto genérico da Ficha de Abertura. Exemplos reais:
  `Não se aplica (Lucro Presumido)` na linha do Simples;
  `IE, situação, ICMS-ST (medicamentos) — após alteração p/ RJ` no SEFAZ;
  `Inscrição municipal, ISS (manipulação), débitos` na Prefeitura.
  A coluna "Regular" fica `☐` — quem marca é o analista.
- **Seção 5** — dois níveis, nesta ordem: primeiro as **▶ definições da
  reunião** (negrito, vindas das colunas "Particularidade N"), depois as
  **• particularidades do onboarding**, herdadas da Ficha de Abertura. A
  primeira `•` leva a classe `espaco`.
- **Seção 6** — responsável, nível, situação e backup vêm da planilha.
  Enquanto a carência não vencer (veja o passo 5), a situação é
  `Pendente distribuição — libera em MM/AAAA`, mesmo que a planilha já
  traga um analista sugerido: quem responde pela empresa nesse período é
  a Gestão Fiscal.
- Campo sem informação na planilha vira `—`. Não complete por dedução.

**Sem nenhuma definição da reunião preenchida, a ficha não é definitiva.**
Avise o usuário e pergunte se quer emitir mesmo assim.

## 3. Estrutura de pastas na rede

Gere o CSV do lote (colunas `Numero,Nome`) e entregue junto com o comando:

```powershell
.\criar-pastas-cliente.ps1 -Raiz "<caminho da rede>" -Lote .\clientes-novos.csv
```

O script está em `estrutura-pastas/` e cria
`<N°> - <NOME>\` com `Apuracao\<ano>\<meses>` e `Certificado\`. Você **não
executa** este passo — não tem acesso ao drive de rede do escritório;
entregue o CSV e o comando para a pessoa rodar. Veja
`estrutura-pastas/README.md` para as convenções (sem acento, número na
frente, senha não vai em arquivo).

## 4. Roteiro do G-Click

Entregue `roteiro-gclick.md` preenchido para o lote: o roteiro genérico
mais, por empresa, as obrigações que o regime e a atividade exigem e as
anotações a criar (cada ▶ da reunião vira uma anotação datada).

Lembre o usuário de que o roteiro tem marcadores `‹confirmar›` nos nomes
de menu — na primeira execução real vale anotar o caminho da versão deles
e fechar o roteiro.

## 5. Alimentar a Carteira Tributária Fiscal

**Empresa nova não vai direto para a carteira do analista.** Ela cumpre
**três competências** sob a Gestão Fiscal, na aba "Pendentes Daniela", e
só depois é distribuída. Entrou em 08/2026 → libera em 11/2026.

```bash
python -m onboarding.alimentar_carteira \
    <particularidades.xlsx> <carteira.xlsx> <carteira-atualizada.xlsx> \
    [--competencia=MM/AAAA]
```

A rotina faz os dois movimentos numa passada só:

1. **Entrada em carência** — empresa da planilha que ainda não está em
   lugar nenhum entra em "Pendentes Daniela", com a competência de entrada
   e a de liberação registradas (colunas acrescentadas à aba na primeira
   execução, sem mexer nas que já existem).
2. **Distribuição** — empresa cuja carência venceu **e** que tenha
   responsável na planilha sai de pendentes e entra na "Carteira
   Completa".

Pontos que valem avisar ao usuário:

- Grava sempre em **arquivo novo** — a carteira original fica intacta.
- Preencher o analista na planilha **não antecipa** a distribuição; só
  vira "Sugestão Analista" enquanto a carência corre.
- Carência vencida **sem** responsável definido: a empresa fica onde está
  e é listada — é decisão de distribuição, não do script.
- Linha antiga de "Pendentes Daniela" sem competência registrada não é
  tocada: sem a data de entrada não há como saber quando vence.
- Empresa em carência **não conta** para nenhum analista no "Resumo
  Equipe", o que é o certo — ela ainda não é de ninguém. O resumo é
  COUNTIF sobre a Carteira Completa e recalcula sozinho no Excel.

Rode uma vez por competência para a distribuição acontecer no mês certo.
Depois de rodar, informe: quantas entraram em carência (e quando liberam),
quantas foram distribuídas, quantas seguem em carência e quantas venceram
sem responsável.

## Entrega obrigatória final

No momento A: a planilha de particularidades + a explicação de como
preencher.

No momento B, tudo isto:

1. **Fichas Cadastrais definitivas** — uma por empresa, no padrão do Dep.
   Fiscal, publicadas como Artifact pronto para A4.
2. **CSV das pastas** + o comando do PowerShell para a pessoa rodar na
   rede.
3. **Roteiro do G-Click** do lote, com as obrigações e as anotações por
   empresa.
4. **Carteira atualizada** em arquivo novo, com o resumo do que entrou.
5. **Lista de pendências** — certificado, IE/IM a buscar, procuração
   e-CAC, empresa sem responsável, e qualquer campo que ficou `—`.

Nunca preencha por dedução um campo que a planilha deixou vazio, e nunca
marque como "Regular" uma consulta de órgão que ninguém fez.

## Encadeamento

- Etapa anterior: `ficha-abertura-fiscal` (triagem do e-mail da Thays).
- Formalização do cliente (contrato, procuração e-CAC, pasta digital):
  `onboarding-cliente`.
- Dúvida de enquadramento levantada na reunião: `analise-tributaria-regime`.
- Empresa implantada e em rotina: `apuracao-simples-nacional`.

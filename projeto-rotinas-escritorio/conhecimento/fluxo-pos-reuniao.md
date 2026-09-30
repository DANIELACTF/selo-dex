# Fluxo depois da reunião com o Paulo

A triagem do e-mail da Thays é a primeira etapa. Esta é a segunda: as
definições da reunião viram ficha definitiva, pasta na rede, cadastro no
G-Click e entrada na carteira.

Ordem: **planilha → ficha → pastas → G-Click → carteira**.

## 1 · Planilha de particularidades

O formulário que o Dep. Fiscal preenche à mão. Já vem com N° Cliente,
razão social e CNPJ da triagem — essas três colunas não se alteram, são
elas que ligam a linha à ficha e à carteira.

Colunas de preenchimento: nome fantasia, município/UF, IE, IM,
certificado, validade, senha, procuração, **Particularidade 1 a 4
(Paulo)**, responsável, nível, situação, backup, segmento, regime
confirmado, **competência de entrada** e observação para a carteira.

Campos de decisão têm lista suspensa — é o que mantém a carteira
consistente. Campo sem informação fica em branco: a ficha imprime `—` e
não inventa dado.

## 2 · Ficha Cadastral definitiva

Ver `padrao-ficha-cadastral.md`. Uma por empresa, no padrão do Dep.
Fiscal, pronta para A4. Vai para a raiz da pasta do cliente na rede.

## 3 · Estrutura de pastas na rede

```
<Raiz>\
└── 1048 - INJECT PHARMA\
    ├── Ficha_Cadastral_1048_INJECT_PHARMA.pdf
    ├── Apuracao\
    │   └── 2026\
    │       ├── 01 Janeiro\ … 12 Dezembro\
    └── Certificado\
```

Convenções:

- Pasta nomeada `<N° do cliente> - <NOME>` — o número vem primeiro porque
  é ele que identifica o cliente na ficha, no G-Click e na carteira.
- **Sem acentos** nos nomes de pasta (`Apuracao`, `03 Marco`) — evita
  problema de codificação em drive de rede.
- Meses com número na frente (`01 Janeiro`) para ordenarem
  cronologicamente.
- A **senha do certificado não vai em arquivo de texto na pasta**. A
  pasta `Certificado` guarda o `.pfx`; a senha fica no cofre, e a ficha
  registra só se está arquivada ou pendente.

Existe um script PowerShell que cria a estrutura em lote
(`criar-pastas-cliente.ps1`), seguro para rodar de novo: pasta existente
é mantida, nada é apagado.

## 4 · Cadastro no G-Click

Ver `roteiro-gclick.md`. Os dados saem todos da ficha, para os dois não
divergirem. O passo que costuma ser esquecido é o **4 (particularidades)**:
cada ▶ da reunião vira uma anotação datada no cadastro, prefixada com a
origem — `20/07/2026 — Reunião Paulo: <definição>`. Sem isso, quem pegar
a empresa daqui a seis meses não entende a exceção.

Empresa sem faturamento ainda também entra nas rotinas: declaração sem
movimento continua sendo obrigação com prazo.

## 5 · Carteira Tributária Fiscal — e a carência

**Empresa nova não vai direto para a carteira do analista.** Ela cumpre
**três competências** sob a Gestão Fiscal, na aba "Pendentes Daniela", e
só depois é distribuída.

Contagem: entrou na competência X, permanece em X, X+1 e X+2, e fica apta
a partir de **X+3**. Entrou em 08/2026 → **libera em 11/2026**.

O que isso implica:

- Preencher o analista na planilha **não antecipa** a distribuição — ele
  fica como "Sugestão Analista" enquanto a carência corre.
- Na ficha, durante a carência: responsável = **Gestão Fiscal (Daniela
  Carvalho)**, situação = `Pendente distribuição — libera em MM/AAAA`.
- Carência vencida **sem** responsável definido: a empresa fica onde
  está. Distribuir é decisão de gente, não automática.
- Linha antiga de "Pendentes Daniela" sem competência registrada não é
  mexida — sem data de entrada não há como saber quando vence.
- Empresa em carência **não conta** para nenhum analista no "Resumo
  Equipe", e está certo: ela ainda não é de ninguém.

A aba "Resumo Equipe" é COUNTIF sobre a "Carteira Completa" e recalcula
sozinha ao abrir no Excel — não editar aqueles números à mão. Toda
atualização da carteira é gravada em **arquivo novo**; o original nunca é
sobrescrito.

A rotina deve rodar **uma vez por competência**, para a distribuição
acontecer no mês certo.

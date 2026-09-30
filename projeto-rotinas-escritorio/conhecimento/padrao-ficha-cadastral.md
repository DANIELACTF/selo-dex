# Padrão da Ficha Cadastral do Cliente — Dep. Fiscal

O **documento definitivo**, emitido depois da reunião com o Paulo, que vai
para a pasta do cliente na rede. Conferido contra a ficha real N°1048
(INJECT PHARMA, 20/07/2026). O gabarito visual é o
`modelo-ficha-cadastral.html`.

Não confundir com a **Ficha de Abertura** (`padrao-ficha-abertura.md`):
aquela é a triagem que sai do e-mail da Thays; esta é o documento
definitivo e tem campos a mais.

## O que a Ficha Cadastral tem e a de Abertura não

| Campo | Onde |
|---|---|
| Pasta na rede + Atualizado em | linha acima da seção 1 |
| Nome fantasia | seção 1 |
| Natureza jurídica | seção 1 |
| Inscrição Estadual / Inscrição Municipal | seção 2 |
| Responsável pela carteira, nível, situação, backup | seção 6 (nova) |
| Particularidades da reunião com o Paulo | seção 5, em destaque |

A seção 4 também muda de natureza: deixa de ser checklist genérico e
passa a registrar **o resultado** das consultas.

## Estrutura — 6 seções

**Cabeçalho:** "FICHA CADASTRAL DO CLIENTE — DEP. FISCAL" e, abaixo,
"Moraex Consultoria Empresarial · documento definitivo — pasta do cliente
(rede)". Em seguida, uma linha com **Pasta na rede** (`<NOME> (N° <número>)`,
o mesmo nome da pasta criada na rede) e **Atualizado em**.

**1 · IDENTIFICAÇÃO** — N° Cliente, Recebido em, Razão social, Nome
fantasia, CNPJ, Tipo, Abertura, Porte, Natureza jurídica, Município/UF,
Grupo econômico, E-mail do cliente.

**2 · ATIVIDADE E REGIME** — CNAE principal, CNAEs secundários,
Regime/enquadramento, Inscrição Estadual, Inscrição Municipal.

**3 · DOCUMENTOS, CERTIFICADO E PROCURAÇÃO** — Certificado A1 (.pfx),
Validade do cert., Senha (cofre), Procuração e-CAC.

**4 · SITUAÇÃO FISCAL NOS ÓRGÃOS (resultado das consultas)** — colunas
Órgão/Sistema, **O que foi consultado**, Situação encontrada, **Regular**.

A coluna "O que foi consultado" é **adaptada à empresa**, não é texto
fixo. Da ficha 1048:

| Órgão | O que foi consultado (exemplo real) |
|---|---|
| RFB / e-CAC | Situação cadastral, pendências, DTE, parcelamentos |
| Simples Nacional | Não se aplica (Lucro Presumido) |
| SEFAZ-RJ | IE, situação, ICMS-ST (medicamentos) — após alteração p/ RJ |
| Prefeitura / Município | Inscrição municipal, ISS (manipulação), débitos |

A coluna "Regular" fica ☐ — quem marca é o analista, depois de consultar.

**5 · PARTICULARIDADES DO CLIENTE** — abre com a legenda em itálico
"Definições da reunião com o Paulo + particularidades identificadas no
onboarding:" e traz **dois níveis**:

- **▶ em negrito** — as definições da reunião com o Paulo. Vêm das
  colunas "Particularidade 1 a 4" da planilha.
- **• normais** — as particularidades herdadas da Ficha de Abertura.

Exemplo real (1048):

```
▶ Vai passar a ter movimento quando for feita a alteração contratual
  para o Rio de Janeiro.
▶ Já está fazendo compras (entradas), sem faturamento (saídas) ainda.
▶ Certificado A1 pendente — cobrar a Thays.
• Farmácia de manipulação: ICMS na venda de medicamentos (com ST) + ISS
  na manipulação de fórmulas.
• Comércio varejo + atacado (materiais médicos) — conferir CST/ST e IE.
• Grupo econômico: Qualitativa. E-mail: qualitativafinanceirorj@gmail.com.
```

**Sem nenhuma ▶ preenchida, a ficha não é definitiva** — é a Ficha de
Abertura com outro cabeçalho.

**6 · RESPONSÁVEL PELA CARTEIRA** — Responsável (analista), Nível/equipe,
Situação, Backup/apoio.

⚠ Durante a carência de três competências, o responsável é a **Gestão
Fiscal** (Daniela Carvalho) e a situação é
`Pendente distribuição — libera em MM/AAAA`, mesmo que a planilha já
traga o analista que vai assumir depois.

**Rodapé:** Elaborado por / Conferido (Gestão Fiscal) / Data, e a
assinatura "Moraex Consultoria Empresarial — Ficha Cadastral do Cliente
(Dep. Fiscal)".

## Regras de preenchimento

- Checkbox marcado ☑, não marcado ☐. Campo sem informação: `—`.
- Município em processo de mudança se escreve como o real:
  `Em alteração para Rio de Janeiro/RJ` (é o que a 1048 traz).
- Inscrição ainda não obtida: `A buscar (farmácia)`,
  `A buscar (ISS manipulação)` — diz *o que* buscar, não só "pendente".
- Nunca marcar "Regular" numa consulta que ninguém fez.
- Campo que a planilha deixou vazio vira `—`; não completar por dedução.

## Nome do arquivo

`Ficha_Cadastral_<N°>_<NOME>.pdf` — ex.:
`Ficha_Cadastral_1048_INJECT_PHARMA.pdf`. Fica na **raiz** da pasta do
cliente na rede.

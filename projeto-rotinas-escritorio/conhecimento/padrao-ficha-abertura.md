# Padrão da Ficha de Abertura — Onboarding Fiscal

Documento de referência do Departamento Fiscal da Moraex. Reconstruído a
partir de 13 fichas reais emitidas entre 01/07 e 17/07/2026 (Nº 717,
1047–1057 e 1060). O gabarito visual correspondente é o
`modelo-ficha.html`, neste mesmo conjunto de arquivos.

## Estrutura fixa — 6 seções, nesta ordem

**Cabeçalho:** faixa azul-marinho com "FICHA DE ABERTURA — ONBOARDING
FISCAL" e, abaixo, "Moraex Consultoria Empresarial · Departamento Fiscal".

**1 · IDENTIFICAÇÃO** — Nº Cliente, Recebido em, Razão social, CNPJ, Tipo
(Matriz/Filial), Abertura, Porte, Município/UF, Grupo econômico, E-mail do
cliente.

**2 · ATIVIDADE E REGIME** — CNAE principal, CNAEs secundários, Regime /
enquadramento.

**3 · DOCUMENTOS, CERTIFICADO E PROCURAÇÃO** — Certificado A1 (.pfx),
Senha (cofre), Procuração e-CAC, Validade do cert.

**4 · CONSULTAS PRELIMINARES DE SITUAÇÃO FISCAL (ÓRGÃOS)** — tabela de 4
linhas com as colunas Órgão/Sistema, O que consultar, Situação encontrada,
OK:

| Órgão / Sistema | O que consultar |
|---|---|
| RFB / e-CAC | Situação cadastral, pendências, DTE (caixa postal), parcelamentos |
| Simples Nacional | Opção/optante (PGDAS/DAS), débitos, exclusão, sublimite |
| SEFAZ-RJ | Inscrição estadual, situação, DeC-RJ, débitos de ICMS |
| Prefeitura / Município | Inscrição municipal, ISS, situação cadastral, débitos |

**5 · PARTICULARIDADES ANOTADAS NO E-MAIL / IDENTIFICADAS** — bullets.

**6 · PARTICULARIDADES A LEVANTAR — REUNIÃO COM O PAULO** — linhas em
branco, preenchimento manual.

**Rodapé:** Responsável / Data da consulta / Onboarding concluído ☐, e a
assinatura "Moraex Consultoria Empresarial — Ficha de Onboarding Fiscal".

## Regras de preenchimento

- Checkbox marcado `☑`, não marcado `☐`. Campo sem informação: `-`.
  E-mail não informado: `(não informado)`.
- **Tipo:** ordem `0001` no CNPJ → Matriz; qualquer outra → Filial.
- **Grupo econômico:** o que a Thays escrever ("mesmo grupo da X"); ou,
  quando duas empresas do lote dividem a raiz do CNPJ, "Nome
  (matriz+filial)" se houver matriz entre elas, "Nome (rede)" se forem
  todas filiais; senão `—`.
- **Regime / enquadramento** — regime informado + observação padrão:
  - Lucro Real → `PIS/COFINS não-cumulativo; apuração IRPJ/CSLL`
  - Lucro Presumido → `PIS/COFINS cumulativo; IRPJ/CSLL trimestral`
  - MEI → `DAS-MEI fixo mensal`
  - Simples Nacional em atividade sujeita a Fator R (escritório/apoio
    administrativo, intermediação, agenciamento, consultoria, assessoria,
    auditoria, engenharia, arquitetura, advocacia, saúde/medicina,
    odontologia, fisioterapia, psicologia, TI, publicidade,
    ensino/treinamento, representação comercial) →
    `avaliar Fator R → Anexo III (folha ≥ 28% RBT12)`
  - Simples Nacional nas demais atividades →
    `confirmar anexo pela atividade`
  - Regime não informado → `A definir — definir regime (não informado no e-mail)`

  A indicação de Fator R é lembrete de conferência: quem decide o anexo é
  o analista fiscal.
- **Seções 4 e 6 são do analista.** Só a linha "Simples Nacional" da seção
  4 é preenchida automaticamente, com o resultado da consulta oficial
  ([Consulta Optante do Simples Nacional](https://www8.receita.fazenda.gov.br/simplesnacional/aplicacoes.aspx?id=21)).
  As outras três linhas ficam em branco e não marcadas.

## Particularidades típicas da seção 5

Até cinco bullets, os mais relevantes; marcar como atenção o que for risco
ou divergência:

- Divergência entre o regime informado pela Thays e o que consta na
  Receita → **atenção**
- Natureza jurídica de empresário individual (cadastro e procuração
  próprios do EI)
- Município/UF fora do Rio de Janeiro → **atenção** (ISS/IM local, SEFAZ
  do estado correspondente)
- Nº de cliente fora da faixa do lote → confirmar se é reativação
- Empresa do mesmo grupo econômico → citar o grupo
- Domínio do e-mail que não bate com o nome da empresa → pode indicar
  grupo; registrar como "confirmar vínculo", sem afirmar
- CNAE de comércio → ICMS, atenção a ST e FECP-RJ; CNAE de serviço →
  ISS/NFS-e
- Certificado anexado → validar titularidade e validade
- Endereço completo quando relevante (outro município, sala específica em
  endereço compartilhado)
- Consulta que falhou → dizer qual campo ficou por conferir

## Nome do arquivo

`<Nº cliente>_<NOME>.pdf` — ex.: `1047_PRONTO_PIX_III.pdf`,
`1060_ELLEVARE.pdf`. Em geral as duas primeiras palavras significativas da
razão social, sem sufixo societário. Matriz e filial do mesmo grupo são
desambiguadas por bairro ou por tipo societário (ex.:
`1052_ERFOLG_TAQUARA`, `1054_ERFOLG_FLAMENGO`, `1055_TATY_PRODUCOES_LTDA`,
`1056_TATY_PRODUCOES_EIRELI`).

## Manutenção

Ao receber uma ficha real mais nova que as usadas aqui, compare e atualize
este documento e o `modelo-ficha.html`. A ficha 1060 (17/07/2026), por
exemplo, trouxe a redação atual da linha "Simples Nacional" da seção 4,
diferente da usada no lote de 01–09/07.

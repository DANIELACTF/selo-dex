---
name: ficha-abertura-fiscal
description: Especialista em triagem fiscal de empresa nova a partir do e-mail "EMPRESA NOVA" do administrativo (Thays/Moraex) — extrai as empresas do e-mail, confere dados cadastrais do CNPJ e opção pelo Simples Nacional na consulta oficial da Receita, valida se o certificado digital A1 veio anexado, aponta divergência entre o regime informado e o que consta na Receita, e emite a Ficha de Abertura (Onboarding Fiscal) no padrão do Departamento Fiscal. Use proativamente quando o usuário (a) colar ou anexar um e-mail "EMPRESA NOVA" do administrativo, (b) mencionar empresa nova para cadastrar/colocar nas rotinas, ficha de abertura, ficha de onboarding fiscal, (c) precisar conferir se a empresa é optante pelo Simples ou se o certificado chegou, (d) precisar atualizar a lista de empresas pendentes de distribuição. NÃO use para o onboarding formal do cliente — contrato, procuração e-CAC, pasta digital, cadastro no software contábil (chame onboarding-cliente), nem para apuração de DAS (chame apuracao-simples-nacional). Entrega obrigatória final: uma Ficha de Abertura por empresa no padrão do Dep. Fiscal (HTML pronto para A4) + bloco de alertas (certificado ausente/não identificado, divergência de regime, consulta que falhou) + tabela de empresas pendentes de distribuição + texto pronto de cobrança ao administrativo quando faltar certificado.
---

# Ficha de Abertura — Onboarding Fiscal (Moraex)

Disparo manual: o usuário traz o texto de um e-mail "EMPRESA NOVA" (Thays
Oliveira, secretaria@moraex.com.br) e você produz as fichas.

**Onde esta skill entra na rotina do escritório:** ela é o *primeiro* passo,
o da triagem fiscal — o e-mail chega, e ela transforma isso em ficha e em
lista de pendências para o Dep. Fiscal distribuir. O onboarding formal do
cliente (contrato, procuração e-CAC, pasta digital, cadastro no Domínio/G
Click) é a etapa seguinte e fica com a skill `onboarding-cliente`. Quando o
usuário pedir as duas coisas, rode esta primeiro e depois chame a outra.

**Execute tudo você mesmo — não rode script Python, não peça para o
usuário instalar nada.** Você lê o e-mail, faz as consultas e monta o
documento. (Existe um CLI Python opcional no repositório para uso em lote;
ignore-o a menos que o usuário peça explicitamente.)

## 1. Obter o e-mail

Se o usuário ainda não trouxe o conteúdo, peça para colar o corpo do
e-mail em texto puro (copiado do Outlook) ou anexar o arquivo. Precisa
incluir a **lista de anexos** (linha "N anexos (...)" com os nomes dos
`.pfx`) — é dela que sai a checagem de certificado.

## 2. Extrair os dados de cada empresa

Leia o e-mail e monte, para cada empresa citada:

| Campo | Onde está |
|---|---|
| Nº de cliente | depois do CNPJ, como `N°1091` ou `n°1091` |
| Razão social | antes do CNPJ |
| CNPJ | com ou sem o rótulo `CNPJ:` |
| Regime informado | linha própria: Simples Nacional / "Optante pelo Simples" / Lucro Presumido / Lucro Real / MEI |
| E-mail do cliente | linha `E mail :` (pode ter mais de um, separados por `/`) |
| Senha do certificado | linha `Senha certificado :` (pode não existir) |
| Observação de grupo | "Obs. mesmo grupo da X" / "Todas são do mesmo grupo" |

O formato varia entre e-mails (com e sem bullet, com e sem `CNPJ:`,
`N°`/`n°`, acentuação inconsistente) — interprete pelo sentido, não por
posição fixa. Se algum campo não aparecer, trate como não informado; não
invente.

## 3. Consultar a Receita Federal

**Antes de consultar, olhe o próprio e-mail.** A Thays quase sempre cola o
"COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL" de cada empresa no
corpo da mensagem — ele já traz razão social, nome fantasia, data de
abertura, porte, CNAE principal e secundários, natureza jurídica e
endereço. Use esses dados quando existirem; as consultas abaixo servem
para preencher o que faltar e para confirmar a opção pelo Simples (que o
comprovante **não** informa).

Para cada CNPJ, faça as duas consultas:

**a) Dados cadastrais** — `https://brasilapi.com.br/api/cnpj/v1/<cnpj só dígitos>`
Retire dali: razão social, data de abertura (`data_inicio_atividade`),
porte, município, UF, CNAE principal (código + descrição), CNAEs
secundários, natureza jurídica e situação cadastral.

**b) Opção pelo Simples Nacional** —
`https://www8.receita.fazenda.gov.br/simplesnacional/aplicacoes.aspx?id=21`
(consulta pública oficial, sem captcha; é a fonte que o escritório já
usa). Informe o CNPJ e leia o resultado.

Se uma consulta falhar (rede, site fora do ar, formato inesperado), **não
pare e não invente o dado**: preencha o campo com `-` ou
`(não consultado)`, registre isso nas particularidades da ficha e avise o
usuário no resumo final. A consulta oficial (b) tem prioridade sobre o
campo `opcao_pelo_simples` da BrasilAPI; use o da BrasilAPI só se a
oficial falhar.

## 4. Aplicar as regras da ficha

**Tipo** — dígitos 9 a 12 do CNPJ iguais a `0001` → `Matriz`; senão `Filial`.

**Grupo econômico**
- Se a Thays escreveu "mesmo grupo da X" → use `X`.
- Senão, se duas ou mais empresas **do mesmo lote** compartilham a raiz do
  CNPJ (8 primeiros dígitos) → `<Primeira palavra do nome> (matriz+filial)`
  se alguma delas for matriz, ou `<Primeira palavra> (rede)` se forem
  todas filiais.
- Senão → `—`.

**Regime / enquadramento** (regime informado + observação padrão):
- Lucro Real → `Lucro Real — PIS/COFINS não-cumulativo; apuração IRPJ/CSLL`
- Lucro Presumido → `Lucro Presumido — PIS/COFINS cumulativo; IRPJ/CSLL trimestral`
- MEI → `MEI — DAS-MEI fixo mensal`
- Simples Nacional, quando o CNAE principal for de **serviço tipicamente
  sujeito a Fator R** (escritório/apoio administrativo, intermediação,
  agenciamento, consultoria, assessoria, auditoria, engenharia,
  arquitetura, advocacia, medicina e demais serviços de saúde,
  odontologia, fisioterapia, psicologia, TI/desenvolvimento de software,
  publicidade, ensino/treinamento, representação comercial) →
  `Simples Nacional — avaliar Fator R → Anexo III (folha ≥ 28% RBT12)`
- Simples Nacional, demais atividades →
  `Simples Nacional — confirmar anexo pela atividade`

  A indicação de Fator R é um **lembrete de conferência**, não um
  enquadramento definitivo — quem decide o anexo é o analista fiscal.
- Não informado no e-mail →
  `A definir — definir regime (não informado no e-mail)`

**Certificado digital** — procure, na lista de anexos, um `.pfx` que
corresponda à empresa: primeiro pelos dígitos do CNPJ dentro do nome do
arquivo, depois pelo nome da empresa (os nomes vêm truncados ou com
sufixos cortados). Achou → `☑ recebido`; não achou → `☐ pendente` **e gere
um alerta de cobrança**. Exceção: MEI não gera alerta de certificado
ausente (não costuma usar e-CNPJ na rotina do escritório) — se o
escritório mudar esse critério, ajuste aqui.

Se sobrar anexo `.pfx` com nome opaco (só um hash, ex.:
`170226042238ff60.pfx`) sem dono identificado, **não chute a quem
pertence**: registre nas particularidades das empresas ainda sem
certificado que existe um anexo não identificado a conferir, e cite isso
no alerta.

**Senha (cofre)** — `☑ arquivada` se a senha veio no e-mail; senão
`☐ pendente`. A senha às vezes vem no **nome do próprio arquivo** (ex.:
`... - senha 12345678.pfx`) — vale como informada.

**Particularidades (seção 5)** — no máximo 5 bullets, os mais relevantes.
Marque com a classe `atencao` os que forem risco/divergência:
- Divergência entre o regime que a Thays informou e o que a Receita
  mostra (ex.: informou Lucro Real, mas consta como optante pelo Simples) → **atenção**
- Natureza jurídica de empresário individual → "EMPRESÁRIO INDIVIDUAL — não é
  sociedade; cadastro/procuração próprios do EI"
- Município/UF fora do Rio de Janeiro → **atenção**, ISS/IM no município de
  origem e SEFAZ do estado correspondente
- Nº de cliente fora da série do restante do lote → confirmar se é
  reativação/registro antigo
- Empresa do mesmo grupo econômico → citar o grupo
- Domínio do e-mail do cliente que não bate com o nome da empresa (ex.:
  `financeiro@fhb1937.com.br` numa empresa chamada ELLEVARE) → pode indicar
  grupo econômico; registrar como "confirmar vínculo", sem afirmar o grupo
- CNAE de comércio → ICMS, atenção a ST/FECP-RJ; CNAE de serviço → ISS/NFS-e
- Endereço completo, quando for relevante para a apuração (outro município,
  sala/loja específica em endereço compartilhado por várias empresas)
- Certificado anexado → "validar titularidade e validade"
- Alguma consulta que falhou → dizer qual campo ficou por conferir

Seções **4** (linhas RFB, SEFAZ, Prefeitura) e **6** ficam em branco: são
o checklist manual do analista. Só a linha **Simples Nacional** da seção 4
você preenche, com o resultado da consulta oficial.

## 5. Montar o documento

Use `modelo-ficha.html` (nesta mesma pasta) como gabarito: copie a
estrutura, substitua os `{{...}}` e repita o bloco `<section class="folha">`
uma vez por empresa. No topo vai um bloco `.resumo` único com os alertas e
a tabela de empresas pendentes de distribuição.

Publique como Artifact (`Artifact`, favicon `📋`). A página já vem
formatada para impressão em A4 — uma ficha por página, e o resumo não sai
na impressão —, então o usuário imprime ou salva em PDF direto do
navegador.

Não altere o layout, as cores nem a ordem das seções do modelo: é o padrão
do Departamento Fiscal.

## 6. Fechar

Responda ao usuário com:
- o link do Artifact;
- quantas empresas foram processadas;
- **alertas de certificado ausente** — liste as empresas e ofereça um texto
  pronto de cobrança para a Thays;
- **divergências de regime** encontradas;
- qualquer consulta que tenha falhado e ficou para conferência manual.

Nunca envie e-mail para a Thays nem para o cliente por conta própria —
monte o texto e deixe o envio com o usuário.

## Entrega obrigatória final

Não encerre sem entregar:

1. **Uma Ficha de Abertura por empresa**, no padrão do Departamento Fiscal
   (as 6 seções, na ordem, sem alterar layout/cores), publicada como
   Artifact pronto para impressão em A4.
2. **Bloco de alertas** no topo, cobrindo: certificado ausente, certificado
   não identificado (anexo de nome opaco), divergência entre o regime
   informado e o que consta na Receita, e qualquer consulta que não pôde
   ser feita.
3. **Tabela de empresas pendentes de distribuição** — Nº, empresa, CNPJ,
   regime informado, Simples (RFB), certificado, status.
4. **Texto pronto de cobrança** ao administrativo para cada certificado
   faltante, para o usuário só copiar e enviar.
5. **Lista do que ficou para conferência manual** — seções 4 (RFB/e-CAC,
   SEFAZ-RJ, Prefeitura) e 6 são sempre do analista, e mais o que tiver
   falhado nas consultas.

Nunca dê por confirmado um dado que não veio do e-mail nem de uma consulta
bem-sucedida: campo sem fonte é `-` ou `(não consultado)`, com o registro
correspondente no alerta.

## Encadeamento com as outras rotinas do escritório

- Terminada a triagem e distribuída a empresa, o onboarding formal
  (contrato, procuração e-CAC, pasta digital, cadastro no software) é a
  skill `onboarding-cliente`.
- Dúvida de enquadramento que apareça aqui (Fator R, anexo do Simples,
  Simples × Presumido × Real) é `analise-tributaria-regime`.
- A apuração mensal do DAS, depois que a empresa entra na rotina, é
  `apuracao-simples-nacional`.

# Roteiro — lançar a empresa e suas particularidades no G-Click

Executado depois da reunião com o Paulo, junto com a emissão da Ficha
Cadastral definitiva. A ficha é a fonte: tudo que entra no G-Click sai
dela, para os dois não divergirem.

> **Antes do primeiro uso — confirmar os nomes de menu.** Este roteiro
> está organizado pelo *dado* a lançar, não pelo caminho de tela, porque
> o rótulo exato de cada campo do G-Click não foi verificado aqui. Na
> primeira vez, anote ao lado de cada passo o caminho real da sua versão
> e devolva este arquivo preenchido — depois disso ele vira roteiro
> fechado, sem os `‹confirmar›`.

## Antes de começar

- [ ] Ficha Cadastral definitiva emitida e conferida pela Gestão Fiscal
- [ ] Pasta do cliente criada na rede (`<N°> - <NOME>`)
- [ ] Responsável pela carteira definido (sem isso o cadastro fica órfão)

## 1 · Cadastro da empresa

Em `‹confirmar: Cadastros → Empresas → Nova›`, com os dados da **seção 1**
da ficha:

| Campo no G-Click | De onde vem |
|---|---|
| Código / N° do cliente | N° Cliente — **use o mesmo número da ficha e da carteira** |
| Razão social | Razão social |
| Nome fantasia | Nome fantasia (em branco na ficha → deixe em branco) |
| CNPJ | CNPJ |
| Matriz / Filial | Tipo |
| Data de abertura | Abertura |
| Porte | Porte |
| Natureza jurídica | Natureza jurídica |
| Município / UF | Município / UF |
| E-mail | E-mail do cliente |

⚠ Se a ficha traz o município como *"Em alteração para…"*, cadastre o
município **atual** e registre a alteração pendente como anotação (passo
4). Cadastrar o município futuro quebra a apuração até a alteração sair.

## 2 · Regime e inscrições

Da **seção 2** da ficha, em `‹confirmar: Dados fiscais / Tributação›`:

- [ ] Regime tributário — exatamente o que está na ficha
- [ ] CNAE principal e secundários
- [ ] Inscrição Estadual — se estiver "A buscar", deixe vazio e marque
      pendência; não invente número
- [ ] Inscrição Municipal — mesma regra

## 3 · Obrigações e rotinas

É o que faz a empresa aparecer nos controles de prazo. Vincule as
obrigações conforme o regime da ficha:

| Regime | Obrigações a vincular |
|---|---|
| Simples Nacional | PGDAS-D, DEFIS (anual), e as municipais/estaduais aplicáveis |
| Lucro Presumido | EFD-Contribuições, DCTFWeb, ECD/ECF, apurações de PIS/COFINS/IRPJ/CSLL |
| Lucro Real | as do Presumido + apuração mensal e controles de crédito |
| MEI | DAS-MEI mensal, DASN-SIMEI (anual) |

Some-se a isso, conforme a atividade:

- [ ] **ICMS / SEFAZ-RJ** quando houver comércio ou indústria — atenção a
      ST e FECP
- [ ] **ISS / NFS-e** quando houver serviço
- [ ] Obrigações do município, quando não for o Rio de Janeiro

⚠ Empresa sem faturamento ainda (caso da 1048) **também** entra nas
rotinas: declaração sem movimento continua sendo obrigação com prazo.

## 4 · Particularidades (o passo que costuma ser esquecido)

Cada linha da **seção 5** da ficha vira uma anotação no cadastro, em
`‹confirmar: Anotações / Observações da empresa›`:

- [ ] As **▶ definições da reunião com o Paulo** — copiadas literalmente,
      uma anotação por definição. São elas que explicam por que a empresa
      é tratada de um jeito específico; sem isso, quem pegar a empresa
      daqui a seis meses não entende a exceção.
- [ ] As **• particularidades do onboarding** — as de risco fiscal (ICMS-ST,
      Fator R, ISS de outro município) merecem anotação própria; as
      informativas podem ir juntas.

Prefixe a anotação com a data e a origem, para não virar texto solto:
`20/07/2026 — Reunião Paulo: <definição>`.

## 5 · Responsável

Da **seção 6** da ficha, em `‹confirmar: Responsáveis / Equipe›`:

- [ ] Analista responsável
- [ ] Nível / equipe
- [ ] Backup / apoio, quando houver
- [ ] Situação

⚠ **Cliente novo cumpre três competências sob a Gestão Fiscal (Daniela)
antes de ser distribuído.** No cadastro inicial, o responsável é a Gestão
Fiscal, mesmo que a ficha já traga um analista sugerido — o nome ali é
para quando a carência vencer. Registre a competência de liberação junto
com a anotação, e só troque o responsável no G-Click na competência em que
a empresa for efetivamente distribuída (é quando ela sai de "Pendentes
Daniela" e entra na Carteira Completa).

## 6 · Certificado digital

- [ ] Vincular o A1 (.pfx) ao cadastro, se o G-Click armazenar certificado
- [ ] Registrar a **validade** — é o que dispara o aviso de renovação
- [ ] Certificado pendente: **não deixe o campo em branco e siga**. Marque
      a pendência e mantenha na lista de cobrança com a Thays; sem
      certificado não há transmissão.

## Conferência final

- [ ] N° do cliente igual em ficha, pasta da rede, G-Click e carteira
- [ ] Regime igual ao da ficha
- [ ] Todas as ▶ da reunião viraram anotação
- [ ] Obrigações vinculadas conforme regime e atividade
- [ ] Responsável definido, ou situação "Pendente distribuição" mantida
- [ ] Pendências registradas: IE/IM a buscar, certificado, procuração e-CAC

Fechado o checklist, atualize a **Carteira Tributária Fiscal** — é o
último passo da implantação.

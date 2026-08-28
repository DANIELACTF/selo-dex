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

1. Numa sessão do Claude, digite `/onboarding` (ou peça "processa essa
   empresa nova").
2. Cole o corpo do e-mail "EMPRESA NOVA" da Thays — incluindo a linha de
   anexos, que é de onde sai a checagem de certificado.
3. O Claude lê o e-mail, consulta a Receita, monta as fichas e devolve uma
   página pronta com todas elas + os alertas + a lista de pendentes de
   distribuição. A página já vem formatada para A4: imprimir ou salvar em
   PDF é direto pelo navegador.

A skill fica em `.claude/skills/onboarding/` — `SKILL.md` tem o
procedimento e as regras de negócio, `modelo-ficha.html` é o gabarito
visual da ficha. Para usar no app do Claude/Cowork (fora do Claude Code),
basta subir essa pasta como skill.

Exemplo do resultado:
[Fichas de Onboarding Fiscal — lote de 20/08/2026](https://claude.ai/code/artifact/5e543225-3f21-45de-90db-3bde1a2b0ed5)

## Alternativa: CLI em Python (uso em lote)

Opcional — serve para processar vários e-mails de uma vez ou rodar em
automação própria. Requer Python 3.10+ e `reportlab` (para gerar o PDF).

```bash
pip install -r requirements.txt
```

1. Copie o corpo do e-mail "EMPRESA NOVA" da Thays (texto puro do Outlook)
   para um arquivo `.txt`.
2. Rode:

   ```bash
   python cli.py --input caminho/para/email_da_thays.txt
   ```

3. Confira:
   - no terminal: a lista de empresas processadas, status do certificado e
     os alertas (certificado ausente, divergência de regime tributário);
   - em `fichas/<nº cliente>_<NOME>.pdf` (e o `.md` equivalente, mais fácil
     de conferir rápido sem abrir PDF): a ficha de onboarding de cada
     empresa;
   - em `data/empresas_pendentes_distribuicao.csv`: a lista atualizada.

Para testar offline (sem consultar a Receita), use `--sem-consulta-cnpj`.
Os exemplos reais usados para desenvolver e testar o parser estão em
`fixtures/` — pode rodar contra eles para ver o resultado:

```bash
python cli.py --input fixtures/exemplo_thays_2026-08-25.txt
```

### Rodando os testes

```bash
pip install -r requirements.txt pytest
pytest tests/ -v
```

`tests/test_parser.py` valida o parser e a checagem de certificado contra
os 5 e-mails reais da Thays em `fixtures/`. `tests/test_ficha.py` valida a
lógica de geração da ficha (tipo Matriz/Filial, regime/enquadramento,
detecção de grupo econômico, particularidades) — inclusive reproduzindo os
casos reais que vieram nas 12 fichas de exemplo (TATY matriz+filial, ERFOLG
rede, JOAO PEDRO BARROS N° fora da série).

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
.claude/skills/onboarding/
  SKILL.md             # procedimento + regras de negócio (caminho sem Python)
  modelo-ficha.html    # gabarito visual da ficha, no padrão do Dep. Fiscal
onboarding/            # ---- CLI Python opcional, para uso em lote ----
  parser.py          # extrai empresas do texto do e-mail da Thays
  cnpj_api.py         # consulta dados cadastrais do CNPJ na BrasilAPI
  simples_rfb.py       # consulta oficial de opção pelo Simples Nacional (Receita)
  ficha_template.py   # modelo de dados + renderização da ficha (PDF/Markdown)
  pipeline.py          # orquestra: parse -> CNPJ -> certificado -> ficha -> pendentes
  fonts/               # DejaVu Sans embutida (checkboxes/acentuação no PDF)
cli.py                 # comando manual (python cli.py --input ...)
fixtures/               # 5 e-mails reais da Thays usados para validar o parser
tests/                  # testes automatizados contra os exemplos reais
fichas/                 # saída: uma ficha .pdf + .md por empresa (gerado, git-ignored)
data/empresas_pendentes_distribuicao.csv  # saída (gerado, git-ignored)
```

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
- Depois de validar tudo isso, publicar como Skill do Claude Code
  (`.claude/skills/onboarding/SKILL.md`, já incluído neste repo) para que o
  fluxo vire um comando `/onboarding` dentro de uma sessão.

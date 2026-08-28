# Automação de Onboarding — Moraex

Processa o e-mail "EMPRESA NOVA" que a Thays (secretaria@moraex.com.br)
envia sempre que a Moraex fecha um cliente novo, e automatiza os passos 2 a
5 do fluxo de onboarding:

1. ~~Receber os e-mails da Thays~~ — **manual por enquanto** (veja
   [Limitações](#limitações-conhecidas)).
2. Conferir os dados do CNPJ na Receita Federal e se a empresa é optante
   pelo Simples Nacional, comparando com o que a Thays informou.
3. Conferir se o certificado digital (.pfx) veio anexado ao e-mail; se não
   veio, gera um alerta para cobrar a emissão.
4. Gerar a ficha de onboarding de cada empresa (padrão proposto — veja
   abaixo).
5. Atualizar a lista de empresas pendentes de distribuição
   (`data/empresas_pendentes_distribuicao.csv`), sem duplicar empresas já
   cadastradas.

Disparo **manual**: você roda o comando quando quiser processar um e-mail
novo da Thays, não fica rodando sozinho em segundo plano.

## Como usar

Requer Python 3.10+ (só biblioteca padrão, sem dependências externas).

1. Copie o corpo do e-mail "EMPRESA NOVA" da Thays (texto puro do Outlook)
   para um arquivo `.txt`.
2. Rode:

   ```bash
   python cli.py --input caminho/para/email_da_thays.txt
   ```

3. Confira no terminal:
   - a lista de empresas processadas e o status do certificado de cada uma;
   - os alertas (certificado ausente, divergência de regime tributário);
   - as fichas geradas em `fichas/<nº cliente>-<nome>.md`;
   - a atualização de `data/empresas_pendentes_distribuicao.csv`.

Para testar offline (sem consultar a Receita), use `--sem-consulta-cnpj`.
Os exemplos reais usados para desenvolver e testar o parser estão em
`fixtures/` — pode rodar contra eles para ver o resultado:

```bash
python cli.py --input fixtures/exemplo_thays_2026-08-25.txt
```

### Rodando os testes

```bash
pip install pytest
pytest tests/ -v
```

Os testes validam o parser e a checagem de certificado contra os 5 e-mails
reais em `fixtures/`.

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
  primeira execução real para confirmar.
- **Não existe hoje um modelo formal de "ficha de onboarding" disponível**
  para este projeto seguir. A estrutura em `onboarding/ficha_template.py`
  é uma **proposta**, montada a partir dos campos que aparecem de forma
  consistente nos e-mails reais da Thays. Ajuste depois de validar com o
  time.
- **Parsing é por heurística de regex**, não NLP — cobre bem os 5 formatos
  de e-mail vistos até agora (com/sem "CNPJ:", com/sem bullet, "N°"/"n°"),
  mas se a Thays mudar o padrão de digitação, os testes em
  `tests/test_parser.py` vão pegar a quebra — ajuste `onboarding/parser.py`
  e rode `pytest` de novo.
- **MEI não gera alerta de certificado ausente por padrão** (constante
  `MEI_EXIGE_CERTIFICADO` em `onboarding/pipeline.py`) — assumi que MEI não
  costuma precisar de e-CNPJ no dia a dia do escritório. Mude para `True`
  se não for o caso.

## Estrutura

```
onboarding/
  parser.py          # extrai empresas do texto do e-mail da Thays
  cnpj_api.py         # consulta CNPJ/Simples Nacional na BrasilAPI
  ficha_template.py   # gera a ficha de onboarding em Markdown
  pipeline.py          # orquestra: parse -> CNPJ -> certificado -> ficha -> pendentes
cli.py                 # comando manual (python cli.py --input ...)
fixtures/               # 5 e-mails reais da Thays usados para validar o parser
tests/                  # testes automatizados contra os exemplos reais
fichas/                 # saída: uma ficha .md por empresa (gerado, git-ignored)
data/empresas_pendentes_distribuicao.csv  # saída (gerado, git-ignored)
```

## Próximos passos sugeridos

- Conectar a caixa da Thays (Outlook/Microsoft 365) como conector desta
  sessão para automatizar de fato o passo 1.
- Validar e ajustar o padrão da ficha (`ficha_template.py`) com quem já usa
  o fluxo hoje.
- Decidir onde a lista de pendentes deve realmente morar em produção
  (planilha compartilhada, Google Sheets, etc.) em vez do CSV local —
  trocar `_atualizar_pendentes_csv` em `onboarding/pipeline.py` pela
  integração escolhida.
- Depois de validar tudo isso, publicar como Skill do Claude Code
  (`.claude/skills/onboarding/SKILL.md`, já incluído neste repo) para que o
  fluxo vire um comando `/onboarding` dentro de uma sessão.

# selo-dex

Ferramentas do departamento fiscal. Hoje o repositório contém o agente de análise
de PIS/COFINS e ICMS.

## Agente de análise de PIS/COFINS e ICMS

Recebe arquivos SPED e a planilha de movimentação de produtos, e devolve as
apurações recompostas, os achados quantificados e as considerações tributárias.

```
.claude/
├── agents/analise-pis-cofins-icms.md          # subagente
└── skills/analise-pis-cofins-icms/
    ├── SKILL.md                               # procedimento e catálogo de testes
    ├── assets/
    │   ├── ncm_regimes.csv                    # NCM x regime (monofásico, alíq. zero, ST)
    │   └── modelo_movimentacao.csv            # modelo para pedir ao cliente
    ├── references/                            # layouts SPED, PIS/COFINS, ICMS, teses, checklist
    └── scripts/
        ├── analisar.py                        # CLI
        ├── fiscal/                            # parser, análises, cruzamento, relatório
        └── tests/                             # suíte + gerador de amostras
```

### Uso

```bash
cd .claude/skills/analise-pis-cofins-icms/scripts

python3 analisar.py \
  --sped /caminho/dos/arquivos \
  --movimentacao /caminho/movimentacao.xlsx \
  --saida ./resultado \
  --json
```

Saídas: `resultado/analise.md` (relatório), `resultado/analise.xlsx` (planilha de
trabalho) e, com `--json`, `resultado/analise.json` para integração.

Os três insumos são opcionais isoladamente — o script roda com o que receber e
declara no relatório o que não pôde ser testado.

### Requisitos

Python 3.8+ e mais nada. Sem `pandas`, sem `openpyxl`: a leitura e a escrita de
`.xlsx` são feitas com `zipfile` e `xml.etree` da biblioteca padrão, e todo valor
monetário trafega em `Decimal`.

### Testes

```bash
cd .claude/skills/analise-pis-cofins-icms/scripts
python3 tests/gerar_amostras.py          # gera SPED e planilha de exemplo
python3 -m unittest discover -s tests -t tests
```

As amostras têm inconsistências plantadas de propósito — cada uma deve acionar um
achado específico, e a suíte também verifica que os testes de consistência **não**
disparam onde a escrituração está correta.

### O que o agente testa

| Grupo | Testes |
|---|---|
| PIS/COFINS | monofásico tributado indevidamente, crédito indevido em monofásico, saída desonerada sem enquadramento, alíquota fora do regime, valor ≠ base × alíquota, CST divergente entre PIS e COFINS, ICMS na base, ICMS-ST fora da base do crédito, aquisição sem crédito no não cumulativo, frete sem crédito, devolução de venda sem crédito, CST desonerado com valor destacado, CST ausente, bloco M × documentos, aritmética do M200/M600, crédito não descontado |
| ICMS | E110 × analíticos, aritmética do E110, crédito em operação sem direito, alíquota interestadual de importado, saída com ST e débito próprio, entrada tributada sem crédito, alíquota interestadual fora do padrão, saída desonerada sem estorno proporcional, E116 × E110 |
| Físico × fiscal | planilha não fecha, entrada sem nota, **saída sem nota (omissão de receita)**, nota sem baixa de estoque, produto do SPED ausente na planilha, estoque final ≠ inventário H010, produto sem NCM |

### Ressalvas

Os valores produzidos são **estimativas de trabalho** sobre o que foi escriturado.
Não são crédito líquido e certo, e não devem ir a PER/DCOMP, retificação ou
provisão contábil sem a conferência item a item descrita em cada achado. A tabela
`ncm_regimes.csv` é apoio curado, não fonte oficial, e traz uma coluna de
confiança — o enquadramento precisa ser confirmado na legislação vigente na
competência analisada.

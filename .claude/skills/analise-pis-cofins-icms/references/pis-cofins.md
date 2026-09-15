# PIS/COFINS — regras aplicadas

## Regimes e alíquotas

| Regime | PIS | COFINS | Base legal |
|---|---|---|---|
| Não cumulativo | 1,65% | 7,6% | Lei 10.637/2002; Lei 10.833/2003 |
| Cumulativo | 0,65% | 3,0% | Lei 9.718/1998 art. 8º |

O regime da escrituração está no `0110.COD_INC_TRIB`. Empresas do Lucro Presumido
são, em regra, cumulativas; do Lucro Real, não cumulativas — mas há receitas que
permanecem cumulativas por força do art. 10 da Lei 10.833/2003 mesmo em empresa do
Lucro Real (regime misto, `COD_INC_TRIB = 3`).

## CST de saída (Tabela I)

| CST | Significado | Gera débito? |
|---|---|---|
| 01 | Tributável à alíquota básica | Sim |
| 02 | Tributável à alíquota diferenciada | Sim |
| 03 | Tributável por unidade de medida | Sim |
| 04 | **Monofásica — revenda a alíquota zero** | Não |
| 05 | Substituição tributária | Sim (pelo substituto) |
| 06 | Alíquota zero | Não |
| 07 | Isenta | Não |
| 08 | Sem incidência | Não |
| 09 | Suspensão | Não |
| 49 | Outras saídas | Depende |

## CST de entrada (Tabela II)

- **50 a 56** — crédito vinculado a receita tributada / não tributada / exportação.
- **60 a 67** — crédito presumido.
- **70 a 75** — aquisição **sem** direito a crédito (sem crédito, isenta, suspensa,
  alíquota zero, sem incidência, por substituição).
- **98/99** — outras operações.

Erro clássico: revendedor de produto monofásico apropriando crédito com CST 50.
O art. 3º, §2º, II da Lei 10.637/2002 e o mesmo dispositivo da Lei 10.833/2003
vedam o crédito quando a aquisição não sofreu a incidência das contribuições.

## Regimes especiais por NCM

A tabela de apoio fica em `assets/ncm_regimes.csv` (colunas: `ncm_prefixo`,
`regime`, `grupo`, `descricao`, `base_legal`, alíquotas do industrial,
`cst_saida_revendedor`, `confianca`, `observacao`). A busca é por **prefixo mais
longo**, então uma exceção legal (3004.90.46) vence a posição genérica (3004).

| Grupo | NCM típicos | Base legal | Alíquotas do industrial/importador |
|---|---|---|---|
| Farmacêuticos | 30.01, 30.03, 30.04 e itens do 30.02/30.06 | Lei 10.147/2000 | PIS 2,1% / COFINS 9,9% |
| Higiene e perfumaria | 3303 a 3307, 3401.11.90, 3401.20.10, 9603.21.00 | Lei 10.147/2000 | PIS 2,2% / COFINS 10,3% |
| Veículos | 87.01 a 87.06 | Lei 10.485/2002 art. 1º | PIS 2,0% / COFINS 9,6% |
| Autopeças | itens dos Anexos I e II | Lei 10.485/2002 art. 3º | PIS 2,3% / COFINS 10,8% |
| Pneus e câmaras | 40.11 e 40.13 | Lei 10.485/2002 art. 5º | PIS 2,0% / COFINS 9,5% |
| Bebidas frias | 2201, 2202, 2203 | Lei 13.097/2015 | regime específico — **confirmar as alíquotas vigentes** |
| Combustíveis | gasolina, diesel, GLP, álcool | Lei 9.718/1998 arts. 4º e 5º | alíquotas ad rem (R$/m³) — **confirmar os valores da competência** |
| Cesta básica / alíquota zero | capítulos 7 e 8, 0407, 0401, 1006, 0713 | Lei 10.925/2004 art. 1º | alíquota zero |
| Cigarros | 2402.20.00 | MP 2.158-35/2001 art. 62 | substituição tributária |

**Atenção aos Anexos da Lei 10.485/2002.** Nem toda a posição 8708 é autopeça
monofásica — só os itens listados nos Anexos I e II. O agente aponta a posição
como indício; a confirmação é item a item.

## Créditos no regime não cumulativo

Rol dos arts. 3º das Leis 10.637/2002 e 10.833/2003, com o conceito de insumo
definido pelo **STJ no REsp 1.221.170** (recurso repetitivo): insumo é o bem ou
serviço **essencial ou relevante** para a atividade, não apenas o que se consome
fisicamente no processo produtivo.

Naturezas da base de crédito (`NAT_BC_CRED`, Tabela 4.3.7):

| Código | Natureza |
|---|---|
| 01 | Bens para revenda |
| 02 | Bens usados como insumo |
| 03 | Serviços usados como insumo |
| 04 | Energia elétrica e térmica |
| 05 / 06 | Aluguel de prédios / de máquinas e equipamentos |
| 07 | Armazenagem e **frete na operação de venda** |
| 08 | Arrendamento mercantil |
| 09 / 10 | Depreciação / aquisição de bens do imobilizado |
| 11 | Depreciação de edificações e benfeitorias |
| 12 | **Devolução de vendas** sujeitas à não cumulatividade |
| 13 | Outras operações com direito a crédito |
| 18 | Estoque de abertura |

Ponto que escapa com frequência: **frete sobre venda** gera crédito próprio
(NAT 07); **frete sobre compra** não gera crédito autônomo — compõe o custo de
aquisição do bem e entra no crédito por ali.

## Base de cálculo

Receita bruta, deduzidas as exclusões legais. A exclusão do **ICMS destacado** foi
fixada pelo STF no **RE 574.706 (Tema 69)**, com modulação a partir de
**15/03/2017**, e está refletida na IN RFB 2.121/2022 art. 26.

Na escrituração a exclusão pode aparecer de duas formas:

1. **Item a item** — `VL_BC_PIS` já vem líquida do ICMS no `C170`.
2. **Consolidada** — base cheia nos itens e ajuste de redução no
   `M210.VL_AJUS_REDUC_BC_PIS` / `M610.VL_AJUS_REDUC_BC_COFINS`.

O teste PC-07 detecta a forma 1 ausente; quando há ajuste no bloco M, ele rebaixa
a severidade e avisa. **Confira as duas antes de concluir por indébito.**

## Conferência aritmética

```
M200:  VL_TOT_CONT_NC_DEV  = VL_TOT_CONT_NC_PER - VL_TOT_CRED_DESC - VL_TOT_CRED_DESC_ANT
       VL_CONT_NC_REC      = VL_TOT_CONT_NC_DEV - VL_RET_NC - VL_OUT_DED_NC
       VL_TOT_CONT_REC     = VL_CONT_NC_REC + VL_CONT_CUM_REC

Item:  VL_PIS    = VL_BC_PIS    x ALIQ_PIS    / 100
       VL_COFINS = VL_BC_COFINS x ALIQ_COFINS / 100
```

Crédito não aproveitado no período **não se perde**: pode ser usado nos meses
seguintes (art. 3º, §4º das Leis 10.637/2002 e 10.833/2003), com controle no
registro 1100/1500.

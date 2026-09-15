# ICMS — regras aplicadas

## Não cumulatividade

Art. 155, §2º, I da CF/1988 e art. 20 da LC 87/1996: o imposto devido em cada
operação é compensado com o cobrado nas anteriores.

**Vedações e estornos** (art. 20, §3º e art. 21 da LC 87/1996):

- entrada de mercadoria cuja saída subsequente seja isenta ou não tributada;
- entrada que se refira a mercadoria alheia à atividade do estabelecimento;
- mercadoria perecida, deteriorada ou perdida;
- **estorno proporcional** quando a saída desonerada é parcial.

A saída para o exterior é a exceção clássica: mantém o crédito (art. 155, §2º, X,
"a" da CF/1988 e art. 32 da LC 87/1996).

## CST de ICMS

O CST tem 3 dígitos: **origem** (1) + **tributação** (2).

### Origem

| Cód. | Origem |
|---|---|
| 0 | Nacional, exceto 3, 4, 5 e 8 |
| 1 | Estrangeira — importação direta |
| 2 | Estrangeira — adquirida no mercado interno |
| 3 | Nacional com conteúdo de importação > 40% e ≤ 70% |
| 4 | Nacional — processos produtivos básicos |
| 5 | Nacional com conteúdo de importação ≤ 40% |
| 6 | Estrangeira — importação direta, sem similar nacional |
| 7 | Estrangeira — mercado interno, sem similar nacional |
| 8 | Nacional com conteúdo de importação > 70% |

### Tributação

| Cód. | Tributação | Débito próprio? | Crédito na entrada? |
|---|---|---|---|
| 00 | Tributada integralmente | Sim | Sim |
| 10 | Tributada com ST | Sim | Sim (o próprio) |
| 20 | Com redução de base | Sim | Proporcional |
| 30 | Isenta/não tributada com ST | Não | Não |
| 40 | Isenta | Não | Não |
| 41 | Não tributada | Não | Não |
| 50 | Suspensão | Não | Não |
| 51 | Diferimento | Não | Não |
| 60 | **ICMS cobrado anteriormente por ST** | Não | Não |
| 70 | Redução de base com ST | Sim | Proporcional |
| 90 | Outras | Depende | Depende |

Fornecedor do Simples Nacional usa **CSOSN** (101, 102, 201, 202, 500, 900 etc.),
não CST. O crédito, quando cabível, é o destacado no campo próprio da nota
(art. 23 da LC 123/2006) — não a alíquota cheia da operação.

## Alíquotas interestaduais

| Situação | Alíquota | Base legal |
|---|---|---|
| Mercadoria **importada** (origem 1, 2, 3, 8) | **4%** | Resolução do Senado 13/2012 |
| Sul/Sudeste (exceto ES) → Norte, Nordeste, Centro-Oeste e ES | 7% | Resolução do Senado 22/1989 |
| Demais operações interestaduais | 12% | Resolução do Senado 22/1989 |

O teste IC-04 procura saída interestadual de item com origem importada e alíquota
diferente de 4%. Antes de apontar, confira a **FCI** (Ficha de Conteúdo de
Importação, Ajuste SINIEF 19/2012) — o conteúdo de importação pode ter mudado a
classificação de origem do item.

## Substituição tributária

Convênio ICMS 142/2018 e arts. 6º a 10 da LC 87/1996. O que importa na análise:

- **CST 60 na saída**: a fase de tributação já se encerrou. ICMS próprio destacado
  aí é erro (IC-05) — ou o CST está errado, ou houve débito indevido.
- **Substituído que revende**: não credita nem debita o ICMS da mercadoria com ST.
- **Ressarcimento** cabe quando a mercadoria com ST sai para outra UF, é devolvida,
  ou a base presumida se mostra maior que a real — cada Estado tem procedimento e
  registro próprios no `E210`/`E220`.
- O `E210` traz retenção, devoluções, ressarcimentos e o ST a recolher.

## DIFAL e FCP

EC 87/2015 e LC 190/2022. Operação interestadual destinada a **não contribuinte**:
o diferencial de alíquota cabe ao Estado de destino, e o FCP (Fundo de Combate à
Pobreza) segue a legislação do destino. Escriturados no `E300`/`E310`.

## CIAP — crédito do ativo imobilizado

Art. 20, §5º da LC 87/1996: o crédito de bem do ativo é apropriado em **48 parcelas**,
proporcionalmente às saídas tributadas sobre o total de saídas. Bloco G:

```
parcela do mês = (valor do crédito / 48) x (saídas tributadas + exportação) / total das saídas
```

Erro comum: apropriar 1/48 cheio sem aplicar o índice de participação
(`G110.IND_PER_SAI`), quando há saídas isentas ou não tributadas relevantes.

## Conferência da apuração

```
E110:  saldo = (VL_TOT_DEBITOS + VL_AJ_DEBITOS + VL_TOT_AJ_DEBITOS + VL_ESTORNOS_CRED)
             - (VL_TOT_CREDITOS + VL_AJ_CREDITOS + VL_TOT_AJ_CREDITOS
                + VL_ESTORNOS_DEB + VL_SLD_CREDOR_ANT)

       saldo > 0 -> VL_ICMS_RECOLHER = VL_SLD_APURADO - VL_TOT_DED
       saldo < 0 -> VL_SLD_CREDOR_TRANSPORTAR
```

Débitos e créditos do `E110` devem bater com a soma dos `C190` (mais `C590` e
`D190`), separados pelo sentido do CFOP. Divergência é IC-01 — mas confira antes
os ajustes do `E111` e documentos de modelos não cobertos pelos analíticos.

O `E116` lista as obrigações a recolher; a soma pode legitimamente diferir do
`E110` quando há ST, DIFAL, FCP ou antecipação no mesmo registro (IC-09).

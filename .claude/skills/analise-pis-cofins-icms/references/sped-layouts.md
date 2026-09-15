# Registros SPED usados na análise

Os layouts completos estão em `scripts/fiscal/layouts.py`. Este arquivo explica
**o que olhar** em cada registro e onde os erros costumam aparecer.

> A versão do layout está no campo `COD_VER` do registro 0000. Campos são
> acrescentados entre versões, então o parser é tolerante: campo ausente fica
> vazio, campo excedente vai para `_extras`. Ao encontrar comportamento
> estranho, confira o Guia Prático da versão declarada.

## EFD-Contribuições

| Registro | Para que serve na análise |
|---|---|
| `0000` | Identificação, CNPJ, competência (`DT_INI`/`DT_FIN`), versão do layout. |
| `0110` | **Chave da análise.** `COD_INC_TRIB`: 1 = só não cumulativo, 2 = só cumulativo, 3 = ambos. Define as alíquotas esperadas. |
| `0200` | Cadastro de itens, com o **NCM** — sem ele não há como testar monofásico. |
| `A100`/`A170` | Serviços (NFS-e) e seus itens com CST e base. |
| `C100`/`C170` | Nota fiscal e itens. `C170` é o registro mais rico: quantidade, CST de PIS/COFINS/ICMS, base, alíquota e valor por item. |
| `C175` | Analítico de saída, usado por quem não escritura item a item. |
| `C181`/`C185` | Consolidação de saídas — PIS e COFINS em registros separados, pareados pelo script. |
| `C191`/`C195` | Consolidação por participante. |
| `D101`/`D105` | Fretes (CT-e) com crédito de PIS e de COFINS. |
| `F100` | Demais operações: receitas e créditos fora de documento fiscal (aluguel, energia, depreciação). |
| `F120`/`F130` | Crédito sobre depreciação e sobre aquisição de imobilizado. |
| `M100`/`M105` | Crédito de PIS apurado e a base do crédito por natureza (`NAT_BC_CRED`). |
| `M200` | **Consolidação do PIS**: contribuição do período, créditos descontados, devida, retenções, a recolher. |
| `M210` | Detalhe do débito por `COD_CONT`, com os campos de **ajuste de base** (`VL_AJUS_ACRES_BC_PIS` / `VL_AJUS_REDUC_BC_PIS`) — é aqui que muita empresa faz a exclusão do ICMS de forma consolidada. |
| `M400`/`M410` | Receitas não tributadas por CST e por natureza. |
| `M500`–`M810` | Equivalentes de COFINS. |
| `1100`/`1500` | Controle do saldo de créditos entre competências. |

### Onde os erros aparecem

- **`C170` com CST 01 em produto monofásico** → PC-01. Confronte `COD_ITEM` → `0200.COD_NCM`.
- **`C170` de entrada com CST 50–56 em monofásico** → PC-02, crédito vedado.
- **`VL_BC_PIS` igual a `VL_ITEM − VL_DESC` com `VL_ICMS` destacado** → ICMS dentro da base (PC-07).
- **`M200` que não fecha** (`NC_PER − CRED_DESC − CRED_DESC_ANT ≠ NC_DEV`) → PC-21.
- **Soma dos `M210.VL_CONT_APUR` diferente da soma dos valores dos itens de saída** → PC-20. Antes de acusar erro, procure receitas em `A170`/`F100` e ajustes de base.

## EFD ICMS/IPI

| Registro | Para que serve na análise |
|---|---|
| `0000` | Identificação, UF, perfil (`IND_PERFIL`) e atividade. |
| `0200` | Cadastro de itens com NCM, CEST e alíquota de ICMS. |
| `C100`/`C170` | Nota e itens, com CST de ICMS, CFOP, base, alíquota, ICMS e ICMS-ST. |
| `C190` | **Analítico por CST + CFOP + alíquota.** É a recomposição oficial que deve bater com o `E110`. |
| `C500`/`C590` | Energia elétrica — relevante para crédito. |
| `D100`/`D190` | Transporte (CT-e) e seu analítico. |
| `E110` | **Apuração do ICMS**: débitos, créditos, ajustes, estornos, saldo, a recolher. |
| `E111` | Ajustes da apuração, por código da tabela da UF. |
| `E116` | Obrigações a recolher (deve conversar com o `E110`). |
| `E210` | Apuração do ICMS-ST. |
| `E310` | DIFAL e FCP. |
| `G110`/`G125` | CIAP — crédito do ativo imobilizado em 48 parcelas. |
| `H005`/`H010` | **Inventário.** Base do cruzamento com a planilha de movimentação. |
| `K` (quando obrigatório) | Controle da produção e do estoque — se existir, é fonte melhor que a planilha. |

### Fórmula do E110

```
saldo = (VL_TOT_DEBITOS + VL_AJ_DEBITOS + VL_TOT_AJ_DEBITOS + VL_ESTORNOS_CRED)
      - (VL_TOT_CREDITOS + VL_AJ_CREDITOS + VL_TOT_AJ_CREDITOS + VL_ESTORNOS_DEB
         + VL_SLD_CREDOR_ANT)

saldo > 0  ->  VL_SLD_APURADO, e VL_ICMS_RECOLHER = VL_SLD_APURADO - VL_TOT_DED
saldo < 0  ->  VL_SLD_CREDOR_TRANSPORTAR
```

## Detalhes de parsing que importam

- **Decimais com vírgula** (`1.234,56`). O parser converte para `Decimal` — nunca use
  `float` em valor tributário.
- **Documentos cancelados**: `C100.COD_SIT` 02, 03, 04 e 05 (cancelado, cancelado
  extemporâneo, denegado, inutilizado) são desconsiderados. Incluí-los infla receita.
- **Encoding**: os arquivos costumam vir em `latin-1`; o parser tenta `latin-1`,
  `utf-8-sig`, `utf-8` e `cp1252` nessa ordem.
- **Hierarquia**: `C170` só faz sentido com o `C100` pai. O parser propaga
  `_num_doc`, `_chv_nfe`, `_dt_doc`, `_ind_oper` e `_cod_sit` para cada filho.
- **`IND_OPER`**: 0 = entrada/aquisição, 1 = saída/prestação. Quando ausente, o
  sentido é inferido pelo primeiro dígito do CFOP (1/2/3 entrada, 5/6/7 saída).

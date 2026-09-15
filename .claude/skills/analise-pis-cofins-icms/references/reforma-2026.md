# Transição da reforma tributária e a apuração corrente

> Este arquivo existe porque a análise de PIS/COFINS e ICMS em 2026 e 2027
> acontece **durante** a transição. Confirme o calendário e as regras vigentes na
> competência analisada antes de concluir — a legislação de transição vem sendo
> regulamentada por etapas.

## O desenho

**EC 132/2023** e **LC 214/2025** substituem cinco tributos por dois, mais um
imposto seletivo:

| Sai | Entra |
|---|---|
| PIS e COFINS (federais) | **CBS** — Contribuição sobre Bens e Serviços |
| ICMS (estadual) e ISS (municipal) | **IBS** — Imposto sobre Bens e Serviços |
| IPI (função extrafiscal) | **IS** — Imposto Seletivo |

## Calendário

| Período | O que acontece |
|---|---|
| **2026** | Ano de teste. CBS e IBS em alíquotas reduzidas de referência, convivendo com PIS/COFINS e ICMS. O valor apurado é compensável com PIS/COFINS, nos termos da regra de transição. |
| **2027** | PIS e COFINS são extintos; CBS passa a valer integralmente. IPI é reduzido (com o tratamento próprio da Zona Franca de Manaus). |
| **2029 a 2032** | ICMS e ISS reduzidos gradualmente, com o IBS subindo na mesma proporção. |
| **2033** | Regime novo pleno; ICMS e ISS extintos. |

## O que isso muda no trabalho de revisão

1. **A janela de recuperação de PIS/COFINS está se fechando.** O tributo acaba,
   mas o direito de repetir indébito das competências anteriores **não** acaba
   junto: continua valendo o prazo de 5 anos do art. 168 do CTN. Revisões de
   período passado seguem fazendo sentido depois de 2027 — o que muda é que não
   haverá mais débito corrente para compensar, o que pode empurrar o caso para
   ressarcimento ou compensação com outros tributos federais.

2. **Saldo credor acumulado precisa de plano.** Crédito de PIS/COFINS não
   aproveitado e saldo credor de ICMS têm regras próprias de aproveitamento na
   transição. Levantar o saldo (registros 1100/1500 na EFD-Contribuições e
   `VL_SLD_CREDOR_TRANSPORTAR` no E110) deixa de ser detalhe e vira prioridade.

3. **A apuração de 2026 tem duas camadas.** Ao conferir a competência, verifique
   se a empresa está cumprindo as obrigações da fase de teste e como tratou o
   valor de CBS/IBS do período — inclusive se houve compensação com PIS/COFINS.

4. **Cadastro de produto continua sendo a base de tudo.** NCM correto, CST
   coerente e classificação fiscal limpa são pré-requisito tanto para a apuração
   atual quanto para o regime novo. Achados como CR-07 (produto sem NCM) e PC-13
   (CST ausente) deixam de ser higiene e viram risco de transição.

## O que o agente faz com isso

Inclui uma ressalva padrão no relatório lembrando que a competência pode estar na
fase de transição, e mantém a análise focada em PIS/COFINS e ICMS — que é o que
está nos arquivos SPED entregues. **Não** estima CBS/IBS nem projeta carga futura:
isso é outro trabalho, com outros insumos.

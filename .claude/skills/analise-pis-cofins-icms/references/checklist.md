# Checklist antes de entregar

## Insumos

- [ ] Todos os arquivos SPED foram identificados (nenhum caiu em "não identificado").
- [ ] As competências dos arquivos batem entre si e com a planilha.
- [ ] O CNPJ é o mesmo em todos os arquivos — se não, os totais foram separados por estabelecimento.
- [ ] O `COD_INC_TRIB` do registro 0110 confere com o regime real da empresa (Lucro Real × Presumido).
- [ ] As colunas reconhecidas da planilha foram conferidas com o usuário.

## Apuração

- [ ] `M200`/`M600` fecham aritmeticamente (PC-21 não disparou, ou a causa está explicada).
- [ ] Débito do bloco M bate com a soma dos documentos (PC-20), ou a diferença está justificada por receitas em `A170`/`F100` e ajustes de base.
- [ ] `E110` fecha aritmeticamente (IC-02) e bate com os analíticos (IC-01).
- [ ] Saldo credor a transportar e saldo de créditos (1100/1500) foram registrados.
- [ ] Retenções na fonte e outras deduções foram consideradas.

## Achados

- [ ] Todo NCM em PC-01/PC-02 foi conferido na legislação da competência — não só na tabela de apoio.
- [ ] Achados com `confianca = media` na tabela de NCM foram checados item a item ou marcados como pendentes.
- [ ] PC-07 foi verificado nas duas formas: item a item e ajuste consolidado no `M210`/`M610`.
- [ ] PC-08 e demais teses estão apresentadas como oportunidade a avaliar, não como crédito líquido.
- [ ] CR-03 (saída sem nota): quebra, perda, consumo interno, brinde, amostra, remessa e erro de unidade foram descartados **antes** de falar em omissão de receita.
- [ ] CR-01 não disparou — se disparou, a planilha foi corrigida antes de valer o cruzamento.
- [ ] Unidades de medida da planilha e do SPED são as mesmas (caixa × unidade distorce tudo).

## Números

- [ ] Potencial a **recuperar** e exposição a **recolher** estão separados.
- [ ] Nenhum valor de mercadoria ou estoque foi somado aos totais tributários.
- [ ] O alcance das competências respeita o prazo de 5 anos (CTN art. 168).
- [ ] Os valores foram apresentados como estimativa de trabalho, com a ressalva explícita.

## Entrega

- [ ] Relatório `.md` gerado e revisado.
- [ ] Planilha `.xlsx` gerada, com a aba de detalhamento completa (não só as amostras).
- [ ] Síntese em tela com achados de alta severidade, totais e ressalvas.
- [ ] O que **não** pôde ser testado está dito explicitamente (planilha ausente, EFD faltando, competência incompleta).
- [ ] Próximos passos estão claros: o que retificar, o que recolher, o que investigar, o que só depende de conferência do cliente.

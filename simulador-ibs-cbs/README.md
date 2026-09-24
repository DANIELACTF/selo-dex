# Simulador IBS/CBS para Google Planilhas (regime regular)

Script do Google Apps Script que simula o impacto da Reforma Tributária do consumo
(EC 132/2023 e LC 214/2025) para empresas do **Lucro Real** ou do **Lucro Presumido**.
Ele compara a carga atual (ICMS, ISS, IPI, PIS e COFINS) com a carga de cada ano da
transição, de 2026 a 2033, e calcula os débitos e créditos de IBS e CBS.

## Instalação

1. Crie uma planilha no Google Planilhas.
2. Abra **Extensões > Apps Script**, apague o conteúdo de `Código.gs` e cole o conteúdo de
   [`SimuladorIBSCBS.gs`](SimuladorIBSCBS.gs). Salve.
3. Recarregue a planilha. O menu **Simulador IBS/CBS** aparece na barra.
4. Clique em **Simulador IBS/CBS > 1. Configurar planilha** e autorize o script na primeira vez.

## Uso

| Aba | O que preencher |
|---|---|
| **Parâmetros** | Empresa, regime (Real/Presumido), alíquotas de referência da CBS e do IBS e as opções de base de cálculo. |
| **Cronograma** | Alíquotas e regras de cada ano da transição. Já vem preenchido e pode ser editado. |
| **Operações** | Uma linha por grupo de vendas ou compras: valor, redução de IBS/CBS (0%, 30%, 60%, 100%), ICMS, ISS e IPI, e quais créditos a compra gera. |
| **Resultado** | Gerado pelo menu **2. Calcular simulação**. Mostra a carga por cenário, a variação sobre a carga atual, os débitos e créditos de IBS/CBS e um gráfico. |

Para ver um exemplo, use **Inserir operações de exemplo** e depois **Calcular simulação**.

### Funções personalizadas

Estas funções podem ser digitadas direto nas células:

- `=ALIQUOTA_IBSCBS(2033; "CBS"; 60%)`: alíquota do ano, já com a redução aplicada.
- `=CBS_SIMULADA(1000; 2027)` e `=IBS_SIMULADO(1000; 2029; 30%)`: valor do tributo sobre uma base.

As funções leem a aba **Cronograma**. Se você mudar o cronograma, edite a célula da
função para que ela seja recalculada.

## Premissas do cálculo

- **Preço constante.** O valor de cada operação é o mesmo em todos os cenários, então a
  variação mostra só o efeito sobre a carga tributária.
- ICMS, ISS, PIS e COFINS são calculados "por dentro" do valor. IPI, IBS e CBS são
  calculados "por fora".
- Durante a transição, ICMS, ISS, PIS e COFINS não entram na base do IBS/CBS. Essa regra
  pode ser desligada em Parâmetros.
- **2026:** CBS de 0,9% e IBS de 0,1% aparecem destacados, mas são compensáveis com o
  PIS/COFINS. Por isso não somam na carga.
- **2027 e 2028:** a CBS entra plena, com 0,1 p.p. a menos. PIS e COFINS são extintos,
  o IPI é zerado (exceto ZFM) e o IBS fica em 0,1%.
- **2029 a 2032:** ICMS e ISS caem para 90%, 80%, 70% e 60%. O IBS sobe na mesma
  proporção (estimativa).
- **2033:** ICMS e ISS são extintos e passa a valer o modelo definitivo.
- Valores negativos indicam saldo credor.
- O simulador não considera Imposto Seletivo, regimes específicos, créditos presumidos,
  split payment nem efeitos no IRPJ/CSLL.

> As alíquotas de referência padrão (CBS 8,8% e IBS 17,7%) são **estimativas**. Ajuste-as
> quando as alíquotas oficiais forem publicadas. O resultado é estimativo e não substitui
> a análise de um contador.

## Testes

A lógica de cálculo é feita por funções puras, testadas com Node.js:

```bash
node simulador-ibs-cbs/test/calculo.test.js
```

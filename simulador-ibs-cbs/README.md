# Simulador IBS/CBS para Google Planilhas (regime regular)

Simula o impacto da Reforma Tributária do consumo (EC 132/2023, LC 214/2025 e
LC 227/2026) para empresas do **Lucro Real** ou do **Lucro Presumido**. Compara a
carga atual (ICMS, ISS, IPI, PIS e COFINS) com a carga de cada ano da transição, de
2026 a 2033, e calcula os débitos e créditos de IBS e CBS. Cada operação tem seu
próprio tratamento: redução por atividade, regime específico, exportação, tipo de
fornecedor e situação atual do PIS/COFINS.

## Qual versão usar

**Versão app (recomendada)**, na pasta [`web-app/`](web-app/). Tem a mesma tela do
Quadro de Férias: abas, cartões, formulário com avisos, gráfico e simulações salvas
na planilha. Abre pelo menu da planilha ou por um link.

→ **[web-app/COMO-PUBLICAR.md](web-app/COMO-PUBLICAR.md)** — roteiro passo a passo.

```
web-app/
  Codigo.gs          serve a tela e guarda as simulações na planilha
  pagina.html        a tela inteira (HTML, CSS e JS)
  motor_js.html      o motor de cálculo, usado pela tela e pelos testes
  COMO-PUBLICAR.md   roteiro de instalação
  testes/
    motor.test.js        cálculo: reduções, regimes, créditos, transição
    codigo.test.js       Codigo.gs sobre uma planilha simulada
    tela.test.js         a tela no Chromium, ligada ao Codigo.gs (Playwright)
    montar-ensaio.js     monta a página completa para o ensaio da tela
    planilha-falsa.js    imitação dos serviços do Apps Script
```

```bash
node simulador-ibs-cbs/web-app/testes/motor.test.js
node simulador-ibs-cbs/web-app/testes/codigo.test.js
NODE_PATH=$(npm root -g) node simulador-ibs-cbs/web-app/testes/tela.test.js /tmp/ensaio
```

**Versão planilha (anterior)**, no arquivo [`SimuladorIBSCBS.gs`](SimuladorIBSCBS.gs).
Funciona só com abas e menu, sem tela própria. As regras de cálculo são as mesmas.
Não coloque as duas versões no mesmo projeto do Apps Script: as duas criam o menu.
O restante deste documento descreve esta versão.

## Instalação (versão planilha)

1. Crie uma planilha no Google Planilhas.
2. Abra **Extensões > Apps Script**, apague o conteúdo de `Código.gs` e cole o conteúdo de
   [`SimuladorIBSCBS.gs`](SimuladorIBSCBS.gs). Salve.
3. Recarregue a planilha. O menu **Simulador IBS/CBS** aparece na barra.
4. Clique em **Simulador IBS/CBS > 1. Configurar planilha** e autorize o script na primeira vez.

## Uso

| Aba | O que preencher |
|---|---|
| **Parâmetros** | Empresa, regime (Real/Presumido), alíquotas de referência da CBS e do IBS e as opções de base de cálculo. |
| **Cronograma** | Alíquotas e regras de cada ano, inclusive a alíquota dos serviços financeiros e o início do Imposto Seletivo. Já vem preenchido e pode ser editado. |
| **Tratamentos** | Catálogo de tratamentos de IBS/CBS por atividade (veja abaixo). Pode ser editado e receber novas linhas. |
| **Operações** | Uma linha por grupo de vendas ou compras: valor, tratamento, ICMS, ISS, IPI, Imposto Seletivo, situação atual do PIS/COFINS e, nas compras, o tipo de fornecedor e os créditos. |
| **Resultado** | Gerado pelo menu **2. Calcular simulação**. Mostra a carga por cenário, a variação sobre a carga atual, os débitos e créditos de IBS/CBS, o IBS/CBS por tratamento em 2033 e um gráfico. |

Para ver um exemplo, use **Inserir operações de exemplo** e depois **Calcular simulação**.

## Tratamentos por atividade (aba Tratamentos)

| Grupo | Tratamentos | Redução |
|---|---|---|
| Geral | Tributação integral | 0% |
| Profissões regulamentadas (art. 127) | Advogados, contabilistas, engenheiros, arquitetos, economistas e demais profissões listadas | 30% |
| Reduções de 60% | Educação, saúde, dispositivos médicos e de acessibilidade, medicamentos, alimentos, higiene e limpeza, produtos agropecuários in natura, insumos agropecuários, produções culturais nacionais, comunicação institucional, desporto, soberania e segurança | 60% |
| Alíquota zero | Cesta Básica Nacional, hortícolas/frutas/ovos, medicamentos e dispositivos das listas de alíquota zero, transporte público coletivo urbano | 100% |
| Regimes específicos | Bares e restaurantes, hotelaria e parques, agências de turismo, transporte coletivo intermunicipal/interestadual | 40% |
| | Operações com bens imóveis | 50% |
| | Locação, cessão onerosa e arrendamento de imóveis | 70% |
| | Planos de assistência à saúde | 60% |
| | Serviços financeiros: alíquota própria de IBS+CBS, de 10,85% (2027) a 12,5% (2033) | específica |
| | Combustíveis (revenda monofásica, sem débito) | — |
| Outros | Exportação (imune, com manutenção dos créditos); isento/imune/não incidência | 100% |

Em cada regime específico, a coluna **O que informar em "Valor"** diz qual é a base:
intermediação nas agências de turismo, spread nos serviços financeiros, receitas menos
indenizações nos planos de saúde e valor líquido dos redutores nos imóveis. Nas compras
de bares e restaurantes, hotelaria e planos de saúde, o crédito é vedado.

Nas compras, a coluna **Fornecedor** define o crédito:

- **Regime regular:** o crédito é o IBS/CBS destacado, se o tratamento permitir.
- **Simples Nacional:** o crédito é limitado ao IBS/CBS pago no DAS. O percentual vem de
  Parâmetros (3%, estimativa) ou pode ser informado por compra, e é escalonado durante a
  transição.
- **Produtor rural não contribuinte:** crédito presumido, com o percentual informado em
  Parâmetros.
- **Sem crédito:** pessoa física ou não contribuinte.

A coluna **PIS/COFINS hoje** trata o cenário atual: o padrão do regime, receitas que
continuam cumulativas mesmo no Lucro Real, revenda monofásica ou alíquota zero, e
receitas isentas ou suspensas. Em vendas com ICMS-ST, informe ICMS 0% e não tome crédito
na compra.

O **Imposto Seletivo** (coluna própria) começa em 2027, integra a base do IBS/CBS e entra
na carga.

### Funções personalizadas

Estas funções podem ser digitadas direto nas células:

- `=ALIQUOTA_IBSCBS(2033; "CBS"; 60%)` ou `=ALIQUOTA_IBSCBS(2033; "IBS"; "Bares e restaurantes (-40%)")`:
  alíquota do ano para uma redução ou um tratamento.
- `=CBS_SIMULADA(1000; 2027)` e `=IBS_SIMULADO(1000; 2029; 30%)`: valor do tributo sobre uma base.

As funções leem as abas **Cronograma** e **Tratamentos**. Se você mudar o cronograma, edite a célula da
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
- O simulador **não** calcula: a alíquota por unidade (ad rem) dos combustíveis; os
  redutores de ajuste e social dos imóveis (informe a base já líquida); o estorno de
  créditos em operações isentas; a redução em pontos percentuais dos serviços financeiros
  sujeitos a ISS; o split payment; os benefícios da ZFM; e os efeitos no IRPJ/CSLL.
- O enquadramento de cada item (NCM/NBS) nos anexos da LC 214/2025 deve ser conferido
  caso a caso.

> As alíquotas de referência padrão (CBS 8,8% e IBS 17,7%) são **estimativas**. Ajuste-as
> quando as alíquotas oficiais forem publicadas. O resultado é estimativo e não substitui
> a análise de um contador.

## Testes

A lógica de cálculo é feita por funções puras, testadas com Node.js:

```bash
node simulador-ibs-cbs/test/calculo.test.js
```

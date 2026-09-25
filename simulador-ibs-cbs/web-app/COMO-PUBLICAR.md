# Como colocar o Simulador IBS/CBS no Google

Este roteiro você faz uma vez só. No fim, o simulador abre **dentro da planilha**,
pelo menu, e, se quiser, também por um **link** que funciona no computador e no
celular. Não custa nada.

Você vai precisar de uma conta Google e de uns 10 minutos. Nada aqui é programação:
é copiar três arquivos e clicar em alguns botões.

---

## Parte 1 — Criar a planilha

1. Na barra de endereço do navegador, digite **sheets.new**. Abre uma planilha nova.
2. Clique em *Planilha sem título* (canto superior esquerdo) e dê o nome
   **Simulador IBS/CBS**.

É nessa planilha que as simulações ficam guardadas. As abas **Simulações** e
**Resultado** aparecem sozinhas quando você usar o app.

## Parte 2 — Colar os três arquivos

3. No menu, clique em **Extensões → Apps Script**. Abre uma aba nova, com o
   arquivo `Código.gs` aberto.
4. Clique em *Projeto sem título* e dê o nome **Simulador IBS/CBS**.

> ⚠️ **Já tinha colado a versão anterior do simulador (`SimuladorIBSCBS.gs`)?**
> Apague esse arquivo ou todo o conteúdo dele. As duas versões não podem ficar
> juntas no mesmo projeto: as duas criam o menu, e uma atrapalha a outra.

### Arquivo 1 — `Codigo.gs`

5. Clique dentro de `Código.gs`, apague **tudo** (`Ctrl+A`, depois `Delete`).
6. Copie o conteúdo inteiro do arquivo **`Codigo.gs`** desta pasta e cole ali.

### Arquivo 2 — `pagina`

7. Na coluna da esquerda, ao lado de **Arquivos**, clique no **+** e escolha **HTML**.
8. No nome, escreva **pagina** (sem acento e sem `.html`) e tecle Enter.
9. Apague o que veio pronto no arquivo novo.
10. Copie tudo de **`pagina.html`** desta pasta e cole ali.

### Arquivo 3 — `motor_js`

11. De novo: **+** ao lado de Arquivos → **HTML**.
12. Nome: **motor_js** (com o sublinhado, sem acento).
13. Apague o que veio pronto, copie tudo de **`motor_js.html`** e cole.

14. Clique no ícone de **disquete** (Salvar projeto) ou tecle `Ctrl+S`.

No fim, a coluna da esquerda deve ter exatamente estes três arquivos:
`Código.gs`, `pagina.html` e `motor_js.html`.

## Parte 3 — Abrir pela planilha (o jeito mais simples)

15. Volte à aba da planilha e **recarregue a página** (F5).
16. Espere alguns segundos. Aparece o menu **Simulador IBS/CBS**, ao lado de *Ajuda*.
17. Clique em **Simulador IBS/CBS → Abrir o simulador**.
18. Na primeira vez, o Google pede permissão:
    - clique em **Continuar** (ou *Autorizar acesso*) e escolha sua conta;
    - se aparecer **"O Google não verificou este app"**, é normal. O app é seu e não
      é público, por isso não passou pela revisão do Google. Clique em **Avançado**
      e depois em **Acessar Simulador IBS/CBS (não seguro)**;
    - clique em **Permitir**.
19. Clique de novo em **Simulador IBS/CBS → Abrir o simulador**. O app abre numa
    janela por cima da planilha.

Quem tiver acesso de edição a esta planilha também consegue usar o simulador pelo menu.

## Parte 4 — Ter um link (opcional)

Faça esta parte se quiser abrir o simulador numa aba própria do navegador ou no celular.

20. No Apps Script, clique em **Implantar → Nova implantação**.
21. Clique na **engrenagem** ao lado de *Selecione o tipo* e escolha **App da Web**.
22. Preencha assim:
    - **Descrição:** `Simulador IBS/CBS`
    - **Executar como:** *Eu* (seu e-mail)
    - **Quem pode acessar:** **Somente eu** se o link for só seu. Escolha
      **Qualquer pessoa na organização** (conta de empresa) se a equipe também for usar.
23. Clique em **Implantar** e copie o **URL do app da Web** (termina em `/exec`).

> **Cuidado com "Qualquer pessoa":** o app roda com a sua conta. Quem tiver o link
> consegue ver e apagar as simulações salvas na sua planilha, e elas podem ter
> dados de clientes. Só escolha essa opção se isso não for um problema.

---

## Como usar

- **Simular:** preencha a empresa e as premissas (Passo 1) e lance as vendas e as
  compras (Passo 2). Em cada operação, escolha o **tratamento de IBS/CBS**, que é a
  atividade: redução de 30% ou 60%, alíquota zero, bares e restaurantes, imóveis,
  serviços financeiros, exportação etc. O formulário avisa o que informar em
  "Valor" e quando a compra não gera crédito.
- **Resultado:** carga de hoje comparada com cada ano de 2026 a 2033, um gráfico,
  os débitos e créditos de IBS/CBS e o detalhamento por tratamento. **Gravar na
  planilha** cria a aba *Resultado*, que dá para filtrar, imprimir ou baixar em Excel.
- **Tabelas:** o cronograma da transição, que pode ser editado, e o catálogo de
  tratamentos, com busca.
- **Simulações salvas:** dê um nome e clique em **Salvar na planilha**. Salvar de
  novo com o mesmo nome grava por cima.

O que está na tela também fica guardado no navegador. Fechar e abrir de novo não
perde o trabalho.

## Quando você mudar alguma coisa no código

- **Pelo menu:** basta salvar no Apps Script e abrir o simulador de novo.
- **Pelo link:** editar o código **não atualiza o link sozinho**. Vá em
  **Implantar → Gerenciar implantações →** ícone de **lápis** → em *Versão*, escolha
  **Nova versão** → **Implantar**. O endereço continua o mesmo.

## Se alguma coisa não sair como o esperado

**O menu "Simulador IBS/CBS" não aparece.**
Recarregue a planilha e espere uns 10 segundos. Se continuar sem aparecer, abra o
Apps Script, escolha a função `onOpen` na lista ao lado de *Depurar*, clique em
**Executar** e autorize. Depois recarregue a planilha.

**"Exception: Cannot call SpreadsheetApp.getUi() from this context".**
Você clicou em *Executar* com `abrirSimulador` escolhida no editor. Essa função só
funciona pelo menu da planilha, então use o menu.

**A janela abre em branco ou aparece "Nenhum arquivo HTML com o nome pagina/motor_js".**
Um dos arquivos está com o nome errado. `pagina` e `motor_js` precisam estar escritos
assim mesmo, minúsculos e sem acento, e os dois precisam ser do tipo **HTML**, não `.gs`.

**Aparece "Sem ligação com a planilha".**
Você abriu o arquivo `pagina.html` direto no navegador, e ele só funciona dentro do
Google. Abra pelo menu ou pelo link do app da Web. As contas continuam funcionando,
mas salvar na planilha, não.

**Dá erro de sintaxe ao salvar o `Código.gs`.**
Quase sempre foi uma cópia incompleta. Apague tudo e cole de novo o arquivo inteiro.

**Mudei o código e o link continua igual.**
Faltou publicar a nova versão (seção anterior).

---

## Aviso honesto

O motor de cálculo, o `Codigo.gs` e a tela foram testados fora do Google: a tela
rodou num Chromium de verdade, ligada ao `Codigo.gs` sobre uma planilha simulada.
**O que não deu para testar daqui foi a instalação na sua conta Google.** Se algum
botão estiver com o nome um pouco diferente do que está escrito aqui, a sequência é
a mesma: colar os arquivos, salvar, recarregar a planilha, autorizar e abrir pelo menu.

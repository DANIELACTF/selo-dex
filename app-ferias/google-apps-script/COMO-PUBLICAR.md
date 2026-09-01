# Como publicar o Quadro de Férias no Google

Um roteiro para fazer uma vez. Ao final você tem um endereço que qualquer pessoa
da equipe abre no celular ou no computador, **sem instalar nada e sem fazer login
em lugar nenhum**. Não custa nada e não tem mensalidade.

Você vai precisar de uma conta Google (um Gmail comum serve) e de uns 10 minutos.

Nada aqui é programação: você vai copiar três arquivos e clicar em alguns botões.

---

## Parte 1 — Criar a planilha

1. Abra o navegador e vá em **sheets.new** (digite isso na barra de endereço).
   Uma planilha nova em branco se abre.
2. No canto superior esquerdo, onde está escrito *Planilha sem título*, clique e
   escreva **Quadro de Férias**.

Essa planilha vai ser o banco de dados. As abas com os funcionários e as
solicitações aparecem sozinhas mais adiante — não precisa criar nada à mão.

## Parte 2 — Colar o programa

3. No menu de cima, clique em **Extensões → Apps Script**. Abre uma aba nova, com
   fundo escuro e um arquivo chamado `Código.gs` já aberto.
4. Em cima, onde está *Projeto sem título*, clique e escreva **Quadro de Férias**.

Agora são três arquivos para colar. Os três estão nesta mesma pasta do projeto.

### Arquivo 1 — `Codigo.gs`

5. No editor, apague **tudo** o que estiver escrito em `Código.gs` (clique dentro,
   `Ctrl+A`, `Delete`).
6. Abra o arquivo **`Codigo.gs`** desta pasta, copie o conteúdo inteiro e cole ali.

### Arquivo 2 — `pagina`

7. Na coluna da esquerda, ao lado de **Arquivos**, clique no **+** e escolha **HTML**.
8. Ele pede um nome: escreva **pagina** (sem acento, sem `.html`) e tecle Enter.
9. Apague tudo o que veio pronto nesse arquivo novo.
10. Abra **`pagina.html`** desta pasta, copie tudo e cole ali.

### Arquivo 3 — `regras_js`

11. De novo: **+** ao lado de Arquivos → **HTML**.
12. Nome: **regras_js** (com o sublinhado, sem acento).
13. Apague o que veio pronto, abra **`regras_js.html`** desta pasta, copie tudo e cole.

14. Clique no ícone de **disquete** (Salvar projeto), ou `Ctrl+S`.

No fim você deve ter exatamente estes três arquivos na coluna da esquerda:
`Código.gs`, `pagina.html` e `regras_js.html`.

## Parte 3 — Publicar

15. No canto superior direito, clique em **Implantar → Nova implantação**.
16. Clique na **engrenagem** ao lado de *Selecione o tipo* e escolha **App da Web**.
17. Preencha assim:
    - **Descrição:** `Quadro de Férias`
    - **Executar como:** *Eu* (seu e-mail)
    - **Quem pode acessar:** **Qualquer pessoa**

    > ⚠️ Cuidado com esta última: existem duas opções parecidas. Tem que ser
    > **"Qualquer pessoa"**. Se você escolher *"Qualquer pessoa com uma Conta do
    > Google"*, a equipe vai ser obrigada a fazer login — que é justamente o que
    > queremos evitar.

18. Clique em **Implantar**.

## Parte 4 — Autorizar (a parte que assusta, mas é normal)

Na primeira vez o Google pede permissão para o programa mexer na sua planilha.

19. Clique em **Autorizar acesso** e escolha sua conta.
20. Vai aparecer uma tela dizendo **"O Google não verificou este app"**. Isso é
    esperado: o app é seu, foi você que acabou de colá-lo, e ele não passou pela
    revisão do Google porque não precisa — não é um app público.
21. Clique em **Avançado** (letra pequena embaixo à esquerda) e depois em
    **Acessar Quadro de Férias (não seguro)**.
22. Clique em **Permitir**.

## Parte 5 — Pegar o link e começar a usar

23. O Google mostra o **URL do app da Web**, terminado em `/exec`. Clique em
    **Copiar**. É esse o link da equipe.
24. Abra o link numa aba nova. O app aparece.
25. Vá na aba **Gestão**. Como ainda não existe PIN, ele pede que você crie um.
    **Escolha o PIN agora, antes de mandar o link para alguém** — quem entrar
    primeiro é quem define.
26. Cadastre a equipe em **Cadastrar funcionário**. A data de admissão é
    obrigatória: é dela que sai todo o cálculo de saldo.
27. Se a empresa já existe há tempos, use **Lançar férias já gozadas** para
    registrar as férias anteriores. Sem isso, quem já é de casa aparece com o
    saldo cheio e o prazo vencido.
28. Mande o link para a equipe. O link é comprido — vale salvar nos favoritos,
    fixar no grupo do WhatsApp ou encurtar.

Pronto. Não tem servidor para cuidar, nem conta para renovar, nem cobrança.

---

## Quando você mudar alguma coisa no programa

Editar o código **não muda o link sozinho**. Depois de colar qualquer alteração:

**Implantar → Gerenciar implantações →** ícone de **lápis** → em *Versão*, escolha
**Nova versão** → **Implantar**.

O endereço continua o mesmo; só o conteúdo é atualizado. Se você criar uma
*nova implantação* em vez de editar a existente, ganha um link diferente e a
equipe continua vendo o antigo.

## Onde ficam os dados

Na planilha, em três abas que o app cria sozinho:

- **Funcionários** — o cadastro da equipe.
- **Solicitações** — um pedido por linha, com nome, período e situação.
- **Ajustes** — o nome da empresa.

Você pode abrir a planilha quando quiser e filtrar, imprimir ou baixar em Excel
(**Arquivo → Fazer o download**). O botão **Abrir a planilha**, dentro da aba
Gestão, leva direto para ela.

Algumas colunas ficam escondidas de propósito (`ID`, `Início (ISO)` e `ID do
funcionário`): são o que amarra cada pedido ao seu dono e a data no formato que o
programa entende. **Não apague nem edite essas colunas**, senão o app perde a
ligação. Corrigir dados pelas telas do app é sempre mais seguro do
que digitar direto na planilha.

O PIN não fica na planilha — ele é guardado em separado, embaralhado, e nem
aparece para quem abrir o arquivo.

## Se alguma coisa não sair como o esperado

**"Quem pode acessar" não tem a opção "Qualquer pessoa".**
Sua conta é de uma empresa (Google Workspace) e o administrador bloqueou
compartilhamento externo. Ou você pede para ele liberar, ou usa uma conta Gmail
pessoal para hospedar, ou aceita que a equipe faça login com as contas da empresa.

**Abri o link e aparece "É necessário fazer login".**
A implantação ficou como *"Qualquer pessoa com uma Conta do Google"*. Vá em
Gerenciar implantações, lápis, corrija para **Qualquer pessoa** e implante a
nova versão.

**A tela fica em branco ou dá erro de script.**
Quase sempre é um dos três arquivos com nome errado. Confira: `pagina` e
`regras_js` precisam estar escritos exatamente assim, minúsculos, sem acento, e
os dois precisam ser do tipo **HTML** — não `.gs`.

**Mudei o código e nada mudou no link.**
Faltou o passo da nova versão, logo acima.

**"Serviço invocado muitas vezes num dia."**
É a cota diária gratuita do Google. Para uma equipe de escritório ela não chega
nem perto do limite; se acontecer, é sinal de que alguma aba ficou recarregando
sozinha — feche e abra de novo.

---

## Uma coisa que você precisa saber antes de mandar o link

A tela de solicitação é **aberta**: quem tiver o endereço escolhe um nome da
lista e manda um pedido. É o preço de não ter senha por pessoa, e para controle
interno costuma bastar — mas quem receber o link consegue, em tese, pedir férias
no nome de outro. Trate o endereço como interno.

A aprovação, essa sim, é protegida: só entra quem souber o PIN, que é conferido
no servidor e não no navegador. Aprovar, recusar, cadastrar e excluir só
acontecem com o PIN correto.

## Aviso honesto sobre este roteiro

O programa foi testado por inteiro — as regras, o servidor e a tela, incluindo o
fluxo completo de pedir, aprovar e recusar. **O que não deu para testar daqui foi
a publicação no Google**, porque isso depende da sua conta. Os nomes de menu
acima são os da interface do Google em português; se algum botão estiver com
nome um pouco diferente, é a mesma sequência: criar arquivo, salvar, implantar
como app da Web, autorizar, copiar o link.

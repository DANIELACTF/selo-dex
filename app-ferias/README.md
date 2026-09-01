# Quadro de Férias

Controle interno de solicitação e aprovação de férias. O funcionário abre um
link, escolhe o nome e pede as férias; o RH entra com um PIN e aprova ou recusa.
Ninguém precisa de conta em lugar nenhum — só do endereço.

O aviso de férias e o cálculo do pagamento continuam saindo do sistema de folha.
Este app cuida só do combinado: quem vai sair, quando, e se o RH aprovou.

## Qual versão usar

O mesmo app existe em duas versões, com a mesma tela e as mesmas regras.

**Versão Google** — para quem não quer servidor nem mensalidade. Roda dentro do
Google e guarda os dados numa planilha do seu Drive. Publicação toda pelo
navegador, uns 10 minutos, de graça, sem manutenção.

→ **[google-apps-script/COMO-PUBLICAR.md](google-apps-script/COMO-PUBLICAR.md)** — roteiro passo a passo, sem jargão.

**Versão servidor** — para quem prefere hospedagem própria e banco em arquivo.
Precisa de um lugar que rode Node (Render, Railway, uma máquina do escritório) e,
em geral, de um plano pago para os dados não se perderem.

→ [Como rodar](#versão-servidor), mais abaixo.

Comece pela versão Google. Se um dia quiser sair de lá, a versão servidor já
está pronta e usa exatamente as mesmas regras.

## O que ele confere

Quando o funcionário monta o pedido, o app separa o que **impede** o envio, o
que merece **atenção** e o que é só **nota**. O servidor refaz a mesma
conferência antes de gravar, então não adianta burlar a tela.

| Regra | Base legal |
|---|---|
| Férias só depois de 12 meses de casa | CLT, art. 130 |
| Saldo do período aquisitivo (30 dias, ou o que estiver no cadastro) | CLT, art. 130 |
| No máximo 3 períodos, um com 14 dias ou mais, nenhum abaixo de 5 | CLT, art. 134, §1º |
| Não começa em sexta, em sábado nem nos dois dias antes de feriado | CLT, art. 134, §3º |
| Aviso com 30 dias de antecedência (avisa, não impede) | CLT, art. 135 |

Também bloqueia períodos sobrepostos da mesma pessoa e avisa quando dois colegas
do mesmo setor pedem datas que se cruzam — no formulário e com um contorno
vermelho no quadro do ano.

Feriados nacionais são calculados sozinhos, inclusive os móveis (Sexta-feira
Santa e Corpus Christi, pelo algoritmo de Meeus para a Páscoa). Carnaval e
Corpus Christi entram como ponto facultativo, não como feriado nacional.

## Primeiros passos, nas duas versões

1. Abra a aba **Gestão**. Como ainda não existe PIN, a primeira pessoa que
   entrar define o dele. Escolha o PIN antes de passar o link para a equipe.
2. Cadastre a equipe em **Cadastrar funcionário**. A data de admissão é
   obrigatória: todo o cálculo de período aquisitivo sai dela.
3. Use **Lançar férias já gozadas** para registrar as férias anteriores ao
   sistema. Sem isso, quem já é de casa aparece com saldo cheio e prazo vencido.
4. Passe o endereço para a equipe. Funciona no celular.

## Sobre acesso

A tela de solicitação é aberta: quem tem o link escolhe um nome da lista e envia
um pedido. É o suficiente para controle interno, e é o preço de não ter login.

A área de aprovação é protegida de verdade. O PIN é guardado embaralhado
(`scrypt` na versão servidor, `SHA-256` com sal na versão Google), conferido
sempre do lado do servidor, e a sessão vale 12 horas. Aprovar, recusar,
cadastrar, excluir e trocar o PIN só acontecem com sessão válida — o navegador
não decide nada disso sozinho. Na versão servidor, dez erros seguidos do mesmo
endereço travam as tentativas por 5 minutos.

Se um dia precisar que cada funcionário só veja o próprio pedido, aí sim entra
login por pessoa. Hoje não tem.

---

## Versão servidor

Precisa do **Node 22.5 ou mais novo** e de nada além disso — não usa nenhuma
biblioteca externa.

```bash
cd app-ferias
npm start                 # abre em http://localhost:3000
```

Para outra porta ou outro lugar de banco:

```bash
PORT=8080 FERIAS_DADOS=/var/dados/ferias npm start
```

Os dados ficam num arquivo SQLite em `dados/ferias.db`. **Backup é copiar esse
arquivo** (com o servidor parado, ou copiando também o `.db-wal`).

Em hospedagem tipo Render ou Railway, o comando de start é `npm start` e a porta
vem da variável `PORT` — as duas coisas já estão prontas. Aponte `FERIAS_DADOS`
para um disco que não seja apagado a cada deploy, senão o banco se perde.

Numa máquina do escritório, com systemd:

```ini
[Unit]
Description=Quadro de Ferias
After=network.target

[Service]
WorkingDirectory=/opt/quadro-ferias
ExecStart=/usr/bin/node servidor.js
Environment=PORT=3000
Environment=FERIAS_DADOS=/var/lib/quadro-ferias
Restart=always
User=ferias

[Install]
WantedBy=multi-user.target
```

Se o servidor for ficar acessível fora da rede interna, coloque um proxy com
HTTPS na frente (nginx, Caddy). O PIN viaja no corpo da requisição: sem HTTPS,
quem estiver na mesma rede consegue lê-lo. (Na versão Google isso não se aplica —
o Google já serve tudo por HTTPS.)

---

## Estrutura

```
app-ferias/
  servidor.js              versão servidor: HTTP + SQLite, sem dependências
  publico/
    index.html             a tela inteira (HTML, CSS e JS)
    regras.js              as regras da CLT
  google-apps-script/
    COMO-PUBLICAR.md       roteiro de publicação no Google
    Codigo.gs              versão Google: planilha no lugar do banco
    pagina.html            gerado a partir de publico/index.html
    regras_js.html         gerado a partir de publico/regras.js
    gerar.js               o gerador dos dois arquivos acima
  testes/
    regras.test.js         29 testes das regras
    api.test.js            43 testes do servidor, com banco temporário
    apps-script.test.js    58 testes do Codigo.gs, com a planilha simulada
```

As regras e a tela têm **uma fonte só**: `publico/regras.js` e
`publico/index.html`. Os arquivos de `google-apps-script/` marcados como gerados
saem deles, e a única diferença real entre as duas versões é como a tela conversa
com o servidor — `fetch` de um lado, `google.script.run` do outro.

```bash
npm test              # roda os três conjuntos e confere se o gerado está em dia
npm run gerar-google  # regera pagina.html e regras_js.html depois de mexer na tela
```

Mexeu em `publico/`? Rode `npm run gerar-google` e cole os arquivos novos no
Apps Script (veja "Quando você mudar alguma coisa" no roteiro de publicação).
O `npm test` avisa se você esquecer.

## Limites conhecidos

- Feriados estaduais e municipais ficam de fora.
- Não calcula o valor das férias nem emite o aviso — isso é da folha.
- O desconto de dias por faltas injustificadas (art. 130) é digitado pelo RH no
  campo "dias de férias por período", não vem de um controle de ponto.
- Abono pecuniário (venda de dias) não é tratado aqui.
- Sem envio de e-mail: o funcionário vê a resposta ao abrir o link de novo.

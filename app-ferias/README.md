# Quadro de Férias

Previsão e controle das férias da equipe. O funcionário abre um link, vê quem do
setor dele já está fora, escolhe uma faixa livre e pede. O pedido só vale depois
de três autorizações: **gestor do departamento, departamento pessoal e diretor**.
Com as três, sai o **aviso de retorno** para imprimir.

Ninguém precisa de conta em lugar nenhum — só do endereço.

**O que este app não faz:** saldo de dias, período aquisitivo, aviso de férias e
cálculo do pagamento continuam no sistema de folha. Aqui é só o combinado: quem
sai, quando volta, e quem autorizou.

## Qual versão usar

O mesmo app existe em duas versões, com a mesma tela e as mesmas regras.

**Versão Google** — para quem não quer servidor nem mensalidade. Roda dentro do
Google e guarda os dados numa planilha do seu Drive. Publicação toda pelo
navegador, uns 10 minutos, de graça, sem manutenção.

→ **[google-apps-script/COMO-PUBLICAR.md](google-apps-script/COMO-PUBLICAR.md)** — roteiro passo a passo, sem jargão.

**Versão servidor** — para quem prefere hospedagem própria e banco em arquivo.
Precisa de um lugar que rode Node e, em geral, de um plano pago para os dados não
se perderem. → [Como rodar](#versão-servidor), mais abaixo.

## Como funciona

**O funcionário** escolhe o nome, vê o quadro do próprio setor já posicionado no
mês de hoje, escolhe as datas e envia. Enquanto digita, o app avisa se alguém do
setor já está fora naquele período e confere o dia de início. Depois acompanha as
três autorizações na tela dele, uma a uma.

**Quem autoriza** entra com o próprio PIN — o sistema reconhece pelo PIN se é o
gestor, o departamento pessoal ou o diretor. Cada um assina só o campo dele e vê,
em destaque, quantos pedidos esperam a assinatura *dele*. Qualquer um dos três
pode recusar, e a recusa encerra o pedido com o motivo registrado.

**Com as três assinaturas**, o pedido vira *autorizado* e o botão **Aviso de
retorno** abre um documento com a data de volta em destaque e as três
autorizações — nome, papel e data de cada uma — pronto para imprimir.

**O departamento pessoal** é quem cadastra a equipe, lança férias já combinadas
fora do sistema, exclui registros e troca os nomes e PINs. Gestor e diretor só
autorizam e consultam.

## O que é conferido

O app confere agendamento, não direito a férias:

| O que | Por quê |
|---|---|
| Choque com colega do mesmo setor | O motivo de o quadro existir — avisa, não impede |
| Choque com outro período seu | Bloqueia |
| Início na sexta, no sábado ou nos dois dias antes de feriado | CLT, art. 134, §3º — bloqueia |
| Menos de 30 dias de antecedência | CLT, art. 135 — avisa |
| Data no passado, ou mais de 30 dias corridos | Bloqueia |

Feriados nacionais são calculados sozinhos, inclusive os móveis (pelo algoritmo
de Meeus para a Páscoa). Carnaval e Corpus Christi entram como ponto facultativo.
Feriados estaduais e municipais não estão incluídos.

## Primeiros passos

1. Abra a aba **Autorização**. Na primeira vez ela pede os três nomes e os três
   PINs de uma vez. Quem preencher entra como departamento pessoal.
2. Cadastre a equipe em **Cadastrar funcionário**. O **setor** é o campo que faz
   o aviso de choque funcionar — preencha sempre.
3. Use **Lançar férias já combinadas** para pôr no quadro as férias acertadas
   antes do sistema. Entram já autorizadas.
4. Entregue os PINs ao gestor e ao diretor, e passe o link para a equipe.

## Sobre acesso

A tela de solicitação é aberta: quem tem o link escolhe um nome da lista e envia
um pedido. É o suficiente para controle interno, e é o preço de não ter login.

As autorizações são protegidas de verdade. Cada PIN é guardado embaralhado
(`scrypt` na versão servidor, `SHA-256` com sal na versão Google), conferido
sempre do lado do servidor, e a sessão vale 12 horas. O servidor não aceita que
um papel assine o campo de outro, nem que o mesmo papel assine duas vezes, nem
que alguém autorize um pedido já recusado. Cadastro e ajustes só respondem ao PIN
do departamento pessoal. Na versão servidor, dez erros seguidos do mesmo endereço
travam as tentativas por 5 minutos.

---

## Versão servidor

Precisa do **Node 22.5 ou mais novo** e de nada além disso — não usa nenhuma
biblioteca externa.

```bash
cd app-ferias
npm start                 # abre em http://localhost:3000
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
HTTPS na frente (nginx, Caddy). Os PINs viajam no corpo da requisição: sem HTTPS,
quem estiver na mesma rede consegue lê-los. (Na versão Google isso não se aplica —
o Google já serve tudo por HTTPS.)

---

## Estrutura

```
app-ferias/
  servidor.js              versão servidor: HTTP + SQLite, sem dependências
  publico/
    index.html             a tela inteira (HTML, CSS e JS)
    regras.js              as regras de agendamento
  google-apps-script/
    COMO-PUBLICAR.md       roteiro de publicação no Google
    Codigo.gs              versão Google: planilha no lugar do banco
    pagina.html            gerado a partir de publico/index.html
    regras_js.html         gerado a partir de publico/regras.js
    gerar.js               o gerador dos dois arquivos acima
  testes/
    regras.test.js          42 testes das regras
    api.test.js             67 testes do servidor, com banco temporário
    apps-script.test.js     75 testes do Codigo.gs, com a planilha simulada
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
Apps Script. O `npm test` avisa se você esquecer.

## Limites conhecidos

- Feriados estaduais e municipais ficam de fora.
- Não controla saldo de dias nem período aquisitivo — de propósito.
- Não calcula o valor das férias nem emite o aviso de férias legal.
- As três autorizações podem sair em qualquer ordem; o app não força o gestor a
  assinar antes do diretor.
- Sem envio de e-mail: cada um vê as novidades ao abrir o link de novo.

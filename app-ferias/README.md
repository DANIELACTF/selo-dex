# Quadro de Férias

App para os funcionários pedirem férias e o RH aprovar, com as regras da CLT
conferidas na hora do pedido.

Uma página só, sem servidor e sem dependências. O arquivo `index.html` abre
direto no navegador; o mesmo código roda como Artifact do Claude, e é aí que os
dados passam a ser compartilhados entre todo mundo.

## O que ele faz

**Aba Solicitar** — o funcionário escolhe o nome, vê o saldo do período
aquisitivo e monta o pedido. Enquanto digita, o app calcula a data de retorno e
lista o que impede o pedido, o que merece atenção e o que é só informação. Não
dá para enviar um pedido com impedimento.

**Aba Gestão** (protegida por PIN) — pendentes, quem está de férias hoje,
aprovações dos próximos 60 dias e riscos de férias em dobro. Dá para aprovar,
recusar com motivo, imprimir o aviso de férias do art. 135, exportar CSV para o
departamento pessoal, cadastrar a equipe e ver o quadro anual com as férias de
todo mundo lado a lado.

## Regras conferidas

| Regra | Base legal |
|---|---|
| Férias só depois de 12 meses de casa | CLT, art. 130 |
| 30, 24, 18, 12 ou 0 dias conforme as faltas injustificadas | CLT, art. 130 |
| No máximo 3 períodos, um deles com 14 dias ou mais, nenhum abaixo de 5 | CLT, art. 134, §1º |
| Início vedado na sexta, no sábado e nos dois dias antes de feriado | CLT, art. 134, §3º |
| Aviso com 30 dias de antecedência | CLT, art. 135 |
| Período concessivo de 12 meses — depois disso, pagamento em dobro | CLT, art. 137 |
| Abono pecuniário de até 1/3, um por período, pedido até 15 dias antes do fim do aquisitivo | CLT, art. 143 |
| Pagamento até 2 dias antes do início | CLT, art. 145 |
| Adiantamento da 1ª parcela do 13º requerido em janeiro | Lei 4.749/65, art. 2º, §2º |

Também avisa quando dois colegas do mesmo setor pedem períodos que se cruzam.

Feriados nacionais são calculados sozinhos, inclusive os móveis (Sexta-feira
Santa e Corpus Christi, via algoritmo de Meeus para a Páscoa). Carnaval e Corpus
Christi entram como ponto facultativo, não como feriado nacional. **Feriados
estaduais e municipais não estão incluídos.**

## Como usar

### Como Artifact do Claude — dados compartilhados

É o modo que faz o app valer a pena: todo mundo que abre o link vê as mesmas
solicitações, e a aprovação do RH aparece na tela do funcionário.

```bash
python3 gerar-artifact.py       # gera artifact.html a partir do index.html
```

Publique `artifact.html` como Artifact com as capacidades `db` (banco
compartilhado) e `downloads` (exportar CSV). O indicador no topo da página passa
a mostrar **Dados compartilhados**.

Uma limitação a considerar antes de adotar: um Artifact que usa `db` é interno à
organização — quem for abrir precisa estar logado no Claude e ser membro da
mesma organização de quem publicou. Se a equipe não estiver nessa condição, o
caminho é hospedar o `index.html` com um backend próprio.

### Como arquivo solto — dados só no aparelho

Abrir `index.html` no navegador (ou servir de qualquer hospedagem estática)
funciona, mas sem banco compartilhado: cada pessoa guarda os dados no
`localStorage` do próprio navegador e ninguém vê o que a outra enviou. Serve para
testar e para o RH usar sozinho. O topo mostra **Somente neste dispositivo**.

## Primeiros passos

1. Abra a aba **Gestão** e defina o PIN. Ele passa a ser pedido para entrar ali.
2. Preencha **Dados da empresa** — o nome vai para o topo e para o aviso de férias.
3. Cadastre a equipe em **Cadastrar funcionário**. A data de admissão é
   obrigatória: todo o cálculo de período aquisitivo sai dela.
4. Use **Lançar férias já gozadas** para registrar as férias anteriores ao
   sistema. Sem isso, quem já é de casa aparece com vários períodos vencidos nos
   alertas — o que está correto, mas polui a tela.
5. Passe o link (ou o arquivo) para a equipe e peça que usem a aba **Solicitar**.

## Sobre o PIN

O PIN é guardado como hash e serve para a equipe não abrir a área de aprovação
por engano. **Não é segurança de verdade**: quem tem o link tem acesso técnico
aos dados. Para controle de acesso real seria preciso autenticação de servidor.

## Desenvolvimento

```bash
node testes/regras.test.js      # 33 testes do motor de regras da CLT
python3 gerar-artifact.py       # gera o artifact.html publicável
```

Os testes leem o motor direto do `index.html`, então testam exatamente o código
que roda no app. Se você mexer nas regras, rode os testes antes de publicar.

Estrutura do `index.html`, em blocos numerados no próprio arquivo: datas e
feriados, regras da CLT, utilitários de interface, armazenamento, estado, aba do
funcionário, aba da gestão, quadro do ano, cadastro, janelas, exportação,
confirmação, desenho geral, eventos e início.

## Limites conhecidos

- Feriados estaduais e municipais ficam de fora.
- Não calcula o valor das férias (remuneração, terço constitucional, INSS, IRRF)
  — isso continua na folha.
- Faltas injustificadas são digitadas pelo RH, não vêm de um controle de ponto.
- Não emite recibo de quitação nem integra com eSocial.
- O app aponta impedimentos e avisos; a concessão e a conferência final
  continuam sendo do empregador e do departamento pessoal.

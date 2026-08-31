# Soul Taquá 307 — maquete eletrônica

Modelo 3D interativo do projeto de interiores da unidade 00307, Bloco 04, do Soul Taquá
Clube (Estrada do Outeiro Santo, 437 — Taquara, Rio de Janeiro).

`soul-taqua-307.html` é uma página única, sem dependências externas de script: o
renderizador WebGL, a geometria e os materiais procedurais são todos próprios. As únicas
requisições de rede são as fontes do Google Fonts, que degradam para a pilha do sistema.

## Levantamento

A volumetria **não** foi deduzida do quadro de áreas do memorial. Ela foi medida sobre a
**Planta Apto Comum** do contrato, escala 1:75, extraindo por análise de imagem a
coordenada de cada face de parede, vão e louça do desenho, e calibrando a escala pelas
cotas impressas.

Cotas livres conferidas contra o memorial descritivo:

| Ambiente | Memorial | Medido no desenho |
| --- | --- | --- |
| Estar / Jantar | 4,45 × 2,50 | 4,47 × 2,51 |
| Dormitório 01 | 2,90 × 2,50 | 2,91 × 2,51 |
| Dormitório 02 | 2,40 × 2,10 | 2,40 × 2,11 |
| Cozinha / A.S. | 2,12 × 2,10 | 2,11 × 2,10 |
| Banho | 1,13 × 2,33 | 1,12 × 2,10 (2,33 é medida por fora das paredes) |
| Varanda | 1,50 × 1,40 | 1,51 × 1,40 |

Paredes com 11 cm, medidos. Pé-direito de 2,60 m e forro rebaixado em 2,45 m são valores
usuais da tipologia, não cotados no contrato.

**Garden × varanda.** A prancha do contrato é a versão *com garden*, do térreo. A unidade
307 é a versão *com varanda, sem garden*, do 3º pavimento. A caixa estrutural e as
divisórias são as mesmas; o recuo de canto que no térreo abre para o garden é aqui a
varanda de 1,50 × 1,40 — o que explica sua única parede cheia, a divisa com o Dormitório
02, ter exatamente 1,40 m, como o memorial descreve.

**O modelo não substitui medição em campo.** Nenhuma peça de marcenaria deve ser
encomendada a partir dele, conforme o próprio memorial determina.

## O que a planta impõe ao projeto

Três leituras do desenho condicionam todo o partido, e estão registradas nas fichas dos
ambientes:

1. **Não há circulação.** As quatro portas — dois dormitórios, banho e entrada — abrem no
   estar. Ele acumula sala, jantar e hall, o que consome a parede norte inteira e deixa a
   parede de fundos como a única longa e livre para a boiserie, o rack e a TV.
2. **O setor social não tem janela própria.** A única abertura é a da cozinha; a luz chega
   ao estar pelo "L" aberto entre os dois. É isso que dá função ao espelho da parede de
   fundos previsto no memorial.
3. **O Dormitório 01 é em "L"**, com recuo de 0,50 m no fundo. A parede de fundos fica com
   1,46 m e não recebe a cabeceira. A única parede longa e livre é a empena, com 2,70 m: com
   a cabeceira ali, a cama queen deixa 0,71 m de um lado e 0,41 m do outro, e não os
   0,55 m de cada lado que o memorial pressupõe.

## O que a página faz

- **Três câmeras** — perspectiva orbital, planta cotada e caminhada em primeira pessoa
  (W A S D, com colisão pelo perímetro dos ambientes e das passagens).
- **Ficha por ambiente** — clicar num ambiente, na lista ou no próprio modelo, leva a
  câmera a uma tomada interna e abre peças, dimensões, notas de projeto e as restrições
  de contrato que incidem ali.
- **Estudo solar** — a fachada é nascente. A régua de horas move o sol num arco inclinado
  ao norte e o mapa de sombras mostra o sol entrando na bancada do home office até por
  volta das 11h e nada à tarde. A persiana rolô screen aparece enquanto há sol na fachada.
- **Camadas** — laje e forro, marcenaria, mobiliário solto, varanda, boiserie, corte de
  paredes a 1,30 m e iluminação artificial (sanca com fita de LED e spots de perímetro).

## Organização do código

Arquivo único, em blocos comentados:

| Bloco | Conteúdo |
| --- | --- |
| `M4` / `V` | álgebra de matrizes e vetores |
| `C`, `MAT`, `L` | paleta do memorial, materiais procedurais e camadas |
| eixos `XA0`…`ZB1` | as coordenadas medidas na planta, nomeadas |
| `box` / `rbox` / `cyl` / `wall` / `boiserie` | geradores de geometria |
| `buildScene` | a unidade, ambiente por ambiente, na ordem do memorial |
| `VS` / `FS` / `DVS` / `DFS` | shaders: materiais procedurais e mapa de sombras empacotado em RGBA |
| `ROOMS` / `OVERVIEW` | conteúdo das fichas, memorial cruzado com a planta |
| `render` | passe de sombra, passe opaco, passe translúcido |

Toda a geometria é gerada em espaço de mundo e enviada em dois buffers intercalados
(opaco e translúcido), desenhados em uma chamada cada. Visibilidade de camada, corte de
parede e destaque de ambiente são resolvidos no fragment shader.

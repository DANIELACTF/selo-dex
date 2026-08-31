# Soul Taquá 307 — maquete eletrônica

Modelo 3D interativo do projeto de interiores da unidade 00307, Bloco 04, do Soul Taquá
Clube (Estrada do Outeiro Santo, 437 — Taquara, Rio de Janeiro), reconstruído a partir do
memorial descritivo de interiores.

`soul-taqua-307.html` é uma página única, sem dependências externas de script: o
renderizador WebGL, a geometria e os materiais procedurais são todos próprios. As únicas
requisições de rede são as fontes do Google Fonts, que degradam para a pilha do sistema.

## O que a página faz

- **Três câmeras** — perspectiva orbital, planta cotada e caminhada em primeira pessoa
  (W A S D, colisão contra o perímetro dos ambientes e das passagens).
- **Ficha por ambiente** — clicar num ambiente, na lista ou no próprio modelo, leva a
  câmera a uma tomada interna e abre peças, dimensões, notas de projeto e as restrições
  de contrato que incidem ali.
- **Estudo solar** — a fachada é nascente. A régua de horas move o sol num arco inclinado
  ao norte e o mapa de sombras mostra o sol entrando na bancada do home office até por
  volta das 11h e nada à tarde. A persiana rolô screen aparece enquanto há sol na fachada.
- **Camadas** — laje e forro, marcenaria, mobiliário solto, varanda, boiserie, corte de
  paredes a 1,30 m e iluminação artificial (sanca com fita de LED e spots de perímetro).

## Como o modelo foi levantado

As cotas do memorial são medidas livres entre paredes, lidas em planta 1:75, e não fecham
um retângulo exato. Três decisões foram tomadas e estão registradas na própria página, em
"Premissas do modelo e desvios":

1. O estar foi modelado com 4,75 m de profundidade, e não 4,45 m, para que a cozinha de
   2,10 m encaixasse atrás do Dormitório 01 na mesma faixa. A largura de 2,50 m foi mantida.
2. A área interna modelada soma cerca de 36 m² contra os 34 m² do quadro de áreas. A
   diferença está na circulação, que o contrato não cota.
3. Paredes de 15 cm, pé-direito estrutural de 2,60 m e forro rebaixado em 2,45 m são
   valores usuais da tipologia, não cotados no contrato.

A varanda foi posicionada projetada da fachada, junto à divisa entre os dormitórios: é a
única leitura compatível com o memorial, que descreve uma parede cheia de 1,40 m na divisa
com o Dormitório 02, o acesso pelo Dormitório 01 e as demais faces em guarda-corpo.

**O modelo não substitui medição em campo.** Nenhuma peça de marcenaria deve ser
encomendada a partir dele, conforme o próprio memorial determina.

## Organização do código

Arquivo único, em blocos comentados:

| Bloco | Conteúdo |
| --- | --- |
| `M4` / `V` | álgebra de matrizes e vetores |
| `C`, `MAT`, `L` | paleta do memorial, materiais procedurais e camadas |
| `box` / `rbox` / `cyl` / `wall` / `boiserie` | geradores de geometria |
| `buildScene` | a unidade, ambiente por ambiente, na ordem do memorial |
| `VS` / `FS` / `DVS` / `DFS` | shaders: materiais procedurais e mapa de sombras empacotado em RGBA |
| `ROOMS` / `OVERVIEW` | conteúdo das fichas, extraído do memorial |
| `render` | passe de sombra, passe opaco, passe translúcido |

Toda a geometria é gerada em espaço de mundo e enviada em dois buffers intercalados
(opaco e translúcido), desenhados em uma chamada cada. Visibilidade de camada, corte de
parede e destaque de ambiente são resolvidos no fragment shader.

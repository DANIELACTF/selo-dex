# Kit — Projeto "Rotinas de Escritório" no claude.ai

Tudo que vai dentro de um Projeto novo do claude.ai para a operação da
Moraex. Monte na ordem abaixo; leva uns 5 minutos.

## 1. Criar o Projeto

Em claude.ai → **Projects** → **Create project**.

- **Nome:** `Rotinas de Escritório — Moraex`
- **Descrição:** `Rotinas dos departamentos Fiscal, Pessoal e Contábil: triagem de empresa nova, onboarding, apuração, fechamento e relatórios.`

## 2. Colar as instruções

Abra **Instruções personalizadas** do Projeto e cole o conteúdo de
[`instrucoes-do-projeto.md`](instrucoes-do-projeto.md) — o texto abaixo da
linha `---`, sem o título do arquivo.

## 3. Subir os arquivos de conhecimento

Em **Adicionar conhecimento**, suba os seis arquivos de `conhecimento/`:

**Etapa 1 — triagem do e-mail**

| Arquivo | Para quê |
|---|---|
| `padrao-ficha-abertura.md` | O padrão da Ficha de Abertura — seções, regras de preenchimento, particularidades típicas |
| `modelo-ficha.html` | Gabarito visual da Ficha de Abertura (cores, tabelas, CSS de impressão A4) |
| `exemplos-email-empresa-nova.md` | Cinco e-mails reais da Thays, com as variações de formato já observadas |

**Etapa 2 — implantação, depois da reunião**

| Arquivo | Para quê |
|---|---|
| `padrao-ficha-cadastral.md` | O padrão da Ficha Cadastral definitiva e o que ela tem a mais que a de Abertura |
| `modelo-ficha-cadastral.html` | Gabarito visual da ficha definitiva |
| `fluxo-pos-reuniao.md` | Planilha, pastas na rede, G-Click, carteira e a **carência de três competências** |
| `roteiro-gclick.md` | Checklist de cadastro no G-Click, guiado pelos dados da ficha |

## 4. Habilitar as skills

As skills valem para a conta toda, não por projeto — confira em
**Settings → Capabilities → Skills** se estas estão ativas:

- `ficha-abertura-fiscal` ← etapa 1; suba pelo zip se ainda não estiver lá
- `implantacao-cliente-fiscal` ← etapa 2; idem
- `onboarding-cliente`
- `analise-tributaria-regime`
- `apuracao-simples-nacional`
- `fechamento-mensal`
- `relatorio-mensal`
- `conciliacao-clientes`
- `revisao-fiscal-cruzamento-sped`

Se a biblioteca usar prefixo numérico (`20-triagem-whatsapp`,
`23-follow-up-cliente`…), renomeie as pastas das skills novas com os
próximos números livres e ajuste o campo `name:` de cada `SKILL.md` para
bater com a pasta. Mantenha as duas em sequência — elas são as etapas 1 e
2 do mesmo fluxo.

## 5. Testar

**Etapa 1.** Abra uma conversa no Projeto, cole um e-mail "EMPRESA NOVA"
e peça para processar. O esperado: as fichas no padrão do Dep. Fiscal, os
alertas de certificado e a lista de pendentes de distribuição. Para um
teste rápido sem esperar e-mail novo, use um dos exemplos de
`conhecimento/exemplos-email-empresa-nova.md`.

**Etapa 2.** Na sequência, peça a planilha de particularidades. Preencha
uma linha (inclusive uma "Particularidade (Paulo)" e um responsável),
devolva a planilha e peça as fichas definitivas. O esperado: a Ficha
Cadastral com as ▶ da reunião em destaque, o CSV das pastas, o roteiro do
G-Click e a carteira atualizada — com a empresa entrando em **carência**,
não direto na carteira do analista.

## Manutenção

Quando o Dep. Fiscal emitir uma ficha com layout ou redação diferente,
atualize o par correspondente e suba de novo — é o que mantém a saída
fiel ao padrão do escritório:

| Mudou a… | Atualize |
|---|---|
| Ficha de Abertura | `padrao-ficha-abertura.md` + `modelo-ficha.html` |
| Ficha Cadastral definitiva | `padrao-ficha-cadastral.md` + `modelo-ficha-cadastral.html` |
| Regra de carência, pastas ou carteira | `fluxo-pos-reuniao.md` + as instruções do Projeto |
| Tela ou campo do G-Click | `roteiro-gclick.md` |

O roteiro do G-Click tem marcadores `‹confirmar›` nos nomes de menu: na
primeira execução real, anote os caminhos da versão de vocês e feche o
roteiro.

A carência hoje é de **três competências**. Se mudar, ajuste em
`fluxo-pos-reuniao.md` e nas instruções do Projeto — e avise, porque no
repositório ela vive numa constante única (`onboarding/competencia.py`).

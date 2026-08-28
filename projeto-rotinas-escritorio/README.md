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

Em **Adicionar conhecimento**, suba os três arquivos de `conhecimento/`:

| Arquivo | Para quê |
|---|---|
| `padrao-ficha-abertura.md` | O padrão da ficha do Dep. Fiscal — seções, regras de preenchimento, particularidades típicas |
| `modelo-ficha.html` | Gabarito visual da ficha (cores, tabelas, CSS de impressão A4) |
| `exemplos-email-empresa-nova.md` | Cinco e-mails reais da Thays, com as variações de formato já observadas |

## 4. Habilitar as skills

As skills valem para a conta toda, não por projeto — confira em
**Settings → Capabilities → Skills** se estas estão ativas:

- `ficha-abertura-fiscal` ← a nova; se ainda não subiu, use o zip enviado
- `onboarding-cliente`
- `analise-tributaria-regime`
- `apuracao-simples-nacional`
- `fechamento-mensal`
- `relatorio-mensal`
- `conciliacao-clientes`
- `revisao-fiscal-cruzamento-sped`

Se a biblioteca usar prefixo numérico (`20-triagem-whatsapp`,
`23-follow-up-cliente`…), renomeie a pasta da skill nova com o próximo
número livre e ajuste o campo `name:` do `SKILL.md` para bater com a
pasta.

## 5. Testar

Abra uma conversa no Projeto, cole um e-mail "EMPRESA NOVA" e peça para
processar. O esperado: as fichas no padrão do Dep. Fiscal, os alertas de
certificado e a lista de pendentes de distribuição.

Para um teste rápido sem esperar e-mail novo, use um dos exemplos de
`conhecimento/exemplos-email-empresa-nova.md`.

## Manutenção

Quando o Dep. Fiscal emitir uma ficha com layout ou redação diferente,
atualize `padrao-ficha-abertura.md` e `modelo-ficha.html` e suba de novo —
é o que mantém a saída fiel ao padrão do escritório.

---
name: onboarding
description: Processa um e-mail "EMPRESA NOVA" da Thays (Moraex) — confere CNPJ/Simples Nacional, checa certificado digital anexado, gera fichas de onboarding e atualiza a lista de empresas pendentes de distribuição. Use quando o usuário colar ou anexar um e-mail novo da Thays, ou pedir para "rodar o onboarding" / "processar empresa nova".
---

# Onboarding Moraex

Disparo manual (não roda sozinho): o usuário traz o texto de um e-mail
"EMPRESA NOVA" (Thays Oliveira, secretaria@moraex.com.br) e pede para
processar.

## Passos

1. Se o usuário ainda não colou/anexou o texto do e-mail, peça para colar o
   corpo em texto puro (copiar do Outlook) ou anexar um arquivo.
2. Salve o conteúdo em um arquivo temporário `.txt` (ex:
   `/tmp/claude-*/scratchpad/thays_email.txt` se houver diretório de
   scratchpad disponível, senão em qualquer caminho temporário do repo).
3. Garanta a dependência (`pip install -r requirements.txt`, usada para
   gerar o PDF da ficha) e rode:

   ```bash
   python cli.py --input <arquivo.txt>
   ```

   Se a consulta de CNPJ falhar por falta de acesso à internet no ambiente
   atual, rode de novo com `--sem-consulta-cnpj` e avise o usuário que a
   checagem de Simples Nacional não pôde ser feita desta vez.
4. Leia a saída do comando e resuma para o usuário:
   - quantas empresas foram processadas;
   - quais fichas foram geradas (`fichas/<nº>_<NOME>.pdf`, com `.md`
     equivalente mais rápido de conferir sem abrir PDF);
   - **alertas de certificado ausente** — liste as empresas e sugira o
     texto de cobrança para a Thays (algo como: "Fulano, falta o
     certificado digital de <empresa> (CNPJ <...>), pode enviar?");
   - **divergências de regime tributário** (Thays informou um regime, mas
     a Receita não confirma) — chame atenção para essas, podem indicar
     erro de digitação ou mudança recente de regime.
5. Confirme que `data/empresas_pendentes_distribuicao.csv` foi atualizado.
6. Não envie e-mails automaticamente para a Thays nem para ninguém —
   apenas monte o texto de cobrança e deixe o usuário decidir se e como
   enviar (a caixa da Thays é Outlook, não está conectada a esta sessão).

## Limitações a lembrar o usuário, se relevante

- A "Ficha de Abertura — Onboarding Fiscal" (`onboarding/ficha_template.py`)
  já segue o padrão real do Departamento Fiscal (reconstruído a partir de
  12 fichas de exemplo), mas a seção 5 (particularidades) é gerada por
  heurística simples — não substitui a análise fiscal completa do
  analista, é só um ponto de partida.
- A leitura automática da caixa da Thays ainda não existe; veja o README
  do repositório para os próximos passos.

Veja `README.md` na raiz do repositório para a documentação completa do
pipeline.

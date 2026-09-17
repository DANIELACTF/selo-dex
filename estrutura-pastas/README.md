# Estrutura de pastas do cliente na rede

Padrão de pasta criado para todo cliente novo do Dep. Fiscal, logo após a
reunião com o Paulo, junto com a emissão da Ficha Cadastral definitiva.

```
<Raiz da rede>\
└── 1048 - INJECT PHARMA\
    ├── Ficha_Cadastral_1048_INJECT_PHARMA.pdf   ← a ficha definitiva fica na raiz
    ├── Apuracao\
    │   └── 2026\
    │       ├── 01 Janeiro\
    │       ├── 02 Fevereiro\
    │       └── … 12 Dezembro\
    └── Certificado\                              ← o .pfx e o registro da senha
```

## Convenções

- **Nome da pasta:** `<N° do cliente> - <NOME>`. O número vem primeiro
  porque é ele que identifica o cliente na ficha, no G-Click e na
  carteira — ordenar por nome deixa a pasta longe do número que a equipe
  usa no dia a dia.
- **Sem acentos nos nomes de pasta** (`Apuracao`, `03 Marco`). Evita
  problema de codificação em drive de rede montado por sistemas
  diferentes, e é o que já se vê nos caminhos do escritório.
- **Meses com número na frente** (`01 Janeiro`) para ordenarem
  cronologicamente, não em ordem alfabética.
- **A senha do certificado não vai em arquivo de texto na pasta.** A pasta
  `Certificado` guarda o `.pfx`; a senha fica no cofre, e a ficha registra
  apenas se está arquivada ou pendente.

## Como criar

O script `criar-pastas-cliente.ps1` (PowerShell, Windows) cria a
estrutura. É seguro rodar de novo: pasta existente é mantida, nada é
apagado nem sobrescrito.

Um cliente:

```powershell
.\criar-pastas-cliente.ps1 -Raiz "\\servidor\Fiscal\Clientes" -Numero 1048 -Nome "INJECT PHARMA"
```

Um lote inteiro, a partir de um CSV com as colunas `Numero,Nome`:

```powershell
.\criar-pastas-cliente.ps1 -Raiz "F:\Clientes" -Lote .\clientes-novos.csv
```

Opções:

| Parâmetro | Para quê |
|---|---|
| `-Ano 2027` | Ano da subpasta de apuração (padrão: ano atual) |
| `-SemMeses` | Cria só a pasta do ano, sem as 12 subpastas de mês |

O CSV do lote é gerado junto com as fichas definitivas — veja a skill
`implantacao-cliente-fiscal`.

## Antes de rodar em produção

Confirme com quem administra a rede:

1. **O caminho da raiz** — o script não adivinha; `-Raiz` é obrigatório.
2. **Se o padrão de nome bate com o que já existe.** Se as pastas antigas
   usam outro formato (só nome, ou `NOME - N°`), alinhe antes: pasta
   duplicada com dois padrões é pior que padrão nenhum.
3. **Permissão de escrita** na raiz para quem vai rodar.

Rode primeiro para um cliente só e confira o resultado no Explorer antes
de processar um lote.

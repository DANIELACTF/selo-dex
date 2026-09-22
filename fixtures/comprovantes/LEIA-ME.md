# Comprovantes de inscrição — amostras

O "COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL" (Cartão CNPJ) é o que
permite preencher a ficha **sem consultar** dados cadastrais: ele traz razão
social, nome fantasia, abertura, porte, CNAE principal e secundários,
natureza jurídica, endereço e situação cadastral. Não traz a opção pelo
Simples Nacional — essa segue sendo consulta.

| Arquivo | Origem | Serve para |
|---|---|---|
| `1099-THAIS-REIS-linhas.txt` | **reconstruído** a partir do layout padrão da Receita, com os dados reais da ficha `1099_THAIS_REIS.pdf` | formato de PDF convertido em texto: rótulo numa linha, valor na seguinte |
| `1099-THAIS-REIS-inline.txt` | idem | formato de e-mail: rótulo e valor na mesma linha |

> **Atenção:** os dois são *reconstruções*. O layout do documento é estável
> há anos e os dados conferem com a ficha real, mas nenhum dos dois saiu de
> um comprovante de verdade. Ao receber o primeiro comprovante real, salve-o
> aqui e rode `node --test tests/test_comprovante.mjs` — se algum rótulo
> divergir, o teste aponta qual.

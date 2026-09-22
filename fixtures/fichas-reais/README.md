# Fichas reais — o gabarito do padrão

Fichas emitidas pelo Departamento Fiscal da Moraex, guardadas aqui como
referência de layout e redação. É contra elas que se confere se o app ainda
produz o documento no padrão do escritório.

| Arquivo | Serve para |
|---|---|
| `1099_THAIS_REIS.pdf` | Gabarito atual da **Ficha de Abertura**. As seis seções na ordem, a linha Abertura/Porte na seção 1, os CNAEs secundários e o enquadramento completo na seção 2, e o formato `ATIVA desde DD/MM/AAAA (base pública RFB)` na seção 4. |

Os testes `tests/test_gas.mjs` reproduzem a linha da aba Triagem
correspondente a esta ficha (`FICHA_1099`) e conferem campo a campo. Se o
Dep. Fiscal mudar o layout, atualize o PDF aqui, ajuste `FICHA_1099` e o
template — o teste vai apontar o que ficou para trás.

Conteúdo de cliente: repositório privado, por autorização da usuária.

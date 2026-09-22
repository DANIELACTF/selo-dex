# OCR real — o que o reconhecimento entrega de verdade

`email-27-08-2026-ocr.txt` é o texto que sai do OCR (tesseract, português,
200 dpi) das 5 páginas do PDF real `27-08-2026_16.26.pdf`, o e-mail
"EMPRESA NOVA" da Thays impresso do Outlook com os comprovantes de inscrição
colados como **imagem**.

Serve para medir, não para ilustrar. O que ele mostra:

| O que | Como sai do OCR |
|---|---|
| Linhas de empresa do e-mail | legíveis, mas `N°` vira `Nº` (U+00BA) e `CNPJ` vira `CNP)` |
| CNPJ dentro do comprovante | destruído — `68.449.732/0001-05` vira `EE 449 732000105` |
| Rótulos do comprovante | destruídos — `NOME EMPRESARIAL` → `NOME LMIMESANIAL`, `NATUREZA JURÍDICA` → `NATUNEZA JUNIUICA` |
| Códigos de CNAE | **confiáveis** — quase só dígitos; só trocam `-` por `.` |
| Natureza jurídica, município/UF | às vezes |
| Nome empresarial | não confiável: uma linha de endereço passa por razão social |

Daí as três decisões do `Comprovante.gs`:

1. O CNPJ **não** sai do comprovante — vem da linha do e-mail, que é texto de
   verdade e passa pelo dígito verificador.
2. A razão social **não** sai do comprovante, pelo mesmo motivo.
3. Tudo que sai carrega o aviso de conferência, e a consulta à Receita tem
   precedência sobre o OCR.

Medido hoje: o OCR rende CNAE aproveitável em **2 das 7** empresas deste
lote. `tests/test_comprovante.mjs` trava esse número — se cair, alguma
mudança piorou a leitura; se subir, melhorou e o teste deve ser atualizado.

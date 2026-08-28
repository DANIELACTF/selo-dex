#!/usr/bin/env python3
"""CLI manual da automação de onboarding (Moraex).

Disparo manual: cole/exporte o corpo do e-mail "EMPRESA NOVA" da Thays em um
arquivo .txt e rode:

    python cli.py --input caminho/para/email_da_thays.txt

Sem acesso à internet (ou para testar rápido), use --sem-consulta-cnpj para
pular a checagem de CNPJ/Simples Nacional na Receita.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from onboarding.pipeline import processar_email

FICHAS_DIR = Path("fichas")
PENDENTES_CSV = Path("data/empresas_pendentes_distribuicao.csv")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, help="Arquivo .txt com o corpo do e-mail da Thays")
    parser.add_argument(
        "--sem-consulta-cnpj", action="store_true",
        help="Não consulta a BrasilAPI (útil offline ou para teste rápido)",
    )
    args = parser.parse_args()

    texto = Path(args.input).read_text(encoding="utf-8")
    resultados = processar_email(
        texto, FICHAS_DIR, PENDENTES_CSV, consultar=not args.sem_consulta_cnpj
    )

    if not resultados:
        print("Nenhuma empresa encontrada no texto informado. Confira o formato do e-mail.")
        return 1

    print(f"\n{len(resultados)} empresa(s) processada(s):\n")
    alertas: list[str] = []
    for r in resultados:
        status_cert = "OK" if r.certificado_ok else "FALTA CERTIFICADO"
        print(f"  N°{r.raw.numero}  {r.raw.nome}  [{status_cert}]  -> {r.ficha_pdf}")
        if r.alerta_certificado:
            alertas.append(
                f"- {r.raw.nome} (N°{r.raw.numero}, CNPJ {r.raw.cnpj}): "
                "certificado digital não recebido — cobrar da Thays"
            )
        if r.divergencia_regime:
            alertas.append(f"- {r.raw.nome} (N°{r.raw.numero}): {r.divergencia_regime}")

    if alertas:
        print("\nALERTAS:")
        for a in alertas:
            print(f"  {a}")
    else:
        print("\nNenhum alerta.")

    print(f"\nLista de empresas pendentes de distribuição atualizada em: {PENDENTES_CSV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

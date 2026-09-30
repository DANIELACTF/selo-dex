#!/usr/bin/env python3
"""Atalho do comando antigo — a entrada da rotina agora é `moraex.py`.

Mantido para não quebrar quem já tinha o comando anotado:

    python cli.py --input email.txt   ==   python moraex.py triagem --email email.txt

Comandos novos (fichas, planilha, pastas, carteira, carência, skills):

    python moraex.py --help
"""
from __future__ import annotations

import sys

import moraex


def main() -> int:
    argv: list[str] = ["triagem"]
    for arg in sys.argv[1:]:
        if arg == "--input":
            argv.append("--email")
        elif arg.startswith("--input="):
            argv.append("--email=" + arg.split("=", 1)[1])
        else:
            argv.append(arg)

    print("Aviso: `cli.py` virou atalho. Use `python moraex.py triagem --email <arquivo>`.\n")
    return moraex.main(argv)


if __name__ == "__main__":
    sys.exit(main())

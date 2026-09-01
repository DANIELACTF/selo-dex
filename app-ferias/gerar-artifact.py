#!/usr/bin/env python3
"""Extrai de index.html o trecho publicável como Artifact do Claude.

O Artifact é servido dentro de um <!doctype>/<head>/<body> montado pela
plataforma, então ele recebe só o miolo do arquivo — o que está entre os
marcadores ARTIFACT-BEGIN e ARTIFACT-END. O index.html continua sendo o
documento completo, que abre sozinho no navegador.

Uso:  python3 gerar-artifact.py [saida.html]
"""
import re
import sys
from pathlib import Path

raiz = Path(__file__).resolve().parent
fonte = raiz / "index.html"
saida = Path(sys.argv[1]) if len(sys.argv) > 1 else raiz / "artifact.html"

html = fonte.read_text(encoding="utf-8")
m = re.search(r"<!--ARTIFACT-BEGIN-->\n(.*)\n<!--ARTIFACT-END-->", html, re.S)
if not m:
    sys.exit("Marcadores ARTIFACT-BEGIN/ARTIFACT-END não encontrados em index.html")

miolo = m.group(1).replace("\n</head>\n<body>\n", "\n")
saida.write_text(miolo + "\n", encoding="utf-8")
print(f"{saida} — {len(miolo.splitlines())} linhas")

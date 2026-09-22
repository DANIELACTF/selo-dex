"""Valida e empacota as skills do repositório para upload no claude.ai.

Existe por causa de duas recusas reais do uploader que só apareceram na
hora de subir o arquivo:

1. `field 'description' in SKILL.md must be at most 1024 characters`;
2. `SKILL.md must start with YAML frontmatter (---)` — na prática, o zip
   errado sendo arrastado, ou o `SKILL.md` dentro de uma pasta em vez de
   estar na raiz do zip.

As duas são verificáveis antes de abrir o navegador. Este módulo faz as
verificações e gera o zip no formato que o uploader aceita: `SKILL.md` na
**raiz**, sem pasta embrulhando.
"""
from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

SKILLS_DIR = Path(".claude/skills")
LIMITE_DESCRICAO = 1024
NOME_VALIDO = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


@dataclass
class Resultado:
    pasta: Path
    nome: str | None = None
    tamanho_descricao: int = 0
    erros: list[str] = field(default_factory=list)
    zip: Path | None = None

    @property
    def ok(self) -> bool:
        return not self.erros


def _frontmatter(texto: str) -> tuple[dict, list[str]]:
    """Extrai o frontmatter sem depender de PyYAML estar instalado."""
    erros: list[str] = []
    if not texto.startswith("---"):
        erros.append("não começa com o frontmatter YAML (`---` na primeira linha)")
        return {}, erros
    if texto.startswith("﻿"):
        erros.append("tem BOM no início do arquivo — o uploader não reconhece o `---`")

    fim = texto.find("\n---", 3)
    if fim == -1:
        erros.append("o frontmatter não é fechado por uma linha `---`")
        return {}, erros

    campos: dict[str, str] = {}
    chave = None
    for linha in texto[3:fim].splitlines():
        if not linha.strip():
            continue
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", linha)
        if m:
            chave = m.group(1)
            campos[chave] = m.group(2).strip()
        elif chave:  # continuação de valor multilinha
            campos[chave] += " " + linha.strip()

    for chave, valor in campos.items():
        if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "\"'":
            campos[chave] = valor[1:-1]
        elif ":" in valor:
            erros.append(
                f"o campo `{chave}` tem `:` e não está entre aspas — "
                "YAML estrito rejeita; use aspas simples no valor inteiro"
            )
    return campos, erros


def validar(pasta: Path) -> Resultado:
    r = Resultado(pasta=pasta)
    skill_md = pasta / "SKILL.md"
    if not skill_md.exists():
        r.erros.append("não tem SKILL.md")
        return r

    texto = skill_md.read_text(encoding="utf-8")
    campos, erros = _frontmatter(texto)
    r.erros.extend(erros)

    r.nome = campos.get("name")
    if not r.nome:
        r.erros.append("frontmatter sem o campo `name`")
    elif not NOME_VALIDO.match(r.nome):
        r.erros.append(f"`name: {r.nome}` — use só minúsculas, números e hífen")
    elif r.nome != pasta.name:
        r.erros.append(f"`name: {r.nome}` não bate com o nome da pasta `{pasta.name}`")

    descricao = campos.get("description", "")
    r.tamanho_descricao = len(descricao)
    if not descricao:
        r.erros.append("frontmatter sem o campo `description`")
    elif r.tamanho_descricao > LIMITE_DESCRICAO:
        r.erros.append(
            f"description com {r.tamanho_descricao} caracteres — "
            f"o limite do uploader é {LIMITE_DESCRICAO}"
        )
    return r


def empacotar(pasta: Path, destino: Path) -> Path:
    """Gera o zip com SKILL.md na raiz (sem pasta embrulhando)."""
    destino.mkdir(parents=True, exist_ok=True)
    caminho = destino / f"{pasta.name}.zip"
    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as z:
        for arquivo in sorted(pasta.rglob("*")):
            if arquivo.is_file():
                z.write(arquivo, arquivo.relative_to(pasta).as_posix())
    return caminho


def conferir_zip(caminho: Path) -> list[str]:
    """Relê o zip pronto e confirma o que o uploader vai encontrar nele."""
    erros: list[str] = []
    with zipfile.ZipFile(caminho) as z:
        nomes = z.namelist()
        if "SKILL.md" not in nomes:
            dentro = next((n for n in nomes if n.endswith("SKILL.md")), None)
            erros.append(
                f"SKILL.md não está na raiz do zip (está em `{dentro}`)" if dentro
                else "o zip não contém SKILL.md"
            )
        else:
            texto = z.read("SKILL.md").decode("utf-8")
            erros.extend(_frontmatter(texto)[1])
    return erros


def processar(skills_dir: Path = SKILLS_DIR, destino: Path | None = None) -> list[Resultado]:
    """Valida todas as skills e, se `destino` for dado, gera os zips."""
    pastas = sorted(p for p in skills_dir.iterdir() if p.is_dir()) if skills_dir.exists() else []
    if not pastas:
        raise SystemExit(f"Nenhuma skill encontrada em {skills_dir}/.")

    resultados = []
    for pasta in pastas:
        r = validar(pasta)
        if r.ok and destino is not None:
            r.zip = empacotar(pasta, destino)
            r.erros.extend(conferir_zip(r.zip))
        resultados.append(r)
    return resultados

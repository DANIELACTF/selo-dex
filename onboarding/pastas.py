"""Gera o lote de pastas na rede a partir da planilha de particularidades.

O script que cria as pastas é PowerShell (`estrutura-pastas/criar-pastas-cliente.ps1`)
e roda no drive de rede do escritório — não aqui. O que esta rotina faz é
preparar o insumo dele: o CSV `Numero,Nome` do lote e o comando pronto para
a pessoa colar no PowerShell.

O nome da pasta segue a convenção do Dep. Fiscal: sem acento, em maiúsculas,
com o N° do cliente na frente (`1048 - INJECT PHARMA`). Aqui geramos só a
coluna `Nome`; o número vai separado e o PowerShell monta o prefixo.
"""
from __future__ import annotations

import csv
import re
import unicodedata
from pathlib import Path

COMANDO = (
    '.\\criar-pastas-cliente.ps1 -Raiz "{raiz}" -Lote .\\{csv}'
)

RAIZ_PLACEHOLDER = "<caminho da rede>"

# Sufixos societários que não entram no nome da pasta.
SUFIXOS = ("LTDA", "EIRELI", "ME", "EPP", "MEI", "S/A", "SA", "S.A.", "- ME", "- EPP")


def nome_pasta(razao_social: str) -> str:
    """Converte a razão social no nome de pasta usado na rede."""
    texto = unicodedata.normalize("NFKD", razao_social).encode("ascii", "ignore").decode()
    texto = re.sub(r"[\\/:*?\"<>|]", " ", texto).upper()
    palavras = [p for p in texto.split() if p.strip(".-") not in SUFIXOS]
    return re.sub(r"\s{2,}", " ", " ".join(palavras)).strip(" .-") or texto.strip()


def gerar(planilha: Path, saida: Path, raiz: str | None = None) -> dict:
    """Escreve o CSV do lote e devolve o resumo com o comando do PowerShell."""
    from onboarding.alimentar_carteira import ler_particularidades

    empresas = ler_particularidades(planilha)
    linhas = [(e["numero"], nome_pasta(e["nome"])) for e in empresas if e["nome"]]
    sem_nome = [e["numero"] for e in empresas if not e["nome"]]

    saida.parent.mkdir(parents=True, exist_ok=True)
    with saida.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Numero", "Nome"])
        w.writerows(linhas)

    return {
        "csv": saida,
        "pastas": [f"{n} - {nome}" for n, nome in linhas],
        "sem_nome": sem_nome,
        "comando": COMANDO.format(raiz=raiz or RAIZ_PLACEHOLDER, csv=saida.name),
    }

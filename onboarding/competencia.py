"""Competência (mês de referência) e a carência de distribuição.

Empresa nova não vai direto para a carteira do analista: ela fica sob a
Gestão Fiscal (aba "Pendentes Daniela") por três competências e só depois
é distribuída.

Contagem adotada: a empresa que entra na competência X permanece em X,
X+1 e X+2 — três competências — e fica **apta à distribuição a partir de
X+3**. Ex.: entrou em 08/2026 → libera em 11/2026.

Se o escritório contar de outro jeito (por exemplo, liberando já em X+2),
mude só MESES_CARENCIA / a regra em `competencia_liberacao`; todo o resto
do fluxo lê daqui.
"""
from __future__ import annotations

import datetime as dt
import re

MESES_CARENCIA = 3

_FORMATO = re.compile(r"^\s*(\d{1,2})\s*/\s*(\d{4})\s*$")


def competencia_atual(hoje: dt.date | None = None) -> str:
    """Competência do mês corrente, no formato MM/AAAA."""
    hoje = hoje or dt.date.today()
    return f"{hoje.month:02d}/{hoje.year}"


def validar(competencia: str) -> tuple[int, int]:
    """Devolve (mes, ano) ou levanta ValueError com mensagem em português."""
    m = _FORMATO.match(str(competencia or ""))
    if not m:
        raise ValueError(f"Competência inválida: {competencia!r}. Use MM/AAAA, ex.: 08/2026.")
    mes, ano = int(m.group(1)), int(m.group(2))
    if not 1 <= mes <= 12:
        raise ValueError(f"Competência inválida: {competencia!r}. O mês precisa estar entre 01 e 12.")
    return mes, ano


def somar_meses(competencia: str, meses: int) -> str:
    mes, ano = validar(competencia)
    total = (ano * 12 + (mes - 1)) + meses
    return f"{total % 12 + 1:02d}/{total // 12}"


def como_numero(competencia: str) -> int:
    """Chave ordenável (ano*12+mês), para comparar competências."""
    mes, ano = validar(competencia)
    return ano * 12 + (mes - 1)


def competencia_liberacao(entrada: str) -> str:
    """Competência a partir da qual a empresa pode ser distribuída."""
    return somar_meses(entrada, MESES_CARENCIA)


def liberada(entrada: str, referencia: str | None = None) -> bool:
    """A carência já venceu na competência de referência (padrão: hoje)?"""
    referencia = referencia or competencia_atual()
    return como_numero(referencia) >= como_numero(competencia_liberacao(entrada))


def competencias_restantes(entrada: str, referencia: str | None = None) -> int:
    """Quantas competências ainda faltam para liberar (0 se já liberada)."""
    referencia = referencia or competencia_atual()
    return max(0, como_numero(competencia_liberacao(entrada)) - como_numero(referencia))

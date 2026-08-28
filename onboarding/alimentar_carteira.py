"""Alimenta a Carteira Tributária Fiscal com as empresas já implantadas.

Entrada: a planilha de particularidades preenchida + a Carteira atual.
Saída:   uma CÓPIA nova da Carteira, com as empresas acrescentadas.

Nunca sobrescreve o arquivo original — grava sempre em arquivo novo, para
a versão anterior continuar disponível se algo sair errado.

A aba "Resumo Equipe" se recalcula sozinha: as células de Total e de
regime são COUNTIF/COUNTIFS sobre a "Carteira Completa". Ao abrir no
Excel, os números da equipe já vêm atualizados — não mexemos neles.
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

ABA_CARTEIRA = "Carteira Completa"
ABA_PENDENTES = "Pendentes Daniela"
ABA_PARTICULARIDADES = "Particularidades"

STATUS_NOVO = "🆕 Novo"
SITUACAO_PENDENTE = "Pendente distribuição"


def _indices(ws) -> dict[str, int]:
    return {
        str(c.value).strip(): i
        for i, c in enumerate(next(ws.iter_rows(min_row=1, max_row=1)), start=1)
        if c.value
    }


def _ler_particularidades(path: Path) -> list[dict]:
    wb = load_workbook(path, data_only=True)
    if ABA_PARTICULARIDADES not in wb.sheetnames:
        raise SystemExit(f"A planilha {path} não tem a aba '{ABA_PARTICULARIDADES}'.")
    ws = wb[ABA_PARTICULARIDADES]
    idx = _indices(ws)
    obrigatorias = ["N° Cliente", "Razão social", "CNPJ"]
    faltando = [c for c in obrigatorias if c not in idx]
    if faltando:
        raise SystemExit(f"Colunas ausentes na planilha de particularidades: {faltando}")

    empresas = []
    for row in ws.iter_rows(min_row=2):
        def val(col: str) -> str:
            i = idx.get(col)
            v = row[i - 1].value if i else None
            return str(v).strip() if v not in (None, "") else ""

        if not val("N° Cliente"):
            continue
        empresas.append({
            "numero": val("N° Cliente"),
            "nome": val("Razão social"),
            "cnpj": val("CNPJ"),
            "regime": val("Regime confirmado") or "⚠ A confirmar",
            "segmento": val("Segmento"),
            "analista": val("Responsável (analista)"),
            "nivel": val("Nível / equipe"),
            "situacao": val("Situação"),
            "obs": val("Obs. para a carteira"),
        })
    return empresas


def _numeros_existentes(ws, col_numero: int) -> set[str]:
    return {
        str(r[col_numero - 1].value).strip()
        for r in ws.iter_rows(min_row=2)
        if r[col_numero - 1].value not in (None, "")
    }


def _estender_filtro(ws, ultima_linha: int) -> None:
    if ws.auto_filter.ref:
        largura = ws.max_column
        ws.auto_filter.ref = f"A1:{get_column_letter(largura)}{ultima_linha}"


def alimentar(particularidades: Path, carteira: Path, saida: Path) -> dict:
    empresas = _ler_particularidades(particularidades)
    wb = load_workbook(carteira)  # data_only=False: preserva as fórmulas do Resumo

    if ABA_CARTEIRA not in wb.sheetnames:
        raise SystemExit(f"A carteira {carteira} não tem a aba '{ABA_CARTEIRA}'.")

    ws = wb[ABA_CARTEIRA]
    idx = _indices(ws)
    ja_na_carteira = _numeros_existentes(ws, idx["N° Cliente"])

    acrescentadas, ja_existiam, sem_analista = [], [], []
    linha = ws.max_row

    for emp in empresas:
        if emp["numero"] in ja_na_carteira:
            ja_existiam.append(emp["numero"])
            continue
        if not emp["analista"]:
            # Sem responsável definido a empresa não entra na carteira: ela
            # ficaria fora das contagens por analista do Resumo Equipe.
            sem_analista.append(emp["numero"])
            continue

        linha += 1
        valores = {
            "N° Cliente": emp["numero"],
            "Nome": emp["nome"],
            "CNPJ": emp["cnpj"],
            "Regime Tributário": emp["regime"],
            "Segmento": emp["segmento"],
            "Analista Responsável": emp["analista"],
            "Nível": emp["nivel"],
            "Status": STATUS_NOVO,
        }
        for coluna, col_idx in idx.items():
            if coluna in valores:
                ws.cell(row=linha, column=col_idx, value=valores[coluna])
        acrescentadas.append(emp["numero"])

    _estender_filtro(ws, linha)

    pendentes_removidas = []
    if ABA_PENDENTES in wb.sheetnames and acrescentadas:
        wsp = wb[ABA_PENDENTES]
        idxp = _indices(wsp)
        col_num = idxp.get("N° Cliente")
        if col_num:
            for r in range(wsp.max_row, 1, -1):
                valor = wsp.cell(row=r, column=col_num).value
                if valor is not None and str(valor).strip() in acrescentadas:
                    wsp.delete_rows(r)
                    pendentes_removidas.append(str(valor).strip())
            _estender_filtro(wsp, wsp.max_row)

    saida.parent.mkdir(parents=True, exist_ok=True)
    wb.save(saida)
    return {
        "saida": saida,
        "acrescentadas": acrescentadas,
        "ja_existiam": ja_existiam,
        "sem_analista": sem_analista,
        "pendentes_removidas": pendentes_removidas,
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            "Uso: python -m onboarding.alimentar_carteira "
            "<particularidades.xlsx> <carteira.xlsx> [saida.xlsx]"
        )
        raise SystemExit(1)

    part = Path(sys.argv[1])
    cart = Path(sys.argv[2])
    saida = Path(sys.argv[3]) if len(sys.argv) > 3 else cart.with_name(
        f"{cart.stem}-atualizada-{dt.date.today().isoformat()}.xlsx"
    )
    r = alimentar(part, cart, saida)

    print(f"Carteira gravada em: {r['saida']}")
    print(f"Acrescentadas ({len(r['acrescentadas'])}): {', '.join(r['acrescentadas']) or '—'}")
    if r["pendentes_removidas"]:
        print(f"Saíram de '{ABA_PENDENTES}': {', '.join(r['pendentes_removidas'])}")
    if r["ja_existiam"]:
        print(f"Já estavam na carteira, ignoradas: {', '.join(r['ja_existiam'])}")
    if r["sem_analista"]:
        print(
            f"SEM responsável definido, NÃO entraram: {', '.join(r['sem_analista'])}\n"
            "  Preencha 'Responsável (analista)' na planilha e rode de novo."
        )
    print("\nAbra no Excel para o 'Resumo Equipe' recalcular as contagens.")

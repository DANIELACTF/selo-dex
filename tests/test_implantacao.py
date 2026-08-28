"""Testa a parte 2 do onboarding: planilha de particularidades e
alimentação da Carteira Tributária Fiscal."""
from pathlib import Path

import openpyxl
import pytest

from onboarding.alimentar_carteira import alimentar
from onboarding.planilha_particularidades import COLUNAS, gerar

CSV_CABECALHO = (
    "numero,empresa,cnpj,regime_informado,regime_simples_api,divergencia_regime,"
    "situacao_cadastral,certificado_recebido,alerta_certificado,email_contato,"
    "grupo_obs,data_processamento,status_distribuicao\n"
)


def _csv_pendentes(tmp_path: Path) -> Path:
    p = tmp_path / "pendentes.csv"
    p.write_text(
        CSV_CABECALHO
        + "1091,C LORENA DISTRIBUIDORA LTDA,68.717.251/0001-25,Lucro Real,?,,,Sim,,a@b.com,,2026-08-28,Pendente\n"
        + "1092,GRAFICA SQUARE LTDA,30.569.577/0001-80,Simples Nacional,?,,,Não,SIM - cobrar certificado,c@d.com,,2026-08-28,Pendente\n",
        encoding="utf-8",
    )
    return p


def _carteira_fake(tmp_path: Path) -> Path:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Carteira Completa"
    ws.append(["N° Cliente", "Nome", "CNPJ", "Regime Tributário", "Segmento",
               "Analista Responsável", "Nível", "Status"])
    ws.append(["500", "EMPRESA ANTIGA LTDA", "11.111.111/0001-11", "Simples Nacional",
               "Serviço", "Wellington", "Auxiliar", "OK"])
    ws.auto_filter.ref = "A1:H2"

    wsp = wb.create_sheet("Pendentes Daniela")
    wsp.append(["N° Cliente", "Nome", "CNPJ", "Regime Tributário", "Segmento",
                "Sugestão Analista", "Origem", "Observação"])
    wsp.append(["1091", "C LORENA DISTRIBUIDORA LTDA", "68.717.251/0001-25",
                "Lucro Real", "Comércio", "Matheus Telles (Sênior)", "🆕 Onboarding", ""])

    wsr = wb.create_sheet("Resumo Equipe")
    wsr["A2"] = "Analista"
    wsr["A3"] = "Wellington"
    wsr["C3"] = "=COUNTIF('Carteira Completa'!$F:$F,$A3)"

    caminho = tmp_path / "carteira.xlsx"
    wb.save(caminho)
    return caminho


def _preencher(planilha: Path, linha: int, valores: dict) -> None:
    wb = openpyxl.load_workbook(planilha)
    ws = wb["Particularidades"]
    idx = {str(c.value).strip(): i for i, c in enumerate(next(ws.iter_rows(max_row=1)), 1) if c.value}
    for coluna, valor in valores.items():
        ws.cell(row=linha, column=idx[coluna], value=valor)
    wb.save(planilha)


def test_planilha_tem_abas_e_prefixa_identificacao(tmp_path):
    saida = gerar(_csv_pendentes(tmp_path), tmp_path / "part.xlsx")
    wb = openpyxl.load_workbook(saida)
    assert wb.sheetnames == ["Instruções", "Particularidades", "Listas"]

    ws = wb["Particularidades"]
    assert ws.max_row == 3  # cabeçalho + 2 empresas
    assert ws.max_column == len(COLUNAS)
    assert [ws.cell(row=2, column=c).value for c in (1, 2, 3)] == [
        "1091", "C LORENA DISTRIBUIDORA LTDA", "68.717.251/0001-25"
    ]
    assert ws.freeze_panes == "D2"


def test_planilha_traz_certificado_e_regime_da_triagem(tmp_path):
    saida = gerar(_csv_pendentes(tmp_path), tmp_path / "part.xlsx")
    ws = openpyxl.load_workbook(saida)["Particularidades"]
    idx = {str(c.value).strip(): i for i, c in enumerate(next(ws.iter_rows(max_row=1)), 1) if c.value}
    assert ws.cell(row=2, column=idx["Certificado A1"]).value == "recebido"
    assert ws.cell(row=3, column=idx["Certificado A1"]).value == "pendente"
    assert ws.cell(row=2, column=idx["Regime confirmado"]).value == "Lucro Real"


def test_planilha_aplica_listas_suspensas(tmp_path):
    saida = gerar(_csv_pendentes(tmp_path), tmp_path / "part.xlsx")
    ws = openpyxl.load_workbook(saida)["Particularidades"]
    esperado = sum(1 for _, _, _, lista in COLUNAS if lista)
    assert len(ws.data_validations.dataValidation) == esperado


def test_planilha_exige_triagem_previa(tmp_path):
    with pytest.raises(SystemExit):
        gerar(tmp_path / "nao-existe.csv", tmp_path / "saida.xlsx")


def test_carteira_recebe_apenas_empresa_com_responsavel(tmp_path):
    planilha = gerar(_csv_pendentes(tmp_path), tmp_path / "part.xlsx")
    _preencher(planilha, 2, {
        "Responsável (analista)": "Matheus Telles", "Nível / equipe": "Sênior",
        "Situação": "Distribuído", "Segmento": "Comércio",
    })
    # a linha 3 (1092) fica sem responsável de propósito

    r = alimentar(planilha, _carteira_fake(tmp_path), tmp_path / "nova.xlsx")
    assert r["acrescentadas"] == ["1091"]
    assert r["sem_analista"] == ["1092"]

    ws = openpyxl.load_workbook(r["saida"])["Carteira Completa"]
    assert ws.max_row == 3
    assert [c.value for c in ws[3]] == [
        "1091", "C LORENA DISTRIBUIDORA LTDA", "68.717.251/0001-25",
        "Lucro Real", "Comércio", "Matheus Telles", "Sênior", "🆕 Novo",
    ]
    assert ws.auto_filter.ref == "A1:H3"


def test_carteira_remove_de_pendentes_quem_entrou(tmp_path):
    planilha = gerar(_csv_pendentes(tmp_path), tmp_path / "part.xlsx")
    _preencher(planilha, 2, {"Responsável (analista)": "Matheus Telles", "Nível / equipe": "Sênior"})

    r = alimentar(planilha, _carteira_fake(tmp_path), tmp_path / "nova.xlsx")
    assert r["pendentes_removidas"] == ["1091"]

    wsp = openpyxl.load_workbook(r["saida"])["Pendentes Daniela"]
    assert wsp.max_row == 1  # sobrou só o cabeçalho


def test_carteira_nao_duplica_empresa_existente(tmp_path):
    planilha = gerar(_csv_pendentes(tmp_path), tmp_path / "part.xlsx")
    _preencher(planilha, 2, {"Responsável (analista)": "Matheus Telles", "Nível / equipe": "Sênior"})
    carteira = _carteira_fake(tmp_path)

    primeira = alimentar(planilha, carteira, tmp_path / "n1.xlsx")
    segunda = alimentar(planilha, primeira["saida"], tmp_path / "n2.xlsx")

    assert segunda["acrescentadas"] == []
    assert segunda["ja_existiam"] == ["1091"]


def test_carteira_preserva_formulas_do_resumo(tmp_path):
    planilha = gerar(_csv_pendentes(tmp_path), tmp_path / "part.xlsx")
    _preencher(planilha, 2, {"Responsável (analista)": "Matheus Telles", "Nível / equipe": "Sênior"})

    r = alimentar(planilha, _carteira_fake(tmp_path), tmp_path / "nova.xlsx")
    wsr = openpyxl.load_workbook(r["saida"], data_only=False)["Resumo Equipe"]
    assert wsr["C3"].value == "=COUNTIF('Carteira Completa'!$F:$F,$A3)"


def test_carteira_original_nao_e_alterada(tmp_path):
    planilha = gerar(_csv_pendentes(tmp_path), tmp_path / "part.xlsx")
    _preencher(planilha, 2, {"Responsável (analista)": "Matheus Telles", "Nível / equipe": "Sênior"})
    carteira = _carteira_fake(tmp_path)
    antes = carteira.read_bytes()

    alimentar(planilha, carteira, tmp_path / "nova.xlsx")
    assert carteira.read_bytes() == antes

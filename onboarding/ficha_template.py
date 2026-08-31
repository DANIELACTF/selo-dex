"""Modelo de dados e renderização da "FICHA DE ABERTURA — ONBOARDING FISCAL".

Este é o padrão real usado pelo Departamento Fiscal da Moraex (confirmado
com 12 fichas de exemplo reais em fichas_padrao/ — nome, CNPJ, tipo,
regime, certificado, consultas preliminares nos órgãos e particularidades
anotadas). A reprodução visual do PDF (barras azul-marinho, tabelas,
checkboxes) é uma aproximação fiel ao que foi observado, não um clone
byte-a-byte de um arquivo-fonte original (não tínhamos acesso a um
template editável, só aos PDFs finais).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# Helvetica (fonte padrão do reportlab) não tem os glifos ☐/☑ usados nos
# checkboxes — viram quadrados sólidos. Usamos DejaVu Sans (embutida em
# onboarding/fonts/, funciona em qualquer máquina) para esses símbolos
# renderizarem corretamente e para melhor suporte a acentuação.
_FONTS_DIR = Path(__file__).parent / "fonts"
if "DejaVu" not in pdfmetrics.getRegisteredFontNames():
    pdfmetrics.registerFont(TTFont("DejaVu", str(_FONTS_DIR / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(_FONTS_DIR / "DejaVuSans-Bold.ttf")))

FONTE = "DejaVu"
FONTE_NEGRITO = "DejaVu-Bold"

AZUL_MARINHO = colors.HexColor("#1B3A5C")
CINZA_CLARO = colors.HexColor("#EAEDF0")
CINZA_TEXTO = colors.HexColor("#555555")

LARGURA_CONTEUDO = 18.0 * cm
COLS_2PAR = [3.3 * cm, 5.7 * cm, 3.3 * cm, 5.7 * cm]

# As outras 3 linhas continuam manuais (não há fonte automatizada
# plugada para elas ainda); a linha "Simples Nacional" é preenchida a
# partir da consulta oficial em onboarding/simples_rfb.py — ver campos
# simples_situacao/simples_ok em FichaOnboarding.
ORGAOS_CONSULTA_MANUAIS = [
    ("RFB / e-CAC", "Situação cadastral, pendências, DTE (caixa postal), parcelamentos"),
    ("SEFAZ-RJ", "Inscrição estadual, situação, DeC-RJ, débitos de ICMS"),
    ("Prefeitura / Município", "Inscrição municipal, ISS, situação cadastral, débitos"),
]
SIMPLES_LABEL = "Simples Nacional"
SIMPLES_OQUE_CONSULTAR = "Opção/optante (PGDAS/DAS), débitos, exclusão, sublimite"


@dataclass
class FichaOnboarding:
    numero: str
    recebido_em: str
    razao_social: str
    cnpj: str
    tipo: str
    abertura: str
    porte: str
    municipio_uf: str
    grupo_economico: str
    email_cliente: str
    cnae_principal: str
    cnaes_secundarios: str
    regime_enquadramento: str
    certificado_status: str  # "recebido" | "pendente"
    senha_status: str  # "arquivada" | "pendente"
    simples_situacao: str = "(a preencher)"
    simples_ok: bool = False
    particularidades: list[str] = field(default_factory=list)


def _checkbox(marcado: bool) -> str:
    return "☑" if marcado else "☐"


def gerar_ficha_markdown(ficha: FichaOnboarding) -> str:
    linhas = [
        "# FICHA DE ABERTURA — ONBOARDING FISCAL",
        "**Moraex Consultoria Empresarial · Departamento Fiscal**",
        "",
        "## 1 · IDENTIFICAÇÃO",
        f"- N° Cliente: {ficha.numero}  |  Recebido em: {ficha.recebido_em}",
        f"- Razão social: {ficha.razao_social}",
        f"- CNPJ: {ficha.cnpj}  |  Tipo: {ficha.tipo}",
        f"- Abertura: {ficha.abertura}  |  Porte: {ficha.porte}",
        f"- Município / UF: {ficha.municipio_uf}  |  Grupo econômico: {ficha.grupo_economico}",
        f"- E-mail do cliente: {ficha.email_cliente}",
        "",
        "## 2 · ATIVIDADE E REGIME",
        f"- CNAE principal: {ficha.cnae_principal}",
        f"- CNAEs secundários: {ficha.cnaes_secundarios}",
        f"- Regime / enquadramento: {ficha.regime_enquadramento}",
        "",
        "## 3 · DOCUMENTOS, CERTIFICADO E PROCURAÇÃO",
        f"- Certificado A1 (.pfx): {_checkbox(ficha.certificado_status == 'recebido')} {ficha.certificado_status}"
        f"  |  Senha (cofre): {_checkbox(ficha.senha_status == 'arquivada')} {ficha.senha_status}",
        f"- Procuração e-CAC: {_checkbox(False)} pendente  |  Validade do cert.: ",
        "",
        "## 4 · CONSULTAS PRELIMINARES DE SITUAÇÃO FISCAL (ÓRGÃOS)",
    ]
    orgao, oque = ORGAOS_CONSULTA_MANUAIS[0]
    linhas.append(f"- **{orgao}** — {oque} — situação encontrada: _(a preencher)_ — {_checkbox(False)}")
    linhas.append(
        f"- **{SIMPLES_LABEL}** — {SIMPLES_OQUE_CONSULTAR} — "
        f"situação encontrada: {ficha.simples_situacao} — {_checkbox(ficha.simples_ok)}"
    )
    for orgao, oque in ORGAOS_CONSULTA_MANUAIS[1:]:
        linhas.append(f"- **{orgao}** — {oque} — situação encontrada: _(a preencher)_ — {_checkbox(False)}")
    linhas += [
        "",
        "## 5 · PARTICULARIDADES ANOTADAS NO E-MAIL / IDENTIFICADAS",
    ]
    linhas += [f"- {p}" for p in ficha.particularidades] or ["- (nenhuma particularidade identificada)"]
    linhas += [
        "",
        "## 6 · PARTICULARIDADES A LEVANTAR — REUNIÃO COM O PAULO",
        "_(a preencher manualmente)_",
        "",
        "---",
        "Responsável: ______________________  "
        "Data da consulta: ____/____/______  "
        f"Onboarding concluído: {_checkbox(False)}",
        "",
        "_Moraex Consultoria Empresarial — Ficha de Onboarding Fiscal_",
    ]
    return "\n".join(linhas) + "\n"


def _label_style() -> ParagraphStyle:
    return ParagraphStyle("label", fontName=FONTE_NEGRITO, fontSize=8, textColor=colors.black, leading=10)


def _valor_style() -> ParagraphStyle:
    return ParagraphStyle("valor", fontName=FONTE, fontSize=8.5, textColor=colors.black, leading=11)


def _titulo_secao(texto: str) -> Table:
    t = Table([[texto]], colWidths=[LARGURA_CONTEUDO])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), AZUL_MARINHO),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), FONTE_NEGRITO),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return t


def _linha_par(label1: str, valor1: str, label2: str, valor2: str) -> list:
    L, V = _label_style(), _valor_style()
    return [Paragraph(label1, L), Paragraph(valor1 or "-", V), Paragraph(label2, L), Paragraph(valor2 or "-", V)]


def _linha_span(label: str, valor: str) -> list:
    L, V = _label_style(), _valor_style()
    return [Paragraph(label, L), Paragraph(valor or "-", V), "", ""]


def _grid_style(spans: list[int]) -> TableStyle:
    cmds = [
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (0, -1), CINZA_CLARO),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for i, span in enumerate(spans):
        if span:
            cmds.append(("SPAN", (1, i), (3, i)))
            cmds.append(("BACKGROUND", (2, i), (2, i), colors.white))
        else:
            cmds.append(("BACKGROUND", (2, i), (2, i), CINZA_CLARO))
    return TableStyle(cmds)


def gerar_ficha_pdf(ficha: FichaOnboarding, caminho: Path) -> None:
    doc = SimpleDocTemplate(
        str(caminho),
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
    )
    story: list = []

    titulo = Table(
        [
            [Paragraph("<b>FICHA DE ABERTURA — ONBOARDING FISCAL</b>", ParagraphStyle(
                "t", fontName=FONTE_NEGRITO, fontSize=13, textColor=colors.white, alignment=1,
            ))],
            [Paragraph("Moraex Consultoria Empresarial · Departamento Fiscal", ParagraphStyle(
                "st", fontName=FONTE, fontSize=9, textColor=colors.white, alignment=1,
            ))],
        ],
        colWidths=[LARGURA_CONTEUDO],
    )
    titulo.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), AZUL_MARINHO),
                ("TOPPADDING", (0, 0), (-1, 0), 6),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
                ("TOPPADDING", (0, 1), (-1, 1), 0),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
            ]
        )
    )
    story.append(titulo)
    story.append(Spacer(1, 4))

    # 1 · IDENTIFICAÇÃO
    story.append(_titulo_secao("1 · IDENTIFICAÇÃO"))
    dados1 = [
        _linha_par("N° Cliente", ficha.numero, "Recebido em", ficha.recebido_em),
        _linha_span("Razão social", ficha.razao_social),
        _linha_par("CNPJ", ficha.cnpj, "Tipo", ficha.tipo),
        _linha_par("Abertura", ficha.abertura, "Porte", ficha.porte),
        _linha_par("Município / UF", ficha.municipio_uf, "Grupo econômico", ficha.grupo_economico),
        _linha_span("E-mail do cliente", ficha.email_cliente),
    ]
    t1 = Table(dados1, colWidths=COLS_2PAR)
    t1.setStyle(_grid_style(spans=[0, 1, 0, 0, 0, 1]))
    story.append(t1)

    # 2 · ATIVIDADE E REGIME
    story.append(_titulo_secao("2 · ATIVIDADE E REGIME"))
    dados2 = [
        _linha_span("CNAE principal", ficha.cnae_principal),
        _linha_span("CNAEs secundários", ficha.cnaes_secundarios),
        _linha_span("Regime / enquadramento", ficha.regime_enquadramento),
    ]
    t2 = Table(dados2, colWidths=COLS_2PAR)
    t2.setStyle(_grid_style(spans=[1, 1, 1]))
    story.append(t2)

    # 3 · DOCUMENTOS, CERTIFICADO E PROCURAÇÃO
    story.append(_titulo_secao("3 · DOCUMENTOS, CERTIFICADO E PROCURAÇÃO"))
    cert_txt = f"{_checkbox(ficha.certificado_status == 'recebido')} {ficha.certificado_status}"
    senha_txt = f"{_checkbox(ficha.senha_status == 'arquivada')} {ficha.senha_status}"
    dados3 = [
        _linha_par("Certificado A1 (.pfx)", cert_txt, "Senha (cofre)", senha_txt),
        _linha_par("Procuração e-CAC", f"{_checkbox(False)} pendente", "Validade do cert.", ""),
    ]
    t3 = Table(dados3, colWidths=COLS_2PAR)
    t3.setStyle(_grid_style(spans=[0, 0]))
    story.append(t3)

    # 4 · CONSULTAS PRELIMINARES
    story.append(_titulo_secao("4 · CONSULTAS PRELIMINARES DE SITUAÇÃO FISCAL (ÓRGÃOS)"))
    L, V = _label_style(), _valor_style()
    header = [Paragraph(h, L) for h in ["Órgão / Sistema", "O que consultar", "Situação encontrada", "OK"]]
    linhas4 = [header]
    orgao, oque = ORGAOS_CONSULTA_MANUAIS[0]
    linhas4.append([Paragraph(orgao, V), Paragraph(oque, V), Paragraph("", V), Paragraph(_checkbox(False), V)])
    linhas4.append([
        Paragraph(SIMPLES_LABEL, V),
        Paragraph(SIMPLES_OQUE_CONSULTAR, V),
        Paragraph(ficha.simples_situacao, V),
        Paragraph(_checkbox(ficha.simples_ok), V),
    ])
    for orgao, oque in ORGAOS_CONSULTA_MANUAIS[1:]:
        linhas4.append([Paragraph(orgao, V), Paragraph(oque, V), Paragraph("", V), Paragraph(_checkbox(False), V)])
    t4 = Table(linhas4, colWidths=[3.6 * cm, 9.4 * cm, 3.5 * cm, 1.5 * cm])
    t4.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("BACKGROUND", (0, 0), (-1, 0), CINZA_CLARO),
                ("FONTNAME", (0, 0), (-1, 0), FONTE_NEGRITO),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("ALIGN", (3, 0), (3, -1), "CENTER"),
            ]
        )
    )
    story.append(t4)

    # 5 · PARTICULARIDADES
    story.append(_titulo_secao("5 · PARTICULARIDADES ANOTADAS NO E-MAIL / IDENTIFICADAS"))
    bullet_style = ParagraphStyle("bullet", fontName=FONTE, fontSize=8.5, leading=12, leftIndent=8)
    linhas5 = [[Paragraph(f"• {p}", bullet_style)] for p in ficha.particularidades] or [
        [Paragraph("(nenhuma particularidade identificada automaticamente)", bullet_style)]
    ]
    t5 = Table(linhas5, colWidths=[LARGURA_CONTEUDO])
    t5.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(t5)

    # 6 · PARTICULARIDADES A LEVANTAR
    story.append(_titulo_secao("6 · PARTICULARIDADES A LEVANTAR — REUNIÃO COM O PAULO"))
    story.append(Spacer(1, 6))
    for _ in range(5):
        story.append(HRFlowable(width=LARGURA_CONTEUDO, thickness=0.5, color=colors.grey))
        story.append(Spacer(1, 14))

    rodape_style = ParagraphStyle("rodape", fontName=FONTE, fontSize=8.5)
    story.append(
        Paragraph(
            "Responsável: ______________________&nbsp;&nbsp;&nbsp; "
            "Data da consulta: ____/____/______&nbsp;&nbsp;&nbsp; "
            f"Onboarding concluído: {_checkbox(False)}",
            rodape_style,
        )
    )
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "Moraex Consultoria Empresarial — Ficha de Onboarding Fiscal",
            ParagraphStyle("footer", fontName=FONTE, fontSize=7.5, textColor=CINZA_TEXTO, alignment=1),
        )
    )

    doc.build(story)

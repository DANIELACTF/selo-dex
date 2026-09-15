# -*- coding: utf-8 -*-
"""Gravacao de arquivos .xlsx usando apenas a biblioteca padrao.

Escreve o minimo do OOXML necessario para o Excel, o LibreOffice e o Google
Sheets abrirem o arquivo: cabecalho em negrito, numeros com duas casas e
congelamento da primeira linha.
"""
from __future__ import annotations

import re
import zipfile
from datetime import datetime
from decimal import Decimal

_INVALIDOS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_PROIBIDOS_ABA = re.compile(r"[\[\]\:\*\?\/\\]")

CONTENT_TYPES_CABECALHO = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
)

STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
    '<fonts count="2">'
    '<font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><name val="Calibri"/></font>'
    '</fonts>'
    '<fills count="3">'
    '<fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>'
    '</fills>'
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="3">'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '</cellXfs>'
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    '</styleSheet>'
)


def _escapar(texto):
    texto = _INVALIDOS.sub("", str(texto))
    return (texto.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def _numero(valor):
    """Serializa numero em notacao decimal simples (nunca cientifica)."""
    if isinstance(valor, Decimal):
        if not valor.is_finite():
            return "0"
        texto = format(valor, "f")
    elif isinstance(valor, float):
        if valor != valor or valor in (float("inf"), float("-inf")):
            return "0"
        texto = repr(valor)
        if "e" in texto or "E" in texto:
            texto = format(Decimal(str(valor)), "f")
    else:
        texto = str(valor)
    if "." in texto:
        texto = texto.rstrip("0").rstrip(".") or "0"
    return texto or "0"


def _letra_coluna(indice):
    letras = ""
    indice += 1
    while indice:
        indice, resto = divmod(indice - 1, 26)
        letras = chr(65 + resto) + letras
    return letras


def _nome_aba(nome, usados):
    nome = _PROIBIDOS_ABA.sub("-", str(nome or "Planilha")).strip() or "Planilha"
    nome = nome[:31]
    base, n = nome, 2
    while nome.lower() in usados:
        sufixo = "_%d" % n
        nome = base[:31 - len(sufixo)] + sufixo
        n += 1
    usados.add(nome.lower())
    return nome


def _celula(valor, linha, coluna, estilo_cabecalho=False):
    ref = "%s%d" % (_letra_coluna(coluna), linha)
    if estilo_cabecalho:
        return '<c r="%s" s="1" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>' % (
            ref, _escapar(valor))
    if valor is None or valor == "":
        return ""
    if isinstance(valor, bool):
        valor = "Sim" if valor else "Nao"
    elif isinstance(valor, (Decimal, int, float)):
        return '<c r="%s" s="2"><v>%s</v></c>' % (ref, _numero(valor))
    elif isinstance(valor, datetime):
        valor = valor.strftime("%d/%m/%Y")
    return '<c r="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>' % (
        ref, _escapar(valor))


def _sheet_xml(cabecalho, linhas):
    """Monta o XML da planilha.

    A ordem dos elementos dentro de <worksheet> e IMPOSTA pelo schema OOXML:
    sheetPr, dimension, sheetViews, sheetFormatPr, cols, sheetData, ...
    Fora dessa ordem o Excel recusa o arquivo inteiro como corrompido, mesmo que
    todo o conteudo esteja correto - e leitores tolerantes abrem assim mesmo, o que
    faz o defeito passar despercebido. Por isso a montagem e sequencial e fixa.
    """
    total_linhas = len(linhas) + (1 if cabecalho else 0)
    total_colunas = max([len(cabecalho)] + [len(l) for l in linhas]) if (cabecalho or linhas) else 1
    total_colunas = max(total_colunas, 1)
    total_linhas = max(total_linhas, 1)

    partes = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '<dimension ref="A1:%s%d"/>' % (_letra_coluna(total_colunas - 1), total_linhas),
    ]
    if cabecalho:
        partes.append('<sheetViews><sheetView workbookViewId="0">'
                      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" '
                      'state="frozen"/></sheetView></sheetViews>')
    else:
        partes.append('<sheetViews><sheetView workbookViewId="0"/></sheetViews>')
    partes.append('<sheetFormatPr defaultRowHeight="15"/>')
    if cabecalho:
        colunas = []
        for i, titulo in enumerate(cabecalho):
            largura = min(max(len(str(titulo)) + 4, 12), 55)
            colunas.append('<col min="%d" max="%d" width="%d" customWidth="1"/>'
                           % (i + 1, i + 1, largura))
        if colunas:
            partes.append("<cols>" + "".join(colunas) + "</cols>")

    partes.append("<sheetData>")
    numero = 1
    if cabecalho:
        celulas = "".join(_celula(t, numero, i, True) for i, t in enumerate(cabecalho))
        partes.append('<row r="%d">%s</row>' % (numero, celulas))
        numero += 1
    for linha in linhas:
        celulas = "".join(_celula(v, numero, i) for i, v in enumerate(linha))
        partes.append('<row r="%d">%s</row>' % (numero, celulas))
        numero += 1
    partes.append("</sheetData>")
    partes.append("</worksheet>")
    return "".join(partes)


def escrever(caminho, abas, validar=True):
    """Grava um .xlsx.

    abas: lista de (nome, cabecalho, linhas) - cabecalho e lista de titulos,
          linhas e lista de listas de valores (str, Decimal, int, float, bool).
    validar: confere o pacote contra o schema OOXML antes de devolver. Fica ligado
          por padrao porque leitores tolerantes abrem arquivos que o Excel recusa,
          e sem essa conferencia o defeito so aparece na mao do usuario.
    """
    usados = set()
    normalizadas = []
    for nome, cabecalho, linhas in abas:
        normalizadas.append((_nome_aba(nome, usados), list(cabecalho or []),
                             [list(l) for l in linhas]))
    if not normalizadas:
        normalizadas = [("Planilha", [], [])]

    tipos = [CONTENT_TYPES_CABECALHO]
    for i, _ in enumerate(normalizadas, start=1):
        tipos.append(
            '<Override PartName="/xl/worksheets/sheet%d.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' % i)
    tipos.append("</Types>")

    sheets, rels = [], []
    for i, (nome, _, _) in enumerate(normalizadas, start=1):
        sheets.append('<sheet name="%s" sheetId="%d" r:id="rId%d"/>' % (_escapar(nome), i, i))
        rels.append(
            '<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/'
            'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>' % (i, i))
    rid_styles = len(normalizadas) + 1
    rels.append(
        '<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/'
        'officeDocument/2006/relationships/styles" Target="styles.xml"/>' % rid_styles)

    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets>' + "".join(sheets) + '</sheets></workbook>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(rels) + '</Relationships>'
    )
    raiz_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/'
        '2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    )

    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "".join(tipos))
        z.writestr("_rels/.rels", raiz_rels)
        z.writestr("xl/workbook.xml", workbook)
        z.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        z.writestr("xl/styles.xml", STYLES)
        for i, (_, cabecalho, linhas) in enumerate(normalizadas, start=1):
            z.writestr("xl/worksheets/sheet%d.xml" % i, _sheet_xml(cabecalho, linhas))
    if validar:
        from .xlsx_validador import exigir_valido
        exigir_valido(caminho)
    return caminho

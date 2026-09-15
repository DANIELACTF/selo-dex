# -*- coding: utf-8 -*-
"""Validador estrito de arquivos .xlsx, conforme o schema OOXML (ECMA-376).

Existe porque leitores tolerantes - openpyxl, o leitor deste proprio pacote e
visualizadores em geral - abrem sem reclamar arquivos que o Excel recusa como
corrompidos. O caso que motivou o modulo foi a ordem dos elementos dentro de
<worksheet>: com <cols> antes de <sheetViews> todos os leitores tolerantes abriam
o arquivo, e o Excel recusava o pacote inteiro.

Valida estrutura, nao conteudo: partes obrigatorias, content types, relacionamentos,
ordem dos elementos e serializacao dos numeros.
"""
from __future__ import annotations

import re
import zipfile
from xml.etree import ElementTree

NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS_CT = "{http://schemas.openxmlformats.org/package/2006/content-types}"
NS_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"

# Sequencias do schema. A ordem dos filhos e IMPOSTA, nao sugerida.
ORDEM_WORKSHEET = [
    "sheetPr", "dimension", "sheetViews", "sheetFormatPr", "cols", "sheetData",
    "sheetCalcPr", "sheetProtection", "protectedRanges", "scenarios", "autoFilter",
    "sortState", "dataConsolidate", "customSheetViews", "mergeCells", "phoneticPr",
    "conditionalFormatting", "dataValidations", "hyperlinks", "printOptions",
    "pageMargins", "pageSetup", "headerFooter", "rowBreaks", "colBreaks",
    "customProperties", "cellWatches", "ignoredErrors", "smartTags", "drawing",
    "drawingHF", "picture", "oleObjects", "controls", "webPublishItems",
    "tableParts", "extLst",
]
ORDEM_STYLESHEET = [
    "numFmts", "fonts", "fills", "borders", "cellStyleXfs", "cellXfs", "cellStyles",
    "dxfs", "tableStyles", "colors", "extLst",
]
ORDEM_WORKBOOK = [
    "fileVersion", "fileSharing", "workbookPr", "workbookProtection", "bookViews",
    "sheets", "functionGroups", "externalReferences", "definedNames", "calcPr",
    "oleSize", "customWorkbookViews", "pivotCaches", "smartTagPr", "smartTagTypes",
    "webPublishing", "fileRecoveryPr", "webPublishObjects", "extLst",
]
ORDEM_CELULA = ["f", "v", "is", "extLst"]

REF_CELULA = re.compile(r"^([A-Z]{1,3})([1-9][0-9]*)$")
CIENTIFICO = re.compile(r"[eE]")
PROIBIDOS_ABA = re.compile(r"[\[\]\:\*\?\/\\]")


class ErroValidacao(Exception):
    pass


def _ordem(elemento, sequencia, contexto, erros):
    posicao = -1
    visto = []
    for filho in elemento:
        nome = filho.tag.replace(NS_MAIN, "")
        visto.append(nome)
        if nome not in sequencia:
            erros.append("%s: elemento <%s> nao previsto no schema" % (contexto, nome))
            continue
        atual = sequencia.index(nome)
        if atual < posicao:
            erros.append(
                "%s: <%s> aparece depois de <%s>, mas o schema exige a ordem %s "
                "(o Excel recusa o arquivo inteiro por isso)"
                % (contexto, nome, visto[-2] if len(visto) > 1 else "?",
                   " -> ".join(n for n in sequencia if n in visto)))
        posicao = max(posicao, atual)


def _conta(elemento, erros, contexto):
    """Confere se o atributo count bate com o numero real de filhos."""
    declarado = elemento.get("count")
    if declarado is None:
        return
    try:
        declarado = int(declarado)
    except ValueError:
        erros.append("%s: atributo count invalido (%r)" % (contexto, declarado))
        return
    real = len(list(elemento))
    if declarado != real:
        erros.append("%s: count=%d mas ha %d filho(s)" % (contexto, declarado, real))


def validar(caminho):
    """Devolve a lista de problemas encontrados. Lista vazia = arquivo valido."""
    erros = []
    if not zipfile.is_zipfile(caminho):
        return ["o arquivo nao e um pacote zip valido"]

    with zipfile.ZipFile(caminho) as z:
        nomes = set(z.namelist())
        for obrigatorio in ("[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
                            "xl/_rels/workbook.xml.rels"):
            if obrigatorio not in nomes:
                erros.append("parte obrigatoria ausente: %s" % obrigatorio)
        if erros:
            return erros

        # --- content types ---
        tipos = ElementTree.fromstring(z.read("[Content_Types].xml"))
        overrides = {o.get("PartName") for o in tipos.findall(NS_CT + "Override")}
        defaults = {d.get("Extension") for d in tipos.findall(NS_CT + "Default")}
        for ext in ("rels", "xml"):
            if ext not in defaults:
                erros.append("[Content_Types].xml sem Default para a extensao %r" % ext)
        partes_xml = [n for n in nomes
                      if n.startswith("xl/") and n.endswith(".xml") and "/_rels/" not in n]
        for parte in partes_xml:
            if "/" + parte not in overrides:
                erros.append("parte sem Override em [Content_Types].xml: %s" % parte)

        # --- relacionamentos ---
        rels = ElementTree.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        alvos = {}
        for rel in rels.findall(NS_REL + "Relationship"):
            destino = rel.get("Target", "")
            caminho_alvo = destino[1:] if destino.startswith("/") else "xl/" + destino
            alvos[rel.get("Id")] = caminho_alvo
            if caminho_alvo not in nomes:
                erros.append("relacionamento %s aponta para parte inexistente: %s"
                             % (rel.get("Id"), caminho_alvo))

        # --- workbook ---
        wb = ElementTree.fromstring(z.read("xl/workbook.xml"))
        _ordem(wb, ORDEM_WORKBOOK, "xl/workbook.xml", erros)
        nomes_abas, ids = [], set()
        for sheet in wb.iter(NS_MAIN + "sheet"):
            nome = sheet.get("name") or ""
            rid = sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/"
                            "relationships}id")
            nomes_abas.append(nome)
            if not nome:
                erros.append("xl/workbook.xml: aba sem atributo name")
            if len(nome) > 31:
                erros.append("nome de aba com %d caracteres (o limite e 31): %r"
                             % (len(nome), nome))
            if PROIBIDOS_ABA.search(nome):
                erros.append("nome de aba com caractere proibido: %r" % nome)
            if rid not in alvos:
                erros.append("aba %r referencia r:id inexistente: %r" % (nome, rid))
            sid = sheet.get("sheetId")
            if sid in ids:
                erros.append("sheetId repetido: %r" % sid)
            ids.add(sid)
        vistos = set()
        for nome in nomes_abas:
            chave = nome.lower()
            if chave in vistos:
                erros.append("nome de aba repetido: %r" % nome)
            vistos.add(chave)

        # --- styles ---
        if "xl/styles.xml" in nomes:
            estilos = ElementTree.fromstring(z.read("xl/styles.xml"))
            _ordem(estilos, ORDEM_STYLESHEET, "xl/styles.xml", erros)
            for filho in estilos:
                _conta(filho, erros, "xl/styles.xml/<%s>" % filho.tag.replace(NS_MAIN, ""))
            xfs = estilos.find(NS_MAIN + "cellXfs")
            total_xf = len(list(xfs)) if xfs is not None else 0
        else:
            total_xf = 0

        # --- planilhas ---
        for parte in sorted(n for n in nomes if n.startswith("xl/worksheets/")
                            and n.endswith(".xml")):
            ws = ElementTree.fromstring(z.read(parte))
            _ordem(ws, ORDEM_WORKSHEET, parte, erros)
            linha_anterior = 0
            for row in ws.iter(NS_MAIN + "row"):
                numero = row.get("r")
                if numero is not None:
                    try:
                        numero = int(numero)
                    except ValueError:
                        erros.append("%s: atributo r invalido em <row>: %r" % (parte, numero))
                        continue
                    if numero <= linha_anterior:
                        erros.append("%s: linha %d fora de ordem crescente" % (parte, numero))
                    linha_anterior = numero
                coluna_anterior = -1
                for c in row.findall(NS_MAIN + "c"):
                    _ordem(c, ORDEM_CELULA, "%s <c r=%s>" % (parte, c.get("r")), erros)
                    ref = c.get("r") or ""
                    casado = REF_CELULA.match(ref)
                    if not casado:
                        erros.append("%s: referencia de celula invalida: %r" % (parte, ref))
                        continue
                    if numero is not None and int(casado.group(2)) != numero:
                        erros.append("%s: celula %s dentro da linha %d" % (parte, ref, numero))
                    indice = 0
                    for letra in casado.group(1):
                        indice = indice * 26 + (ord(letra) - 64)
                    if indice <= coluna_anterior:
                        erros.append("%s: celula %s fora de ordem crescente" % (parte, ref))
                    coluna_anterior = indice
                    estilo = c.get("s")
                    if estilo is not None and total_xf and int(estilo) >= total_xf:
                        erros.append("%s: celula %s usa estilo s=%s inexistente (ha %d)"
                                     % (parte, ref, estilo, total_xf))
                    tipo = c.get("t", "n")
                    v = c.find(NS_MAIN + "v")
                    if tipo in ("n", "") and v is not None and v.text:
                        if CIENTIFICO.search(v.text):
                            erros.append("%s: celula %s com numero em notacao cientifica "
                                         "(%r), que o Excel nao aceita" % (parte, ref, v.text))
                    if tipo == "inlineStr" and c.find(NS_MAIN + "is") is None:
                        erros.append("%s: celula %s marcada inlineStr sem <is>" % (parte, ref))
    return erros


def exigir_valido(caminho):
    """Levanta ErroValidacao se o arquivo tiver qualquer problema estrutural."""
    problemas = validar(caminho)
    if problemas:
        raise ErroValidacao("%s: %d problema(s)\n  - %s"
                            % (caminho, len(problemas), "\n  - ".join(problemas)))
    return True

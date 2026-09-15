# -*- coding: utf-8 -*-
"""Leitura de planilhas sem dependencias externas: .xlsx (zip + XML), .csv e .txt.

A planilha de movimentacao de produtos chega em formatos muito variados. Por isso:
  * o cabecalho e procurado nas primeiras linhas (planilhas costumam ter titulo antes);
  * os nomes de coluna sao reconhecidos por sinonimos, sem acento e sem diferenciar caixa;
  * o mapeamento aplicado e devolvido junto, para poder ser conferido pelo usuario.
"""
from __future__ import annotations

import csv
import io
import os
import re
import unicodedata
import zipfile
from decimal import Decimal
from xml.etree import ElementTree

from .parser import to_decimal

NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
NS_PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"


# ---------------------------------------------------------------------------
# Normalizacao de texto
# ---------------------------------------------------------------------------
def normalizar(texto):
    """'Estoque Inicial (Qtd.)' -> 'estoque inicial qtd'."""
    if texto is None:
        return ""
    texto = unicodedata.normalize("NFKD", str(texto))
    texto = "".join(ch for ch in texto if not unicodedata.combining(ch))
    texto = texto.lower().strip()
    texto = re.sub(r"[^a-z0-9]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


# ---------------------------------------------------------------------------
# Leitura de .xlsx sem openpyxl
# ---------------------------------------------------------------------------
def _coluna_para_indice(ref):
    """'AB12' -> 27 (indice 0-based da coluna AB)."""
    letras = "".join(ch for ch in ref if ch.isalpha()).upper()
    indice = 0
    for ch in letras:
        indice = indice * 26 + (ord(ch) - 64)
    return indice - 1


def _shared_strings(z):
    try:
        raiz = ElementTree.fromstring(z.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    strings = []
    for si in raiz.findall(NS_MAIN + "si"):
        partes = [t.text or "" for t in si.iter(NS_MAIN + "t")]
        strings.append("".join(partes))
    return strings


def _planilhas_do_workbook(z):
    """Devolve [(nome, caminho_xml)] na ordem do workbook."""
    try:
        wb = ElementTree.fromstring(z.read("xl/workbook.xml"))
        rels = ElementTree.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    except KeyError:
        nomes = sorted(n for n in z.namelist()
                       if n.startswith("xl/worksheets/") and n.endswith(".xml"))
        return [(os.path.basename(n), n) for n in nomes]
    alvo = {}
    for rel in rels:
        destino = rel.get("Target", "")
        if destino.startswith("/"):
            destino = destino[1:]
        elif not destino.startswith("xl/"):
            destino = "xl/" + destino
        alvo[rel.get("Id")] = destino.replace("xl/../", "")
    saida = []
    for sheet in wb.iter(NS_MAIN + "sheet"):
        rid = sheet.get(NS_REL + "id")
        caminho = alvo.get(rid)
        if caminho and caminho in z.namelist():
            saida.append((sheet.get("name", caminho), caminho))
    return saida


def ler_xlsx(caminho, aba=None):
    """Devolve (nome_da_aba, [[celula, ...], ...]) com os valores como texto."""
    with zipfile.ZipFile(caminho) as z:
        strings = _shared_strings(z)
        abas = _planilhas_do_workbook(z)
        if not abas:
            raise ValueError("Arquivo .xlsx sem planilhas legiveis: %s" % caminho)
        escolhida = abas[0]
        if aba:
            alvo = normalizar(aba)
            for nome, caminho_xml in abas:
                if normalizar(nome) == alvo:
                    escolhida = (nome, caminho_xml)
                    break
        nome_aba, caminho_xml = escolhida
        raiz = ElementTree.fromstring(z.read(caminho_xml))

    linhas = []
    for row in raiz.iter(NS_MAIN + "row"):
        celulas = []
        for c in row.findall(NS_MAIN + "c"):
            ref = c.get("r") or ""
            idx = _coluna_para_indice(ref) if ref else len(celulas)
            tipo = c.get("t", "n")
            valor = ""
            if tipo == "inlineStr":
                valor = "".join(t.text or "" for t in c.iter(NS_MAIN + "t"))
            else:
                v = c.find(NS_MAIN + "v")
                bruto = v.text if v is not None else None
                if bruto is None:
                    valor = ""
                elif tipo == "s":
                    try:
                        valor = strings[int(bruto)]
                    except (ValueError, IndexError):
                        valor = ""
                elif tipo == "b":
                    valor = "1" if bruto == "1" else "0"
                else:
                    valor = bruto
            while len(celulas) < idx:
                celulas.append("")
            celulas.append(valor)
        linhas.append(celulas)
    return nome_aba, linhas


def ler_csv(caminho):
    dados = None
    for enc in ("utf-8-sig", "latin-1", "utf-8"):
        try:
            with io.open(caminho, "r", encoding=enc, newline="") as fh:
                dados = fh.read()
            break
        except UnicodeDecodeError:
            continue
    if dados is None:
        raise ValueError("Nao foi possivel decodificar %s" % caminho)
    amostra = dados[:8192]
    delim = ";" if amostra.count(";") >= amostra.count(",") else ","
    if amostra.count("\t") > amostra.count(delim):
        delim = "\t"
    return [list(linha) for linha in csv.reader(io.StringIO(dados), delimiter=delim)]


def ler_grade(caminho, aba=None):
    """Le qualquer formato suportado e devolve (nome_origem, matriz de texto)."""
    ext = os.path.splitext(caminho)[1].lower()
    if ext in (".xlsx", ".xlsm"):
        return ler_xlsx(caminho, aba)
    if ext in (".xls", ".xlt"):
        from . import xls_legacy
        return xls_legacy.ler(caminho, aba)
    if ext in (".csv", ".txt", ".tsv"):
        return os.path.basename(caminho), ler_csv(caminho)
    if zipfile.is_zipfile(caminho):     # .xlsx com extensao trocada
        return ler_xlsx(caminho, aba)
    with io.open(caminho, "rb") as fh:  # .xls binario com extensao trocada
        if fh.read(8) == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
            from . import xls_legacy
            return xls_legacy.ler(caminho, aba)
    return os.path.basename(caminho), ler_csv(caminho)


# ---------------------------------------------------------------------------
# Mapeamento de colunas da movimentacao de produtos
# ---------------------------------------------------------------------------
SINONIMOS = {
    "codigo": [
        "codigo", "cod", "cod item", "codigo item", "cod produto", "codigo produto",
        "cod prod", "sku", "referencia", "ref", "cod interno", "codigo interno",
        "item", "cod material",
    ],
    "descricao": [
        "descricao", "descricao produto", "descricao do produto", "produto",
        "nome", "nome produto", "mercadoria", "descricao item", "desc",
    ],
    "ncm": ["ncm", "ncm sh", "cod ncm", "classificacao fiscal", "nbm"],
    "unidade": ["unidade", "un", "und", "unid", "unid medida", "unidade medida", "um"],
    "estoque_inicial": [
        "estoque inicial", "saldo inicial", "est inicial", "qtd inicial",
        "quantidade inicial", "inicial", "saldo anterior", "estoque anterior",
        "qtde inicial",
    ],
    "entradas": [
        "entradas", "entrada", "qtd entrada", "qtd entradas", "quantidade entrada",
        "quantidade entradas", "compras", "total entradas", "qtde entrada",
        "qtde entradas", "e", "entrada qtd",
    ],
    "saidas": [
        "saidas", "saida", "qtd saida", "qtd saidas", "quantidade saida",
        "quantidade saidas", "vendas", "total saidas", "qtde saida", "qtde saidas",
        "s", "saida qtd", "baixas",
    ],
    "estoque_final": [
        "estoque final", "saldo final", "est final", "qtd final",
        "quantidade final", "final", "saldo atual", "estoque atual", "qtde final",
    ],
    "custo_unitario": [
        "custo unitario", "custo medio", "custo", "valor unitario", "vl unitario",
        "preco custo", "preco medio", "custo medio unitario", "vl unit",
    ],
    "valor_entradas": ["valor entradas", "vl entradas", "valor entrada", "total entrada valor"],
    "valor_saidas": ["valor saidas", "vl saidas", "valor saida", "total saida valor"],
    "valor_estoque_final": [
        "valor estoque final", "vl estoque final", "valor final", "saldo valor",
        "valor total", "total", "valor estoque",
    ],
}
_INDICE_SINONIMOS = {}
for _campo, _lista in SINONIMOS.items():
    for _alias in _lista:
        _INDICE_SINONIMOS.setdefault(normalizar(_alias), _campo)

CAMPOS_QUANTIDADE = ("estoque_inicial", "entradas", "saidas", "estoque_final")
CAMPOS_VALOR = ("custo_unitario", "valor_entradas", "valor_saidas", "valor_estoque_final")


def _mapear_cabecalho(celulas):
    """Devolve {indice_coluna: campo} para uma linha candidata a cabecalho."""
    mapa = {}
    for i, celula in enumerate(celulas):
        chave = normalizar(celula)
        if not chave:
            continue
        campo = _INDICE_SINONIMOS.get(chave)
        if campo is None:
            # tentativa por prefixo, para cabecalhos como "entradas (kg)"
            for alias, destino in _INDICE_SINONIMOS.items():
                if chave.startswith(alias + " ") or chave == alias:
                    campo = destino
                    break
        if campo and campo not in mapa.values():
            mapa[i] = campo
    return mapa


def localizar_cabecalho(linhas, limite=25):
    """Escolhe a linha de cabecalho como a que reconhece mais colunas."""
    melhor_idx, melhor_mapa = None, {}
    for idx, celulas in enumerate(linhas[:limite]):
        mapa = _mapear_cabecalho(celulas)
        if len(mapa) > len(melhor_mapa):
            melhor_idx, melhor_mapa = idx, mapa
    return melhor_idx, melhor_mapa


class ItemMovimentacao(object):
    __slots__ = ("codigo", "descricao", "ncm", "unidade", "estoque_inicial",
                 "entradas", "saidas", "estoque_final", "custo_unitario",
                 "valor_entradas", "valor_saidas", "valor_estoque_final", "linha")

    def __init__(self, **kw):
        for campo in self.__slots__:
            setattr(self, campo, kw.get(campo))
        for campo in CAMPOS_QUANTIDADE + CAMPOS_VALOR:
            if getattr(self, campo) is None:
                setattr(self, campo, Decimal("0"))
        for campo in ("codigo", "descricao", "ncm", "unidade"):
            if getattr(self, campo) is None:
                setattr(self, campo, "")

    @property
    def saldo_calculado(self):
        return self.estoque_inicial + self.entradas - self.saidas

    @property
    def divergencia_saldo(self):
        """Diferenca entre o estoque final informado e o recalculado (EI + E - S)."""
        return self.estoque_final - self.saldo_calculado

    def como_dict(self):
        return {c: getattr(self, c) for c in self.__slots__}


class Movimentacao(object):
    def __init__(self, arquivo, aba, itens, mapa_colunas, cabecalho_linha, avisos):
        self.arquivo = arquivo
        self.aba = aba
        self.itens = itens
        self.mapa_colunas = mapa_colunas          # {nome_coluna_original: campo}
        self.cabecalho_linha = cabecalho_linha
        self.avisos = avisos

    def por_codigo(self):
        indice = {}
        for item in self.itens:
            chave = normalizar(item.codigo)
            if chave:
                indice.setdefault(chave, []).append(item)
        return indice

    def resumo(self):
        return {
            "arquivo": self.arquivo,
            "aba": self.aba,
            "linha_do_cabecalho": self.cabecalho_linha,
            "colunas_reconhecidas": self.mapa_colunas,
            "qtd_itens": len(self.itens),
            "avisos": list(self.avisos),
        }


def ler_movimentacao(caminho, aba=None):
    nome, linhas = ler_grade(caminho, aba)
    avisos = []
    idx_cabecalho, mapa = localizar_cabecalho(linhas)

    if not mapa:
        raise ValueError(
            "Nenhuma coluna reconhecida em %s. Esperado ao menos uma coluna de codigo/produto "
            "e uma de quantidade (estoque inicial, entradas, saidas, estoque final). "
            "Cabecalhos lidos: %s" % (caminho, linhas[0][:15] if linhas else [])
        )
    campos = set(mapa.values())
    if not ({"codigo", "descricao"} & campos):
        avisos.append("Planilha sem coluna de codigo ou descricao do produto - o cruzamento "
                      "com o SPED sera limitado.")
    faltando = [c for c in CAMPOS_QUANTIDADE if c not in campos]
    if faltando:
        avisos.append("Colunas de quantidade ausentes: %s." % ", ".join(faltando))

    cabecalho_original = linhas[idx_cabecalho]
    mapa_nomeado = {}
    for i, campo in sorted(mapa.items()):
        titulo = cabecalho_original[i] if i < len(cabecalho_original) else "coluna %d" % i
        mapa_nomeado[str(titulo).strip() or "coluna %d" % i] = campo

    itens, vazias = [], 0
    for numero, celulas in enumerate(linhas[idx_cabecalho + 1:], start=idx_cabecalho + 2):
        if not any(str(c).strip() for c in celulas):
            vazias += 1
            continue
        dados = {"linha": numero}
        for i, campo in mapa.items():
            bruto = celulas[i] if i < len(celulas) else ""
            if campo in CAMPOS_QUANTIDADE or campo in CAMPOS_VALOR:
                dados[campo] = to_decimal(bruto)
            else:
                dados[campo] = str(bruto).strip()
        if not (dados.get("codigo") or dados.get("descricao")):
            continue
        itens.append(ItemMovimentacao(**dados))

    if not itens:
        avisos.append("Nenhuma linha de produto foi lida apos o cabecalho.")
    return Movimentacao(os.path.basename(caminho), nome, itens, mapa_nomeado,
                        idx_cabecalho + 1, avisos)

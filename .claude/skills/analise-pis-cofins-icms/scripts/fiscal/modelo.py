# -*- coding: utf-8 -*-
"""Estruturas comuns: linha fiscal normalizada e achado de auditoria."""
from __future__ import annotations

from decimal import Decimal

ZERO = Decimal("0")


def tipo_estabelecimento(cnpj):
    """MATRIZ quando a ordem do CNPJ e 0001; FILIAL nos demais casos."""
    digitos = "".join(ch for ch in str(cnpj or "") if ch.isdigit())
    if len(digitos) != 14:
        return ""
    return "MATRIZ" if digitos[8:12] == "0001" else "FILIAL"


def formata_cnpj(cnpj):
    d = "".join(ch for ch in str(cnpj or "") if ch.isdigit())
    if len(d) != 14:
        return str(cnpj or "")
    return "%s.%s.%s/%s-%s" % (d[:2], d[2:5], d[5:8], d[8:12], d[12:])

SEV_ALTA = "ALTA"
SEV_MEDIA = "MEDIA"
SEV_BAIXA = "BAIXA"
SEV_INFO = "INFO"

_ORDEM_SEV = {SEV_ALTA: 0, SEV_MEDIA: 1, SEV_BAIXA: 2, SEV_INFO: 3}

# Documentos cancelados / denegados / inutilizados (COD_SIT do C100)
COD_SIT_DESCONSIDERAR = {"02", "03", "04", "05"}


class LinhaFiscal(object):
    """Item de documento fiscal ja normalizado, independente do registro de origem."""

    __slots__ = (
        "origem", "tipo", "doc", "serie", "chave", "data", "cod_part", "cfop",
        "cod_item", "ncm", "descricao", "qtd", "unid", "vl_item", "vl_desc",
        "cst_pis", "bc_pis", "aliq_pis", "vl_pis",
        "cst_cofins", "bc_cofins", "aliq_cofins", "vl_cofins",
        "cst_icms", "bc_icms", "aliq_icms", "vl_icms", "bc_icms_st", "vl_icms_st",
        "nat_bc_cred", "linha", "arquivo", "estabelecimento",
        "cnpj_estabelecimento", "uf_estabelecimento",
    )

    def __init__(self, **kw):
        for campo in self.__slots__:
            setattr(self, campo, kw.get(campo))
        for campo in ("qtd", "vl_item", "vl_desc", "bc_pis", "aliq_pis", "vl_pis",
                      "bc_cofins", "aliq_cofins", "vl_cofins", "bc_icms", "aliq_icms",
                      "vl_icms", "bc_icms_st", "vl_icms_st"):
            if getattr(self, campo) is None:
                setattr(self, campo, ZERO)
        for campo in ("origem", "tipo", "doc", "serie", "chave", "data", "cod_part",
                      "cfop", "cod_item", "ncm", "descricao", "unid", "cst_pis",
                      "cst_cofins", "cst_icms", "nat_bc_cred", "arquivo",
                      "estabelecimento", "cnpj_estabelecimento", "uf_estabelecimento"):
            if getattr(self, campo) is None:
                setattr(self, campo, "")

    @property
    def eh_saida(self):
        return self.tipo == "SAIDA"

    @property
    def eh_entrada(self):
        return self.tipo == "ENTRADA"

    @property
    def tipo_estabelecimento(self):
        return tipo_estabelecimento(self.cnpj_estabelecimento)

    def ref(self):
        """Identificacao curta do item para amostragem em relatorio."""
        partes = []
        if self.estabelecimento or self.cnpj_estabelecimento:
            rotulo = self.estabelecimento or self.cnpj_estabelecimento
            if self.uf_estabelecimento:
                rotulo = "%s/%s" % (rotulo, self.uf_estabelecimento)
            partes.append("est. %s" % rotulo)
        if self.doc:
            partes.append("NF %s" % self.doc)
        if self.data:
            partes.append(self.data)
        if self.cod_item:
            partes.append("item %s" % self.cod_item)
        if self.cfop:
            partes.append("CFOP %s" % self.cfop)
        return " | ".join(partes) or self.origem

    def como_dict(self):
        return {c: getattr(self, c) for c in self.__slots__}


class Achado(object):
    """Uma constatacao de auditoria com efeito financeiro estimado."""

    def __init__(self, codigo, titulo, severidade, tributo, descricao,
                 base_legal="", recomendacao="", competencia="", cnpj="",
                 natureza_valor="Efeito tributario estimado"):
        self.codigo = codigo
        self.titulo = titulo
        self.severidade = severidade
        self.tributo = tributo           # PIS/COFINS | ICMS | ESTOQUE | GERAL
        self.descricao = descricao
        self.base_legal = base_legal
        self.recomendacao = recomendacao
        self.competencia = competencia
        self.cnpj = cnpj
        self.quantidade = 0
        self.valor = ZERO                # efeito financeiro estimado (sempre positivo)
        self.sentido = ""                # RECUPERAR | RECOLHER | AJUSTAR | ""
        self.natureza_valor = natureza_valor   # o que o campo valor mede
        self.amostras = []
        self.detalhes = []               # todas as linhas, para exportacao em CSV

    def adicionar(self, linha, valor=ZERO, obs=""):
        self.quantidade += 1
        self.valor += valor or ZERO
        registro = {"ref": linha.ref() if hasattr(linha, "ref") else str(linha),
                    "valor": valor or ZERO, "obs": obs}
        if hasattr(linha, "como_dict"):
            registro["linha"] = linha.como_dict()
        self.detalhes.append(registro)
        if len(self.amostras) < 10:
            self.amostras.append(registro)
        return self

    @property
    def relevante(self):
        return self.quantidade > 0

    def como_dict(self):
        return {
            "codigo": self.codigo,
            "titulo": self.titulo,
            "severidade": self.severidade,
            "tributo": self.tributo,
            "competencia": self.competencia,
            "cnpj": self.cnpj,
            "quantidade": self.quantidade,
            "valor": self.valor,
            "sentido": self.sentido,
            "natureza_valor": self.natureza_valor,
            "descricao": self.descricao,
            "base_legal": self.base_legal,
            "recomendacao": self.recomendacao,
            "amostras": self.amostras,
        }


def ordenar_achados(achados):
    return sorted(
        [a for a in achados if a.relevante],
        key=lambda a: (_ORDEM_SEV.get(a.severidade, 9), -a.valor, a.codigo),
    )

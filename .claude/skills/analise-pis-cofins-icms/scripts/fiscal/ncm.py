# -*- coding: utf-8 -*-
"""Classificacao de NCM por regime de PIS/COFINS (monofasico, aliquota zero, ST).

A tabela vive em assets/ncm_regimes.csv para poder ser mantida sem mexer no codigo.
A busca e por PREFIXO MAIS LONGO: '3004.90.46' vence '3004' se estiver cadastrado.

ATENCAO: a tabela e um ponto de partida curado, nao uma fonte oficial. Antes de
quantificar qualquer valor a recuperar, confirme item a item na legislacao vigente
na competencia analisada (a coluna base_legal indica onde olhar).
"""
from __future__ import annotations

import csv
import io
import os

_AQUI = os.path.dirname(os.path.abspath(__file__))
CAMINHO_PADRAO = os.path.normpath(os.path.join(_AQUI, "..", "..", "assets", "ncm_regimes.csv"))

REGIME_MONOFASICO = "MONOFASICO"
REGIME_ALIQUOTA_ZERO = "ALIQUOTA_ZERO"
REGIME_ST = "ST_PIS_COFINS"
REGIME_TRIBUTADO = "TRIBUTADO"

# CST esperado na SAIDA (revenda por atacadista/varejista) para cada regime
CST_ESPERADO_REVENDA = {
    REGIME_MONOFASICO: "04",
    REGIME_ALIQUOTA_ZERO: "06",
    REGIME_ST: "05",
}
# CST esperado na ENTRADA (aquisicao para revenda) - sem direito a credito
CST_ESPERADO_ENTRADA = {
    REGIME_MONOFASICO: {"70", "73", "75", "98"},
    REGIME_ALIQUOTA_ZERO: {"70", "73", "98"},
    REGIME_ST: {"70", "75", "98"},
}


def normaliza_ncm(ncm):
    """Deixa somente digitos: '3004.90.46' -> '30049046'."""
    return "".join(ch for ch in str(ncm or "") if ch.isdigit())


class TabelaNCM(object):
    def __init__(self, linhas=None, origem=""):
        self.origem = origem
        self._por_prefixo = {}
        self.erros = []
        for linha in (linhas or []):
            self.adicionar(linha)

    def adicionar(self, linha):
        prefixo = normaliza_ncm(linha.get("ncm_prefixo"))
        if not prefixo:
            return
        self._por_prefixo[prefixo] = {
            "ncm_prefixo": linha.get("ncm_prefixo", "").strip(),
            "regime": (linha.get("regime") or "").strip().upper(),
            "grupo": (linha.get("grupo") or "").strip(),
            "descricao": (linha.get("descricao") or "").strip(),
            "base_legal": (linha.get("base_legal") or "").strip(),
            "aliq_pis_ind": (linha.get("aliq_pis_ind") or "").strip(),
            "aliq_cofins_ind": (linha.get("aliq_cofins_ind") or "").strip(),
            "cst_saida_revendedor": (linha.get("cst_saida_revendedor") or "").strip(),
            "confianca": (linha.get("confianca") or "").strip().lower(),
            "observacao": (linha.get("observacao") or "").strip(),
        }

    def __len__(self):
        return len(self._por_prefixo)

    def classificar(self, ncm):
        """Devolve o registro de regime mais especifico para o NCM, ou None."""
        digitos = normaliza_ncm(ncm)
        if not digitos:
            return None
        for tam in range(len(digitos), 1, -1):
            achado = self._por_prefixo.get(digitos[:tam])
            if achado:
                return achado
        return None

    def regime(self, ncm):
        achado = self.classificar(ncm)
        return achado["regime"] if achado else REGIME_TRIBUTADO


def carregar(caminho=None):
    """Carrega a tabela do CSV (delimitador ';'). Devolve TabelaNCM vazia se faltar."""
    caminho = caminho or CAMINHO_PADRAO
    if not os.path.exists(caminho):
        tabela = TabelaNCM(origem=caminho)
        tabela.erros.append("Tabela de NCM nao encontrada em %s" % caminho)
        return tabela
    linhas = []
    with io.open(caminho, "r", encoding="utf-8") as fh:
        amostra = fh.read(4096)
        fh.seek(0)
        delim = ";" if amostra.count(";") >= amostra.count(",") else ","
        for linha in csv.DictReader(fh, delimiter=delim):
            linhas.append(linha)
    return TabelaNCM(linhas, origem=caminho)


def mesclar(tabela, caminho_extra):
    """Sobrepoe/complementa a tabela com um CSV do cliente (mesmas colunas)."""
    extra = carregar(caminho_extra)
    for prefixo, dados in extra._por_prefixo.items():
        tabela._por_prefixo[prefixo] = dados
    return tabela

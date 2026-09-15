#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera arquivos SPED e planilha de exemplo com inconsistencias plantadas.

Serve de fixture para os testes e de material de demonstracao da skill.
Cada erro plantado esta comentado com o codigo do achado que deve dispara-lo.
"""
from __future__ import annotations

import io
import os
import sys
from decimal import Decimal, ROUND_HALF_UP

_AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_AQUI))

from fiscal import xlsx

D = Decimal
CENTAVO = D("0.01")

CNPJ = "11222333000181"
NOME = "EXEMPLO COMERCIO DE PRODUTOS LTDA"
UF = "SP"
DT_INI, DT_FIN = "01072026", "31072026"

ITENS = [
    # cod,  descricao,                   ncm,          unid, tipo_item
    ("P001", "DIPIRONA SODICA 500MG C/20", "30049099", "CX", "00"),
    ("P002", "REFRIGERANTE COLA 2L",       "22021000", "UN", "00"),
    ("P003", "CADEIRA DE ESCRITORIO GIRAT", "94013000", "UN", "00"),
    ("P004", "PNEU 175/70 R13",            "40111000", "UN", "00"),
    ("P005", "ARROZ TIPO 1 PACOTE 5KG",    "10063021", "PC", "00"),
    ("P006", "CANETA ESFEROGRAFICA AZUL",  "",         "UN", "00"),  # CR-07: sem NCM
]

PIS_NC, COFINS_NC = D("1.65"), D("7.6")


def n(valor, casas=2):
    if not isinstance(valor, Decimal):
        valor = D(str(valor))
    quant = D("1").scaleb(-casas)
    return format(valor.quantize(quant, rounding=ROUND_HALF_UP), "f").replace(".", ",")


def reg(*campos):
    return "|" + "|".join("" if c is None else str(c) for c in campos) + "|"


class Item(object):
    def __init__(self, cod, qtd, vl_unit, cfop, cst_icms, aliq_icms,
                 cst_pis, cst_cofins, aliq_pis=None, aliq_cofins=None,
                 bc_com_icms=False, vl_pis_forcado=None, vl_icms_st=D("0"),
                 sem_credito_icms=False, vl_icms_forcado=None):
        self.cod = cod
        self.qtd = D(str(qtd))
        self.vl_unit = D(str(vl_unit))
        self.cfop = cfop
        self.cst_icms = cst_icms
        self.aliq_icms = D(str(aliq_icms))
        self.cst_pis = cst_pis
        self.cst_cofins = cst_cofins
        self.aliq_pis = PIS_NC if aliq_pis is None else D(str(aliq_pis))
        self.aliq_cofins = COFINS_NC if aliq_cofins is None else D(str(aliq_cofins))
        self.bc_com_icms = bc_com_icms
        self.vl_pis_forcado = vl_pis_forcado
        self.vl_icms_st = D(str(vl_icms_st))
        self.sem_credito_icms = sem_credito_icms
        self.vl_icms_forcado = vl_icms_forcado

    @property
    def vl_item(self):
        return (self.qtd * self.vl_unit).quantize(CENTAVO)

    @property
    def bc_icms(self):
        trib = self.cst_icms[-2:]
        return self.vl_item if trib in ("00", "10", "20") else D("0")

    @property
    def vl_icms(self):
        if self.vl_icms_forcado is not None:
            return D(str(self.vl_icms_forcado))
        if self.sem_credito_icms:
            return D("0")
        trib = self.cst_icms[-2:]
        if trib in ("00", "10", "20"):
            return (self.bc_icms * self.aliq_icms / 100).quantize(CENTAVO)
        return D("0")

    @property
    def bc_pis(self):
        if self.cst_pis in ("01", "02", "50", "51", "52", "53", "54", "55", "56"):
            return self.vl_item if self.bc_com_icms else (self.vl_item - self.vl_icms)
        return D("0")

    @property
    def vl_pis(self):
        if self.vl_pis_forcado is not None:
            return D(str(self.vl_pis_forcado))
        return (self.bc_pis * self.aliq_pis / 100).quantize(CENTAVO)

    @property
    def bc_cofins(self):
        return self.bc_pis

    @property
    def vl_cofins(self):
        return (self.bc_cofins * self.aliq_cofins / 100).quantize(CENTAVO)


class Doc(object):
    def __init__(self, ind_oper, ind_emit, num, serie, dt, cod_part, itens, cod_sit="00"):
        self.ind_oper, self.ind_emit = ind_oper, ind_emit
        self.num, self.serie, self.dt = num, serie, dt
        self.cod_part, self.itens, self.cod_sit = cod_part, itens, cod_sit

    def total(self, atributo):
        return sum((getattr(i, atributo) for i in self.itens), D("0"))

    @property
    def chave(self):
        return ("35260711222333000181550%03d%09d" % (int(self.serie), int(self.num))).ljust(44, "0")[:44]


# ---------------------------------------------------------------------------
# Documentos - com os erros plantados
# ---------------------------------------------------------------------------
def documentos():
    return [
        # ---- ENTRADAS ----
        Doc("0", "1", 5001, "1", "03072026", "F001", [
            # PC-02: pneu monofasico comprado com CST 50 (credito indevido)
            Item("P004", 40, "280.00", "1102", "000", 18, "50", "50"),
            # PC-09: item tributado comprado com CST 70 (credito nao aproveitado)
            Item("P003", 30, "420.00", "1102", "000", 18, "70", "70"),
        ]),
        Doc("0", "1", 5002, "1", "05072026", "F002", [
            Item("P001", 200, "12.50", "1102", "000", 18, "70", "70"),   # correto
            Item("P005", 500, "22.00", "1102", "041", 0, "73", "73"),    # correto
            # IC-03: CST 060 (ICMS ja retido por ST) com ICMS creditado
            Item("P002", 800, "4.10", "1102", "060", 18, "70", "70",
                 vl_icms_forcado="590.40"),
        ]),
        Doc("0", "1", 5003, "1", "10072026", "F003", [
            Item("P006", 1000, "1.80", "1102", "000", 18, "50", "50"),   # correto
        ]),
        # ---- SAIDAS ----
        Doc("1", "0", 9001, "1", "12072026", "C001", [
            # PC-01: medicamento monofasico vendido com CST 01 (tributado indevidamente)
            Item("P001", 150, "24.90", "5102", "000", 18, "01", "01"),
            # PC-07: BC de PIS/COFINS com o ICMS dentro
            Item("P003", 20, "780.00", "5102", "000", 18, "01", "01", bc_com_icms=True),
        ]),
        Doc("1", "0", 9002, "1", "18072026", "C002", [
            # PC-12: CST 06 (aliquota zero) com valor de PIS destacado
            Item("P005", 300, "31.90", "5102", "041", 0, "06", "06", vl_pis_forcado="5.40"),
            # IC-05: CST 060 na saida com ICMS proprio destacado
            Item("P002", 600, "7.20", "5405", "060", 18, "04", "04",
                 vl_icms_forcado="777.60"),
        ]),
        Doc("1", "0", 9003, "1", "25072026", "C003", [
            # PC-06: CST de PIS diferente do CST de COFINS
            Item("P006", 700, "3.50", "5102", "000", 18, "01", "02"),
            # PC-05: valor de PIS incompativel com base x aliquota
            Item("P004", 25, "395.00", "5102", "000", 18, "04", "04"),
        ]),
        Doc("1", "0", 9004, "1", "28072026", "C004", [
            Item("P003", 12, "795.00", "5102", "000", 18, "01", "01"),   # correto
        ]),
    ]


def _forcar_pc05(docs):
    """PC-05: distorce VL_PIS de um item tributado mantendo BC e aliquota."""
    for d in docs:
        if d.num == 9004:
            item = d.itens[0]
            item.vl_pis_forcado = (item.bc_pis * item.aliq_pis / 100 + D("50.00")).quantize(CENTAVO)
    return docs


# ---------------------------------------------------------------------------
# Geracao dos arquivos
# ---------------------------------------------------------------------------
def bloco_0(tipo, docs):
    linhas = []
    if tipo == "contrib":
        linhas.append(reg("0000", "006", "0", "", "", DT_INI, DT_FIN, NOME, CNPJ,
                          UF, "3550308", "", "01", "0"))
        linhas.append(reg("0001", "0"))
        linhas.append(reg("0110", "1", "1", "", ""))
        linhas.append(reg("0140", "001", NOME, CNPJ, UF, "111222333111", "3550308", "", ""))
    else:
        linhas.append(reg("0000", "019", "0", DT_INI, DT_FIN, NOME, CNPJ, "", UF,
                          "111222333111", "3550308", "", "", "A", "0"))
        linhas.append(reg("0001", "0"))
    for cod_part in ("F001", "F002", "F003", "C001", "C002", "C003", "C004"):
        linhas.append(reg("0150", cod_part, "PARCEIRO " + cod_part, "1058",
                          "99888777000166", "", "111000111000", "3550308", "", "RUA X",
                          "100", "", "CENTRO"))
    for unid in ("UN", "CX", "PC"):
        linhas.append(reg("0190", unid, "UNIDADE " + unid))
    for cod, descr, ncm, unid, tipo_item in ITENS:
        linhas.append(reg("0200", cod, descr, "", "", unid, tipo_item, ncm, "", "", "",
                          "", ""))
    linhas.append(reg("0990", len(linhas) + 1))
    return linhas


def bloco_C(tipo, docs):
    linhas = [reg("C001", "0")]
    for d in docs:
        linhas.append(reg(
            "C100", d.ind_oper, d.ind_emit, d.cod_part, "55", d.cod_sit, d.serie,
            d.num, d.chave, d.dt, d.dt, n(d.total("vl_item")), "0", "0,00", "0,00",
            n(d.total("vl_item")), "9", "0,00", "0,00", "0,00",
            n(d.total("bc_icms")), n(d.total("vl_icms")), "0,00",
            n(d.total("vl_icms_st")), "0,00", n(d.total("vl_pis")),
            n(d.total("vl_cofins")), "0,00", "0,00"))
        for numero, it in enumerate(d.itens, start=1):
            linhas.append(reg(
                "C170", numero, it.cod, "", n(it.qtd, 3), "UN", n(it.vl_item), "0,00",
                "0", it.cst_icms, it.cfop, "", n(it.bc_icms), n(it.aliq_icms),
                n(it.vl_icms), "0,00", "0,00", n(it.vl_icms_st), "0", "99", "",
                "0,00", "0,00", "0,00",
                it.cst_pis, n(it.bc_pis), n(it.aliq_pis, 2), "0,00", "0,0000",
                n(it.vl_pis),
                it.cst_cofins, n(it.bc_cofins), n(it.aliq_cofins, 2), "0,00", "0,0000",
                n(it.vl_cofins), "", "0,00"))
        if tipo == "icms":
            analitico = {}
            for it in d.itens:
                chave = (it.cst_icms, it.cfop, n(it.aliq_icms))
                acc = analitico.setdefault(chave, [D("0")] * 5)
                acc[0] += it.vl_item
                acc[1] += it.bc_icms
                acc[2] += it.vl_icms
                acc[3] += D("0")
                acc[4] += it.vl_icms_st
            for (cst, cfop, aliq), acc in sorted(analitico.items()):
                linhas.append(reg("C190", cst, cfop, aliq, n(acc[0]), n(acc[1]),
                                  n(acc[2]), n(acc[3]), n(acc[4]), "0,00", "0,00", ""))
    linhas.append(reg("C990", len(linhas) + 1))
    return linhas


def bloco_E(docs):
    debitos = sum((i.vl_icms for d in docs if d.ind_oper == "1" for i in d.itens), D("0"))
    creditos = sum((i.vl_icms for d in docs if d.ind_oper == "0" for i in d.itens), D("0"))
    saldo = debitos - creditos
    a_recolher = saldo if saldo > 0 else D("0")
    credor = -saldo if saldo < 0 else D("0")
    linhas = [
        reg("E001", "0"),
        reg("E100", DT_INI, DT_FIN),
        reg("E110", n(debitos), "0,00", "0,00", "0,00", n(creditos), "0,00", "0,00",
            "0,00", "0,00", n(abs(saldo)), "0,00", n(a_recolher), n(credor), "0,00"),
    ]
    if a_recolher > 0:
        linhas.append(reg("E116", "000", n(a_recolher), "25082026", "046", "", "", "",
                          "ICMS PROPRIO", "072026"))
    linhas.append(reg("E990", len(linhas) + 1))
    return linhas


def bloco_H(docs):
    """Inventario final - com uma divergencia plantada para CR-06 em P003."""
    saldo_inicial = {"P001": D("300"), "P002": D("1200"), "P003": D("50"),
                     "P004": D("60"), "P005": D("800"), "P006": D("2000")}
    movimento = dict((c, D("0")) for c in saldo_inicial)
    for d in docs:
        for it in d.itens:
            movimento[it.cod] += it.qtd if d.ind_oper == "0" else -it.qtd
    linhas = [reg("H001", "0"), reg("H005", DT_FIN, "0,00", "01")]
    total = D("0")
    for cod, descr, ncm, unid, _ in ITENS:
        qtd_final = saldo_inicial[cod] + movimento[cod]
        if cod == "P003":
            qtd_final -= D("5")           # CR-06: inventario nao bate com a planilha
        custo = {"P001": "12.50", "P002": "4.10", "P003": "420.00", "P004": "280.00",
                 "P005": "22.00", "P006": "1.80"}[cod]
        valor = (qtd_final * D(custo)).quantize(CENTAVO)
        total += valor
        linhas.append(reg("H010", cod, unid, n(qtd_final, 3), n(D(custo)), n(valor),
                          "0", "", "", "", "0,00"))
    linhas[1] = reg("H005", DT_FIN, n(total), "01")
    linhas.append(reg("H990", len(linhas) + 1))
    return linhas


def bloco_M(docs):
    deb_pis = sum((i.vl_pis for d in docs if d.ind_oper == "1" for i in d.itens), D("0"))
    deb_cofins = sum((i.vl_cofins for d in docs if d.ind_oper == "1" for i in d.itens), D("0"))
    bc_deb = sum((i.bc_pis for d in docs if d.ind_oper == "1" for i in d.itens), D("0"))
    cred_pis = sum((i.vl_pis for d in docs if d.ind_oper == "0" for i in d.itens), D("0"))
    cred_cofins = sum((i.vl_cofins for d in docs if d.ind_oper == "0" for i in d.itens), D("0"))
    bc_cred = sum((i.bc_pis for d in docs if d.ind_oper == "0" for i in d.itens), D("0"))

    dev_pis = max(deb_pis - cred_pis, D("0"))
    dev_cofins = max(deb_cofins - cred_cofins, D("0"))

    linhas = [reg("M001", "0")]
    linhas.append(reg("M100", "01", "0", n(bc_cred), n(PIS_NC), "0,00", "0,0000",
                      n(cred_pis), "0,00", "0,00", "0,00", n(cred_pis), "0",
                      n(cred_pis), "0,00"))
    linhas.append(reg("M105", "01", "50", n(bc_cred), "0,00", n(bc_cred), n(bc_cred),
                      "0,00", "0,00", ""))
    linhas.append(reg("M200", n(deb_pis), n(cred_pis), "0,00", n(dev_pis), "0,00",
                      "0,00", n(dev_pis), "0,00", "0,00", "0,00", "0,00", n(dev_pis)))
    linhas.append(reg("M210", "01", n(bc_deb), n(bc_deb), "0,00", "0,00", n(bc_deb),
                      n(PIS_NC), "0,00", "0,0000", n(deb_pis), "0,00", "0,00",
                      "0,00", "0,00", n(deb_pis)))
    linhas.append(reg("M500", "01", "0", n(bc_cred), n(COFINS_NC), "0,00", "0,0000",
                      n(cred_cofins), "0,00", "0,00", "0,00", n(cred_cofins), "0",
                      n(cred_cofins), "0,00"))
    linhas.append(reg("M505", "01", "50", n(bc_cred), "0,00", n(bc_cred), n(bc_cred),
                      "0,00", "0,00", ""))
    linhas.append(reg("M600", n(deb_cofins), n(cred_cofins), "0,00", n(dev_cofins),
                      "0,00", "0,00", n(dev_cofins), "0,00", "0,00", "0,00", "0,00",
                      n(dev_cofins)))
    linhas.append(reg("M610", "01", n(bc_deb), n(bc_deb), "0,00", "0,00", n(bc_deb),
                      n(COFINS_NC), "0,00", "0,0000", n(deb_cofins), "0,00", "0,00",
                      "0,00", "0,00", n(deb_cofins)))
    linhas.append(reg("M990", len(linhas) + 1))
    return linhas


def gravar(caminho, linhas):
    linhas = list(linhas)
    linhas.append(reg("9999", len(linhas) + 1))
    with io.open(caminho, "w", encoding="latin-1", newline="\r\n") as fh:
        fh.write("\n".join(linhas) + "\n")
    return caminho


def gerar_movimentacao(docs, destino_csv, destino_xlsx):
    saldo_inicial = {"P001": D("300"), "P002": D("1200"), "P003": D("50"),
                     "P004": D("60"), "P005": D("800"), "P006": D("2000")}
    entradas = dict((c, D("0")) for c in saldo_inicial)
    saidas = dict((c, D("0")) for c in saldo_inicial)
    for d in docs:
        for it in d.itens:
            if d.ind_oper == "0":
                entradas[it.cod] += it.qtd
            else:
                saidas[it.cod] += it.qtd

    # CR-03: o estoque acusa 18 unidades de P003 a mais de saida do que o SPED documenta
    saidas["P003"] += D("18")
    # CR-02: entrada de P006 sem nota fiscal
    entradas["P006"] += D("250")

    cabecalho = ["Codigo", "Descricao do Produto", "NCM", "Un.", "Estoque Inicial",
                 "Entradas", "Saidas", "Estoque Final", "Custo Medio"]
    linhas = []
    custos = {"P001": "12.50", "P002": "4.10", "P003": "420.00", "P004": "280.00",
              "P005": "22.00", "P006": "1.80"}
    for cod, descr, ncm, unid, _ in ITENS:
        final = saldo_inicial[cod] + entradas[cod] - saidas[cod]
        linhas.append([cod, descr, ncm, unid, saldo_inicial[cod], entradas[cod],
                       saidas[cod], final, D(custos[cod])])

    with io.open(destino_csv, "w", encoding="utf-8", newline="") as fh:
        fh.write("MOVIMENTACAO DE PRODUTOS - JULHO/2026\n")
        fh.write("EXEMPLO COMERCIO DE PRODUTOS LTDA\n")
        fh.write("\n")
        fh.write(";".join(cabecalho) + "\n")
        for linha in linhas:
            fh.write(";".join(str(c).replace(".", ",") if isinstance(c, Decimal) else str(c)
                              for c in linha) + "\n")

    xlsx.escrever(destino_xlsx, [(
        "Movimentacao", [], [["MOVIMENTACAO DE PRODUTOS - JULHO/2026"], [""], cabecalho]
        + linhas)])
    return destino_csv, destino_xlsx


def main(destino=None):
    destino = destino or os.path.join(_AQUI, "amostras")
    os.makedirs(destino, exist_ok=True)
    docs = _forcar_pc05(documentos())

    contrib = bloco_0("contrib", docs) + bloco_C("contrib", docs) + bloco_M(docs)
    gravar(os.path.join(destino, "EFD_CONTRIBUICOES_072026.txt"), contrib)

    fiscal = (bloco_0("icms", docs) + bloco_C("icms", docs) + bloco_E(docs)
              + bloco_H(docs))
    gravar(os.path.join(destino, "EFD_ICMS_IPI_072026.txt"), fiscal)

    gerar_movimentacao(docs, os.path.join(destino, "movimentacao_072026.csv"),
                       os.path.join(destino, "movimentacao_072026.xlsx"))
    print("Amostras geradas em %s" % destino)
    for nome in sorted(os.listdir(destino)):
        print("  -", nome)
    return destino


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)

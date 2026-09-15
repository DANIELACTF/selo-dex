# -*- coding: utf-8 -*-
"""Tabelas de dominio: CST de PIS/COFINS e ICMS, CFOP, aliquotas e naturezas de credito."""
from __future__ import annotations

from decimal import Decimal

# ---------------------------------------------------------------------------
# Aliquotas basicas de PIS/COFINS (Lei 10.637/2002, Lei 10.833/2003, Lei 9.718/1998)
# ---------------------------------------------------------------------------
ALIQ_PIS_NAO_CUMULATIVO = Decimal("1.65")
ALIQ_COFINS_NAO_CUMULATIVO = Decimal("7.6")
ALIQ_PIS_CUMULATIVO = Decimal("0.65")
ALIQ_COFINS_CUMULATIVO = Decimal("3.0")

# COD_INC_TRIB do registro 0110 da EFD-Contribuicoes
REGIME_INCIDENCIA = {
    "1": "Escrituracao exclusivamente no regime NAO CUMULATIVO",
    "2": "Escrituracao exclusivamente no regime CUMULATIVO",
    "3": "Escrituracao nos regimes NAO CUMULATIVO E CUMULATIVO",
}

# ---------------------------------------------------------------------------
# CST PIS/COFINS - Tabela I e II do Ato Declaratorio Executivo Cofis
# ---------------------------------------------------------------------------
CST_PIS_COFINS_SAIDA = {
    "01": "Operacao tributavel com aliquota basica",
    "02": "Operacao tributavel com aliquota diferenciada",
    "03": "Operacao tributavel com aliquota por unidade de medida de produto",
    "04": "Operacao tributavel monofasica - revenda a aliquota zero",
    "05": "Operacao tributavel por substituicao tributaria",
    "06": "Operacao tributavel a aliquota zero",
    "07": "Operacao isenta da contribuicao",
    "08": "Operacao sem incidencia da contribuicao",
    "09": "Operacao com suspensao da contribuicao",
    "49": "Outras operacoes de saida",
}
CST_PIS_COFINS_ENTRADA = {
    "50": "Credito exclusivo sobre receita tributada no mercado interno",
    "51": "Credito exclusivo sobre receita nao tributada no mercado interno",
    "52": "Credito exclusivo sobre receita de exportacao",
    "53": "Credito sobre receitas tributadas e nao tributadas no mercado interno",
    "54": "Credito sobre receitas tributadas no mercado interno e de exportacao",
    "55": "Credito sobre receitas nao tributadas no mercado interno e de exportacao",
    "56": "Credito sobre receitas tributadas e nao tributadas no MI e de exportacao",
    "60": "Credito presumido sobre receita tributada no mercado interno",
    "61": "Credito presumido sobre receita nao tributada no mercado interno",
    "62": "Credito presumido sobre receita de exportacao",
    "63": "Credito presumido sobre receitas tributadas e nao tributadas no MI",
    "64": "Credito presumido sobre receitas tributadas no MI e de exportacao",
    "65": "Credito presumido sobre receitas nao tributadas no MI e de exportacao",
    "66": "Credito presumido sobre receitas tributadas e nao tributadas no MI e exportacao",
    "67": "Credito presumido - outras operacoes",
    "70": "Operacao de aquisicao sem direito a credito",
    "71": "Operacao de aquisicao com isencao",
    "72": "Operacao de aquisicao com suspensao",
    "73": "Operacao de aquisicao a aliquota zero",
    "74": "Operacao de aquisicao sem incidencia da contribuicao",
    "75": "Operacao de aquisicao por substituicao tributaria",
    "98": "Outras operacoes de entrada",
    "99": "Outras operacoes",
}
CST_PIS_COFINS = dict(CST_PIS_COFINS_SAIDA)
CST_PIS_COFINS.update(CST_PIS_COFINS_ENTRADA)

CST_TRIBUTADOS = {"01", "02", "03", "05"}          # geram debito
CST_DESONERADOS = {"04", "06", "07", "08", "09"}   # nao geram debito
CST_COM_CREDITO = set(str(n) for n in range(50, 57)) | set(str(n) for n in range(60, 68))
CST_SEM_CREDITO = {"70", "71", "72", "73", "74", "75"}

# ---------------------------------------------------------------------------
# CST ICMS - origem (1 digito) + tributacao (2 digitos)
# ---------------------------------------------------------------------------
ORIGEM_ICMS = {
    "0": "Nacional, exceto 3, 4, 5 e 8",
    "1": "Estrangeira - importacao direta, exceto 6",
    "2": "Estrangeira - adquirida no mercado interno, exceto 7",
    "3": "Nacional com conteudo de importacao superior a 40% e ate 70%",
    "4": "Nacional - processos produtivos basicos (Dec-Lei 288/67, Leis 8.248/91, 8.387/91, 10.176/01, 11.484/07)",
    "5": "Nacional com conteudo de importacao inferior ou igual a 40%",
    "6": "Estrangeira - importacao direta sem similar nacional (CAMEX)",
    "7": "Estrangeira - adquirida no mercado interno sem similar nacional (CAMEX)",
    "8": "Nacional com conteudo de importacao superior a 70%",
}
TRIBUTACAO_ICMS = {
    "00": "Tributada integralmente",
    "10": "Tributada e com cobranca do ICMS por substituicao tributaria",
    "20": "Com reducao de base de calculo",
    "30": "Isenta ou nao tributada e com cobranca do ICMS por substituicao tributaria",
    "40": "Isenta",
    "41": "Nao tributada",
    "50": "Suspensao",
    "51": "Diferimento",
    "60": "ICMS cobrado anteriormente por substituicao tributaria",
    "70": "Com reducao de base de calculo e cobranca do ICMS por substituicao tributaria",
    "90": "Outras",
}
CST_ICMS_COM_DEBITO_PROPRIO = {"00", "10", "20", "70", "90"}
CST_ICMS_COM_ST = {"10", "30", "60", "70"}
CST_ICMS_SEM_CREDITO_ENTRADA = {"40", "41", "50", "60"}

# CSOSN - usado por emitentes do Simples Nacional (aparece nas NFs de entrada)
CSOSN = {
    "101": "Tributada pelo Simples Nacional com permissao de credito",
    "102": "Tributada pelo Simples Nacional sem permissao de credito",
    "103": "Isencao do ICMS no Simples Nacional para faixa de receita bruta",
    "201": "Tributada com permissao de credito e com cobranca do ICMS por ST",
    "202": "Tributada sem permissao de credito e com cobranca do ICMS por ST",
    "203": "Isencao do ICMS para faixa de receita bruta e com cobranca do ICMS por ST",
    "300": "Imune",
    "400": "Nao tributada pelo Simples Nacional",
    "500": "ICMS cobrado anteriormente por ST ou por antecipacao",
    "900": "Outros",
}

# ---------------------------------------------------------------------------
# CFOP
# ---------------------------------------------------------------------------
CFOP_DEVOLUCAO = {
    "1201", "1202", "1203", "1204", "1208", "1209", "1410", "1411", "1503", "1504",
    "1505", "1506", "1553", "1660", "1661", "1662",
    "2201", "2202", "2203", "2204", "2208", "2209", "2410", "2411", "2503", "2504",
    "2505", "2506", "2553", "2660", "2661", "2662",
    "5201", "5202", "5208", "5209", "5210", "5410", "5411", "5412", "5413", "5503",
    "5553", "5555", "5660", "5661", "5662",
    "6201", "6202", "6208", "6209", "6210", "6410", "6411", "6412", "6413", "6503",
    "6553", "6555", "6660", "6661", "6662",
    "1949", "2949", "5949", "6949",  # fallback generico, validar caso a caso
}
CFOP_TRANSFERENCIA = {
    "1151", "1152", "1153", "1154", "1408", "1409", "1552", "1557",
    "2151", "2152", "2153", "2154", "2408", "2409", "2552", "2557",
    "5151", "5152", "5153", "5155", "5156", "5408", "5409", "5552", "5557",
    "6151", "6152", "6153", "6155", "6156", "6408", "6409", "6552", "6557",
}
CFOP_VENDA = {
    "5101", "5102", "5103", "5104", "5105", "5106", "5109", "5110", "5111", "5112",
    "5113", "5114", "5115", "5116", "5117", "5118", "5119", "5120", "5122", "5123",
    "5251", "5252", "5253", "5254", "5255", "5256", "5257", "5258", "5401", "5402",
    "5403", "5404", "5405",
    "6101", "6102", "6103", "6104", "6105", "6106", "6107", "6108", "6109", "6110",
    "6111", "6112", "6113", "6114", "6115", "6116", "6117", "6118", "6119", "6120",
    "6122", "6123", "6251", "6252", "6253", "6254", "6255", "6256", "6257", "6258",
    "6401", "6402", "6403", "6404", "6405",
    "7101", "7102", "7105", "7106", "7127",
}
CFOP_COMPRA = {
    "1101", "1102", "1111", "1113", "1116", "1117", "1118", "1120", "1121", "1122",
    "1124", "1125", "1126", "1128", "1401", "1403", "1651", "1652", "1653",
    "2101", "2102", "2111", "2113", "2116", "2117", "2118", "2120", "2121", "2122",
    "2124", "2125", "2126", "2128", "2401", "2403", "2651", "2652", "2653",
    "3101", "3102", "3126", "3127", "3201", "3202", "3205", "3206", "3207", "3211",
    "3251", "3351", "3352", "3353", "3354", "3355", "3356", "3503", "3553", "3651",
    "3652", "3653", "3930", "3949",
}
CFOP_REMESSA_SEM_RECEITA = {
    "5901", "5902", "5903", "5904", "5905", "5906", "5907", "5908", "5909", "5910",
    "5911", "5912", "5913", "5914", "5915", "5916", "5917", "5918", "5919", "5920",
    "5921", "5922", "5923", "5924", "5925", "5926", "5927", "5928", "5929", "5931",
    "5932", "5934",
    "6901", "6902", "6903", "6904", "6905", "6906", "6907", "6908", "6909", "6910",
    "6911", "6912", "6913", "6914", "6915", "6916", "6917", "6918", "6919", "6920",
    "6921", "6922", "6923", "6924", "6925", "6929", "6931", "6932", "6934",
}
CFOP_ENTRADA_SEM_CUSTO = {
    "1901", "1902", "1903", "1904", "1905", "1906", "1907", "1908", "1909", "1910",
    "1911", "1912", "1913", "1914", "1915", "1916", "1917", "1918", "1919", "1920",
    "1921", "1922", "1923", "1924", "1925", "1926", "1931", "1932", "1934",
    "2901", "2902", "2903", "2904", "2905", "2906", "2907", "2908", "2909", "2910",
    "2911", "2912", "2913", "2914", "2915", "2916", "2917", "2918", "2919", "2920",
    "2921", "2922", "2923", "2924", "2925", "2931", "2932", "2934",
}
CFOP_EXPORTACAO_PREFIXO = "7"
CFOP_IMPORTACAO_PREFIXO = "3"


def normaliza_cfop(cfop):
    return "".join(ch for ch in str(cfop or "") if ch.isdigit())[:4]


def eh_entrada(cfop):
    c = normaliza_cfop(cfop)
    return bool(c) and c[0] in "123"


def eh_saida(cfop):
    c = normaliza_cfop(cfop)
    return bool(c) and c[0] in "567"


def eh_exportacao(cfop):
    return normaliza_cfop(cfop).startswith(CFOP_EXPORTACAO_PREFIXO)


def eh_importacao(cfop):
    return normaliza_cfop(cfop).startswith(CFOP_IMPORTACAO_PREFIXO)


def eh_devolucao(cfop):
    return normaliza_cfop(cfop) in CFOP_DEVOLUCAO


def eh_transferencia(cfop):
    return normaliza_cfop(cfop) in CFOP_TRANSFERENCIA


def eh_venda(cfop):
    return normaliza_cfop(cfop) in CFOP_VENDA


def eh_compra(cfop):
    return normaliza_cfop(cfop) in CFOP_COMPRA


def movimenta_estoque_fisico(cfop):
    """CFOPs que efetivamente movimentam quantidade de estoque proprio.

    Remessas para conserto/demonstracao/industrializacao mudam a posse mas nao a
    propriedade - por isso sao tratadas a parte no cruzamento fisico x fiscal.
    """
    c = normaliza_cfop(cfop)
    if not c:
        return False
    if c in CFOP_REMESSA_SEM_RECEITA or c in CFOP_ENTRADA_SEM_CUSTO:
        return False
    return True


def classifica_cfop(cfop):
    c = normaliza_cfop(cfop)
    if not c:
        return "INDEFINIDO"
    if eh_devolucao(c):
        return "DEVOLUCAO"
    if eh_transferencia(c):
        return "TRANSFERENCIA"
    if eh_exportacao(c):
        return "EXPORTACAO"
    if eh_importacao(c):
        return "IMPORTACAO"
    if eh_venda(c):
        return "VENDA"
    if eh_compra(c):
        return "COMPRA"
    if c in CFOP_REMESSA_SEM_RECEITA:
        return "REMESSA"
    if c in CFOP_ENTRADA_SEM_CUSTO:
        return "RETORNO_OU_ENTRADA_ESPECIAL"
    return "SAIDA_OUTRAS" if eh_saida(c) else "ENTRADA_OUTRAS"


# ---------------------------------------------------------------------------
# NAT_BC_CRED - Tabela 4.3.7 da EFD-Contribuicoes
# ---------------------------------------------------------------------------
NAT_BC_CRED = {
    "01": "Aquisicao de bens para revenda",
    "02": "Aquisicao de bens utilizados como insumo",
    "03": "Aquisicao de servicos utilizados como insumo",
    "04": "Energia eletrica e termica, inclusive sob a forma de vapor",
    "05": "Alugueis de predios",
    "06": "Alugueis de maquinas e equipamentos",
    "07": "Armazenagem de mercadoria e frete na operacao de venda",
    "08": "Contraprestacoes de arrendamento mercantil",
    "09": "Credito com base nos encargos de depreciacao/amortizacao de bens do imobilizado",
    "10": "Credito com base no valor de aquisicao de bens do imobilizado",
    "11": "Amortizacao e depreciacao de edificacoes e benfeitorias em imoveis",
    "12": "Devolucao de vendas sujeitas a incidencia nao cumulativa",
    "13": "Outras operacoes com direito a credito",
    "14": "Atividade de transporte de cargas - subcontratacao",
    "15": "Atividade imobiliaria - custo incorrido de unidade imobiliaria",
    "16": "Atividade imobiliaria - custo orcado de unidade nao concluida",
    "17": "Atividade de prestacao de servicos de limpeza, conservacao e manutencao",
    "18": "Estoque de abertura de bens",
}

# Codigos de contribuicao do M210/M610 (Tabela 4.3.5)
COD_CONT = {
    "01": "Contribuicao nao-cumulativa apurada a aliquota basica",
    "02": "Contribuicao nao-cumulativa apurada a aliquotas diferenciadas",
    "03": "Contribuicao nao-cumulativa apurada a aliquota por unidade de medida de produto",
    "04": "Contribuicao nao-cumulativa apurada a aliquota basica - atividade imobiliaria",
    "31": "Contribuicao apurada por ST",
    "32": "Contribuicao apurada por ST - aliquota por unidade de medida",
    "51": "Contribuicao cumulativa apurada a aliquota basica",
    "52": "Contribuicao cumulativa apurada a aliquotas diferenciadas",
    "53": "Contribuicao cumulativa apurada a aliquota por unidade de medida de produto",
    "54": "Contribuicao cumulativa apurada a aliquota basica - atividade imobiliaria",
}


def descreve_cst_pis_cofins(cst):
    cst = str(cst or "").strip().zfill(2)
    return CST_PIS_COFINS.get(cst, "CST desconhecido")


def descreve_cst_icms(cst):
    cst = str(cst or "").strip()
    if len(cst) == 3:
        return "%s / %s" % (
            ORIGEM_ICMS.get(cst[0], "origem desconhecida"),
            TRIBUTACAO_ICMS.get(cst[1:], "tributacao desconhecida"),
        )
    if len(cst) == 2:
        return TRIBUTACAO_ICMS.get(cst, CSOSN.get(cst, "CST desconhecido"))
    return CSOSN.get(cst, "CST/CSOSN desconhecido")


def tributacao_icms(cst):
    """Extrai os 2 digitos de tributacao do CST de ICMS (ignora a origem)."""
    cst = "".join(ch for ch in str(cst or "") if ch.isdigit())
    if len(cst) >= 3:
        return cst[-2:]
    return cst.zfill(2) if cst else ""

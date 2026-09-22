# -*- coding: utf-8 -*-
"""Apuracao e auditoria de ICMS a partir da EFD ICMS/IPI."""
from __future__ import annotations

from decimal import Decimal

from . import tabelas
from .modelo import Achado, SEV_ALTA, SEV_MEDIA, SEV_BAIXA, ZERO

CENTAVO = Decimal("0.01")
TOL_REAL = Decimal("1.00")
TOL_REL = Decimal("0.005")

# Aliquotas interestaduais - Resolucoes do Senado 22/1989 e 13/2012
ALIQ_INTERESTADUAL_IMPORTADO = Decimal("4")
ALIQ_INTERESTADUAL_GERAL = Decimal("12")
ALIQ_INTERESTADUAL_REDUZIDA = Decimal("7")   # S/SE (exceto ES) -> N/NE/CO/ES
UF_SUL_SUDESTE = {"RS", "SC", "PR", "SP", "RJ", "MG"}
# Referencia para dimensionar exposicao, nao para apurar: a aliquota interna
# efetiva depende do produto e dos adicionais de cada Estado.
ALIQUOTA_INTERNA_REFERENCIA = {
    "RJ": Decimal("20"), "SP": Decimal("18"), "MG": Decimal("18"),
    "ES": Decimal("17"), "RS": Decimal("17"), "SC": Decimal("17"),
    "PR": Decimal("19"), "BA": Decimal("20.5"), "DF": Decimal("20"),
}
ORIGENS_IMPORTADAS = {"1", "2", "3", "8"}


def _q(v):
    return (v or ZERO).quantize(CENTAVO)


def _ach(codigo, titulo, sev, descricao, base_legal, recomendacao, sentido, ctx):
    a = Achado(codigo, titulo, sev, "ICMS", descricao, base_legal, recomendacao,
               ctx["competencia"], ctx["cnpj"])
    a.sentido = sentido
    return a


class _Ref(object):
    def __init__(self, texto):
        self.texto = texto

    def ref(self):
        return self.texto


# ---------------------------------------------------------------------------
# Apuracao escriturada (bloco E)
# ---------------------------------------------------------------------------
def apuracao_escriturada(esc):
    e110 = esc.primeiro("E110")
    apuracao = None
    if e110:
        apuracao = {
            "total_debitos": e110.dec("VL_TOT_DEBITOS"),
            "ajustes_debito_documento": e110.dec("VL_AJ_DEBITOS"),
            "total_ajustes_debito": e110.dec("VL_TOT_AJ_DEBITOS"),
            "estornos_credito": e110.dec("VL_ESTORNOS_CRED"),
            "total_creditos": e110.dec("VL_TOT_CREDITOS"),
            "ajustes_credito_documento": e110.dec("VL_AJ_CREDITOS"),
            "total_ajustes_credito": e110.dec("VL_TOT_AJ_CREDITOS"),
            "estornos_debito": e110.dec("VL_ESTORNOS_DEB"),
            "saldo_credor_anterior": e110.dec("VL_SLD_CREDOR_ANT"),
            "saldo_apurado": e110.dec("VL_SLD_APURADO"),
            "total_deducoes": e110.dec("VL_TOT_DED"),
            "icms_a_recolher": e110.dec("VL_ICMS_RECOLHER"),
            "saldo_credor_a_transportar": e110.dec("VL_SLD_CREDOR_TRANSPORTAR"),
            "debitos_especiais": e110.dec("DEB_ESP"),
        }

    ajustes = [
        {"codigo": r.txt("COD_AJ_APUR"), "descricao": r.txt("DESCR_COMPL_AJ"),
         "valor": r.dec("VL_AJ_APUR")}
        for r in esc.get("E111")
    ]
    obrigacoes = [
        {"codigo": r.txt("COD_OR"), "valor": r.dec("VL_OR"), "vencimento": r.txt("DT_VCTO"),
         "receita": r.txt("COD_REC"), "descricao": r.txt("TXT_COMPL")}
        for r in esc.get("E116")
    ]
    st = []
    for r in esc.get("E210"):
        st.append({
            "movimento": r.txt("IND_MOV_ST"),
            "saldo_credor_anterior": r.dec("VL_SLD_CRED_ANT_ST"),
            "devolucoes": r.dec("VL_DEVOL_ST"),
            "ressarcimentos": r.dec("VL_RESSARC_ST"),
            "outros_creditos": r.dec("VL_OUT_CRED_ST"),
            "retencao": r.dec("VL_RETENCAO_ST"),
            "outros_debitos": r.dec("VL_OUT_DEB_ST"),
            "icms_st_a_recolher": r.dec("VL_ICMS_RECOL_ST"),
            "saldo_credor_a_transportar": r.dec("VL_SLD_CRED_ST_TRANSPORTAR"),
        })
    difal = []
    for r in esc.get("E310"):
        difal.append({
            "debito_difal": r.dec("VL_TOT_DEBITO_DIFAL"),
            "credito_difal": r.dec("VL_TOT_CREDITO_DIFAL"),
            "difal_a_recolher": r.dec("VL_RECOL_DIFAL"),
            "debito_fcp": r.dec("VL_TOT_DEB_FCP"),
            "fcp_a_recolher": r.dec("VL_RECOL_FCP"),
        })
    ciap = []
    for r in esc.get("G110"):
        ciap.append({
            "saldo_inicial": r.dec("SALDO_IN_ICMS"),
            "soma_parcelas": r.dec("SOM_PARC"),
            "valor_tributado_exportacao": r.dec("VL_TRIB_EXP"),
            "valor_total_saidas": r.dec("VL_TOTAL"),
            "indice_participacao": r.dec("IND_PER_SAI"),
            "icms_apropriado": r.dec("ICMS_APROP"),
        })
    inventario = esc.primeiro("H005")
    return {
        "apuracao": apuracao,
        "ajustes": ajustes,
        "obrigacoes_a_recolher": obrigacoes,
        "substituicao_tributaria": st,
        "difal_fcp": difal,
        "ciap": ciap,
        "inventario": {
            "data": inventario.txt("DT_INV") if inventario else "",
            "valor": inventario.dec("VL_INV") if inventario else ZERO,
            "motivo": inventario.txt("MOT_INV") if inventario else "",
            "qtd_itens": len(esc.get("H010")),
        },
    }


# ---------------------------------------------------------------------------
# Recomposicao pelos registros analiticos C190/C590/D190
# ---------------------------------------------------------------------------
def recompor(esc):
    res = {
        "debitos": ZERO, "creditos": ZERO, "debito_st": ZERO,
        "por_cfop": {}, "por_cst": {},
    }
    for reg in ("C190", "C590", "D190"):
        for r in esc.get(reg):
            if r.get("_cod_sit", "") in {"02", "03", "04", "05"}:
                continue
            cfop = tabelas.normaliza_cfop(r.txt("CFOP"))
            cst = r.txt("CST_ICMS")
            trib = tabelas.tributacao_icms(cst)
            vl_icms = r.dec("VL_ICMS")
            vl_st = r.dec("VL_ICMS_ST")
            vl_opr = r.dec("VL_OPR")

            d = res["por_cfop"].setdefault(cfop, {
                "cfop": cfop, "natureza": tabelas.classifica_cfop(cfop),
                "sentido": "SAIDA" if tabelas.eh_saida(cfop) else "ENTRADA",
                "qtd": 0, "valor_operacao": ZERO, "base_calculo": ZERO,
                "icms": ZERO, "icms_st": ZERO,
            })
            d["qtd"] += 1
            d["valor_operacao"] += vl_opr
            d["base_calculo"] += r.dec("VL_BC_ICMS")
            d["icms"] += vl_icms
            d["icms_st"] += vl_st

            c = res["por_cst"].setdefault(trib, {
                "cst": trib, "descricao": tabelas.TRIBUTACAO_ICMS.get(trib, ""),
                "qtd": 0, "valor_operacao": ZERO, "icms": ZERO,
            })
            c["qtd"] += 1
            c["valor_operacao"] += vl_opr
            c["icms"] += vl_icms

            if tabelas.eh_saida(cfop):
                res["debitos"] += vl_icms
                res["debito_st"] += vl_st
            elif tabelas.eh_entrada(cfop):
                res["creditos"] += vl_icms
    return res


# ---------------------------------------------------------------------------
# Testes de conformidade
# ---------------------------------------------------------------------------
def testes(esc, linhas, apuracao, recomposicao, ctx):
    achados = []
    uf = ctx["uf"]

    # IC-01 bloco E x registros analiticos
    a = _ach("IC-01", "Divergencia entre a apuracao (E110) e os registros analiticos",
             SEV_ALTA,
             "Os totais de debito/credito do E110 nao correspondem a soma dos registros "
             "analiticos C190/C590/D190.",
             "Guia Pratico da EFD ICMS/IPI - registros C190 e E110",
             "Identificar a origem antes de concluir por erro: ajustes do E111, documentos "
             "de outros modelos e operacoes nao analiticas podem explicar a diferenca.",
             "AJUSTAR", ctx)
    if apuracao["apuracao"]:
        ap = apuracao["apuracao"]
        for rotulo, escriturado, recomposto in (
                ("debitos", ap["total_debitos"], recomposicao["debitos"]),
                ("creditos", ap["total_creditos"], recomposicao["creditos"])):
            dif = abs(escriturado - recomposto)
            base = max(escriturado, recomposto, Decimal("1"))
            if dif > max(TOL_REAL, base * TOL_REL):
                a.adicionar(_Ref("E110 - %s" % rotulo), dif,
                            "E110 %s x analitico %s" % (_q(escriturado), _q(recomposto)))
    achados.append(a)

    # IC-02 coerencia aritmetica do E110
    b = _ach("IC-02", "Inconsistencia aritmetica no E110", SEV_ALTA,
             "O saldo apurado nao corresponde a conta de debitos e creditos declarada.",
             "Guia Pratico da EFD ICMS/IPI - registro E110; LC 87/1996 art. 24",
             "Reprocessar a apuracao e retransmitir a escrituracao.",
             "AJUSTAR", ctx)
    if apuracao["apuracao"]:
        ap = apuracao["apuracao"]
        debitos = (ap["total_debitos"] + ap["ajustes_debito_documento"]
                   + ap["total_ajustes_debito"] + ap["estornos_credito"])
        creditos = (ap["total_creditos"] + ap["ajustes_credito_documento"]
                    + ap["total_ajustes_credito"] + ap["estornos_debito"]
                    + ap["saldo_credor_anterior"])
        saldo = debitos - creditos
        esperado = saldo if saldo > 0 else -saldo
        declarado = (ap["saldo_apurado"] if saldo > 0
                     else ap["saldo_credor_a_transportar"] or ap["saldo_apurado"])
        if abs(esperado - declarado) > TOL_REAL:
            b.adicionar(_Ref("E110"), abs(esperado - declarado),
                        "saldo recalculado %s x declarado %s (debitos %s, creditos %s)" %
                        (_q(esperado), _q(declarado), _q(debitos), _q(creditos)))
        if saldo > 0:
            recolher = ap["saldo_apurado"] - ap["total_deducoes"]
            recolher = recolher if recolher > 0 else ZERO
            if abs(recolher - ap["icms_a_recolher"]) > TOL_REAL:
                b.adicionar(_Ref("E110 - a recolher"), abs(recolher - ap["icms_a_recolher"]),
                            "a recolher recalculado %s x declarado %s" %
                            (_q(recolher), _q(ap["icms_a_recolher"])))
    achados.append(b)

    # IC-03 credito indevido em CST que nao permite
    c = _ach("IC-03", "Credito de ICMS em operacao que nao gera credito", SEV_ALTA,
             "Entradas com CST de isencao, nao tributacao, suspensao ou ICMS ja retido por "
             "substituicao tributaria (40, 41, 50, 60) escrituradas com valor de ICMS creditado.",
             "LC 87/1996 art. 20 §3 e art. 155 §2 II da CF/1988",
             "Estornar o credito e retificar a EFD. Avaliar denuncia espontanea.",
             "RECOLHER", ctx)

    # IC-04 aliquota interestadual de produto importado
    d = _ach("IC-04", "Aliquota interestadual divergente em produto importado", SEV_MEDIA,
             "Saidas interestaduais de mercadoria com origem importada (CST de origem 1, 2, 3 "
             "ou 8) escrituradas com aliquota diferente de 4%.",
             "Resolucao do Senado Federal 13/2012; Ajuste SINIEF 19/2012",
             "Conferir o Conteudo de Importacao (FCI) e corrigir a aliquota. Recolher ou "
             "recuperar a diferenca conforme o sentido do erro.",
             "AJUSTAR", ctx)

    # IC-05 saida com CST 60 e debito destacado
    e = _ach("IC-05", "Saida com ICMS ja retido por ST e debito destacado", SEV_MEDIA,
             "Saidas com CST de tributacao 60 (ICMS cobrado anteriormente por ST) com valor de "
             "ICMS proprio destacado - a fase de tributacao ja se encerrou.",
             "Convenio ICMS 142/2018; LC 87/1996 art. 6 e 9",
             "Corrigir o CST ou estornar o debito indevido. Se houve recolhimento a maior, "
             "avaliar restituicao/ressarcimento na via propria do Estado.",
             "RECUPERAR", ctx)

    # IC-06 credito nao aproveitado em entrada tributada
    f = _ach("IC-06", "Entrada tributada sem credito escriturado", SEV_MEDIA,
             "Aquisicoes com CST de tributacao 00 ou 20 e base de calculo destacada, porem sem "
             "valor de ICMS creditado.",
             "CF/1988 art. 155 §2 I (nao cumulatividade); LC 87/1996 art. 20",
             "Verificar se ha vedacao especifica (uso e consumo, saida isenta subsequente). "
             "Nao havendo, apropriar o credito extemporaneo conforme a legislacao estadual.",
             "RECUPERAR", ctx)

    # IC-07 aliquota interestadual geral
    g = _ach("IC-07", "Aliquota interestadual fora do padrao para mercadoria nacional",
             SEV_BAIXA,
             "Saidas interestaduais de mercadoria nacional com aliquota diferente de 7% ou 12%.",
             "Resolucao do Senado Federal 22/1989",
             "Confirmar se ha beneficio fiscal, reducao de base ou operacao com "
             "nao contribuinte (DIFAL) que justifique a aliquota.",
             "AJUSTAR", ctx)

    for l in linhas:
        trib = tabelas.tributacao_icms(l.cst_icms)
        origem = "".join(ch for ch in str(l.cst_icms or "") if ch.isdigit())
        origem = origem[0] if len(origem) == 3 else ""

        if l.eh_entrada:
            if trib in tabelas.CST_ICMS_SEM_CREDITO_ENTRADA and l.vl_icms > CENTAVO:
                c.adicionar(l, l.vl_icms, "CST %s com ICMS de %s creditado" %
                            (l.cst_icms, _q(l.vl_icms)))
            if (trib in ("00", "20") and l.bc_icms > 0 and l.vl_icms <= CENTAVO
                    and tabelas.eh_compra(l.cfop)):
                aliq = l.aliq_icms if l.aliq_icms > 0 else ZERO
                estimado = _q(l.bc_icms * aliq / Decimal("100")) if aliq else ZERO
                f.adicionar(l, estimado, "CST %s, BC %s, sem ICMS destacado" %
                            (l.cst_icms, _q(l.bc_icms)))

        elif l.eh_saida:
            if trib == "60" and l.vl_icms > CENTAVO:
                e.adicionar(l, l.vl_icms, "CST %s com ICMS proprio de %s" %
                            (l.cst_icms, _q(l.vl_icms)))
            interestadual = l.cfop.startswith("6") and trib in tabelas.CST_ICMS_COM_DEBITO_PROPRIO
            if interestadual and l.aliq_icms > 0:
                if origem in ORIGENS_IMPORTADAS:
                    if l.aliq_icms != ALIQ_INTERESTADUAL_IMPORTADO:
                        esperado = _q(l.bc_icms * ALIQ_INTERESTADUAL_IMPORTADO / Decimal("100"))
                        d.adicionar(l, abs(esperado - l.vl_icms),
                                    "origem %s com aliquota %s%% (esperado 4%%)" %
                                    (origem, l.aliq_icms))
                elif l.aliq_icms not in (ALIQ_INTERESTADUAL_GERAL, ALIQ_INTERESTADUAL_REDUZIDA):
                    g.adicionar(l, ZERO, "aliquota %s%% em CFOP %s" % (l.aliq_icms, l.cfop))

    achados.extend([c, d, e, f, g])

    # IC-08 estorno proporcional de credito
    h = _ach("IC-08", "Saidas isentas/nao tributadas sem estorno proporcional de credito",
             SEV_MEDIA,
             "Ha saidas com CST 40/41 (isenta ou nao tributada) no periodo e nenhum estorno de "
             "credito registrado no E110. O credito das entradas vinculadas deve ser estornado, "
             "salvo determinacao em contrario da legislacao ou saida para o exterior.",
             "CF/1988 art. 155 §2 II b; LC 87/1996 art. 20 §3 e art. 21",
             "Levantar as entradas vinculadas as saidas desoneradas e lancar o estorno "
             "proporcional, ou demonstrar a manutencao do credito autorizada em lei.",
             "RECOLHER", ctx)
    saidas_desoneradas = ZERO
    for cst, dados in recomposicao["por_cst"].items():
        if cst in ("40", "41"):
            saidas_desoneradas += dados["valor_operacao"]
    if apuracao["apuracao"] and saidas_desoneradas > 0:
        if apuracao["apuracao"]["estornos_credito"] <= CENTAVO:
            h.adicionar(_Ref("Saidas com CST 40/41"), ZERO,
                        "R$ %s em saidas desoneradas sem estorno de credito no E110" %
                        _q(saidas_desoneradas))
    achados.append(h)

    # IC-09 E116 x E110
    i = _ach("IC-09", "Obrigacoes do E116 divergentes do ICMS a recolher", SEV_MEDIA,
             "A soma das obrigacoes a recolher do E116 nao corresponde ao valor apurado no E110.",
             "Guia Pratico da EFD ICMS/IPI - registros E110 e E116",
             "Conferir se ha obrigacoes de outra natureza no E116 (ST, DIFAL, antecipacao) "
             "antes de tratar como erro.",
             "AJUSTAR", ctx)
    if apuracao["apuracao"] and apuracao["obrigacoes_a_recolher"]:
        total_e116 = sum((o["valor"] for o in apuracao["obrigacoes_a_recolher"]), ZERO)
        devido = apuracao["apuracao"]["icms_a_recolher"]
        if devido > 0 and abs(total_e116 - devido) > max(TOL_REAL, devido * TOL_REL):
            i.adicionar(_Ref("E116"), abs(total_e116 - devido),
                        "E116 total %s x E110 a recolher %s" % (_q(total_e116), _q(devido)))
    achados.append(i)

    # IC-10 - saidas com CST 60, agrupadas por NCM, para conferencia do enquadramento
    j = _ach("IC-10", "Saidas com CST 60 a confirmar no protocolo de ST", SEV_BAIXA,
             "Relacao dos NCM vendidos como contribuinte substituido (CST de tributacao "
             "60), em que nao ha debito de ICMS proprio. O enquadramento em substituicao "
             "tributaria vale apenas para os produtos listados no Convenio ou Protocolo "
             "aplicavel ao Estado; fora da lista, a operacao e tributada normalmente e a "
             "falta de debito vira ICMS nao recolhido.",
             "Convenio ICMS 142/2018 e os Protocolos por segmento; "
             "legislacao interna do Estado de destino",
             "Conferir cada NCM na lista de ST vigente na competencia. O valor ao lado e "
             "o ICMS que seria devido se o produto NAO estivesse em ST - serve para "
             "priorizar a conferencia, nao como apuracao.",
             "AVALIAR", ctx)
    por_ncm = {}
    for l in linhas:
        if not l.eh_saida or tabelas.tributacao_icms(l.cst_icms) != "60":
            continue
        d = por_ncm.setdefault(l.ncm or "(sem NCM)", {
            "valor": ZERO, "qtd": 0, "linha": l, "descricoes": set()})
        d["valor"] += l.vl_item - l.vl_desc
        d["qtd"] += 1
        if l.descricao:
            d["descricoes"].add(l.descricao[:28])
    for ncm_codigo, dados in sorted(por_ncm.items(), key=lambda x: -x[1]["valor"]):
        # referencia de exposicao: aliquota interna do Estado, quando conhecida
        aliquota = ALIQUOTA_INTERNA_REFERENCIA.get(uf, Decimal("18"))
        j.adicionar(dados["linha"], _q(dados["valor"] * aliquota / Decimal("100")),
                    "NCM %s - %d item(ns), R$ %s em saidas sem debito proprio (%s)" %
                    (ncm_codigo, dados["qtd"], _q(dados["valor"]),
                     ", ".join(sorted(dados["descricoes"])[:2])))
    achados.append(j)

    return achados


def analisar_linhas(linhas, ctx_base=None):
    """Testes de item de ICMS sem a escrituracao (planilha do cliente como fonte)."""
    ctx_base = ctx_base or {}
    ctx = {"competencia": ctx_base.get("competencia", ""),
           "cnpj": ctx_base.get("cnpj", ""), "uf": ctx_base.get("uf", "")}
    apuracao = {"apuracao": None, "ajustes": [], "obrigacoes_a_recolher": [],
                "substituicao_tributaria": [], "difal_fcp": [], "ciap": [],
                "inventario": {"data": "", "valor": ZERO, "motivo": "", "qtd_itens": 0}}
    recomposicao = {"debitos": ZERO, "creditos": ZERO, "debito_st": ZERO,
                    "por_cfop": {}, "por_cst": {}}
    for l in linhas:
        trib = tabelas.tributacao_icms(l.cst_icms)
        cfop = l.cfop
        d = recomposicao["por_cfop"].setdefault(cfop, {
            "cfop": cfop, "natureza": tabelas.classifica_cfop(cfop),
            "sentido": "SAIDA" if l.eh_saida else "ENTRADA", "qtd": 0,
            "valor_operacao": ZERO, "base_calculo": ZERO, "icms": ZERO, "icms_st": ZERO})
        d["qtd"] += 1
        d["valor_operacao"] += l.vl_item - l.vl_desc
        d["base_calculo"] += l.bc_icms
        d["icms"] += l.vl_icms
        d["icms_st"] += l.vl_icms_st
        c = recomposicao["por_cst"].setdefault(trib, {
            "cst": trib, "descricao": tabelas.TRIBUTACAO_ICMS.get(trib, ""),
            "qtd": 0, "valor_operacao": ZERO, "icms": ZERO})
        c["qtd"] += 1
        c["valor_operacao"] += l.vl_item - l.vl_desc
        c["icms"] += l.vl_icms
        if l.eh_saida:
            recomposicao["debitos"] += l.vl_icms
        elif l.eh_entrada:
            recomposicao["creditos"] += l.vl_icms
    achados = testes(None, linhas, apuracao, recomposicao, ctx)
    return {
        "identificacao": {"competencia": ctx["competencia"], "cnpj": ctx["cnpj"],
                          "arquivo": "planilha do cliente", "tipo": "PLANILHA"},
        "apuracao_escriturada": apuracao,
        "recomposicao": recomposicao,
        "achados": achados,
        "qtd_linhas": len(linhas),
    }


def analisar(esc, linhas=None):
    from .extracao import extrair_linhas
    linhas = linhas if linhas is not None else extrair_linhas(esc)
    ctx = {"competencia": esc.competencia, "cnpj": esc.cnpj, "uf": esc.uf}
    apuracao = apuracao_escriturada(esc)
    recomposicao = recompor(esc)
    achados = testes(esc, linhas, apuracao, recomposicao, ctx)
    return {
        "identificacao": esc.resumo(),
        "apuracao_escriturada": apuracao,
        "recomposicao": recomposicao,
        "achados": achados,
        "qtd_linhas": len(linhas),
    }

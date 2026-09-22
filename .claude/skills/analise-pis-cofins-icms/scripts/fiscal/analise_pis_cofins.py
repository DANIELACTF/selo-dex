# -*- coding: utf-8 -*-
"""Apuracao e auditoria de PIS/COFINS a partir da EFD-Contribuicoes."""
from __future__ import annotations

from decimal import Decimal

from . import ncm as mod_ncm
from . import tabelas
from .extracao import extrair_linhas
from .modelo import Achado, SEV_ALTA, SEV_MEDIA, SEV_BAIXA, SEV_INFO, ZERO

TOL_ITEM = Decimal("0.05")       # tolerancia de centavos por item
TOL_REL = Decimal("0.005")       # 0,5% de tolerancia em confrontos agregados
CENTAVO = Decimal("0.01")


def _q(valor):
    return (valor or ZERO).quantize(CENTAVO)


def aliquotas_do_regime(cod_inc_trib):
    """Devolve (aliq_pis, aliq_cofins) esperadas para o CST 01 conforme o regime."""
    if cod_inc_trib == "2":
        return tabelas.ALIQ_PIS_CUMULATIVO, tabelas.ALIQ_COFINS_CUMULATIVO
    return tabelas.ALIQ_PIS_NAO_CUMULATIVO, tabelas.ALIQ_COFINS_NAO_CUMULATIVO


# ---------------------------------------------------------------------------
# 1. Apuracao conforme escriturada (bloco M)
# ---------------------------------------------------------------------------
def apuracao_escriturada(esc):
    def consolida(reg_m200):
        r = esc.primeiro(reg_m200)
        if not r:
            return None
        return {
            "contribuicao_nc_periodo": r.dec("VL_TOT_CONT_NC_PER"),
            "creditos_descontados": r.dec("VL_TOT_CRED_DESC"),
            "creditos_periodos_anteriores": r.dec("VL_TOT_CRED_DESC_ANT"),
            "contribuicao_nc_devida": r.dec("VL_TOT_CONT_NC_DEV"),
            "retencoes_nc": r.dec("VL_RET_NC"),
            "outras_deducoes_nc": r.dec("VL_OUT_DED_NC"),
            "contribuicao_nc_recolher": r.dec("VL_CONT_NC_REC"),
            "contribuicao_cum_periodo": r.dec("VL_TOT_CONT_CUM_PER"),
            "retencoes_cum": r.dec("VL_RET_CUM"),
            "outras_deducoes_cum": r.dec("VL_OUT_DED_CUM"),
            "contribuicao_cum_recolher": r.dec("VL_CONT_CUM_REC"),
            "total_recolher": r.dec("VL_TOT_CONT_REC"),
        }

    def detalhe(reg_m210, campo_aliq):
        itens = []
        for r in esc.get(reg_m210):
            itens.append({
                "cod_cont": r.txt("COD_CONT"),
                "descricao": tabelas.COD_CONT.get(r.txt("COD_CONT"), ""),
                "receita_bruta": r.dec("VL_REC_BRT"),
                "base_calculo": r.dec("VL_BC_CONT"),
                "ajuste_acrescimo_bc": r.dec("VL_AJUS_ACRES_BC_PIS") or r.dec("VL_AJUS_ACRES_BC_COFINS"),
                "ajuste_reducao_bc": r.dec("VL_AJUS_REDUC_BC_PIS") or r.dec("VL_AJUS_REDUC_BC_COFINS"),
                "base_calculo_ajustada": r.dec("VL_BC_CONT_AJUS"),
                "aliquota": r.dec(campo_aliq),
                "contribuicao_apurada": r.dec("VL_CONT_APUR"),
                "ajuste_acrescimo": r.dec("VL_AJUS_ACRES"),
                "ajuste_reducao": r.dec("VL_AJUS_REDUC"),
                "contribuicao_periodo": r.dec("VL_CONT_PER"),
            })
        return itens

    def creditos(reg_m100, campo_bc, campo_aliq):
        itens = []
        for r in esc.get(reg_m100):
            itens.append({
                "cod_cred": r.txt("COD_CRED"),
                "origem": r.txt("IND_CRED_ORI"),
                "base_calculo": r.dec(campo_bc),
                "aliquota": r.dec(campo_aliq),
                "credito_apurado": r.dec("VL_CRED"),
                "credito_diferido": r.dec("VL_CRED_DIF"),
                "credito_disponivel": r.dec("VL_CRED_DISP"),
                "credito_descontado": r.dec("VL_CRED_DESC"),
                "saldo_credito": r.dec("SLD_CRED"),
            })
        return itens

    def bases_credito(reg_m105, campo_bc):
        por_natureza = {}
        for r in esc.get(reg_m105):
            nat = r.txt("NAT_BC_CRED")
            d = por_natureza.setdefault(nat, {
                "nat_bc_cred": nat,
                "descricao": tabelas.NAT_BC_CRED.get(nat, ""),
                "base_calculo": ZERO,
            })
            d["base_calculo"] += r.dec(campo_bc)
        return sorted(por_natureza.values(), key=lambda x: x["nat_bc_cred"])

    return {
        "pis": {
            "consolidacao": consolida("M200"),
            "detalhe_debito": detalhe("M210", "ALIQ_PIS"),
            "creditos": creditos("M100", "VL_BC_PIS", "ALIQ_PIS"),
            "bases_credito": bases_credito("M105", "VL_BC_PIS"),
            "receitas_nao_tributadas": [
                {"cst": r.txt("CST_PIS"), "valor": r.dec("VL_TOT_REC")}
                for r in esc.get("M400")
            ],
        },
        "cofins": {
            "consolidacao": consolida("M600"),
            "detalhe_debito": detalhe("M610", "ALIQ_COFINS"),
            "creditos": creditos("M500", "VL_BC_COFINS", "ALIQ_COFINS"),
            "bases_credito": bases_credito("M505", "VL_BC_COFINS"),
            "receitas_nao_tributadas": [
                {"cst": r.txt("CST_COFINS"), "valor": r.dec("VL_TOT_REC")}
                for r in esc.get("M800")
            ],
        },
    }


# ---------------------------------------------------------------------------
# 2. Recomposicao a partir dos documentos
# ---------------------------------------------------------------------------
def recompor(linhas):
    """Soma debitos e creditos a partir dos itens escriturados."""
    res = {
        "debito_pis": ZERO, "debito_cofins": ZERO,
        "credito_pis": ZERO, "credito_cofins": ZERO,
        "receita_tributada": ZERO, "receita_desonerada": ZERO,
        "base_credito": ZERO,
        "por_cst_saida": {}, "por_cst_entrada": {}, "por_natureza_credito": {},
    }
    for l in linhas:
        valor_liquido = l.vl_item - l.vl_desc
        if l.eh_saida:
            cst = (l.cst_pis or l.cst_cofins or "").zfill(2)
            d = res["por_cst_saida"].setdefault(cst, {
                "cst": cst, "descricao": tabelas.descreve_cst_pis_cofins(cst),
                "qtd": 0, "valor_operacao": ZERO, "bc_pis": ZERO, "vl_pis": ZERO,
                "bc_cofins": ZERO, "vl_cofins": ZERO,
            })
            d["qtd"] += 1
            d["valor_operacao"] += valor_liquido
            d["bc_pis"] += l.bc_pis
            d["vl_pis"] += l.vl_pis
            d["bc_cofins"] += l.bc_cofins
            d["vl_cofins"] += l.vl_cofins
            res["debito_pis"] += l.vl_pis
            res["debito_cofins"] += l.vl_cofins
            if cst in tabelas.CST_TRIBUTADOS:
                res["receita_tributada"] += valor_liquido
            elif cst in tabelas.CST_DESONERADOS:
                res["receita_desonerada"] += valor_liquido
        elif l.eh_entrada:
            cst = (l.cst_pis or l.cst_cofins or "").zfill(2)
            d = res["por_cst_entrada"].setdefault(cst, {
                "cst": cst, "descricao": tabelas.descreve_cst_pis_cofins(cst),
                "qtd": 0, "valor_operacao": ZERO, "bc_pis": ZERO, "vl_pis": ZERO,
                "bc_cofins": ZERO, "vl_cofins": ZERO,
            })
            d["qtd"] += 1
            d["valor_operacao"] += valor_liquido
            d["bc_pis"] += l.bc_pis
            d["vl_pis"] += l.vl_pis
            d["bc_cofins"] += l.bc_cofins
            d["vl_cofins"] += l.vl_cofins
            if cst in tabelas.CST_COM_CREDITO:
                res["credito_pis"] += l.vl_pis
                res["credito_cofins"] += l.vl_cofins
                res["base_credito"] += l.bc_pis
                if l.nat_bc_cred:
                    n = res["por_natureza_credito"].setdefault(l.nat_bc_cred, {
                        "nat_bc_cred": l.nat_bc_cred,
                        "descricao": tabelas.NAT_BC_CRED.get(l.nat_bc_cred, ""),
                        "base_calculo": ZERO, "credito_pis": ZERO, "credito_cofins": ZERO,
                    })
                    n["base_calculo"] += l.bc_pis
                    n["credito_pis"] += l.vl_pis
                    n["credito_cofins"] += l.vl_cofins
    return res


# ---------------------------------------------------------------------------
# 3. Testes de conformidade
# ---------------------------------------------------------------------------
def _novo(codigo, titulo, sev, descricao, base_legal, recomendacao, sentido, ctx):
    a = Achado(codigo, titulo, sev, "PIS/COFINS", descricao, base_legal,
               recomendacao, ctx["competencia"], ctx["cnpj"])
    a.sentido = sentido
    return a


def testes_por_item(linhas, tabela, ctx):
    aliq_pis, aliq_cofins = ctx["aliq_pis"], ctx["aliq_cofins"]
    regime_misto = ctx["cod_inc_trib"] == "3"
    soma_aliq = (aliq_pis + aliq_cofins) / Decimal("100")

    a1 = _novo("PC-01", "Saida de produto monofasico/desonerado tributada indevidamente",
               SEV_ALTA,
               "Itens cujo NCM esta em regime monofasico, de aliquota zero ou de substituicao "
               "tributaria foram vendidos com CST de operacao tributavel (01/02/03), gerando "
               "debito de PIS/COFINS sobre receita que a lei ja desonerou na revenda.",
               "Lei 10.147/2000; Lei 10.485/2002; Lei 13.097/2015; Lei 10.925/2004; "
               "Lei 10.637/2002 art. 1; Lei 10.833/2003 art. 1",
               "Confirmar o NCM item a item, retificar a EFD-Contribuicoes das competencias "
               "afetadas e habilitar o credito via PER/DCOMP (prazo de 5 anos, art. 168 do CTN).",
               "RECUPERAR", ctx)

    a2 = _novo("PC-02", "Credito em aquisicao de produto desonerado destinado a REVENDA",
               SEV_ALTA,
               "Aquisicoes de produtos para revenda em regime monofasico, aliquota zero ou ST "
               "escrituradas com CST de credito (50 a 66). Na revenda a fase de tributacao ja "
               "se encerrou: nao ha contribuicao paga na etapa anterior para ser recuperada, e "
               "a saida tambem sai sem debito. E o caso menos controvertido de credito indevido.",
               "Lei 10.637/2002 art. 3 §2 II; Lei 10.833/2003 art. 3 §2 II; "
               "IN RFB 2.121/2022 art. 171",
               "Estornar o credito, retificar a EFD-Contribuicoes e recolher a diferenca com "
               "denuncia espontanea (art. 138 do CTN) antes de qualquer procedimento fiscal. "
               "Conferir em conjunto com o PC-01: o mesmo produto costuma estar sendo "
               "tributado na saida, e as duas correcoes se compensam em parte.",
               "RECOLHER", ctx)

    a14 = _novo("PC-14", "Credito sobre INSUMO desonerado empregado em produto tributado",
                SEV_MEDIA,
                "Aquisicoes de produtos desonerados (aliquota zero, monofasico ou ST) com CFOP "
                "de industrializacao, escrituradas com credito. Diferente da revenda, aqui o "
                "insumo e transformado em um produto cuja saida e tributada.",
                "Lei 10.637/2002 art. 3 §2 II e Lei 10.833/2003 art. 3 §2 II vedam o credito na "
                "aquisicao de bens 'nao sujeitos ao pagamento da contribuicao', o que a RFB "
                "aplica tambem quando o insumo e desonerado e a saida e tributada "
                "(IN RFB 2.121/2022 art. 171). O contribuinte sustenta leitura diversa, de que "
                "a vedacao so alcanca o insumo empregado em saida tambem desonerada. "
                "Credito presumido da Lei 10.925/2004 art. 8 e caminho distinto e exige que a "
                "empresa produza mercadoria dos capitulos 2, 3, 4, 8 a 12, 15, 16 ou 23 E que a "
                "aquisicao venha de pessoa fisica ou cooperado.",
                "Decidir a posicao com o cliente e documenta-la. Mantido o credito, dimensionar "
                "a exposicao e avaliar medida judicial preventiva; estornado, retificar as "
                "competencias alcancadas. Verificar antes se o art. 8 da Lei 10.925/2004 se "
                "aplica - se aplicar, o caminho e o credito presumido, com base e aliquota "
                "proprias, e nao o credito basico.",
                "AVALIAR", ctx)

    a15 = _novo("PC-15", "Credito sobre combustivel monofasico consumido como insumo",
                SEV_MEDIA,
                "Aquisicoes de combustivel em regime monofasico (GLP, diesel, gasolina) "
                "escrituradas com credito. Quando o combustivel e consumido na atividade, e "
                "nao revendido, ha fundamento especifico para o credito.",
                "Lei 10.637/2002 art. 3 II e Lei 10.833/2003 art. 3 II mencionam expressamente "
                "combustiveis e lubrificantes entre os insumos que geram credito; o art. 3 §2 II "
                "veda o credito na aquisicao nao sujeita ao pagamento da contribuicao, e a "
                "revenda pelo distribuidor se da a aliquota zero. STJ REsp 1.221.170 "
                "(essencialidade e relevancia) apoia o enquadramento como insumo.",
                "Confirmar que o combustivel e de fato consumido na atividade, e nao revendido, "
                "e que o CFOP usado reflete isso. Documentar a posicao adotada.",
                "AVALIAR", ctx)

    a3 = _novo("PC-03", "Saida desonerada sem enquadramento identificado",
               SEV_MEDIA,
               "Itens vendidos com CST desonerado (04/06/07/08/09) cujo NCM nao consta na tabela "
               "de regimes especiais. Pode ser tabela desatualizada ou falta de recolhimento.",
               "Lei 10.637/2002 art. 1; Lei 10.833/2003 art. 1",
               "Confirmar o enquadramento de cada NCM. Se nao houver amparo legal, corrigir o CST "
               "e recolher a contribuicao devida.",
               "RECOLHER", ctx)

    a4 = _novo("PC-04", "Aliquota divergente do regime de apuracao", SEV_MEDIA,
               "Itens com CST 01 (aliquota basica) escriturados com aliquota diferente da "
               "esperada para o regime declarado no registro 0110.",
               "Lei 10.637/2002 art. 2; Lei 10.833/2003 art. 2; Lei 9.718/1998 art. 8",
               "Verificar se ha item em regime distinto mal classificado (deveria ser CST 02) ou "
               "erro de parametrizacao do sistema emissor.",
               "AJUSTAR", ctx)

    a5 = _novo("PC-05", "Valor da contribuicao incompativel com base x aliquota", SEV_MEDIA,
               "Itens em que VL_PIS/VL_COFINS difere do produto da base pela aliquota informada, "
               "acima da tolerancia de arredondamento.",
               "Guia Pratico da EFD-Contribuicoes - regras de validacao dos registros C170/C175",
               "Corrigir a escrituracao. Diferencas sistematicas indicam erro de parametrizacao.",
               "AJUSTAR", ctx)

    a6 = _novo("PC-06", "CST de PIS diferente do CST de COFINS no mesmo item", SEV_MEDIA,
               "PIS e COFINS seguem o mesmo fato gerador e a mesma sistematica de CST. "
               "Divergencia no mesmo item indica erro de cadastro.",
               "Tabelas I e II do ADE Cofis (CST de PIS/COFINS)",
               "Uniformizar o CST no cadastro de produtos e retificar as competencias afetadas.",
               "AJUSTAR", ctx)

    a7 = _novo("PC-07", "ICMS destacado mantido na base de calculo do PIS/COFINS", SEV_ALTA,
               "Itens de saida tributada em que a base de PIS/COFINS equivale ao valor da "
               "operacao com o ICMS destacado incluido, sem a exclusao reconhecida pelo STF.",
               "STF RE 574.706 (Tema 69), com modulacao a partir de 15/03/2017; "
               "Lei 12.973/2014 art. 55; IN RFB 2.121/2022 art. 26",
               "Confirmar se a exclusao foi feita via ajuste de base no M210/M610 (nesse caso o "
               "apontamento se resolve). Caso contrario, quantificar o indebito, retificar a EFD "
               "e avaliar PER/DCOMP dentro do prazo de 5 anos.",
               "RECUPERAR", ctx)

    a8 = _novo("PC-08", "ICMS-ST pago na aquisicao fora da base do credito", SEV_MEDIA,
               "Aquisicoes para revenda com ICMS-ST destacado em que a base do credito de "
               "PIS/COFINS nao inclui o ICMS-ST, embora ele componha o custo de aquisicao.",
               "STJ Tema 1231 (creditamento sobre o ICMS-ST). Verificar o inteiro teor, a "
               "modulacao e a posicao atual da RFB antes de aplicar.",
               "Medida de risco: avaliar com o cliente a via administrativa x judicial. Nao "
               "escriturar o credito sem respaldo formal.",
               "RECUPERAR", ctx)

    a9 = _novo("PC-09", "Aquisicao sem credito em regime nao cumulativo", SEV_MEDIA,
               "Aquisicoes de bens para revenda ou insumos escrituradas com CST sem direito a "
               "credito (70 a 75) em empresa do regime nao cumulativo, sem que o NCM justifique.",
               "Lei 10.637/2002 art. 3; Lei 10.833/2003 art. 3; "
               "STJ REsp 1.221.170 (conceito de insumo por essencialidade e relevancia)",
               "Revisar item a item. Havendo direito, apropriar o credito extemporaneo (retificar "
               "a EFD ou escriturar no periodo corrente, conforme a orientacao adotada).",
               "RECUPERAR", ctx)

    a10 = _novo("PC-10", "Frete sem credito apropriado", SEV_MEDIA,
                "Fretes escriturados nos registros D101/D105 sem CST que gere credito.",
                "Lei 10.833/2003 art. 3 IX (frete na operacao de venda); "
                "frete sobre compra integra o custo de aquisicao",
                "Separar frete sobre venda (credito proprio, NAT_BC_CRED 07) de frete sobre "
                "compra (compoe o custo do bem adquirido) e apropriar o que for devido.",
                "RECUPERAR", ctx)

    a11 = _novo("PC-11", "Devolucao de venda sem credito", SEV_MEDIA,
                "Entradas por devolucao de venda sem credito escriturado. A devolucao de venda "
                "tributada gera credito no regime nao cumulativo.",
                "Lei 10.637/2002 art. 3 VIII; Lei 10.833/2003 art. 3 VIII; "
                "NAT_BC_CRED 12 da Tabela 4.3.7",
                "Escriturar o credito da devolucao com NAT_BC_CRED 12.",
                "RECUPERAR", ctx)

    a12 = _novo("PC-12", "CST desonerado com valor de contribuicao destacado", SEV_ALTA,
                "Itens com CST 04/06/07/08/09 (sem debito) que mesmo assim tem VL_PIS ou "
                "VL_COFINS preenchido - contradicao interna da escrituracao.",
                "Tabela I do ADE Cofis; Guia Pratico da EFD-Contribuicoes",
                "Corrigir a escrituracao: ou o CST esta errado, ou o valor foi destacado a maior.",
                "RECUPERAR", ctx)

    a17 = _novo("PC-17", "Parcela do ICMS destacado mantida na base de PIS/COFINS",
                SEV_MEDIA,
                "Itens de saida em que a base de PIS/COFINS e menor que o valor da "
                "operacao - ou seja, houve exclusao do ICMS - mas a exclusao ficou "
                "aquem do ICMS destacado. O residuo costuma ser o adicional de FCP "
                "(Fundo de Combate a Pobreza), que e parte do ICMS destacado e vem "
                "sendo mantido na base.",
                "STF RE 574.706 (Tema 69) manda excluir o ICMS destacado na nota; "
                "o adicional de FCP compoe o ICMS destacado (CF/1988 art. 82 do ADCT). "
                "Conferir a posicao adotada e a jurisprudencia aplicavel ao Estado.",
                "Quantificar o residuo por competencia e decidir com o cliente se o FCP "
                "entra na exclusao. Havendo decisao pela exclusao, retificar a EFD e "
                "avaliar PER/DCOMP dentro do prazo de 5 anos.",
                "RECUPERAR", ctx)

    a13 = _novo("PC-13", "CST ausente ou invalido", SEV_MEDIA,
                "Itens sem CST de PIS/COFINS ou com codigo fora das tabelas oficiais.",
                "Tabelas I e II do ADE Cofis",
                "Corrigir o cadastro do produto e retificar a escrituracao.",
                "AJUSTAR", ctx)

    for l in linhas:
        cst_p = (l.cst_pis or "").strip().zfill(2) if l.cst_pis else ""
        cst_c = (l.cst_cofins or "").strip().zfill(2) if l.cst_cofins else ""
        valor_liquido = l.vl_item - l.vl_desc
        regime_item = tabela.regime(l.ncm) if l.ncm else None
        classif = tabela.classificar(l.ncm) if l.ncm else None

        # PC-13 CST ausente/invalido
        for cst in (cst_p, cst_c):
            if cst and cst not in tabelas.CST_PIS_COFINS:
                a13.adicionar(l, ZERO, "CST %s fora das tabelas oficiais" % cst)
                break
        else:
            if not cst_p and not cst_c and l.origem in ("C170", "C175", "A170", "F100"):
                a13.adicionar(l, ZERO, "item sem CST de PIS/COFINS")

        # PC-06 CST divergente entre os dois tributos
        if cst_p and cst_c and cst_p != cst_c:
            a6.adicionar(l, ZERO, "PIS %s x COFINS %s" % (cst_p, cst_c))

        if l.eh_saida:
            tributado = cst_p in tabelas.CST_TRIBUTADOS or cst_c in tabelas.CST_TRIBUTADOS
            desonerado = cst_p in tabelas.CST_DESONERADOS or cst_c in tabelas.CST_DESONERADOS

            # PC-12 CST desonerado com valor destacado
            if desonerado and (l.vl_pis > TOL_ITEM or l.vl_cofins > TOL_ITEM):
                a12.adicionar(l, l.vl_pis + l.vl_cofins,
                              "CST %s/%s com PIS %s e COFINS %s" %
                              (cst_p, cst_c, _q(l.vl_pis), _q(l.vl_cofins)))

            if tabelas.eh_venda(l.cfop) or not l.cfop:
                # PC-01 monofasico/desonerado tributado
                if tributado and classif and regime_item in (
                        mod_ncm.REGIME_MONOFASICO, mod_ncm.REGIME_ALIQUOTA_ZERO,
                        mod_ncm.REGIME_ST):
                    a1.adicionar(l, l.vl_pis + l.vl_cofins,
                                 "NCM %s - %s (%s) - confianca %s" %
                                 (l.ncm, regime_item, classif["grupo"], classif["confianca"]))
                # PC-03 desonerado sem enquadramento
                elif desonerado and l.ncm and (
                        classif is None or regime_item == mod_ncm.REGIME_TRIBUTADO):
                    a3.adicionar(l, _q(valor_liquido * soma_aliq),
                                 "NCM %s sem enquadramento na tabela" % l.ncm)

            # PC-04 aliquota divergente
            if cst_p == "01" and l.bc_pis > 0 and l.aliq_pis > 0:
                if not regime_misto and abs(l.aliq_pis - aliq_pis) > Decimal("0.01"):
                    esperado = l.bc_pis * aliq_pis / Decimal("100")
                    a4.adicionar(l, abs(esperado - l.vl_pis),
                                 "PIS: aliquota %s%% x esperada %s%%" % (l.aliq_pis, aliq_pis))
                elif regime_misto and l.aliq_pis not in (
                        tabelas.ALIQ_PIS_CUMULATIVO, tabelas.ALIQ_PIS_NAO_CUMULATIVO):
                    a4.adicionar(l, ZERO, "PIS: aliquota %s%% fora de 0,65%% e 1,65%%" % l.aliq_pis)

            # PC-07 / PC-17 - ICMS na base de calculo.
            # PC-07: nada foi excluido. PC-17: excluiu-se menos que o destacado,
            # o que quase sempre significa FCP mantido na base. Sao disjuntos.
            if tributado and l.vl_icms > TOL_ITEM and l.bc_pis > 0:
                if abs(l.bc_pis - valor_liquido) <= TOL_ITEM:
                    a7.adicionar(l, _q(l.vl_icms * soma_aliq),
                                 "BC %s = valor da operacao, com ICMS de %s destacado" %
                                 (_q(l.bc_pis), _q(l.vl_icms)))
                else:
                    residuo = l.bc_pis - (valor_liquido - l.vl_icms)
                    if residuo > TOL_ITEM:
                        pct = (residuo / valor_liquido * Decimal("100")) if valor_liquido else ZERO
                        a17.adicionar(l, _q(residuo * soma_aliq),
                                      "ICMS destacado %s, excluido da base apenas %s; "
                                      "residuo de %s (%.2f%% do valor)" %
                                      (_q(l.vl_icms), _q(valor_liquido - l.bc_pis),
                                       _q(residuo), pct))

        elif l.eh_entrada:
            com_credito = cst_p in tabelas.CST_COM_CREDITO or cst_c in tabelas.CST_COM_CREDITO
            sem_credito = cst_p in tabelas.CST_SEM_CREDITO or cst_c in tabelas.CST_SEM_CREDITO

            # PC-02 / PC-14 / PC-15 - credito em aquisicao desonerada.
            # O destino da compra decide o tratamento: revenda e credito indevido
            # sem controversia; insumo e combustivel tem discussao propria.
            if com_credito and classif and regime_item in (
                    mod_ncm.REGIME_MONOFASICO, mod_ncm.REGIME_ALIQUOTA_ZERO,
                    mod_ncm.REGIME_ST):
                destino = tabelas.destino_da_compra(l.cfop)
                detalhe = "NCM %s - %s (%s), CFOP %s" % (
                    l.ncm, regime_item, classif["grupo"], l.cfop)
                if destino == "COMBUSTIVEL" or classif["grupo"] == "COMBUSTIVEIS":
                    a15.adicionar(l, l.vl_pis + l.vl_cofins, detalhe)
                elif destino == "INSUMO":
                    a14.adicionar(l, l.vl_pis + l.vl_cofins, detalhe)
                else:
                    a2.adicionar(l, l.vl_pis + l.vl_cofins,
                                 detalhe + " - destino %s" % destino)

            # PC-08 ICMS-ST fora da base do credito
            if com_credito and l.vl_icms_st > TOL_ITEM and l.bc_pis > 0:
                if abs(l.bc_pis - valor_liquido) <= TOL_ITEM:
                    a8.adicionar(l, _q(l.vl_icms_st * soma_aliq),
                                 "ICMS-ST de %s fora da base do credito" % _q(l.vl_icms_st))

            # PC-09 aquisicao sem credito no nao cumulativo
            if (sem_credito and ctx["cod_inc_trib"] in ("1", "3")
                    and tabelas.eh_compra(l.cfop)
                    and (classif is None or regime_item == mod_ncm.REGIME_TRIBUTADO)
                    and valor_liquido > 0):
                a9.adicionar(l, _q(valor_liquido * soma_aliq),
                             "CST %s em CFOP %s" % (cst_p or cst_c, l.cfop))

            # PC-10 frete sem credito
            if l.origem == "D101/D105" and not com_credito:
                a10.adicionar(l, _q(valor_liquido * soma_aliq),
                              "CST %s no frete" % (cst_p or cst_c or "vazio"))

            # PC-11 devolucao de venda sem credito
            if tabelas.eh_devolucao(l.cfop) and not com_credito and valor_liquido > 0:
                a11.adicionar(l, _q(valor_liquido * soma_aliq),
                              "CFOP %s sem credito" % l.cfop)

    return [a1, a2, a14, a15, a3, a4, a5, a6, a7, a17, a8, a9, a10, a11, a12, a13]


def testes_de_base_x_aliquota(linhas, ctx, achado):
    """PC-05 - confere VL = BC x ALIQ item a item."""
    for l in linhas:
        for rotulo, bc, aliq, valor in (
                ("PIS", l.bc_pis, l.aliq_pis, l.vl_pis),
                ("COFINS", l.bc_cofins, l.aliq_cofins, l.vl_cofins)):
            if bc > 0 and aliq > 0:
                esperado = (bc * aliq / Decimal("100")).quantize(CENTAVO)
                dif = abs(esperado - valor)
                tolerancia = max(TOL_ITEM, esperado * TOL_REL)
                if dif > tolerancia:
                    achado.adicionar(l, dif, "%s: escriturado %s x calculado %s" %
                                     (rotulo, _q(valor), esperado))
    return achado


def testes_de_consolidacao(esc, apuracao, recomposicao, ctx, linhas=()):
    """Confronta bloco M x documentos e verifica a coerencia interna do M200/M600."""
    achados = []

    a = _novo("PC-20", "Divergencia entre o debito do bloco M e os documentos escriturados",
              SEV_ALTA,
              "A contribuicao apurada no bloco M nao corresponde a soma dos valores "
              "destacados nos itens de saida.",
              "Guia Pratico da EFD-Contribuicoes - blocos A/C/D/F e bloco M",
              "Identificar a origem (ajustes de base, receitas fora de documento fiscal, "
              "registros consolidados) antes de concluir por erro de apuracao.",
              "AJUSTAR", ctx)
    for tributo, campo in (("pis", "debito_pis"), ("cofins", "debito_cofins")):
        detalhe = apuracao[tributo]["detalhe_debito"]
        if not detalhe:
            continue
        bloco_m = sum((d["contribuicao_apurada"] for d in detalhe), ZERO)
        documentos = recomposicao[campo]
        dif = abs(bloco_m - documentos)
        referencia = max(bloco_m, documentos, Decimal("1"))
        if dif > max(Decimal("1.00"), referencia * TOL_REL):
            a.adicionar(_Ref("Bloco M %s" % tributo.upper()), dif,
                        "bloco M %s x documentos %s" % (_q(bloco_m), _q(documentos)))
    achados.append(a)

    b = _novo("PC-21", "Inconsistencia aritmetica no M200/M600", SEV_ALTA,
              "Os totalizadores da consolidacao nao fecham entre si.",
              "Guia Pratico da EFD-Contribuicoes - registros M200 e M600",
              "Reprocessar a apuracao no sistema e retransmitir a escrituracao.",
              "AJUSTAR", ctx)
    for tributo in ("pis", "cofins"):
        c = apuracao[tributo]["consolidacao"]
        if not c:
            continue
        devida = (c["contribuicao_nc_periodo"] - c["creditos_descontados"]
                  - c["creditos_periodos_anteriores"])
        devida = devida if devida > 0 else ZERO
        if abs(devida - c["contribuicao_nc_devida"]) > Decimal("1.00"):
            b.adicionar(_Ref("M200/M600 %s" % tributo.upper()),
                        abs(devida - c["contribuicao_nc_devida"]),
                        "devida escriturada %s x recalculada %s" %
                        (_q(c["contribuicao_nc_devida"]), _q(devida)))
        recolher = (c["contribuicao_nc_devida"] - c["retencoes_nc"] - c["outras_deducoes_nc"])
        recolher = recolher if recolher > 0 else ZERO
        if abs(recolher - c["contribuicao_nc_recolher"]) > Decimal("1.00"):
            b.adicionar(_Ref("M200/M600 %s" % tributo.upper()),
                        abs(recolher - c["contribuicao_nc_recolher"]),
                        "a recolher escriturado %s x recalculado %s" %
                        (_q(c["contribuicao_nc_recolher"]), _q(recolher)))
        total = c["contribuicao_nc_recolher"] + c["contribuicao_cum_recolher"]
        if abs(total - c["total_recolher"]) > Decimal("1.00"):
            b.adicionar(_Ref("M200/M600 %s" % tributo.upper()),
                        abs(total - c["total_recolher"]),
                        "total escriturado %s x soma dos regimes %s" %
                        (_q(c["total_recolher"]), _q(total)))
    achados.append(b)

    c_ach = _novo("PC-22", "Credito apurado nao descontado integralmente", SEV_BAIXA,
                  "Ha credito apurado no periodo que nao foi descontado nem transferido "
                  "para o saldo de periodos seguintes.",
                  "Lei 10.637/2002 art. 3 §4; Lei 10.833/2003 art. 3 §4 "
                  "(o credito nao aproveitado pode ser utilizado nos meses subsequentes)",
                  "Controlar o saldo no registro 1100/1500 e aproveita-lo nas competencias "
                  "seguintes ou pedir ressarcimento quando cabivel.",
                  "RECUPERAR", ctx)
    for tributo in ("pis", "cofins"):
        for cred in apuracao[tributo]["creditos"]:
            nao_usado = cred["credito_disponivel"] - cred["credito_descontado"]
            if nao_usado > Decimal("1.00"):
                c_ach.adicionar(_Ref("%s cod. credito %s" % (tributo.upper(), cred["cod_cred"])),
                                nao_usado,
                                "disponivel %s, descontado %s" %
                                (_q(cred["credito_disponivel"]), _q(cred["credito_descontado"])))
    achados.append(c_ach)

    # PC-16 - receita de ente publico sem retencao na fonte aproveitada
    d_ach = _novo("PC-16", "Receita de ente publico sem retencao na fonte aproveitada",
                  SEV_ALTA,
                  "Ha receita faturada contra orgaos, autarquias, fundacoes ou fundos "
                  "publicos, e a escrituracao nao registra nenhuma retencao de PIS/COFINS "
                  "na fonte (VL_RET_NC zerado no M200/M600 e nenhum registro F600). "
                  "Se a retencao ocorreu no pagamento e nao foi deduzida, a contribuicao "
                  "foi recolhida em duplicidade.",
                  "Lei 9.430/1996 art. 64 e IN RFB 1.234/2012 para orgaos federais; "
                  "Lei 10.833/2003 art. 33 para Estados, Distrito Federal e Municipios, "
                  "que depende de convenio com a Uniao. A retencao aproveitada e "
                  "declarada no registro F600 e deduzida no M200/M600.",
                  "Levantar os comprovantes de retencao dos pagamentos recebidos no "
                  "periodo. Confirmar, para cada ente, se ele retem (orgao federal retem "
                  "sempre; Estado e Municipio so com convenio). Havendo retencao nao "
                  "aproveitada, escriturar o F600, deduzir no M200/M600 e retificar.",
                  "RECUPERAR", ctx)
    tem_f600 = bool(esc.get("F600"))
    ret_declarada = ZERO
    for tributo in ("pis", "cofins"):
        c = apuracao[tributo]["consolidacao"]
        if c:
            ret_declarada += c["retencoes_nc"] + c["retencoes_cum"]
    if not tem_f600 and ret_declarada <= CENTAVO:
        # agrupa por estabelecimento E cliente: os comprovantes de retencao ficam
        # com a filial que faturou, e atribuir tudo a matriz manda o usuario
        # procurar no lugar errado
        receita_publica = {}
        for l in linhas:
            if not l.eh_saida or not l.cod_part:
                continue
            participante = esc.participantes.get(l.cod_part)
            nome = participante.txt("NOME") if participante else ""
            if not _parece_ente_publico(nome):
                continue
            chave = (l.cnpj_estabelecimento, l.cod_part)
            acc = receita_publica.setdefault(chave, {"nome": nome, "valor": ZERO,
                                                     "linha": l})
            acc["valor"] += l.vl_item - l.vl_desc
        # estimativa pelas aliquotas de retencao de PIS (0,65%) e COFINS (3%)
        aliquota_retencao = Decimal("0.65") + Decimal("3.0")
        for chave, dados in sorted(receita_publica.items(), key=lambda x: -x[1]["valor"]):
            estimado = _q(dados["valor"] * aliquota_retencao / Decimal("100"))
            referencia = dados["linha"]
            d_ach.adicionar(referencia, estimado,
                            "%s - receita de R$ %s; retencao estimada a 0,65%% + 3,00%% "
                            "(a confirmar contra os comprovantes)"
                            % (dados["nome"][:52], _q(dados["valor"])))
    achados.append(d_ach)
    return achados


# Marcadores de ente publico no nome do participante. E heuristica: serve para
# levantar a pergunta sobre retencao na fonte, nunca para afirmar o enquadramento.
MARCADORES_ENTE_PUBLICO = (
    "municipio", "prefeitura", "estado de", "secretaria", "fundo municipal",
    "fundo estadual", "fundo nacional", "autarquia", "fundacao publica",
    "camara municipal", "assembleia", "tribunal", "ministerio publico",
    "ministerio da", "universidade federal", "instituto federal", "hospital municipal",
    "hospital estadual", "departamento nacional", "agencia nacional", "poder judiciario",
    "defensoria", "procuradoria", "governo do", "uniao federal", "exercito",
    "marinha", "aeronautica", "policia militar", "corpo de bombeiros",
)


def _parece_ente_publico(nome):
    n = (nome or "").lower()
    return any(marca in n for marca in MARCADORES_ENTE_PUBLICO)


class _Ref(object):
    """Referencia simples para achados que nao tem uma LinhaFiscal por tras."""

    def __init__(self, texto):
        self.texto = texto

    def ref(self):
        return self.texto


# ---------------------------------------------------------------------------
# Orquestracao
# ---------------------------------------------------------------------------
def analisar_linhas(linhas, tabela=None, ctx_base=None):
    """Roda so os testes de item, sem escrituracao por tras.

    Serve quando a planilha do cliente chegou e o arquivo SPED nao: a bateria de
    item e a mesma, o que muda e a fonte e o que deixa de ser testado (apuracao,
    bloco M, creditos).
    """
    tabela = tabela or mod_ncm.carregar()
    ctx_base = ctx_base or {}
    cod_inc = ctx_base.get("cod_inc_trib") or "1"
    aliq_pis, aliq_cofins = aliquotas_do_regime(cod_inc)
    ctx = {
        "competencia": ctx_base.get("competencia", ""),
        "cnpj": ctx_base.get("cnpj", ""),
        "cod_inc_trib": cod_inc,
        "aliq_pis": aliq_pis,
        "aliq_cofins": aliq_cofins,
    }
    achados = testes_por_item(linhas, tabela, ctx)
    pc05 = next(a for a in achados if a.codigo == "PC-05")
    testes_de_base_x_aliquota(linhas, ctx, pc05)
    vazio = {"consolidacao": None, "detalhe_debito": [], "creditos": [],
             "bases_credito": [], "receitas_nao_tributadas": []}
    return {
        "identificacao": {"competencia": ctx["competencia"], "cnpj": ctx["cnpj"],
                          "arquivo": "planilha do cliente", "tipo": "PLANILHA"},
        "regime": {
            "cod_inc_trib": cod_inc,
            "descricao": "regime presumido a partir das aliquotas da planilha "
                         "(nao ha registro 0110 sem o arquivo SPED)",
            "aliquota_pis": aliq_pis, "aliquota_cofins": aliq_cofins,
        },
        "apuracao_escriturada": {"pis": dict(vazio), "cofins": dict(vazio)},
        "recomposicao": recompor(linhas),
        "achados": achados,
        "qtd_linhas": len(linhas),
        "ajuste_reducao_bc_bloco_m": ZERO,
    }


def analisar(esc, tabela=None, linhas=None):
    tabela = tabela or mod_ncm.carregar()
    linhas = linhas if linhas is not None else extrair_linhas(esc)
    cod_inc = esc.regime_pis_cofins or "1"
    aliq_pis, aliq_cofins = aliquotas_do_regime(cod_inc)
    ctx = {
        "competencia": esc.competencia,
        "cnpj": esc.cnpj,
        "cod_inc_trib": cod_inc,
        "aliq_pis": aliq_pis,
        "aliq_cofins": aliq_cofins,
    }

    apuracao = apuracao_escriturada(esc)
    recomposicao = recompor(linhas)
    achados = testes_por_item(linhas, tabela, ctx)
    pc05 = next(a for a in achados if a.codigo == "PC-05")
    testes_de_base_x_aliquota(linhas, ctx, pc05)
    achados.extend(testes_de_consolidacao(esc, apuracao, recomposicao, ctx, linhas))

    # PC-07 se resolve quando a exclusao do ICMS foi feita via ajuste de base no M210/M610
    ajuste_reducao_bc = ZERO
    for tributo in ("pis", "cofins"):
        for d in apuracao[tributo]["detalhe_debito"]:
            ajuste_reducao_bc += d["ajuste_reducao_bc"]
    pc07 = next(a for a in achados if a.codigo == "PC-07")
    if pc07.relevante and ajuste_reducao_bc > 0:
        pc07.severidade = SEV_BAIXA
        pc07.descricao += (
            " OBSERVACAO: ha ajuste de reducao de base no M210/M610 totalizando R$ %s - "
            "a exclusao pode ter sido feita de forma consolidada, e nao item a item. "
            "Conferir antes de tratar como indebito." % _q(ajuste_reducao_bc)
        )

    return {
        "identificacao": esc.resumo(),
        "regime": {
            "cod_inc_trib": cod_inc,
            "descricao": tabelas.REGIME_INCIDENCIA.get(cod_inc, "nao informado"),
            "aliquota_pis": aliq_pis,
            "aliquota_cofins": aliq_cofins,
        },
        "apuracao_escriturada": apuracao,
        "recomposicao": recomposicao,
        "achados": achados,
        "qtd_linhas": len(linhas),
        "ajuste_reducao_bc_bloco_m": ajuste_reducao_bc,
    }

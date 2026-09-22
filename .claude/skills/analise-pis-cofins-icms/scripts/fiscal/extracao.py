# -*- coding: utf-8 -*-
"""Normaliza registros SPED em LinhaFiscal, independente do registro de origem."""
from __future__ import annotations


from decimal import Decimal

from .modelo import LinhaFiscal, COD_SIT_DESCONSIDERAR, ZERO
from . import tabelas

IND_OPER_ENTRADA = "0"
IND_OPER_SAIDA = "1"


def _tipo_por_cfop_ou_oper(ind_oper, cfop):
    if ind_oper == IND_OPER_SAIDA:
        return "SAIDA"
    if ind_oper == IND_OPER_ENTRADA:
        return "ENTRADA"
    if tabelas.eh_saida(cfop):
        return "SAIDA"
    if tabelas.eh_entrada(cfop):
        return "ENTRADA"
    return "INDEFINIDO"


def _ncm_do_item(esc, cod_item):
    item = esc.itens.get(cod_item)
    return item.txt("COD_NCM") if item else ""


def _descr_do_item(esc, cod_item, fallback=""):
    item = esc.itens.get(cod_item)
    if item and item.txt("DESCR_ITEM"):
        return item.txt("DESCR_ITEM")
    return fallback


def _doc_cancelado(reg):
    return reg.get("_cod_sit", "") in COD_SIT_DESCONSIDERAR


def _estab(esc, reg):
    """Identificacao do estabelecimento a que o registro pertence.

    Vale para toda origem de linha, nao so para o C170: servico, energia, frete e
    as demais operacoes tambem pertencem a um estabelecimento, e sem isso um
    achado em arquivo de varias filiais nao tem endereco.
    """
    cnpj = reg.get("_cnpj_est", "") or esc.cnpj
    dados = esc.estabelecimentos.get(cnpj, {})
    return {
        "cnpj_estabelecimento": cnpj,
        "estabelecimento": dados.get("cod_est", ""),
        "uf_estabelecimento": dados.get("uf", "") or esc.uf,
    }


def extrair_linhas(esc, incluir_icms=True):
    """Devolve a lista de LinhaFiscal de uma escrituracao (fiscal ou contribuicoes)."""
    linhas = []

    # --- C170: itens de documentos fiscais (mais rico: tem quantidade e NCM) ---
    for r in esc.get("C170"):
        if _doc_cancelado(r):
            continue
        cod_item = r.txt("COD_ITEM")
        cfop = tabelas.normaliza_cfop(r.txt("CFOP"))
        linhas.append(LinhaFiscal(
            origem="C170", arquivo=esc.arquivo, linha=r.get("_linha"), **_estab(esc, r),
            tipo=_tipo_por_cfop_ou_oper(r.get("_ind_oper", ""), cfop),
            doc=r.get("_num_doc", ""), serie=r.get("_ser", ""),
            chave=r.get("_chv_nfe", ""), data=r.get("_dt_doc", ""),
            cod_part=r.get("_cod_part", ""), cfop=cfop,
            cod_item=cod_item, ncm=_ncm_do_item(esc, cod_item),
            descricao=_descr_do_item(esc, cod_item, r.txt("DESCR_COMPL")),
            qtd=r.dec("QTD"), unid=r.txt("UNID"),
            vl_item=r.dec("VL_ITEM"), vl_desc=r.dec("VL_DESC"),
            cst_pis=r.txt("CST_PIS"), bc_pis=r.dec("VL_BC_PIS"),
            aliq_pis=r.dec("ALIQ_PIS"), vl_pis=r.dec("VL_PIS"),
            cst_cofins=r.txt("CST_COFINS"), bc_cofins=r.dec("VL_BC_COFINS"),
            aliq_cofins=r.dec("ALIQ_COFINS"), vl_cofins=r.dec("VL_COFINS"),
            cst_icms=r.txt("CST_ICMS") if incluir_icms else "",
            bc_icms=r.dec("VL_BC_ICMS"), aliq_icms=r.dec("ALIQ_ICMS"),
            vl_icms=r.dec("VL_ICMS"), bc_icms_st=r.dec("VL_BC_ICMS_ST"),
            vl_icms_st=r.dec("VL_ICMS_ST"),
        ))

    # --- C100 sem C170: NF-e de emissao propria dispensa o detalhe por item ---
    # Nesse caso o analitico C190 e a maior granularidade disponivel. Sem isso o
    # arquivo pareceria vazio e o cruzamento acusaria tudo como nao escriturado.
    linhas.extend(_linhas_de_documento_sem_item(esc))

    # --- C175: analitico de saida da EFD-Contribuicoes (quando nao ha C170) ---
    for r in esc.get("C175"):
        if _doc_cancelado(r):
            continue
        cfop = tabelas.normaliza_cfop(r.txt("CFOP"))
        linhas.append(LinhaFiscal(
            origem="C175", arquivo=esc.arquivo, linha=r.get("_linha"), **_estab(esc, r),
            tipo=_tipo_por_cfop_ou_oper(r.get("_ind_oper", ""), cfop),
            doc=r.get("_num_doc", ""), chave=r.get("_chv_nfe", ""),
            data=r.get("_dt_doc", ""), cod_part=r.get("_cod_part", ""), cfop=cfop,
            vl_item=r.dec("VL_OPR"), vl_desc=r.dec("VL_DESC"),
            cst_pis=r.txt("CST_PIS"), bc_pis=r.dec("VL_BC_PIS"),
            aliq_pis=r.dec("ALIQ_PIS"), vl_pis=r.dec("VL_PIS"),
            cst_cofins=r.txt("CST_COFINS"), bc_cofins=r.dec("VL_BC_COFINS"),
            aliq_cofins=r.dec("ALIQ_COFINS"), vl_cofins=r.dec("VL_COFINS"),
        ))

    # --- C181/C185 e C191/C195: consolidacao de saidas (PIS e COFINS separados) ---
    _pareia_consolidados(esc, linhas, "C181", "C185")
    _pareia_consolidados(esc, linhas, "C191", "C195")

    # --- A170: itens de NFS-e (servicos) ---
    # No registro A100, IND_OPER 0 = aquisicao de servico (entrada, gera credito) e
    # 1 = prestacao de servico (saida, gera debito). Tratar todo A170 como saida
    # joga credito de servico contratado dentro do debito e quebra a apuracao.
    for r in esc.get("A170"):
        if _doc_cancelado(r):
            continue
        linhas.append(LinhaFiscal(
            origem="A170", arquivo=esc.arquivo, linha=r.get("_linha"), **_estab(esc, r),
            tipo=_tipo_por_cfop_ou_oper(r.get("_ind_oper", ""), ""),
            doc=r.get("_num_doc", ""), data=r.get("_dt_doc", ""),
            cod_part=r.get("_cod_part", ""), cod_item=r.txt("COD_ITEM"),
            descricao=r.txt("DESCR_COMPL"),
            vl_item=r.dec("VL_ITEM"), vl_desc=r.dec("VL_DESC"),
            nat_bc_cred=r.txt("NAT_BC_CRED"),
            cst_pis=r.txt("CST_PIS"), bc_pis=r.dec("VL_BC_PIS"),
            aliq_pis=r.dec("ALIQ_PIS"), vl_pis=r.dec("VL_PIS"),
            cst_cofins=r.txt("CST_COFINS"), bc_cofins=r.dec("VL_BC_COFINS"),
            aliq_cofins=r.dec("ALIQ_COFINS"), vl_cofins=r.dec("VL_COFINS"),
        ))

    # --- F100: demais operacoes (creditos e receitas fora de documento fiscal) ---
    for r in esc.get("F100"):
        ind = r.txt("IND_OPER")   # 0=operacao de aquisicao com credito, 1=receita, 2=outras
        tipo = "ENTRADA" if ind == "0" else "SAIDA" if ind == "1" else "INDEFINIDO"
        linhas.append(LinhaFiscal(
            origem="F100", arquivo=esc.arquivo, linha=r.get("_linha"), tipo=tipo, **_estab(esc, r),
            data=r.txt("DT_OPER"), cod_part=r.txt("COD_PART"),
            cod_item=r.txt("COD_ITEM"), descricao=r.txt("DESC_DOC_OPER"),
            vl_item=r.dec("VL_OPER"), nat_bc_cred=r.txt("NAT_BC_CRED"),
            cst_pis=r.txt("CST_PIS"), bc_pis=r.dec("VL_BC_PIS"),
            aliq_pis=r.dec("ALIQ_PIS"), vl_pis=r.dec("VL_PIS"),
            cst_cofins=r.txt("CST_COFINS"), bc_cofins=r.dec("VL_BC_COFINS"),
            aliq_cofins=r.dec("ALIQ_COFINS"), vl_cofins=r.dec("VL_COFINS"),
        ))

    # --- D101/D105: fretes (creditos sobre transporte) ---
    _pareia_fretes(esc, linhas)

    # --- C501/C505 (energia eletrica) e D501/D505 (comunicacao/transporte) ---
    # Sao creditos comuns e faceis de perder de vista: entram na apuracao pelo
    # bloco M sem aparecer em nenhum C170.
    _pareia_creditos(esc, linhas, "C501", "C505", "Energia eletrica")
    _pareia_creditos(esc, linhas, "D501", "D505", "Comunicacao/transporte")
    return linhas


def _pareia_creditos(esc, linhas, reg_pis, reg_cofins, rotulo):
    """Pareia registros de credito em que PIS e COFINS vem separados."""
    cofins = list(esc.get(reg_cofins))
    for i, r in enumerate(esc.get(reg_pis)):
        c = cofins[i] if i < len(cofins) else None
        linhas.append(LinhaFiscal(
            origem="%s/%s" % (reg_pis, reg_cofins), arquivo=esc.arquivo,
            linha=r.get("_linha"), tipo="ENTRADA", doc=r.get("_num_doc", ""),
            **_estab(esc, r),
            data=r.get("_dt_doc", ""), cod_part=r.get("_cod_part", ""),
            descricao=rotulo, vl_item=r.dec("VL_ITEM"),
            nat_bc_cred=r.txt("NAT_BC_CRED"),
            cst_pis=r.txt("CST_PIS"), bc_pis=r.dec("VL_BC_PIS"),
            aliq_pis=r.dec("ALIQ_PIS"), vl_pis=r.dec("VL_PIS"),
            cst_cofins=c.txt("CST_COFINS") if c else "",
            bc_cofins=c.dec("VL_BC_COFINS") if c else ZERO,
            aliq_cofins=c.dec("ALIQ_COFINS") if c else ZERO,
            vl_cofins=c.dec("VL_COFINS") if c else ZERO,
        ))
    return linhas


def _linhas_de_documento_sem_item(esc):
    """Gera linhas a partir de C100/C190 quando o documento nao tem C170.

    PIS e COFINS so existem no total do C100, entao sao rateados entre os C190 na
    proporcao do valor da operacao. Com um unico C190 o rateio e exato; com varios
    e aproximacao, e a origem da linha diz isso ("C100/C190").
    """
    saida = []
    c190_por_doc = {}
    for r in esc.get("C190"):
        c190_por_doc.setdefault(r.get("_linha_c100"), []).append(r)

    tem_item = set()
    for reg in ("C170", "C175"):
        for r in esc.get(reg):
            tem_item.add(r.get("_linha_c100"))

    for c100 in esc.get("C100"):
        chave = c100.get("_linha")
        if chave in tem_item or _doc_cancelado_c100(c100):
            continue
        analiticos = c190_por_doc.get(chave, [])
        if not analiticos:
            continue
        total_opr = sum((a.dec("VL_OPR") for a in analiticos), ZERO) or ZERO
        vl_pis, vl_cofins = c100.dec("VL_PIS"), c100.dec("VL_COFINS")
        for a in analiticos:
            proporcao = (a.dec("VL_OPR") / total_opr) if total_opr else ZERO
            cfop = tabelas.normaliza_cfop(a.txt("CFOP"))
            saida.append(LinhaFiscal(
                origem="C100/C190", arquivo=esc.arquivo, linha=c100.get("_linha"),
                **_estab(esc, c100),
                tipo=_tipo_por_cfop_ou_oper(c100.txt("IND_OPER"), cfop),
                doc=c100.txt("NUM_DOC"), serie=c100.txt("SER"),
                chave=c100.txt("CHV_NFE"), data=c100.txt("DT_DOC"),
                cod_part=c100.txt("COD_PART"), cfop=cfop,
                descricao="Documento sem detalhe de item (C190)",
                vl_item=a.dec("VL_OPR"), vl_desc=ZERO,
                cst_icms=a.txt("CST_ICMS"), bc_icms=a.dec("VL_BC_ICMS"),
                aliq_icms=a.dec("ALIQ_ICMS"), vl_icms=a.dec("VL_ICMS"),
                bc_icms_st=a.dec("VL_BC_ICMS_ST"), vl_icms_st=a.dec("VL_ICMS_ST"),
                vl_pis=(vl_pis * proporcao).quantize(Decimal("0.01")),
                vl_cofins=(vl_cofins * proporcao).quantize(Decimal("0.01")),
            ))
    return saida


def _doc_cancelado_c100(reg):
    return reg.txt("COD_SIT") in COD_SIT_DESCONSIDERAR


def _pareia_consolidados(esc, linhas, reg_pis, reg_cofins):
    """C181/C185 (e C191/C195) trazem PIS e COFINS em registros separados.

    Pareia pela chave (documento, CFOP, valor do item) para reconstruir a linha.
    O que nao parear entra assim mesmo, com o tributo faltante zerado.
    """
    def chave(r, campo_cst):
        return (r.get("_chv_nfe", ""), r.get("_num_doc", ""),
                tabelas.normaliza_cfop(r.txt("CFOP")), r.txt("VL_ITEM"),
                r.get("CNPJ_CPF_PART", ""))

    cofins_por_chave = {}
    for r in esc.get(reg_cofins):
        cofins_por_chave.setdefault(chave(r, "CST_COFINS"), []).append(r)

    for r in esc.get(reg_pis):
        if _doc_cancelado(r):
            continue
        k = chave(r, "CST_PIS")
        par = cofins_por_chave.get(k)
        c = par.pop(0) if par else None
        cfop = tabelas.normaliza_cfop(r.txt("CFOP"))
        linhas.append(LinhaFiscal(
            origem=reg_pis + "/" + reg_cofins, arquivo=esc.arquivo,
            linha=r.get("_linha"), **_estab(esc, r),
            tipo=_tipo_por_cfop_ou_oper(r.get("_ind_oper", ""), cfop),
            doc=r.get("_num_doc", ""), chave=r.get("_chv_nfe", ""),
            data=r.get("_dt_doc", ""), cfop=cfop,
            vl_item=r.dec("VL_ITEM"), vl_desc=r.dec("VL_DESC"),
            cst_pis=r.txt("CST_PIS"), bc_pis=r.dec("VL_BC_PIS"),
            aliq_pis=r.dec("ALIQ_PIS"), vl_pis=r.dec("VL_PIS"),
            cst_cofins=c.txt("CST_COFINS") if c else "",
            bc_cofins=c.dec("VL_BC_COFINS") if c else ZERO,
            aliq_cofins=c.dec("ALIQ_COFINS") if c else ZERO,
            vl_cofins=c.dec("VL_COFINS") if c else ZERO,
        ))

    # registros de COFINS que sobraram sem par de PIS
    for restantes in cofins_por_chave.values():
        for c in restantes:
            cfop = tabelas.normaliza_cfop(c.txt("CFOP"))
            linhas.append(LinhaFiscal(
                origem=reg_cofins, arquivo=esc.arquivo, linha=c.get("_linha"),
                **_estab(esc, c),
                tipo=_tipo_por_cfop_ou_oper(c.get("_ind_oper", ""), cfop),
                doc=c.get("_num_doc", ""), chave=c.get("_chv_nfe", ""),
                data=c.get("_dt_doc", ""), cfop=cfop,
                vl_item=c.dec("VL_ITEM"), vl_desc=c.dec("VL_DESC"),
                cst_cofins=c.txt("CST_COFINS"), bc_cofins=c.dec("VL_BC_COFINS"),
                aliq_cofins=c.dec("ALIQ_COFINS"), vl_cofins=c.dec("VL_COFINS"),
            ))


def _pareia_fretes(esc, linhas):
    d105_por_doc = {}
    for r in esc.get("D105"):
        d105_por_doc.setdefault((r.get("_num_doc", ""), r.txt("IND_NAT_FRT")), []).append(r)
    for r in esc.get("D101"):
        k = (r.get("_num_doc", ""), r.txt("IND_NAT_FRT"))
        par = d105_por_doc.get(k)
        c = par.pop(0) if par else None
        linhas.append(LinhaFiscal(
            origem="D101/D105", arquivo=esc.arquivo, linha=r.get("_linha"),
            **_estab(esc, r),
            tipo="ENTRADA", doc=r.get("_num_doc", ""), data=r.get("_dt_doc", ""),
            cod_part=r.get("_cod_part", ""), descricao="Frete - CT-e",
            vl_item=r.dec("VL_ITEM"), nat_bc_cred=r.txt("NAT_BC_CRED"),
            cst_pis=r.txt("CST_PIS"), bc_pis=r.dec("VL_BC_PIS"),
            aliq_pis=r.dec("ALIQ_PIS"), vl_pis=r.dec("VL_PIS"),
            cst_cofins=c.txt("CST_COFINS") if c else "",
            bc_cofins=c.dec("VL_BC_COFINS") if c else ZERO,
            aliq_cofins=c.dec("ALIQ_COFINS") if c else ZERO,
            vl_cofins=c.dec("VL_COFINS") if c else ZERO,
        ))

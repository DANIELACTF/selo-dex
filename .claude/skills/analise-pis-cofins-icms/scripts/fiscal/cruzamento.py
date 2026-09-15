# -*- coding: utf-8 -*-
"""Cruzamento entre a movimentacao fisica de produtos e o que foi escriturado no SPED.

A diferenca entre o estoque que a empresa movimentou e o que ela documentou e o
principal indicio objetivo de omissao de receita (saida sem nota) ou de entrada
sem documento fiscal. Este modulo quantifica essa diferenca item a item.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from . import tabelas
from .modelo import Achado, SEV_ALTA, SEV_MEDIA, SEV_BAIXA, ZERO
from .planilha import normalizar

CENTAVO = Decimal("0.01")
TOL_QTD_ABS = Decimal("1")        # ate 1 unidade de diferenca e ruido de arredondamento
TOL_QTD_REL = Decimal("0.005")    # ou 0,5% do volume movimentado


def _q(v):
    return (v or ZERO).quantize(CENTAVO)


class _Ref(object):
    def __init__(self, texto):
        self.texto = texto

    def ref(self):
        return self.texto


def agregar_por_item(linhas):
    """Consolida quantidades e valores por COD_ITEM a partir das LinhaFiscal do SPED."""
    itens = {}
    for l in linhas:
        if not l.cod_item or l.qtd == ZERO:
            continue
        if not tabelas.movimenta_estoque_fisico(l.cfop):
            continue
        chave = normalizar(l.cod_item)
        d = itens.setdefault(chave, {
            "cod_item": l.cod_item, "descricao": l.descricao, "ncm": l.ncm,
            "unidade": l.unid,
            "qtd_entradas": ZERO, "qtd_saidas": ZERO,
            "valor_entradas": ZERO, "valor_saidas": ZERO,
            "qtd_devolucao_venda": ZERO, "qtd_devolucao_compra": ZERO,
            "qtd_transferencia_entrada": ZERO, "qtd_transferencia_saida": ZERO,
            "icms_saidas": ZERO, "pis_saidas": ZERO, "cofins_saidas": ZERO,
            "docs_saida": set(), "docs_entrada": set(),
        })
        if not d["ncm"] and l.ncm:
            d["ncm"] = l.ncm
        if not d["descricao"] and l.descricao:
            d["descricao"] = l.descricao
        valor = l.vl_item - l.vl_desc
        if l.eh_entrada:
            d["qtd_entradas"] += l.qtd
            d["valor_entradas"] += valor
            d["docs_entrada"].add(l.doc)
            if tabelas.eh_devolucao(l.cfop):
                d["qtd_devolucao_venda"] += l.qtd
            if tabelas.eh_transferencia(l.cfop):
                d["qtd_transferencia_entrada"] += l.qtd
        elif l.eh_saida:
            d["qtd_saidas"] += l.qtd
            d["valor_saidas"] += valor
            d["docs_saida"].add(l.doc)
            d["icms_saidas"] += l.vl_icms
            d["pis_saidas"] += l.vl_pis
            d["cofins_saidas"] += l.vl_cofins
            if tabelas.eh_devolucao(l.cfop):
                d["qtd_devolucao_compra"] += l.qtd
            if tabelas.eh_transferencia(l.cfop):
                d["qtd_transferencia_saida"] += l.qtd
    return itens


def mesclar_itens(acumulado, novos):
    """Soma os agregados de varios arquivos sem contar o mesmo item duas vezes."""
    for chave, dados in novos.items():
        alvo = acumulado.get(chave)
        if alvo is None:
            acumulado[chave] = {
                k: (set(v) if isinstance(v, set) else v) for k, v in dados.items()
            }
            continue
        for campo, valor in dados.items():
            if isinstance(valor, Decimal):
                alvo[campo] = alvo.get(campo, ZERO) + valor
            elif isinstance(valor, set):
                alvo[campo] = alvo.get(campo, set()) | valor
            elif not alvo.get(campo):
                alvo[campo] = valor
    return acumulado


def inventario_por_item(esc):
    """Quantidades do bloco H (inventario) por COD_ITEM."""
    saida = {}
    for r in esc.get("H010"):
        chave = normalizar(r.txt("COD_ITEM"))
        if not chave:
            continue
        d = saida.setdefault(chave, {
            "cod_item": r.txt("COD_ITEM"), "unidade": r.txt("UNID"),
            "quantidade": ZERO, "valor": ZERO,
        })
        d["quantidade"] += r.dec("QTD")
        d["valor"] += r.dec("VL_ITEM")
    return saida


def _preco_medio(dados):
    if dados["qtd_saidas"] > 0:
        try:
            return dados["valor_saidas"] / dados["qtd_saidas"]
        except (InvalidOperation, ZeroDivisionError):
            return ZERO
    if dados["qtd_entradas"] > 0:
        try:
            return dados["valor_entradas"] / dados["qtd_entradas"]
        except (InvalidOperation, ZeroDivisionError):
            return ZERO
    return ZERO


def _custo_medio(dados):
    """Custo medio de aquisicao do item, para avaliar diferencas de estoque."""
    if dados["qtd_entradas"] > 0:
        try:
            return dados["valor_entradas"] / dados["qtd_entradas"]
        except (InvalidOperation, ZeroDivisionError):
            return ZERO
    return ZERO


def _carga_media(dados):
    """Carga tributaria media efetiva das saidas do item (ICMS + PIS + COFINS)."""
    if dados["valor_saidas"] <= 0:
        return ZERO
    tributos = dados["icms_saidas"] + dados["pis_saidas"] + dados["cofins_saidas"]
    try:
        return tributos / dados["valor_saidas"]
    except (InvalidOperation, ZeroDivisionError):
        return ZERO


def _tolerancia(volume):
    return max(TOL_QTD_ABS, abs(volume) * TOL_QTD_REL)


def cruzar(movimentacao, itens_sped, inventario_final=None, ctx=None):
    """Compara a planilha de movimentacao com o agregado do SPED. Devolve achados + linhas."""
    ctx = ctx or {"competencia": "", "cnpj": ""}
    inventario_final = inventario_final or {}

    def novo(codigo, titulo, sev, descricao, base_legal, recomendacao, sentido,
             natureza_valor="Efeito tributario estimado"):
        a = Achado(codigo, titulo, sev, "ESTOQUE", descricao, base_legal, recomendacao,
                   ctx.get("competencia", ""), ctx.get("cnpj", ""), natureza_valor)
        a.sentido = sentido
        return a

    cr01 = novo("CR-01", "Planilha de movimentacao nao fecha internamente", SEV_MEDIA,
                "Itens em que estoque final informado difere de estoque inicial + entradas - saidas. "
                "A base do cruzamento precisa estar consistente antes de qualquer conclusao fiscal.",
                "Consistencia interna da propria planilha",
                "Reconciliar a planilha com o sistema de estoque antes de usar o resultado.",
                "AJUSTAR")

    cr02 = novo("CR-02", "Entradas fisicas maiores que as entradas escrituradas", SEV_ALTA,
                "O produto entrou no estoque em quantidade superior a documentada no SPED - "
                "indicio de aquisicao sem nota fiscal.",
                "Lei 9.430/1996 art. 42; presuncao de omissao de receita por entrada nao "
                "contabilizada; legislacao estadual de ICMS sobre entrada desacompanhada de documento",
                "Localizar as notas de entrada nao escrituradas. Nao havendo documento, avaliar "
                "regularizacao antes de eventual fiscalizacao.",
                "RECOLHER")

    cr03 = novo("CR-03", "Saidas fisicas maiores que as saidas escrituradas", SEV_ALTA,
                "O produto saiu do estoque em quantidade superior a documentada no SPED - "
                "indicio objetivo de venda sem emissao de nota fiscal (omissao de receita).",
                "CTN art. 149; Lei 9.430/1996 art. 42; LC 87/1996 art. 11 e ss.; "
                "presuncao legal de omissao de receita por saida de mercadoria sem documento",
                "Verificar primeiro se ha quebra, perda, consumo interno, brinde ou remessa nao "
                "considerada. Confirmada a venda sem nota, quantificar e regularizar "
                "(denuncia espontanea - CTN art. 138).",
                "RECOLHER")

    cr04 = novo("CR-04", "Saidas escrituradas maiores que as saidas fisicas", SEV_MEDIA,
                "Ha nota fiscal de saida sem baixa correspondente no estoque.",
                "Consistencia entre escrituracao fiscal e controle de estoque; "
                "bloco K da EFD ICMS/IPI quando obrigatorio",
                "Verificar erro de baixa no estoque, venda de item nao cadastrado ou documento "
                "emitido sem lastro.",
                "AJUSTAR")

    cr05 = novo("CR-05", "Produto movimentado no SPED e ausente na planilha", SEV_BAIXA,
                "Itens com movimento fiscal que nao aparecem no controle de estoque enviado.",
                "Consistencia entre o cadastro de produtos e o registro 0200 da EFD",
                "Confirmar se e item de uso/consumo, servico ou falha de cadastro.",
                "AJUSTAR")

    cr06 = novo("CR-06", "Estoque final divergente do inventario declarado (bloco H)", SEV_ALTA,
                "O estoque final da planilha nao confere com o inventario escriturado no "
                "registro H010 da EFD ICMS/IPI.",
                "Guia Pratico da EFD ICMS/IPI - bloco H; "
                "legislacao estadual sobre levantamento de estoque",
                "Reconciliar antes da entrega do inventario. Divergencia de inventario e um dos "
                "cruzamentos mais usados pelos fiscos estaduais.",
                "AJUSTAR", "Valor de estoque divergente (a custo)")

    cr07 = novo("CR-07", "Produto sem NCM no cadastro do SPED", SEV_MEDIA,
                "Itens movimentados sem NCM no registro 0200, o que impede a verificacao de "
                "regime monofasico, aliquota zero e substituicao tributaria.",
                "Registro 0200 do Guia Pratico da EFD; Ajuste SINIEF 07/2005",
                "Completar o cadastro de produtos com o NCM correto - sem ele nao ha como "
                "confirmar o tratamento de PIS/COFINS nem o enquadramento em ST.",
                "AJUSTAR")

    linhas_comparativo = []
    usados = set()

    for item in movimentacao.itens:
        chave = normalizar(item.codigo) or normalizar(item.descricao)
        usados.add(chave)
        sped = itens_sped.get(chave)
        preco = _preco_medio(sped) if sped else item.custo_unitario
        carga = _carga_media(sped) if sped else ZERO

        entradas_sped = sped["qtd_entradas"] if sped else ZERO
        saidas_sped = sped["qtd_saidas"] if sped else ZERO
        dif_entradas = item.entradas - entradas_sped
        dif_saidas = item.saidas - saidas_sped

        comparativo = {
            "codigo": item.codigo,
            "descricao": item.descricao or (sped["descricao"] if sped else ""),
            "ncm": item.ncm or (sped["ncm"] if sped else ""),
            "unidade_planilha": item.unidade,
            "unidade_sped": sped["unidade"] if sped else "",
            "estoque_inicial": item.estoque_inicial,
            "entradas_planilha": item.entradas,
            "entradas_sped": entradas_sped,
            "diferenca_entradas": dif_entradas,
            "saidas_planilha": item.saidas,
            "saidas_sped": saidas_sped,
            "diferenca_saidas": dif_saidas,
            "estoque_final_planilha": item.estoque_final,
            "estoque_final_calculado": item.saldo_calculado,
            "divergencia_saldo_planilha": item.divergencia_saldo,
            "preco_medio_sped": _q(preco),
            "carga_tributaria_media": carga,
            "encontrado_no_sped": bool(sped),
        }

        inv = inventario_final.get(chave)
        if inv:
            comparativo["estoque_final_inventario_h010"] = inv["quantidade"]
            comparativo["diferenca_inventario"] = item.estoque_final - inv["quantidade"]
        linhas_comparativo.append(comparativo)

        # CR-01 consistencia da propria planilha
        volume = item.estoque_inicial + item.entradas + item.saidas
        if abs(item.divergencia_saldo) > _tolerancia(volume):
            cr01.adicionar(_Ref("%s - %s" % (item.codigo, item.descricao[:40])),
                           ZERO,
                           "final informado %s x recalculado %s (dif. %s)" %
                           (item.estoque_final, item.saldo_calculado, item.divergencia_saldo))

        if not sped:
            continue

        # CR-02 entrada sem nota
        if dif_entradas > _tolerancia(max(item.entradas, entradas_sped)):
            custo = item.custo_unitario or _custo_medio(sped) or preco
            valor_mercadoria = dif_entradas * custo
            # a presuncao e de receita omitida ao menos no valor da entrada sem documento
            receita_presumida = dif_entradas * (preco or custo)
            efeito = _q(receita_presumida * carga) if carga > 0 else ZERO
            cr02.adicionar(_Ref("%s - %s" % (item.codigo, item.descricao[:40])), efeito,
                           "planilha %s x SPED %s (dif. %s un.); mercadoria a custo R$ %s; "
                           "receita presumida R$ %s" %
                           (item.entradas, entradas_sped, dif_entradas,
                            _q(valor_mercadoria), _q(receita_presumida)))

        # CR-03 saida sem nota - o achado de maior risco
        if dif_saidas > _tolerancia(max(item.saidas, saidas_sped)):
            receita_omitida = dif_saidas * preco
            tributo_estimado = _q(receita_omitida * carga) if carga > 0 else ZERO
            cr03.adicionar(_Ref("%s - %s" % (item.codigo, item.descricao[:40])),
                           tributo_estimado,
                           "planilha %s x SPED %s (dif. %s un.); receita estimada R$ %s "
                           "ao preco medio de R$ %s" %
                           (item.saidas, saidas_sped, dif_saidas,
                            _q(receita_omitida), _q(preco)))

        # CR-04 nota sem baixa de estoque
        if -dif_saidas > _tolerancia(max(item.saidas, saidas_sped)):
            cr04.adicionar(_Ref("%s - %s" % (item.codigo, item.descricao[:40])), ZERO,
                           "SPED %s x planilha %s (dif. %s un.)" %
                           (saidas_sped, item.saidas, -dif_saidas))

        # CR-06 inventario
        if inv and abs(item.estoque_final - inv["quantidade"]) > _tolerancia(item.estoque_final):
            custo = item.custo_unitario or _custo_medio(sped) or preco
            cr06.adicionar(_Ref("%s - %s" % (item.codigo, item.descricao[:40])),
                           _q(abs(item.estoque_final - inv["quantidade"]) * custo),
                           "planilha %s x H010 %s (avaliado ao custo de R$ %s)" %
                           (item.estoque_final, inv["quantidade"], _q(custo)))

        # CR-07 sem NCM
        if not sped["ncm"]:
            cr07.adicionar(_Ref("%s - %s" % (item.codigo, item.descricao[:40])), ZERO,
                           "item sem NCM no registro 0200")

    # CR-05 itens do SPED ausentes na planilha
    for chave, sped in itens_sped.items():
        if chave in usados:
            continue
        cr05.adicionar(_Ref("%s - %s" % (sped["cod_item"], (sped["descricao"] or "")[:40])),
                       ZERO,
                       "entradas %s, saidas %s no SPED" %
                       (sped["qtd_entradas"], sped["qtd_saidas"]))
        linhas_comparativo.append({
            "codigo": sped["cod_item"], "descricao": sped["descricao"], "ncm": sped["ncm"],
            "unidade_planilha": "", "unidade_sped": sped["unidade"],
            "estoque_inicial": ZERO, "entradas_planilha": ZERO,
            "entradas_sped": sped["qtd_entradas"], "diferenca_entradas": -sped["qtd_entradas"],
            "saidas_planilha": ZERO, "saidas_sped": sped["qtd_saidas"],
            "diferenca_saidas": -sped["qtd_saidas"],
            "estoque_final_planilha": ZERO, "estoque_final_calculado": ZERO,
            "divergencia_saldo_planilha": ZERO,
            "preco_medio_sped": _q(_preco_medio(sped)),
            "carga_tributaria_media": _carga_media(sped),
            "encontrado_no_sped": True,
        })

    achados = [cr03, cr02, cr06, cr01, cr04, cr07, cr05]
    return {"achados": achados, "comparativo": linhas_comparativo}

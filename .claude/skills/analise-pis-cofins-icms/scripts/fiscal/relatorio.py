# -*- coding: utf-8 -*-
"""Geracao dos entregaveis: relatorio em Markdown e planilha de trabalho em .xlsx."""
from __future__ import annotations

import io
import os
from decimal import Decimal

from . import tabelas, xlsx
from .modelo import formata_cnpj, tipo_estabelecimento
from .modelo import ordenar_achados, SEV_ALTA, SEV_MEDIA, ZERO

CENTAVO = Decimal("0.01")


def brl(valor):
    """Formata Decimal no padrao brasileiro: 1234.5 -> '1.234,50'."""
    if valor is None:
        valor = ZERO
    valor = Decimal(valor).quantize(CENTAVO)
    negativo = valor < 0
    inteiro, _, decimal = str(abs(valor)).partition(".")
    decimal = (decimal + "00")[:2]
    grupos = []
    while len(inteiro) > 3:
        grupos.insert(0, inteiro[-3:])
        inteiro = inteiro[:-3]
    grupos.insert(0, inteiro)
    return ("-" if negativo else "") + ".".join(grupos) + "," + decimal


def qtd(valor):
    if valor is None:
        return "0"
    valor = Decimal(valor).normalize()
    texto = format(valor, "f")
    return texto.replace(".", ",")


def _data(texto):
    if texto and len(texto) == 8 and texto.isdigit():
        return "%s/%s/%s" % (texto[:2], texto[2:4], texto[4:])
    return texto or "-"


def _tabela_md(cabecalho, linhas):
    if not linhas:
        return "_Sem dados._\n"
    saida = ["| " + " | ".join(cabecalho) + " |",
             "|" + "|".join(["---"] * len(cabecalho)) + "|"]
    for linha in linhas:
        saida.append("| " + " | ".join("" if c is None else str(c) for c in linha) + " |")
    return "\n".join(saida) + "\n"


NATUREZA_TRIBUTARIA = "Efeito tributario estimado"


def totais_por_sentido(achados):
    """Soma apenas os achados cujo valor mede efeito tributario.

    Achados que medem valor de mercadoria ou de estoque ficam de fora para nao
    inflar o total - eles aparecem individualmente no relatorio.
    """
    totais = {"RECUPERAR": ZERO, "RECOLHER": ZERO, "AJUSTAR": ZERO, "AVALIAR": ZERO}
    for a in achados:
        if a.relevante and a.sentido in totais and a.natureza_valor == NATUREZA_TRIBUTARIA:
            totais[a.sentido] += a.valor
    return totais


# ---------------------------------------------------------------------------
# Relatorio em Markdown
# ---------------------------------------------------------------------------
def montar_markdown(resultado):
    ident = resultado["identificacao"]
    achados = ordenar_achados(resultado["achados"])
    totais = totais_por_sentido(achados)
    out = []
    a = out.append

    a("# Analise de PIS/COFINS e ICMS")
    a("")
    a("| Campo | Conteudo |")
    a("|---|---|")
    a("| Empresa | %s |" % (ident.get("nome") or "-"))
    a("| CNPJ | %s |" % (ident.get("cnpj") or "-"))
    a("| UF | %s |" % (ident.get("uf") or "-"))
    a("| Competencias | %s |" % (", ".join(ident.get("competencias", [])) or "-"))
    a("| Arquivos SPED | %s |" % (", ".join(ident.get("arquivos", [])) or "-"))
    a("| Planilha de movimentacao | %s |" % (ident.get("movimentacao") or "nao fornecida"))
    a("")

    # --- estabelecimentos alcancados pelos achados ---
    estabs = {}
    for item in achados:
        for d in item.detalhes:
            linha = d.get("linha") or {}
            cnpj = linha.get("cnpj_estabelecimento") or item.cnpj
            if not cnpj:
                continue
            e = estabs.setdefault(cnpj, {
                "cod": linha.get("estabelecimento", ""),
                "uf": linha.get("uf_estabelecimento", ""),
                "qtd": 0, "valor": ZERO,
            })
            e["qtd"] += 1
            if item.natureza_valor == NATUREZA_TRIBUTARIA:
                e["valor"] += d["valor"]
            if not e["cod"]:
                e["cod"] = linha.get("estabelecimento", "")
            if not e["uf"]:
                e["uf"] = linha.get("uf_estabelecimento", "")
    if estabs:
        a("## 1. Estabelecimentos alcancados")
        a("")
        a("As amostras dos achados identificam o estabelecimento pelo codigo interno "
          "(`est. 53/ES`). A correspondencia com o CNPJ esta abaixo, e a planilha traz "
          "o CNPJ em cada linha da aba de detalhamento.")
        a("")
        a(_tabela_md(["CNPJ", "Matriz/Filial", "Cod.", "UF", "Ocorrencias",
                      "Efeito tributario (R$)"],
                     [[formata_cnpj(c), tipo_estabelecimento(c) or "-", e["cod"] or "-",
                       e["uf"] or "-", e["qtd"], brl(e["valor"])]
                      for c, e in sorted(estabs.items(),
                                         key=lambda x: -x[1]["valor"])]))
    a("## 2. Sintese")
    a("")
    a("| Indicador | Valor (R$) |")
    a("|---|---|")
    a("| Potencial a **recuperar** | %s |" % brl(totais["RECUPERAR"]))
    a("| Potencial a **recolher** (exposicao) | %s |" % brl(totais["RECOLHER"]))
    if totais["AVALIAR"]:
        a("| Em **avaliacao** (posicao a definir com o cliente) | %s |" % brl(totais["AVALIAR"]))
    outros = [x for x in achados if x.natureza_valor != NATUREZA_TRIBUTARIA and x.valor]
    if outros:
        a("| Valores nao tributarios apontados (estoque/mercadoria) | %s |"
          % brl(sum((x.valor for x in outros), ZERO)))
    a("| Achados de alta severidade | %d |" % sum(1 for x in achados if x.severidade == SEV_ALTA))
    a("| Total de achados | %d |" % len(achados))
    a("")
    a("> Os valores sao **estimativas de trabalho** calculadas sobre o que foi escriturado. "
      "Nenhum deles deve ser levado a PER/DCOMP, retificacao ou provisao contabil sem a "
      "conferencia item a item descrita em cada achado.")
    a("")

    # --- Apuracao PIS/COFINS ---
    if resultado.get("pis_cofins"):
        a("## 3. Apuracao de PIS/COFINS")
        a("")
        for bloco in resultado["pis_cofins"]:
            regime = bloco["regime"]
            a("### Competencia %s - %s" % (bloco["identificacao"]["competencia"],
                                           regime["descricao"]))
            a("")
            a("Aliquotas de referencia: PIS %s%% / COFINS %s%%."
              % (regime["aliquota_pis"], regime["aliquota_cofins"]))
            a("")
            linhas = []
            for tributo in ("pis", "cofins"):
                c = bloco["apuracao_escriturada"][tributo]["consolidacao"]
                if not c:
                    continue
                linhas.append([
                    tributo.upper(),
                    brl(c["contribuicao_nc_periodo"]),
                    brl(c["creditos_descontados"] + c["creditos_periodos_anteriores"]),
                    brl(c["contribuicao_nc_devida"]),
                    brl(c["contribuicao_cum_periodo"]),
                    brl(c["retencoes_nc"] + c["retencoes_cum"]),
                    brl(c["total_recolher"]),
                ])
            if linhas:
                a("**Apuracao conforme escriturada (bloco M)**")
                a("")
                a(_tabela_md(["Tributo", "Nao cum. do periodo", "Creditos descontados",
                              "Nao cum. devida", "Cumulativa do periodo", "Retencoes",
                              "Total a recolher"], linhas))

            calc = bloco.get("apuracao_calculada")
            if calc:
                a("> Esta apuracao foi **calculada a partir da movimentacao**, e nao "
                  "lida do bloco M: a EFD-Contribuicoes nao foi entregue.")
                a("")
                a("**Demonstrativo de calculo**")
                a("")
                esc_c = calc["cenario_escriturado"]
                a(_tabela_md(["Item", "Valor (R$)"], [
                    ["Receita bruta das saidas", brl(calc["receita_bruta"])],
                    ["(-) ICMS excluido da base", "(%s)" % brl(calc["exclusao_aplicada"])],
                    ["**= Base de calculo**", "**%s**" % brl(esc_c["base"])],
                    ["PIS %s%%" % calc["aliquotas"]["pis"], brl(esc_c["pis"])],
                    ["COFINS %s%%" % calc["aliquotas"]["cofins"], brl(esc_c["cofins"])],
                    ["(-) Creditos de PIS (%d entrada(s))" % calc["creditos"]["qtd_entradas"],
                     "(%s)" % brl(calc["creditos"]["pis"])],
                    ["(-) Creditos de COFINS", "(%s)" % brl(calc["creditos"]["cofins"])],
                    ["**PIS a recolher**", "**%s**" % brl(esc_c["pis_a_recolher"])],
                    ["**COFINS a recolher**", "**%s**" % brl(esc_c["cofins_a_recolher"])],
                    ["**Total a recolher**", "**%s**" % brl(esc_c["total_a_recolher"])],
                ]))
                if calc["por_cst"]:
                    a("**Receita e base por CST**")
                    a("")
                    a(_tabela_md(["CST", "Descricao", "Docs", "Receita", "ICMS destacado",
                                  "Base de calculo", "PIS", "COFINS"],
                                 [[c["cst"], c["descricao"][:44], c["qtd"],
                                   brl(c["receita"]), brl(c["icms"]), brl(c["base"]),
                                   brl(c["pis"]), brl(c["cofins"])]
                                  for c in calc["por_cst"]]))
                if calc["residuo_de_icms_na_base"] > 0:
                    alt = calc["cenario_icms_integral"]
                    a("**Cenario alternativo: excluir todo o ICMS destacado**")
                    a("")
                    a("Foram excluidos da base R$ %s dos R$ %s de ICMS destacado, "
                      "deixando **R$ %s** dentro da base (tipicamente o adicional de FCP)."
                      % (brl(calc["exclusao_aplicada"]), brl(calc["icms_destacado"]),
                         brl(calc["residuo_de_icms_na_base"])))
                    a("")
                    a(_tabela_md(["Cenario", "Base de calculo", "PIS", "COFINS",
                                  "Total a recolher"],
                                 [["Como escriturado", brl(esc_c["base"]), brl(esc_c["pis"]),
                                   brl(esc_c["cofins"]), brl(esc_c["total_a_recolher"])],
                                  ["Excluindo o ICMS destacado integral", brl(alt["base"]),
                                   brl(alt["pis"]), brl(alt["cofins"]),
                                   brl(alt["total_a_recolher"])],
                                  ["**Diferenca**", "", "", "",
                                   "**%s**" % brl(calc["diferenca_entre_cenarios"])]]))
                div = calc["divergencia_calculo_x_destaque"]
                if abs(div["pis"]) > Decimal("0.50") or abs(div["cofins"]) > Decimal("0.50"):
                    a("ATENCAO: o calculo sobre a base informada difere do valor "
                      "destacado nos documentos em R$ %s de PIS e R$ %s de COFINS."
                      % (brl(div["pis"]), brl(div["cofins"])))
                    a("")

            rec = bloco["recomposicao"]
            a("**Recomposicao pelos documentos escriturados**")
            a("")
            a(_tabela_md(["Item", "PIS (R$)", "COFINS (R$)"], [
                ["Debito apurado nos documentos de saida",
                 brl(rec["debito_pis"]), brl(rec["debito_cofins"])],
                ["Credito apurado nos documentos de entrada",
                 brl(rec["credito_pis"]), brl(rec["credito_cofins"])],
            ]))

            saidas = sorted(rec["por_cst_saida"].values(), key=lambda x: x["cst"])
            if saidas:
                a("**Saidas por CST**")
                a("")
                a(_tabela_md(["CST", "Descricao", "Itens", "Valor da operacao",
                              "BC PIS", "PIS", "COFINS"],
                             [[s["cst"], s["descricao"][:50], s["qtd"],
                               brl(s["valor_operacao"]), brl(s["bc_pis"]),
                               brl(s["vl_pis"]), brl(s["vl_cofins"])] for s in saidas]))

            creditos = sorted(rec["por_natureza_credito"].values(),
                              key=lambda x: x["nat_bc_cred"])
            if creditos:
                a("**Creditos por natureza da base (Tabela 4.3.7)**")
                a("")
                a(_tabela_md(["Cod.", "Natureza", "Base de calculo", "PIS", "COFINS"],
                             [[c["nat_bc_cred"], c["descricao"][:55],
                               brl(c["base_calculo"]), brl(c["credito_pis"]),
                               brl(c["credito_cofins"])] for c in creditos]))

    # --- Apuracao ICMS ---
    if resultado.get("icms"):
        a("## 4. Apuracao de ICMS")
        a("")
        for bloco in resultado["icms"]:
            ap = bloco["apuracao_escriturada"]["apuracao"]
            a("### Competencia %s" % bloco["identificacao"]["competencia"])
            a("")
            if ap:
                a(_tabela_md(["Item", "Valor (R$)"], [
                    ["Total de debitos", brl(ap["total_debitos"])],
                    ["Ajustes a debito", brl(ap["ajustes_debito_documento"] + ap["total_ajustes_debito"])],
                    ["Estornos de credito", brl(ap["estornos_credito"])],
                    ["Total de creditos", brl(ap["total_creditos"])],
                    ["Ajustes a credito", brl(ap["ajustes_credito_documento"] + ap["total_ajustes_credito"])],
                    ["Saldo credor anterior", brl(ap["saldo_credor_anterior"])],
                    ["**Saldo apurado**", "**%s**" % brl(ap["saldo_apurado"])],
                    ["Deducoes", brl(ap["total_deducoes"])],
                    ["**ICMS a recolher**", "**%s**" % brl(ap["icms_a_recolher"])],
                    ["Saldo credor a transportar", brl(ap["saldo_credor_a_transportar"])],
                ]))
            else:
                a("_Registro E110 nao encontrado na escrituracao._")
                a("")

            st = bloco["apuracao_escriturada"]["substituicao_tributaria"]
            if st:
                a("**Substituicao tributaria (E210)**")
                a("")
                a(_tabela_md(["Retencao", "Devolucoes", "Ressarcimentos", "ST a recolher"],
                             [[brl(s["retencao"]), brl(s["devolucoes"]),
                               brl(s["ressarcimentos"]), brl(s["icms_st_a_recolher"])]
                              for s in st]))

            difal = bloco["apuracao_escriturada"]["difal_fcp"]
            if difal:
                a("**DIFAL e FCP (E310)**")
                a("")
                a(_tabela_md(["Debito DIFAL", "DIFAL a recolher", "Debito FCP", "FCP a recolher"],
                             [[brl(d["debito_difal"]), brl(d["difal_a_recolher"]),
                               brl(d["debito_fcp"]), brl(d["fcp_a_recolher"])] for d in difal]))

            cfops = sorted(bloco["recomposicao"]["por_cfop"].values(),
                           key=lambda x: (x["sentido"], x["cfop"]))
            if cfops:
                a("**Movimento por CFOP (registros analiticos)**")
                a("")
                a(_tabela_md(["CFOP", "Natureza", "Sentido", "Docs", "Valor da operacao",
                              "Base de calculo", "ICMS", "ICMS-ST"],
                             [[c["cfop"], c["natureza"], c["sentido"], c["qtd"],
                               brl(c["valor_operacao"]), brl(c["base_calculo"]),
                               brl(c["icms"]), brl(c["icms_st"])] for c in cfops]))

            inv = bloco["apuracao_escriturada"]["inventario"]
            if inv["qtd_itens"]:
                a("Inventario declarado em %s: %d itens, R$ %s."
                  % (_data(inv["data"]), inv["qtd_itens"], brl(inv["valor"])))
                a("")

    # --- Cruzamento ---
    if resultado.get("cruzamento"):
        a("## 5. Cruzamento entre a movimentacao de produtos e o SPED")
        a("")
        cr = resultado["cruzamento"]
        res = cr["resumo"]
        a("Planilha: %s (aba %s), formato **%s**, cabecalho na linha %s."
          % (res.get("arquivo", "-"), res.get("aba", "-"),
             res.get("formato", "-"), res.get("linha_do_cabecalho", "-")))
        a("")
        if res.get("registros_por_secao"):
            a("Registros lidos por secao: %s."
              % ", ".join("%s = %d" % (k, v)
                          for k, v in sorted(res["registros_por_secao"].items())))
            a("")
        elif res.get("qtd_itens") is not None:
            a("Itens lidos: %d." % res["qtd_itens"])
            a("")
        if cr.get("totais"):
            t = cr["totais"]
            a("**Confronto de totais entre a planilha e o SPED**")
            a("")
            linhas_t = []
            for secao in ("entrada", "saida"):
                d = t.get(secao)
                if not d:
                    continue
                linhas_t.append([
                    secao.upper(),
                    "%d / %d" % (d["docs_planilha"], d["docs_sped"]),
                    brl(d["planilha_valor"]), brl(d["sped_valor"]),
                    brl(d["planilha_valor"] - d["sped_valor"]),
                    brl(d["planilha_tributo"]), brl(d["sped_tributo"]),
                ])
            a(_tabela_md(["Secao", "Docs planilha / SPED", "Valor planilha",
                          "Valor SPED", "Diferenca", "PIS+COFINS planilha",
                          "PIS+COFINS SPED"], linhas_t))
            a("Itens comparados par a par: %d." % t.get("itens_comparados", 0))
            a("")
        a("Colunas reconhecidas: %s"
          % ("; ".join("%s -> %s" % (k, v)
                       for k, v in res.get("colunas_reconhecidas", {}).items()) or "-"))
        a("")
        for aviso in res.get("avisos", []):
            a("- ATENCAO: %s" % aviso)
        if res.get("avisos"):
            a("")
        destaques = [l for l in cr["comparativo"]
                     if abs(l["diferenca_saidas"]) > 0 or abs(l["diferenca_entradas"]) > 0]
        destaques.sort(key=lambda l: -abs(l["diferenca_saidas"]))
        if destaques:
            a("**Itens com divergencia (20 maiores por diferenca de saida)**")
            a("")
            a(_tabela_md(["Codigo", "Descricao", "Saidas planilha", "Saidas SPED",
                          "Dif. saidas", "Entradas planilha", "Entradas SPED",
                          "Dif. entradas", "Preco medio"],
                         [[l["codigo"], (l["descricao"] or "")[:35],
                           qtd(l["saidas_planilha"]), qtd(l["saidas_sped"]),
                           qtd(l["diferenca_saidas"]), qtd(l["entradas_planilha"]),
                           qtd(l["entradas_sped"]), qtd(l["diferenca_entradas"]),
                           brl(l["preco_medio_sped"])] for l in destaques[:20]]))
        else:
            a("Nenhuma divergencia de quantidade acima da tolerancia.")
            a("")

    # --- Achados ---
    a("## 6. Achados e consideracoes tributarias")
    a("")
    if not achados:
        a("Nenhuma inconsistencia identificada pelos testes aplicados.")
        a("")
    for item in achados:
        a("### [%s] %s" % (item.codigo, item.titulo))
        a("")
        a("| | |")
        a("|---|---|")
        a("| Severidade | **%s** |" % item.severidade)
        a("| Tributo | %s |" % item.tributo)
        a("| Ocorrencias | %d |" % item.quantidade)
        a("| %s | R$ %s (%s) |" % (item.natureza_valor, brl(item.valor),
                                            item.sentido or "-"))
        a("")
        a("**O que foi encontrado.** %s" % item.descricao)
        a("")
        if item.base_legal:
            a("**Fundamento.** %s" % item.base_legal)
            a("")
        if item.recomendacao:
            a("**Encaminhamento.** %s" % item.recomendacao)
            a("")
        if item.amostras:
            a("Amostras:")
            a("")
            for amostra in item.amostras:
                valor = " - R$ %s" % brl(amostra["valor"]) if amostra["valor"] else ""
                a("- `%s`%s%s" % (amostra["ref"], valor,
                                  " - %s" % amostra["obs"] if amostra["obs"] else ""))
            if item.quantidade > len(item.amostras):
                a("- ... e mais %d ocorrencia(s), na aba de detalhamento da planilha."
                  % (item.quantidade - len(item.amostras)))
            a("")

    # --- Ressalvas ---
    a("## 7. Ressalvas")
    a("")
    for ressalva in resultado.get("ressalvas", []):
        a("- %s" % ressalva)
    a("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Planilha de trabalho
# ---------------------------------------------------------------------------
def montar_xlsx(resultado, caminho):
    abas = []
    achados = ordenar_achados(resultado["achados"])
    totais = totais_por_sentido(achados)
    ident = resultado["identificacao"]

    abas.append(("Resumo", ["Campo", "Conteudo"], [
        ["Empresa", ident.get("nome", "")],
        ["CNPJ", ident.get("cnpj", "")],
        ["UF", ident.get("uf", "")],
        ["Competencias", ", ".join(ident.get("competencias", []))],
        ["Arquivos SPED", ", ".join(ident.get("arquivos", []))],
        ["Planilha de movimentacao", ident.get("movimentacao", "")],
        ["Potencial a recuperar (R$)", totais["RECUPERAR"]],
        ["Potencial a recolher (R$)", totais["RECOLHER"]],
        ["Achados de alta severidade", sum(1 for x in achados if x.severidade == SEV_ALTA)],
        ["Total de achados", len(achados)],
    ]))

    def _estabs(achado):
        vistos = []
        for d in achado.detalhes:
            cod = (d.get("linha") or {}).get("estabelecimento", "")
            if cod and cod not in vistos:
                vistos.append(cod)
        return ", ".join(sorted(vistos, key=lambda x: (len(x), x))) or "-"

    abas.append(("Achados",
                 ["Codigo", "Titulo", "Severidade", "Tributo", "Competencia",
                  "Ocorrencias", "Valor (R$)", "O que o valor mede", "Sentido",
                  "Estabelecimentos", "Descricao", "Fundamento", "Encaminhamento"],
                 [[a.codigo, a.titulo, a.severidade, a.tributo, a.competencia,
                   a.quantidade, a.valor, a.natureza_valor, a.sentido, _estabs(a),
                   a.descricao, a.base_legal, a.recomendacao] for a in achados]))

    detalhes = []
    for a in achados:
        for d in a.detalhes:
            linha = d.get("linha") or {}
            # achados sem linha fiscal (consolidacao, retencao) pertencem ao
            # declarante da escrituracao
            cnpj_est = linha.get("cnpj_estabelecimento") or a.cnpj
            detalhes.append([
                a.codigo, a.severidade, a.competencia,
                formata_cnpj(cnpj_est), tipo_estabelecimento(cnpj_est),
                linha.get("estabelecimento", ""), linha.get("uf_estabelecimento", ""),
                d["ref"], d["valor"], d["obs"],
                linha.get("origem", ""), linha.get("doc", ""), linha.get("data", ""),
                linha.get("cod_item", ""), linha.get("ncm", ""), linha.get("cfop", ""),
                linha.get("cst_pis", ""), linha.get("cst_cofins", ""),
                linha.get("cst_icms", ""), linha.get("vl_item", ""),
                linha.get("vl_pis", ""), linha.get("vl_cofins", ""),
                linha.get("vl_icms", ""), linha.get("arquivo", ""),
            ])
    abas.append(("Detalhe dos achados",
                 ["Achado", "Severidade", "Competencia",
                  "CNPJ do estabelecimento", "Matriz/Filial", "Cod. estab.", "UF",
                  "Referencia", "Valor (R$)",
                  "Observacao", "Registro", "Documento", "Data", "Cod. item", "NCM",
                  "CFOP", "CST PIS", "CST COFINS", "CST ICMS", "Valor do item",
                  "PIS", "COFINS", "ICMS", "Arquivo"],
                 detalhes))

    for bloco in resultado.get("pis_cofins", []):
        comp = bloco["identificacao"]["competencia"]
        linhas = []
        for tributo in ("pis", "cofins"):
            c = bloco["apuracao_escriturada"][tributo]["consolidacao"]
            if not c:
                continue
            for rotulo, valor in c.items():
                linhas.append([comp, tributo.upper(), rotulo.replace("_", " "), valor])
        if linhas:
            abas.append(("Apuracao PIS-COFINS %s" % comp,
                         ["Competencia", "Tributo", "Item", "Valor (R$)"], linhas))
        saidas = sorted(bloco["recomposicao"]["por_cst_saida"].values(), key=lambda x: x["cst"])
        entradas = sorted(bloco["recomposicao"]["por_cst_entrada"].values(), key=lambda x: x["cst"])
        linhas_cst = [[comp, "SAIDA", s["cst"], s["descricao"], s["qtd"],
                       s["valor_operacao"], s["bc_pis"], s["vl_pis"],
                       s["bc_cofins"], s["vl_cofins"]] for s in saidas]
        linhas_cst += [[comp, "ENTRADA", e["cst"], e["descricao"], e["qtd"],
                        e["valor_operacao"], e["bc_pis"], e["vl_pis"],
                        e["bc_cofins"], e["vl_cofins"]] for e in entradas]
        if linhas_cst:
            abas.append(("CST PIS-COFINS %s" % comp,
                         ["Competencia", "Sentido", "CST", "Descricao", "Itens",
                          "Valor da operacao", "BC PIS", "PIS", "BC COFINS", "COFINS"],
                         linhas_cst))

    for bloco in resultado.get("icms", []):
        comp = bloco["identificacao"]["competencia"]
        ap = bloco["apuracao_escriturada"]["apuracao"]
        if ap:
            abas.append(("Apuracao ICMS %s" % comp, ["Item", "Valor (R$)"],
                         [[k.replace("_", " "), v] for k, v in ap.items()]))
        cfops = sorted(bloco["recomposicao"]["por_cfop"].values(),
                       key=lambda x: (x["sentido"], x["cfop"]))
        if cfops:
            abas.append(("ICMS por CFOP %s" % comp,
                         ["CFOP", "Natureza", "Sentido", "Docs", "Valor da operacao",
                          "Base de calculo", "ICMS", "ICMS-ST"],
                         [[c["cfop"], c["natureza"], c["sentido"], c["qtd"],
                           c["valor_operacao"], c["base_calculo"], c["icms"],
                           c["icms_st"]] for c in cfops]))

    if resultado.get("cruzamento"):
        comparativo = resultado["cruzamento"]["comparativo"]
        colunas = ["codigo", "descricao", "ncm", "unidade_planilha", "unidade_sped",
                   "estoque_inicial", "entradas_planilha", "entradas_sped",
                   "diferenca_entradas", "saidas_planilha", "saidas_sped",
                   "diferenca_saidas", "estoque_final_planilha",
                   "estoque_final_calculado", "divergencia_saldo_planilha",
                   "estoque_final_inventario_h010", "diferenca_inventario",
                   "preco_medio_sped"]
        titulos = [c.replace("_", " ").capitalize() for c in colunas]
        abas.append(("Cruzamento estoque", titulos,
                     [[l.get(c, "") for c in colunas] for l in comparativo]))

    return xlsx.escrever(caminho, abas)


def gravar(resultado, diretorio, prefixo="analise"):
    os.makedirs(diretorio, exist_ok=True)
    caminho_md = os.path.join(diretorio, "%s.md" % prefixo)
    with io.open(caminho_md, "w", encoding="utf-8") as fh:
        fh.write(montar_markdown(resultado))
    caminho_xlsx = os.path.join(diretorio, "%s.xlsx" % prefixo)
    montar_xlsx(resultado, caminho_xlsx)
    return {"markdown": caminho_md, "xlsx": caminho_xlsx}

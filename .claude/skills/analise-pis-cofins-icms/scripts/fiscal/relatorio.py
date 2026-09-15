# -*- coding: utf-8 -*-
"""Geracao dos entregaveis: relatorio em Markdown e planilha de trabalho em .xlsx."""
from __future__ import annotations

import io
import os
from decimal import Decimal

from . import tabelas, xlsx
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
    totais = {"RECUPERAR": ZERO, "RECOLHER": ZERO, "AJUSTAR": ZERO}
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

    a("## 1. Sintese")
    a("")
    a("| Indicador | Valor (R$) |")
    a("|---|---|")
    a("| Potencial a **recuperar** | %s |" % brl(totais["RECUPERAR"]))
    a("| Potencial a **recolher** (exposicao) | %s |" % brl(totais["RECOLHER"]))
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
        a("## 2. Apuracao de PIS/COFINS")
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
            a(_tabela_md(["Tributo", "Nao cum. do periodo", "Creditos descontados",
                          "Nao cum. devida", "Cumulativa do periodo", "Retencoes",
                          "Total a recolher"], linhas))

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
        a("## 3. Apuracao de ICMS")
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
        a("## 4. Cruzamento entre a movimentacao de produtos e o SPED")
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
    a("## 5. Achados e consideracoes tributarias")
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
    a("## 6. Ressalvas")
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

    abas.append(("Achados",
                 ["Codigo", "Titulo", "Severidade", "Tributo", "Competencia",
                  "Ocorrencias", "Valor (R$)", "O que o valor mede", "Sentido",
                  "Descricao", "Fundamento", "Encaminhamento"],
                 [[a.codigo, a.titulo, a.severidade, a.tributo, a.competencia,
                   a.quantidade, a.valor, a.natureza_valor, a.sentido, a.descricao,
                   a.base_legal, a.recomendacao] for a in achados]))

    detalhes = []
    for a in achados:
        for d in a.detalhes:
            linha = d.get("linha") or {}
            detalhes.append([
                a.codigo, a.severidade, a.competencia, d["ref"], d["valor"], d["obs"],
                linha.get("origem", ""), linha.get("doc", ""), linha.get("data", ""),
                linha.get("cod_item", ""), linha.get("ncm", ""), linha.get("cfop", ""),
                linha.get("cst_pis", ""), linha.get("cst_cofins", ""),
                linha.get("cst_icms", ""), linha.get("vl_item", ""),
                linha.get("vl_pis", ""), linha.get("vl_cofins", ""),
                linha.get("vl_icms", ""), linha.get("arquivo", ""),
            ])
    abas.append(("Detalhe dos achados",
                 ["Achado", "Severidade", "Competencia", "Referencia", "Valor (R$)",
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

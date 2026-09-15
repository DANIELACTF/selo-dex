#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Analise de PIS/COFINS e ICMS a partir de arquivos SPED e da planilha de movimentacao.

Uso tipico:
    python3 analisar.py --sped ./arquivos --movimentacao ./movimentacao.xlsx --saida ./resultado

Sem dependencias externas: roda com Python 3.8+ puro.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from decimal import Decimal

_AQUI = os.path.dirname(os.path.abspath(__file__))
if _AQUI not in sys.path:
    sys.path.insert(0, _AQUI)

from fiscal import analise_icms, analise_pis_cofins, cruzamento, ncm, parser, relatorio
from fiscal.extracao import extrair_linhas
from fiscal.modelo import ordenar_achados, SEV_ALTA, ZERO
from fiscal import movimentacao_analitica
from fiscal.planilha import ler_grade, ler_movimentacao

EXTENSOES_SPED = (".txt", ".sped", ".efd", ".dat")

RESSALVAS = [
    "Os valores apontados sao estimativas calculadas sobre o que consta nos arquivos "
    "entregues. Eles servem para dimensionar e priorizar o trabalho, nao para embasar "
    "diretamente PER/DCOMP, retificacao ou provisao contabil.",
    "O enquadramento de NCM em regime monofasico, aliquota zero ou substituicao tributaria "
    "foi verificado contra a tabela de apoio da skill (assets/ncm_regimes.csv), que e um "
    "ponto de partida curado e nao uma fonte oficial. Cada NCM apontado precisa ser "
    "confirmado na legislacao vigente na competencia analisada antes de qualquer medida.",
    "Teses judiciais (exclusao do ICMS-ST da base, creditamento sobre o ICMS-ST, creditos "
    "presumidos de ICMS) sao sinalizadas como oportunidade, com o status processual a "
    "confirmar na data do trabalho. Nao aproveite credito com base em tese sem decisao "
    "transitada em julgado favoravel ao proprio contribuinte ou orientacao formal da RFB.",
    "A analise cobre o que esta escriturado. Operacoes nao escrituradas so aparecem pelo "
    "cruzamento com a movimentacao fisica, e apenas para os itens presentes na planilha.",
    "O direito de repetir indebito tributario prescreve em 5 anos (CTN art. 168). Verifique "
    "o alcance das competencias antes de dimensionar a recuperacao.",
    "Transicao da reforma tributaria: em 2026 CBS e IBS convivem com PIS/COFINS e ICMS "
    "(EC 132/2023 e LC 214/2025). Confirme as regras de compensacao da fase de transicao "
    "vigentes na competencia antes de concluir a apuracao do periodo.",
]


def coletar_arquivos(caminhos):
    arquivos = []
    for caminho in caminhos:
        if os.path.isdir(caminho):
            for raiz, _, nomes in os.walk(caminho):
                for nome in sorted(nomes):
                    if nome.lower().endswith(EXTENSOES_SPED):
                        arquivos.append(os.path.join(raiz, nome))
        elif os.path.isfile(caminho):
            arquivos.append(caminho)
        else:
            print("AVISO: caminho nao encontrado, ignorado: %s" % caminho, file=sys.stderr)
    return arquivos


def _json_pronto(obj):
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _json_pronto(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, (list, tuple)):
        return [_json_pronto(v) for v in obj]
    if isinstance(obj, set):
        return sorted(str(v) for v in obj)
    if hasattr(obj, "como_dict"):
        return _json_pronto(obj.como_dict())
    return obj


def executar(args):
    arquivos = coletar_arquivos(args.sped)
    if not arquivos:
        raise SystemExit("Nenhum arquivo SPED encontrado em: %s" % ", ".join(args.sped))

    tabela = ncm.carregar(args.tabela_ncm) if args.tabela_ncm else ncm.carregar()
    if args.tabela_ncm_extra:
        ncm.mesclar(tabela, args.tabela_ncm_extra)

    escrituracoes_icms, escrituracoes_contrib, desconhecidas = parser.parse_varios(arquivos)
    print("Arquivos lidos: %d EFD ICMS/IPI, %d EFD-Contribuicoes, %d nao identificados."
          % (len(escrituracoes_icms), len(escrituracoes_contrib), len(desconhecidas)))

    resultado = {
        "identificacao": {},
        "pis_cofins": [],
        "icms": [],
        "cruzamento": None,
        "achados": [],
        "ressalvas": list(RESSALVAS),
    }

    nomes, cnpjs, ufs, competencias = [], [], [], []
    linhas_por_item = {}
    inventario = {}
    todas_as_linhas = []

    for esc in escrituracoes_contrib:
        linhas = extrair_linhas(esc)
        todas_as_linhas.extend(linhas)
        bloco = analise_pis_cofins.analisar(esc, tabela, linhas)
        resultado["pis_cofins"].append(bloco)
        resultado["achados"].extend(bloco["achados"])
        nomes.append(esc.nome); cnpjs.append(esc.cnpj); ufs.append(esc.uf)
        competencias.append(esc.competencia)
        for aviso in esc.avisos:
            resultado["ressalvas"].append("%s: %s" % (esc.arquivo, aviso))

    for esc in escrituracoes_icms:
        linhas = extrair_linhas(esc)
        todas_as_linhas.extend(linhas)
        bloco = analise_icms.analisar(esc, linhas)
        resultado["icms"].append(bloco)
        resultado["achados"].extend(bloco["achados"])
        nomes.append(esc.nome); cnpjs.append(esc.cnpj); ufs.append(esc.uf)
        competencias.append(esc.competencia)
        cruzamento.mesclar_itens(linhas_por_item, cruzamento.agregar_por_item(linhas))
        inventario.update(cruzamento.inventario_por_item(esc))
        for aviso in esc.avisos:
            resultado["ressalvas"].append("%s: %s" % (esc.arquivo, aviso))

    # A EFD-Contribuicoes tambem tem C170 com quantidade: serve de fonte se nao houver EFD fiscal
    if not linhas_por_item:
        for esc in escrituracoes_contrib:
            cruzamento.mesclar_itens(
                linhas_por_item, cruzamento.agregar_por_item(extrair_linhas(esc)))

    for esc in desconhecidas:
        resultado["ressalvas"].append(
            "Arquivo %s nao foi identificado como EFD ICMS/IPI nem EFD-Contribuicoes e ficou "
            "fora da analise." % esc.arquivo)

    if args.movimentacao:
        ctx = {"competencia": ", ".join(sorted(set(c for c in competencias if c))),
               "cnpj": cnpjs[0] if cnpjs else ""}
        nome_aba, grade = ler_grade(args.movimentacao, args.aba)
        # dois formatos de planilha no mercado: saldo de estoque (EI + E - S = EF) e
        # relatorio analitico por documento fiscal. O segundo permite conferir a
        # escrituracao item a item, entao e usado quando reconhecido.
        if movimentacao_analitica.detectar(grade):
            registros, diagnostico = movimentacao_analitica.ler(grade)
            mapa_est = {}
            for esc in escrituracoes_contrib + escrituracoes_icms:
                for cnpj, dados in esc.estabelecimentos.items():
                    if dados.get("cod_est"):
                        mapa_est[dados["cod_est"]] = {"cnpj": cnpj, "uf": dados.get("uf", "")}
            cruz = movimentacao_analitica.cruzar(registros, todas_as_linhas, ctx, mapa_est)
            diagnostico.update({"arquivo": os.path.basename(args.movimentacao),
                                "aba": nome_aba, "formato": "analitica por documento"})
            resultado["cruzamento"] = {"resumo": diagnostico,
                                       "comparativo": [],
                                       "totais": cruz["resumo"]}
            resultado["achados"].extend(cruz["achados"])
        else:
            mov = ler_movimentacao(args.movimentacao, args.aba)
            cruz = cruzamento.cruzar(mov, linhas_por_item, inventario, ctx)
            resumo = mov.resumo()
            resumo["formato"] = "saldo de estoque"
            resultado["cruzamento"] = {"resumo": resumo,
                                       "comparativo": cruz["comparativo"]}
            resultado["achados"].extend(cruz["achados"])
            if not linhas_por_item:
                resultado["ressalvas"].append(
                    "O cruzamento rodou sem quantidades do SPED: nenhum registro C170 com "
                    "quantidade foi encontrado. Confira se os arquivos entregues incluem a "
                    "EFD ICMS/IPI ou uma EFD-Contribuicoes escriturada por item.")
    else:
        resultado["ressalvas"].append(
            "Planilha de movimentacao nao fornecida: o cruzamento entre estoque fisico e "
            "documentos fiscais nao foi executado, entao omissao de receita por saida sem "
            "nota nao foi testada.")

    resultado["identificacao"] = {
        "nome": next((n for n in nomes if n), ""),
        "cnpj": next((c for c in cnpjs if c), ""),
        "uf": next((u for u in ufs if u), ""),
        "competencias": sorted(set(c for c in competencias if c)),
        "arquivos": [os.path.basename(a) for a in arquivos],
        "movimentacao": os.path.basename(args.movimentacao) if args.movimentacao else "",
    }

    if len(set(c for c in cnpjs if c)) > 1:
        resultado["ressalvas"].append(
            "Os arquivos entregues pertencem a mais de um CNPJ (%s). Os totais do relatorio "
            "estao somados - separe por estabelecimento se a analise for por filial."
            % ", ".join(sorted(set(c for c in cnpjs if c))))

    saidas = relatorio.gravar(resultado, args.saida, args.prefixo)
    if args.json:
        caminho_json = os.path.join(args.saida, "%s.json" % args.prefixo)
        with open(caminho_json, "w", encoding="utf-8") as fh:
            json.dump(_json_pronto(resultado), fh, ensure_ascii=False, indent=2)
        saidas["json"] = caminho_json

    achados = ordenar_achados(resultado["achados"])
    totais = relatorio.totais_por_sentido(achados)
    print("")
    print("Empresa: %s  CNPJ: %s  Competencias: %s"
          % (resultado["identificacao"]["nome"] or "-",
             resultado["identificacao"]["cnpj"] or "-",
             ", ".join(resultado["identificacao"]["competencias"]) or "-"))
    print("Achados: %d (alta severidade: %d)"
          % (len(achados), sum(1 for a in achados if a.severidade == SEV_ALTA)))
    print("Potencial a recuperar: R$ %s" % relatorio.brl(totais["RECUPERAR"]))
    print("Potencial a recolher:  R$ %s" % relatorio.brl(totais["RECOLHER"]))
    print("")
    for a in achados[:15]:
        marca = "" if a.natureza_valor == relatorio.NATUREZA_TRIBUTARIA else " (*)"
        print("  [%s] %-8s %-58s %3d ocorr.  R$ %s%s"
              % (a.severidade[:1], a.codigo, a.titulo[:58], a.quantidade,
                 relatorio.brl(a.valor), marca))
    if any(a.natureza_valor != relatorio.NATUREZA_TRIBUTARIA and a.valor for a in achados):
        print("  (*) valor de estoque/mercadoria, nao somado aos totais tributarios.")
    print("")
    for rotulo, caminho in saidas.items():
        print("%-9s -> %s" % (rotulo, caminho))
    return resultado


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Apuracao e auditoria de PIS/COFINS e ICMS a partir do SPED.")
    ap.add_argument("--sped", nargs="+", required=True,
                    help="arquivos SPED ou diretorios com eles (EFD ICMS/IPI e/ou EFD-Contribuicoes)")
    ap.add_argument("--movimentacao", help="planilha de movimentacao de produtos (.xlsx ou .csv)")
    ap.add_argument("--aba", help="nome da aba da planilha (padrao: a primeira)")
    ap.add_argument("--saida", default="./resultado", help="diretorio de saida")
    ap.add_argument("--prefixo", default="analise", help="prefixo dos arquivos gerados")
    ap.add_argument("--tabela-ncm", help="CSV de regimes por NCM substituindo o padrao")
    ap.add_argument("--tabela-ncm-extra", help="CSV adicional que complementa/sobrepoe o padrao")
    ap.add_argument("--json", action="store_true", help="grava tambem o resultado em JSON")
    args = ap.parse_args(argv)
    executar(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())

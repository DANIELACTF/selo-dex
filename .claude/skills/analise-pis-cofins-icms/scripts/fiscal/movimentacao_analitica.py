# -*- coding: utf-8 -*-
"""Cruzamento com planilhas de movimentacao ANALITICA (uma linha por item de documento).

Muitos sistemas contabeis exportam a movimentacao de produtos como um relatorio
por documento fiscal - com secoes de Entradas, Saidas e Servicos, e blocos de
colunas por tributo - e nao como um saldo de estoque. Esse formato permite um
cruzamento mais forte que o de saldo: confere, item a item, se o que foi
escriturado no SPED e o mesmo que o sistema do cliente registrou.
"""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from .modelo import Achado, SEV_ALTA, SEV_MEDIA, SEV_BAIXA, ZERO
from .parser import to_decimal
from .planilha import normalizar

CENTAVO = Decimal("0.01")
TOL = Decimal("0.02")

SECOES = {"entradas": "ENTRADA", "entrada": "ENTRADA", "compras": "ENTRADA",
          "saidas": "SAIDA", "saida": "SAIDA", "vendas": "SAIDA",
          "servicos": "SERVICO", "servico": "SERVICO"}

COLUNAS_DETALHE = {
    "filial": "filial", "estabelecimento": "filial", "loja": "filial",
    "codigo": "sequencia", "cod": "sequencia",
    "numero": "documento", "num": "documento", "nota": "documento",
    "nf": "documento", "documento": "documento", "num doc": "documento",
    "data": "data", "dt": "data", "data emissao": "data",
    "produto": "produto", "item": "produto", "descricao": "produto",
    "cfop": "cfop", "ncm": "ncm", "qtde": "quantidade", "qtd": "quantidade",
    "quantidade": "quantidade",
    "r unit": "valor_unitario", "r unitario": "valor_unitario",
    "r produto": "valor", "valor": "valor", "r total": "valor",
}
TRIBUTOS = {"icms": "icms", "pis": "pis", "cofins": "cofins",
            "icms st": "icms_st", "st": "icms_st", "ipi": "ipi"}


def _norm_num(codigo):
    """Normaliza codigo de produto ignorando zeros a esquerda ('001-38' == '1-38')."""
    return str(codigo).strip().lstrip("0") or "0"


def _cabecalho_detalhe(grade, limite=40):
    """Acha a linha de cabecalho do detalhe e a linha de grupos de tributo acima."""
    melhor, melhor_n = None, 0
    for i, linha in enumerate(grade[:limite]):
        rotulos = {normalizar(c) for c in linha if str(c).strip()}
        n = len(rotulos & {"produto", "cfop", "ncm", "qtde", "r unit", "r produto",
                           "numero", "data"})
        if n > melhor_n:
            melhor, melhor_n = i, n
    if melhor is None or melhor_n < 4:
        return None, None
    grupos = None
    for j in range(max(0, melhor - 3), melhor):
        rotulos = {normalizar(c) for c in grade[j] if str(c).strip()}
        if len(rotulos & set(TRIBUTOS)) >= 2:
            grupos = j
    return melhor, grupos


def _mapear(grade, linha_cab, linha_grupos):
    """Mapeia indice de coluna -> campo.

    O relatorio repete 'R$ Base', 'Aliq.' e 'CST' em cada bloco de tributo, e alguns
    sistemas ainda erram o rotulo das ultimas colunas de valor (repetem 'R$ COFINS'
    para ICMS ST e IPI). Por isso a ancora e a coluna de VALOR com rotulo distintivo
    ('R$ ICMS', 'R$ PIS', 'R$ COFINS'), tomada na primeira ocorrencia de cada: base e
    aliquota sao as mais proximas a esquerda e o CST o mais proximo a direita.
    """
    cabecalho = [normalizar(c) for c in grade[linha_cab]]
    mapa = {}
    for j, chave in enumerate(cabecalho):
        if chave in COLUNAS_DETALHE:
            mapa[j] = COLUNAS_DETALHE[chave]

    ancoras = {}
    for tributo, rotulo in (("icms", "r icms"), ("pis", "r pis"), ("cofins", "r cofins"),
                            ("icms_st", "r icms st"), ("ipi", "r ipi")):
        for j, chave in enumerate(cabecalho):
            if chave == rotulo and j not in ancoras.values():
                ancoras[tributo] = j
                break

    ordenadas = sorted(ancoras.items(), key=lambda x: x[1])
    for k, (tributo, col_valor) in enumerate(ordenadas):
        anterior = ordenadas[k - 1][1] if k else -1
        proximo = ordenadas[k + 1][1] if k + 1 < len(ordenadas) else len(cabecalho)
        mapa[col_valor] = "%s_valor" % tributo
        for j in range(col_valor - 1, anterior, -1):
            if j in mapa or not cabecalho[j]:
                continue
            if cabecalho[j].startswith("r base") or cabecalho[j] == "base":
                mapa.setdefault(j, "%s_base" % tributo)
                break
        for j in range(col_valor - 1, anterior, -1):
            if j in mapa or not cabecalho[j]:
                continue
            if cabecalho[j].startswith("aliq"):
                mapa.setdefault(j, "%s_aliquota" % tributo)
                break
        for j in range(col_valor + 1, proximo):
            if j in mapa or not cabecalho[j]:
                continue
            if cabecalho[j] == "cst":
                mapa.setdefault(j, "%s_cst" % tributo)
                break
    return mapa


class Registro(object):
    __slots__ = ("secao", "filial", "documento", "data", "codigo", "descricao",
                 "cfop", "ncm", "quantidade", "valor", "linha",
                 "cnpj_estabelecimento", "uf_estabelecimento",
                 "pis_cst", "pis_base", "pis_valor",
                 "cofins_cst", "cofins_base", "cofins_valor",
                 "icms_cst", "icms_base", "icms_valor", "icms_st_valor")

    def __init__(self, **kw):
        for c in self.__slots__:
            setattr(self, c, kw.get(c))
        for c in ("quantidade", "valor", "pis_base", "pis_valor", "cofins_base",
                  "cofins_valor", "icms_base", "icms_valor", "icms_st_valor"):
            if getattr(self, c) is None:
                setattr(self, c, ZERO)
        for c in ("secao", "filial", "documento", "data", "codigo", "descricao",
                  "cfop", "ncm", "pis_cst", "cofins_cst", "icms_cst",
                  "cnpj_estabelecimento", "uf_estabelecimento"):
            if getattr(self, c) is None:
                setattr(self, c, "")

    @property
    def chave(self):
        return (self.documento, _norm_num(self.codigo))

    @property
    def estabelecimento(self):
        return self.filial

    def como_dict(self):
        dados = {c: getattr(self, c) for c in self.__slots__}
        # "estabelecimento" e propriedade, nao slot: sem isso o relatorio perde
        # o codigo da filial nas linhas vindas da planilha
        dados["estabelecimento"] = self.filial
        return dados

    def ref(self):
        return "est. %s | doc %s | %s" % (self.filial, self.documento,
                                          (self.descricao or self.codigo)[:40])


def detectar(grade):
    linha_cab, _ = _cabecalho_detalhe(grade)
    return linha_cab is not None


def ler(grade):
    """Converte a grade em registros por secao. Devolve (registros, diagnostico)."""
    linha_cab, linha_grupos = _cabecalho_detalhe(grade)
    if linha_cab is None:
        raise ValueError("planilha nao reconhecida como movimentacao analitica")
    mapa = _mapear(grade, linha_cab, linha_grupos)

    registros = []
    secao = "ENTRADA"
    for i, linha in enumerate(grade):
        primeira = str(linha[0]).strip() if linha else ""
        rotulo = normalizar(primeira)
        if rotulo in SECOES and not primeira.isdigit():
            secao = SECOES[rotulo]
            continue
        if not primeira or not primeira.replace(".", "").isdigit():
            continue
        dados = {"secao": secao, "linha": i + 1}
        for j, campo in mapa.items():
            bruto = linha[j] if j < len(linha) else ""
            if campo in ("quantidade", "valor", "valor_unitario") or campo.endswith(
                    ("_base", "_valor", "_aliquota")):
                dados[campo] = to_decimal(bruto)
            else:
                dados[campo] = str(bruto).strip()
        produto = dados.pop("produto", "") or ""
        if " - " in produto:
            cod, descr = produto.split(" - ", 1)
            dados["codigo"], dados["descricao"] = cod.strip(), descr.strip()
        else:
            dados["codigo"] = dados.get("codigo") or produto.strip()
            dados["descricao"] = produto.strip()
        dados.pop("sequencia", None)
        dados.pop("valor_unitario", None)
        for k in list(dados):
            if k.endswith("_aliquota") or k not in Registro.__slots__:
                dados.pop(k, None)
        registros.append(Registro(**dados))

    diagnostico = {
        "linha_do_cabecalho": linha_cab + 1,
        # o cabecalho repete rotulos ("R$ Base", "CST"), entao o diagnostico traz a
        # coluna junto do rotulo - sem isso nao da para conferir o mapeamento
        "colunas_reconhecidas": dict(
            ("col %d (%s)" % (j, str(grade[linha_cab][j]).strip() or "-"), campo)
            for j, campo in sorted(mapa.items())
        ),
        "registros_por_secao": dict(
            (s, sum(1 for r in registros if r.secao == s))
            for s in sorted({r.secao for r in registros})),
    }
    return registros, diagnostico


def cruzar(registros, linhas_sped, ctx=None, estabelecimentos=None):
    """Confronta a planilha analitica com as linhas extraidas do SPED."""
    ctx = ctx or {}
    # {cod_est: {cnpj, uf}} - permite dizer a qual CNPJ pertence cada achado,
    # aproveitando a coluna Filial que a planilha analitica ja traz
    estabelecimentos = estabelecimentos or {}

    def _identificar(registro):
        dados = estabelecimentos.get(str(registro.filial).strip(), {})
        registro.cnpj_estabelecimento = dados.get("cnpj", "")
        registro.uf_estabelecimento = dados.get("uf", "")
        return registro

    def novo(codigo, titulo, sev, descricao, base_legal, recomendacao, sentido,
             natureza="Efeito tributario estimado"):
        a = Achado(codigo, titulo, sev, "PIS/COFINS", descricao, base_legal,
                   recomendacao, ctx.get("competencia", ""), ctx.get("cnpj", ""),
                   natureza)
        a.sentido = sentido
        return a

    ma01 = novo("MA-01", "Documento do sistema do cliente ausente da escrituracao",
                SEV_ALTA,
                "Documentos que aparecem na movimentacao do cliente com credito de "
                "PIS/COFINS destacado e que nao foram localizados na EFD-Contribuicoes. "
                "Se o credito era devido, ele foi perdido na competencia.",
                "Lei 10.637/2002 art. 3; Lei 10.833/2003 art. 3; "
                "Guia Pratico da EFD-Contribuicoes",
                "Verificar se o documento gera credito. Havendo direito, escriturar e "
                "retificar a competencia.",
                "RECUPERAR")

    ma02 = novo("MA-02", "Documento do sistema do cliente fora da escrituracao, sem "
                "credito destacado", SEV_BAIXA,
                "Documentos que constam da movimentacao do cliente e nao foram "
                "localizados na EFD-Contribuicoes, sem PIS/COFINS destacado na planilha. "
                "Em regra sao operacoes que nao geram credito (comodato, uso e consumo, "
                "outras entradas) e cuja ausencia na escrituracao e esperada.",
                "Guia Pratico da EFD-Contribuicoes - escrituracao das aquisicoes",
                "Conferir por amostragem se realmente nao ha direito a credito. "
                "Nao e apontamento por si so.",
                "", "Valor da operacao")

    ma05 = novo("MA-05", "Documento escriturado e ausente do sistema do cliente",
                SEV_MEDIA,
                "Documentos presentes na EFD-Contribuicoes que nao constam do relatorio "
                "de movimentacao do cliente - escrituracao sem lastro no sistema de origem.",
                "Consistencia entre a escrituracao fiscal e o sistema de origem",
                "Confirmar a origem do documento e a integridade do relatorio extraido "
                "antes de concluir por escrituracao indevida.",
                "AJUSTAR", "Valor da operacao")

    ma03 = novo("MA-03", "Divergencia de valor ou de tributo entre planilha e SPED",
                SEV_ALTA,
                "Itens em que o valor da operacao ou o PIS/COFINS destacado difere "
                "entre o relatorio do cliente e a escrituracao.",
                "Guia Pratico da EFD-Contribuicoes - registros C100/C170",
                "Identificar qual das duas fontes esta correta e corrigir a outra.",
                "AJUSTAR")

    ma04 = novo("MA-04", "Divergencia de CST entre planilha e SPED", SEV_ALTA,
                "Itens escriturados com CST de PIS/COFINS diferente do que consta no "
                "sistema de origem.",
                "Tabelas I e II do ADE Cofis",
                "Uniformizar o cadastro fiscal do produto nas duas pontas.",
                "AJUSTAR", "Diferenca de tributo")

    # indices do SPED
    sped = defaultdict(lambda: {"valor": ZERO, "pis": ZERO, "cofins": ZERO,
                                "cst_pis": "", "linhas": 0})
    docs_sped = {"ENTRADA": set(), "SAIDA": set()}
    docs_sped_qualquer = set()
    for l in linhas_sped:
        if not l.doc:
            continue
        sentido = "ENTRADA" if l.eh_entrada else "SAIDA" if l.eh_saida else None
        if sentido is None:
            continue
        docs_sped[sentido].add(l.doc)
        docs_sped_qualquer.add(l.doc)
        if l.cod_item:
            d = sped[(sentido, l.doc, _norm_num(l.cod_item))]
            d["valor"] += l.vl_item - l.vl_desc
            d["pis"] += l.vl_pis
            d["cofins"] += l.vl_cofins
            d["cst_pis"] = d["cst_pis"] or (l.cst_pis or "")
            d["linhas"] += 1

    planilha = defaultdict(lambda: {"valor": ZERO, "pis": ZERO, "cofins": ZERO,
                                    "cst": "", "ref": None})
    docs_planilha = defaultdict(set)
    docs_planilha_qualquer = set()
    por_documento = defaultdict(lambda: [ZERO, ZERO, 0, None, set()])
    for r in registros:
        docs_planilha_qualquer.add(r.documento)
        if r.secao == "SERVICO":
            continue
        docs_planilha[r.secao].add(r.documento)
        k = (r.secao, r.documento, _norm_num(r.codigo))
        d = planilha[k]
        d["valor"] += r.valor
        d["pis"] += r.pis_valor
        d["cofins"] += r.cofins_valor
        d["cst"] = d["cst"] or r.pis_cst
        d["ref"] = d["ref"] or r
        acc = por_documento[(r.secao, r.filial, r.documento)]
        acc[0] += r.valor
        acc[1] += r.pis_valor + r.cofins_valor
        acc[2] += 1
        acc[3] = acc[3] or r
        acc[4].add(r.cfop)

    # MA-01 / MA-02 - presenca de documentos
    for (secao, filial, doc), (valor, tributo, n, exemplo, cfops) in sorted(
            por_documento.items(), key=lambda x: -x[1][1]):
        if doc in docs_sped.get(secao, set()) or doc in docs_sped_qualquer:
            continue
        if tributo > CENTAVO:
            ma01.adicionar(_identificar(exemplo), tributo,
                           "%d item(ns), R$ %s, CFOP %s - a planilha destaca credito "
                           "que nao foi localizado no SPED" %
                           (n, valor.quantize(CENTAVO), ", ".join(sorted(cfops)[:3])))
        else:
            ma02.adicionar(_identificar(exemplo), valor,
                           "%d item(ns), CFOP %s, sem tributo destacado na planilha" %
                           (n, ", ".join(sorted(cfops)[:3])))

    # MA-03 / MA-04 - itens presentes nos dois lados
    comparados = 0
    for k, p in planilha.items():
        s = sped.get(k)
        if not s:
            continue
        comparados += 1
        ref = p["ref"]
        dif = max(abs(p["valor"] - s["valor"]), abs(p["pis"] - s["pis"]),
                  abs(p["cofins"] - s["cofins"]))
        if dif > TOL:
            ma03.adicionar(_identificar(ref), abs(p["pis"] + p["cofins"] - s["pis"] - s["cofins"]),
                           "planilha R$ %s (PIS %s / COFINS %s) x SPED R$ %s "
                           "(PIS %s / COFINS %s)" %
                           (p["valor"].quantize(CENTAVO), p["pis"].quantize(CENTAVO),
                            p["cofins"].quantize(CENTAVO), s["valor"].quantize(CENTAVO),
                            s["pis"].quantize(CENTAVO), s["cofins"].quantize(CENTAVO)))
        cst_p = str(p["cst"] or "").strip().zfill(2)
        cst_s = str(s["cst_pis"] or "").strip().zfill(2)
        if cst_p and cst_s and cst_p != cst_s:
            ma04.adicionar(_identificar(ref), abs(p["pis"] + p["cofins"] - s["pis"] - s["cofins"]),
                           "planilha CST %s x SPED CST %s" % (cst_p, cst_s))

    # sentido oposto: o que esta escriturado e nao aparece no sistema do cliente
    agregado_sped = defaultdict(lambda: [ZERO, 0, None])
    for l in linhas_sped:
        if not l.doc:
            continue
        secao = "ENTRADA" if l.eh_entrada else "SAIDA" if l.eh_saida else None
        if secao is None or l.doc in docs_planilha_qualquer:
            continue
        acc = agregado_sped[(secao, l.doc)]
        acc[0] += l.vl_item - l.vl_desc
        acc[1] += 1
        acc[2] = acc[2] or l
    for (secao, doc), (valor, n, exemplo) in sorted(agregado_sped.items(),
                                                    key=lambda x: -x[1][0]):
        ma05.adicionar(exemplo, valor,
                       "%s - %d item(ns) escriturado(s) sem correspondencia na planilha"
                       % (secao, n))

    # --- totais: precisam cobrir o MESMO universo dos dois lados ---
    # A planilha poe servico em secao propria e o SPED o traz no bloco A; o SPED
    # ainda tem creditos sem item (energia, comunicacao, F100) que a planilha
    # lista como entrada comum. Somar so o que casa por item daria uma diferenca
    # falsa de milhoes, entao os totais usam todas as linhas de cada lado.
    totais_pl = defaultdict(lambda: {"valor": ZERO, "tributo": ZERO, "docs": set()})
    for r in registros:
        if r.secao == "SERVICO":
            cst = str(r.pis_cst or "").strip().zfill(2)
            destino = "ENTRADA" if cst and cst >= "50" else "SAIDA"
        else:
            destino = r.secao
        d = totais_pl[destino]
        d["valor"] += r.valor
        d["tributo"] += r.pis_valor + r.cofins_valor
        d["docs"].add(r.documento)

    totais_sp = defaultdict(lambda: {"valor": ZERO, "tributo": ZERO, "docs": set()})
    for l in linhas_sped:
        destino = "ENTRADA" if l.eh_entrada else "SAIDA" if l.eh_saida else None
        if destino is None:
            continue
        d = totais_sp[destino]
        d["valor"] += l.vl_item - l.vl_desc
        d["tributo"] += l.vl_pis + l.vl_cofins
        if l.doc:
            d["docs"].add(l.doc)

    resumo = {"itens_comparados": comparados}
    for secao in ("ENTRADA", "SAIDA"):
        pl, sp = totais_pl[secao], totais_sp[secao]
        resumo[secao.lower()] = {
            "planilha_valor": pl["valor"], "sped_valor": sp["valor"],
            "planilha_tributo": pl["tributo"], "sped_tributo": sp["tributo"],
            "docs_planilha": len(pl["docs"]), "docs_sped": len(sp["docs"]),
        }
    return {"achados": [ma01, ma03, ma04, ma05, ma02], "resumo": resumo}

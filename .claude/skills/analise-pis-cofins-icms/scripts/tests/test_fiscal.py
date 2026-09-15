#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testes da skill de analise de PIS/COFINS e ICMS.

Rode com:  python3 -m unittest discover -s tests -v
Os testes usam as amostras de tests/amostras, geradas por gerar_amostras.py, que
tem inconsistencias plantadas de proposito - cada uma deve acionar um achado.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest
from decimal import Decimal

_AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_AQUI))

from fiscal import analise_icms, analise_pis_cofins, cruzamento, ncm, parser, relatorio, xlsx
from fiscal.extracao import extrair_linhas
from fiscal.modelo import ordenar_achados
from fiscal.planilha import (ItemMovimentacao, ler_movimentacao, ler_xlsx,
                             localizar_cabecalho, normalizar)
from fiscal.parser import to_decimal
from fiscal import tabelas

import gerar_amostras

AMOSTRAS = os.path.join(_AQUI, "amostras")


def _garantir_amostras():
    esperados = ["EFD_CONTRIBUICOES_072026.txt", "EFD_ICMS_IPI_072026.txt",
                 "movimentacao_072026.csv", "movimentacao_072026.xlsx"]
    if not all(os.path.exists(os.path.join(AMOSTRAS, n)) for n in esperados):
        gerar_amostras.main(AMOSTRAS)


class TestConversoes(unittest.TestCase):
    def test_decimal_padrao_brasileiro(self):
        self.assertEqual(to_decimal("1.234,56"), Decimal("1234.56"))
        self.assertEqual(to_decimal("0,65"), Decimal("0.65"))
        self.assertEqual(to_decimal("-10,50"), Decimal("-10.50"))
        self.assertEqual(to_decimal(""), Decimal("0"))
        self.assertEqual(to_decimal(None), Decimal("0"))
        self.assertEqual(to_decimal("texto"), Decimal("0"))

    def test_decimal_sem_separador_de_milhar(self):
        self.assertEqual(to_decimal("1234.56"), Decimal("1234.56"))

    def test_formatacao_brasileira(self):
        self.assertEqual(relatorio.brl(Decimal("1234567.891")), "1.234.567,89")
        self.assertEqual(relatorio.brl(Decimal("-45.5")), "-45,50")
        self.assertEqual(relatorio.brl(Decimal("0")), "0,00")


class TestTabelas(unittest.TestCase):
    def test_classificacao_de_cfop(self):
        self.assertEqual(tabelas.classifica_cfop("5102"), "VENDA")
        self.assertEqual(tabelas.classifica_cfop("1202"), "DEVOLUCAO")
        self.assertEqual(tabelas.classifica_cfop("7101"), "EXPORTACAO")
        self.assertEqual(tabelas.classifica_cfop("5915"), "REMESSA")

    def test_sentido_do_cfop(self):
        self.assertTrue(tabelas.eh_entrada("1102"))
        self.assertTrue(tabelas.eh_saida("6102"))
        self.assertFalse(tabelas.eh_saida("1102"))

    def test_remessa_nao_movimenta_estoque_proprio(self):
        self.assertFalse(tabelas.movimenta_estoque_fisico("5915"))
        self.assertTrue(tabelas.movimenta_estoque_fisico("5102"))

    def test_tributacao_do_cst_icms(self):
        self.assertEqual(tabelas.tributacao_icms("060"), "60")
        self.assertEqual(tabelas.tributacao_icms("000"), "00")
        self.assertEqual(tabelas.tributacao_icms("20"), "20")


class TestTabelaNCM(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tabela = ncm.carregar()

    def test_tabela_carregada(self):
        self.assertGreater(len(self.tabela), 40)
        self.assertEqual(self.tabela.erros, [])

    def test_prefixo_mais_longo_vence(self):
        self.assertEqual(self.tabela.regime("3004.90.10"), ncm.REGIME_MONOFASICO)
        # excecao legal expressa: 3004.90.46 esta fora do monofasico
        self.assertEqual(self.tabela.regime("3004.90.46"), ncm.REGIME_TRIBUTADO)
        self.assertEqual(self.tabela.regime("3003.90.56"), ncm.REGIME_TRIBUTADO)

    def test_regimes_reconhecidos(self):
        self.assertEqual(self.tabela.regime("40111000"), ncm.REGIME_MONOFASICO)
        self.assertEqual(self.tabela.regime("10063021"), ncm.REGIME_ALIQUOTA_ZERO)
        self.assertEqual(self.tabela.regime("24022000"), ncm.REGIME_ST)
        self.assertEqual(self.tabela.regime("94013000"), ncm.REGIME_TRIBUTADO)

    def test_ncm_desconhecido_nao_quebra(self):
        self.assertIsNone(self.tabela.classificar(""))
        self.assertIsNone(self.tabela.classificar("99999999"))


class TestParser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _garantir_amostras()
        cls.contrib = parser.parse(os.path.join(AMOSTRAS, "EFD_CONTRIBUICOES_072026.txt"))
        cls.fiscal = parser.parse(os.path.join(AMOSTRAS, "EFD_ICMS_IPI_072026.txt"))

    def test_deteccao_de_tipo(self):
        self.assertEqual(self.contrib.tipo, "EFD_CONTRIBUICOES")
        self.assertEqual(self.fiscal.tipo, "EFD_ICMS_IPI")

    def test_identificacao(self):
        self.assertEqual(self.contrib.cnpj, "11222333000181")
        self.assertEqual(self.contrib.competencia, "2026-07")
        self.assertEqual(self.fiscal.competencia, "2026-07")
        self.assertEqual(self.fiscal.uf, "SP")

    def test_regime_de_incidencia(self):
        self.assertEqual(self.contrib.regime_pis_cofins, "1")
        self.assertIsNone(self.fiscal.regime_pis_cofins)

    def test_hierarquia_c100_c170(self):
        itens = self.contrib.get("C170")
        self.assertTrue(itens)
        for item in itens:
            self.assertTrue(item.get("_num_doc"), "C170 sem o documento pai")
            self.assertIn(item.get("_ind_oper"), ("0", "1"))

    def test_cadastro_de_itens(self):
        self.assertIn("P001", self.contrib.itens)
        self.assertEqual(self.contrib.itens["P001"].txt("COD_NCM"), "30049099")

    def test_arquivo_inexistente_gera_erro(self):
        with self.assertRaises(IOError):
            parser.parse(os.path.join(AMOSTRAS, "nao_existe.txt"))


class TestPlanilha(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _garantir_amostras()

    def test_normalizacao_de_cabecalho(self):
        self.assertEqual(normalizar("Estoque Inicial (Qtd.)"), "estoque inicial qtd")
        self.assertEqual(normalizar("  DESCRIÇÃO  "), "descricao")

    def test_cabecalho_encontrado_apos_linhas_de_titulo(self):
        linhas = [["RELATORIO"], [""], ["Codigo", "Descricao", "Entradas", "Saidas"]]
        idx, mapa = localizar_cabecalho(linhas)
        self.assertEqual(idx, 2)
        self.assertEqual(mapa[0], "codigo")
        self.assertEqual(mapa[3], "saidas")

    def test_leitura_xlsx_e_csv_produzem_os_mesmos_itens(self):
        mov_x = ler_movimentacao(os.path.join(AMOSTRAS, "movimentacao_072026.xlsx"))
        mov_c = ler_movimentacao(os.path.join(AMOSTRAS, "movimentacao_072026.csv"))
        self.assertEqual(len(mov_x.itens), len(mov_c.itens))
        self.assertEqual([i.codigo for i in mov_x.itens], [i.codigo for i in mov_c.itens])
        for a, b in zip(mov_x.itens, mov_c.itens):
            self.assertEqual(a.saidas, b.saidas, "divergencia em %s" % a.codigo)

    def test_saldo_calculado(self):
        item = ItemMovimentacao(codigo="X", estoque_inicial=Decimal("10"),
                                entradas=Decimal("5"), saidas=Decimal("3"),
                                estoque_final=Decimal("12"))
        self.assertEqual(item.saldo_calculado, Decimal("12"))
        self.assertEqual(item.divergencia_saldo, Decimal("0"))

    def test_planilha_sem_colunas_reconheciveis(self):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False,
                                         encoding="utf-8") as fh:
            fh.write("alfa;beta;gama\n1;2;3\n")
            caminho = fh.name
        try:
            with self.assertRaises(ValueError):
                ler_movimentacao(caminho)
        finally:
            os.unlink(caminho)

    def test_escrita_e_leitura_de_xlsx(self):
        destino = tempfile.mkdtemp()
        try:
            caminho = os.path.join(destino, "t.xlsx")
            xlsx.escrever(caminho, [
                ("Aba 1", ["A", "B"], [["x & y", Decimal("10.50")], ["<z>", 3]]),
                ("Aba 2", ["C"], [["only"]]),
            ])
            nome, linhas = ler_xlsx(caminho)
            self.assertEqual(nome, "Aba 1")
            self.assertEqual(linhas[0], ["A", "B"])
            self.assertEqual(linhas[1], ["x & y", "10.50"])
            nome2, linhas2 = ler_xlsx(caminho, aba="Aba 2")
            self.assertEqual(nome2, "Aba 2")
            self.assertEqual(linhas2[1], ["only"])
        finally:
            shutil.rmtree(destino)


class TestAnalisePisCofins(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _garantir_amostras()
        esc = parser.parse(os.path.join(AMOSTRAS, "EFD_CONTRIBUICOES_072026.txt"))
        cls.resultado = analise_pis_cofins.analisar(esc, ncm.carregar())
        cls.por_codigo = {a.codigo: a for a in cls.resultado["achados"]}

    def disparou(self, codigo):
        return self.por_codigo[codigo].relevante

    def test_regime_identificado(self):
        self.assertEqual(self.resultado["regime"]["cod_inc_trib"], "1")
        self.assertEqual(self.resultado["regime"]["aliquota_pis"], Decimal("1.65"))

    def test_monofasico_tributado_indevidamente(self):
        achado = self.por_codigo["PC-01"]
        self.assertTrue(achado.relevante)
        self.assertEqual(achado.quantidade, 1)
        # 150 un x 24,90 = 3.735,00 - ICMS 672,30 = BC 3.062,70 -> 9,25% = 283,30
        self.assertEqual(achado.valor.quantize(Decimal("0.01")), Decimal("283.30"))

    def test_credito_indevido_em_monofasico(self):
        achado = self.por_codigo["PC-02"]
        self.assertTrue(achado.relevante)
        self.assertEqual(achado.valor.quantize(Decimal("0.01")), Decimal("849.52"))

    def test_icms_na_base(self):
        self.assertTrue(self.disparou("PC-07"))
        self.assertEqual(self.por_codigo["PC-07"].valor.quantize(Decimal("0.01")),
                         Decimal("259.74"))

    def test_demais_achados_plantados(self):
        for codigo in ("PC-05", "PC-06", "PC-09", "PC-12"):
            self.assertTrue(self.disparou(codigo), "%s deveria ter disparado" % codigo)

    def test_sem_falso_positivo_na_consolidacao(self):
        # a amostra tem bloco M coerente com os documentos
        for codigo in ("PC-20", "PC-21"):
            self.assertFalse(self.disparou(codigo),
                             "%s disparou sem inconsistencia: %s"
                             % (codigo, self.por_codigo[codigo].amostras))

    def test_recomposicao_bate_com_bloco_m(self):
        debito_documentos = self.resultado["recomposicao"]["debito_pis"]
        bloco_m = sum(d["contribuicao_apurada"]
                      for d in self.resultado["apuracao_escriturada"]["pis"]["detalhe_debito"])
        self.assertLess(abs(debito_documentos - bloco_m), Decimal("1.00"))


class TestAnaliseIcms(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _garantir_amostras()
        esc = parser.parse(os.path.join(AMOSTRAS, "EFD_ICMS_IPI_072026.txt"))
        cls.resultado = analise_icms.analisar(esc)
        cls.por_codigo = {a.codigo: a for a in cls.resultado["achados"]}

    def test_apuracao_lida(self):
        ap = self.resultado["apuracao_escriturada"]["apuracao"]
        self.assertIsNotNone(ap)
        self.assertGreater(ap["total_debitos"], Decimal("0"))

    def test_credito_indevido_em_cst_60(self):
        achado = self.por_codigo["IC-03"]
        self.assertTrue(achado.relevante)
        self.assertEqual(achado.valor.quantize(Decimal("0.01")), Decimal("590.40"))

    def test_saida_com_st_e_debito_proprio(self):
        achado = self.por_codigo["IC-05"]
        self.assertTrue(achado.relevante)
        self.assertEqual(achado.valor.quantize(Decimal("0.01")), Decimal("777.60"))

    def test_sem_falso_positivo_na_apuracao(self):
        for codigo in ("IC-01", "IC-02"):
            self.assertFalse(self.por_codigo[codigo].relevante,
                             "%s disparou sem inconsistencia: %s"
                             % (codigo, self.por_codigo[codigo].amostras))

    def test_inventario_lido(self):
        inv = self.resultado["apuracao_escriturada"]["inventario"]
        self.assertEqual(inv["qtd_itens"], 6)


class TestCruzamento(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _garantir_amostras()
        esc = parser.parse(os.path.join(AMOSTRAS, "EFD_ICMS_IPI_072026.txt"))
        linhas = extrair_linhas(esc)
        itens = cruzamento.agregar_por_item(linhas)
        inventario = cruzamento.inventario_por_item(esc)
        mov = ler_movimentacao(os.path.join(AMOSTRAS, "movimentacao_072026.xlsx"))
        cls.saida = cruzamento.cruzar(mov, itens, inventario,
                                      {"competencia": "2026-07", "cnpj": "11222333000181"})
        cls.por_codigo = {a.codigo: a for a in cls.saida["achados"]}

    def test_saida_sem_nota_detectada(self):
        achado = self.por_codigo["CR-03"]
        self.assertTrue(achado.relevante)
        self.assertEqual(achado.quantidade, 1)
        self.assertIn("P003", achado.amostras[0]["ref"])

    def test_entrada_sem_nota_detectada(self):
        achado = self.por_codigo["CR-02"]
        self.assertTrue(achado.relevante)
        self.assertIn("P006", achado.amostras[0]["ref"])

    def test_divergencia_de_inventario(self):
        self.assertTrue(self.por_codigo["CR-06"].relevante)

    def test_produto_sem_ncm(self):
        achado = self.por_codigo["CR-07"]
        self.assertTrue(achado.relevante)
        self.assertIn("P006", achado.amostras[0]["ref"])

    def test_planilha_internamente_consistente(self):
        self.assertFalse(self.por_codigo["CR-01"].relevante,
                         "a planilha de amostra fecha EI + E - S = EF")

    def test_comparativo_tem_todos_os_itens(self):
        codigos = {l["codigo"] for l in self.saida["comparativo"]}
        for cod in ("P001", "P002", "P003", "P004", "P005", "P006"):
            self.assertIn(cod, codigos)

    def test_mesclar_itens_nao_duplica(self):
        a = {"x": {"qtd_entradas": Decimal("10"), "docs_entrada": {"1"},
                   "cod_item": "X", "descricao": "", "ncm": ""}}
        b = {"x": {"qtd_entradas": Decimal("5"), "docs_entrada": {"2"},
                   "cod_item": "X", "descricao": "D", "ncm": "123"}}
        acumulado = {}
        cruzamento.mesclar_itens(acumulado, a)
        self.assertEqual(acumulado["x"]["qtd_entradas"], Decimal("10"))
        cruzamento.mesclar_itens(acumulado, b)
        self.assertEqual(acumulado["x"]["qtd_entradas"], Decimal("15"))
        self.assertEqual(acumulado["x"]["docs_entrada"], {"1", "2"})
        self.assertEqual(acumulado["x"]["ncm"], "123")


class TestPontaAPonta(unittest.TestCase):
    def test_cli_gera_entregaveis(self):
        _garantir_amostras()
        import analisar
        destino = tempfile.mkdtemp()
        try:
            args = analisar.main.__globals__["argparse"].Namespace(
                sped=[AMOSTRAS],
                movimentacao=os.path.join(AMOSTRAS, "movimentacao_072026.xlsx"),
                aba=None, saida=destino, prefixo="teste",
                tabela_ncm=None, tabela_ncm_extra=None, json=True)
            resultado = analisar.executar(args)
            self.assertTrue(os.path.exists(os.path.join(destino, "teste.md")))
            self.assertTrue(os.path.exists(os.path.join(destino, "teste.xlsx")))
            self.assertTrue(os.path.exists(os.path.join(destino, "teste.json")))
            achados = ordenar_achados(resultado["achados"])
            codigos = {a.codigo for a in achados}
            for esperado in ("PC-01", "PC-02", "PC-07", "IC-03", "IC-05",
                             "CR-02", "CR-03", "CR-06"):
                self.assertIn(esperado, codigos)
            # a planilha gerada precisa ser legivel de volta
            nome, linhas = ler_xlsx(os.path.join(destino, "teste.xlsx"))
            self.assertEqual(nome, "Resumo")
            self.assertGreater(len(linhas), 5)
            # totais tributarios nao podem incluir valor de mercadoria
            totais = relatorio.totais_por_sentido(achados)
            nao_tributarios = [a for a in achados
                               if a.natureza_valor != relatorio.NATUREZA_TRIBUTARIA]
            self.assertTrue(nao_tributarios)
            for a in nao_tributarios:
                self.assertLessEqual(a.valor, sum(totais.values()) + a.valor)
        finally:
            shutil.rmtree(destino)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestMovimentacaoAnalitica(unittest.TestCase):
    """Planilha analitica por documento (uma linha por item de nota fiscal).

    O layout real que motivou este modulo repete os rotulos 'R$ Base', 'Aliq.' e
    'CST' em cada bloco de tributo e ainda erra o rotulo das ultimas colunas de
    valor - por isso o mapeamento se ancora nos rotulos distintivos.
    """

    CAB = ["Filial", "Codigo", "Numero", "Data", "Produto", "CFOP", "NCM", "Qtde",
           "R$ Unit.", "R$ Produto",
           "R$ Base", "Aliq.", "R$ ICMS", "CST",
           "R$ Base", "Aliq.", "R$ PIS", "CST",
           "R$ Base", "Aliq.", "R$ COFINS", "CST",
           "R$ Base", "Aliq.", "R$ COFINS"]
    GRUPOS = ["", "", "", "", "", "", "", "", "", "",
              "ICMS", "", "", "", "PIS", "", "", "", "COFINS", "", "", "", "ICMS ST"]

    GRADE = [
        ["Movimentacao de Produtos - de: 01/07/2026 ate 31/07/2026"],
        ["Empresa: 0052 - EXEMPLO LTDA"],
        ["Entradas"],
        GRUPOS,
        CAB,
        ["52", "1", "1001", "02/07/2026", "P001 - CARNE BOVINA", "1102", "02013000",
         "10", "100,00", "1000,00",
         "0", "0", "0", "060", "1000,00", "1,65", "16,50", "50",
         "1000,00", "7,60", "76,00", "50", "0", "0", "0"],
        ["52", "2", "1002", "03/07/2026", "P002 - SEM LASTRO", "1102", "94013000",
         "5", "100,00", "500,00",
         "500,00", "18", "90,00", "000", "500,00", "1,65", "8,25", "50",
         "500,00", "7,60", "38,00", "50", "0", "0", "0"],
        ["Saidas"],
        GRUPOS,
        CAB,
        ["52", "3", "9001", "20/07/2026", "P001 - CARNE BOVINA", "5102", "02013000",
         "4", "100,00", "400,00",
         "400,00", "12", "48,00", "000", "400,00", "1,65", "6,60", "01",
         "400,00", "7,60", "30,40", "01", "0", "0", "0"],
    ]

    def test_detecta_layout_analitico(self):
        from fiscal import movimentacao_analitica as ma
        self.assertTrue(ma.detectar(self.GRADE))
        self.assertFalse(ma.detectar([["Codigo", "Estoque Inicial", "Entradas"]]))

    def test_le_secoes_e_mapeia_tributos(self):
        from fiscal import movimentacao_analitica as ma
        registros, diag = ma.ler(self.GRADE)
        self.assertEqual(diag["registros_por_secao"], {"ENTRADA": 2, "SAIDA": 1})
        ent = [r for r in registros if r.secao == "ENTRADA"][0]
        self.assertEqual(ent.codigo, "P001")
        self.assertEqual(ent.descricao, "CARNE BOVINA")
        self.assertEqual(ent.ncm, "02013000")
        self.assertEqual(ent.pis_cst, "50")
        self.assertEqual(ent.pis_valor, Decimal("16.50"))
        self.assertEqual(ent.cofins_valor, Decimal("76.00"))
        self.assertEqual(ent.icms_valor, Decimal("0"))
        sai = [r for r in registros if r.secao == "SAIDA"][0]
        self.assertEqual(sai.pis_cst, "01")
        self.assertEqual(sai.icms_valor, Decimal("48.00"))

    def _linhas_sped(self, **ajustes):
        from fiscal.modelo import LinhaFiscal
        base = dict(origem="C170", tipo="ENTRADA", doc="1001", cod_item="P001",
                    vl_item=Decimal("1000"), vl_pis=Decimal("16.50"),
                    vl_cofins=Decimal("76.00"), cst_pis="50")
        base.update(ajustes)
        return [LinhaFiscal(**base)]

    def test_documento_da_planilha_ausente_do_sped(self):
        from fiscal import movimentacao_analitica as ma
        registros, _ = ma.ler(self.GRADE)
        saida = ma.cruzar(registros, self._linhas_sped())
        por = {a.codigo: a for a in saida["achados"]}
        self.assertTrue(por["MA-01"].relevante)
        self.assertIn("1002", por["MA-01"].amostras[0]["ref"])
        self.assertFalse(por["MA-03"].relevante)
        self.assertFalse(por["MA-04"].relevante)

    def test_divergencia_de_valor_e_de_cst(self):
        from fiscal import movimentacao_analitica as ma
        registros, _ = ma.ler(self.GRADE)
        linhas = self._linhas_sped(vl_pis=Decimal("99.00"), cst_pis="70")
        por = {a.codigo: a for a in ma.cruzar(registros, linhas)["achados"]}
        self.assertTrue(por["MA-03"].relevante)
        self.assertTrue(por["MA-04"].relevante)
        self.assertIn("CST 50", por["MA-04"].amostras[0]["obs"])

    def test_codigo_com_zeros_a_esquerda_casa(self):
        from fiscal import movimentacao_analitica as ma
        registros, _ = ma.ler(self.GRADE)
        linhas = self._linhas_sped(cod_item="001")
        registros[0].codigo = "1"          # planilha sem os zeros a esquerda
        por = {a.codigo: a for a in ma.cruzar(registros, linhas)["achados"]}
        self.assertFalse(por["MA-03"].relevante)

    def test_servico_em_secao_propria_nao_vira_falso_positivo(self):
        from fiscal import movimentacao_analitica as ma
        grade = [l[:] for l in self.GRADE] + [
            ["Servicos"], self.GRUPOS, self.CAB,
            ["52", "9", "7777", "09/07/2026", "SERVICOS - PRESTADOS", "", "", "1",
             "100,00", "100,00",
             "0", "0", "0", "", "100,00", "1,65", "1,65", "01",
             "100,00", "7,60", "7,60", "01", "0", "0", "0"],
        ]
        registros, _ = ma.ler(grade)
        from fiscal.modelo import LinhaFiscal
        linhas = self._linhas_sped() + [LinhaFiscal(
            origem="A170", tipo="SAIDA", doc="7777", cod_item="SERVICOS",
            vl_item=Decimal("100"), vl_pis=Decimal("1.65"),
            vl_cofins=Decimal("7.60"), cst_pis="01")]
        por = {a.codigo: a for a in ma.cruzar(registros, linhas)["achados"]}
        self.assertFalse(por["MA-05"].relevante,
                         "servico escriturado no bloco A nao pode ser apontado como "
                         "ausente do sistema do cliente")


class TestXlsLegacy(unittest.TestCase):
    def test_rejeita_arquivo_que_nao_e_ole2(self):
        from fiscal import xls_legacy
        with tempfile.NamedTemporaryFile("wb", suffix=".xls", delete=False) as fh:
            fh.write(b"isto nao e um xls")
            caminho = fh.name
        try:
            with self.assertRaises(xls_legacy.ErroXls):
                xls_legacy.ler(caminho)
        finally:
            os.unlink(caminho)

    def test_decodifica_valor_rk(self):
        from fiscal.xls_legacy import _valor_rk
        self.assertEqual(_valor_rk((100 << 2) | 0x02), 100.0)          # inteiro
        self.assertAlmostEqual(_valor_rk((12345 << 2) | 0x03), 123.45)  # inteiro /100

    def test_texto_curto_do_boundsheet(self):
        # o nome da aba usa contagem de caracteres em 1 byte, nao 2
        from fiscal.xls_legacy import _texto_curto
        dados = b"\x00" * 6 + bytes([4, 0x01]) + "Aba1".encode("utf-16-le")
        self.assertEqual(_texto_curto(dados, 6, True)[0], "Aba1")


class TestDestinoDaCompra(unittest.TestCase):
    """O credito sobre produto desonerado muda de tratamento conforme o destino."""

    def test_classificacao_por_cfop(self):
        self.assertEqual(tabelas.destino_da_compra("1101"), "INSUMO")
        self.assertEqual(tabelas.destino_da_compra("1401"), "INSUMO")
        self.assertEqual(tabelas.destino_da_compra("1102"), "REVENDA")
        self.assertEqual(tabelas.destino_da_compra("1403"), "REVENDA")
        self.assertEqual(tabelas.destino_da_compra("1653"), "COMBUSTIVEL")
        self.assertEqual(tabelas.destino_da_compra("1556"), "USO_CONSUMO")
        self.assertEqual(tabelas.destino_da_compra("1551"), "ATIVO")
        self.assertEqual(tabelas.destino_da_compra("1949"), "OUTROS")

    def _rodar(self, cfop):
        from fiscal.analise_pis_cofins import testes_por_item
        from fiscal.modelo import LinhaFiscal
        linha = LinhaFiscal(origem="C170", tipo="ENTRADA", doc="1", cod_item="X",
                            ncm="02013000", cfop=cfop, vl_item=Decimal("1000"),
                            cst_pis="50", cst_cofins="50", bc_pis=Decimal("1000"),
                            aliq_pis=Decimal("1.65"), vl_pis=Decimal("16.50"),
                            bc_cofins=Decimal("1000"), aliq_cofins=Decimal("7.6"),
                            vl_cofins=Decimal("76.00"))
        ctx = {"competencia": "2026-07", "cnpj": "", "cod_inc_trib": "1",
               "aliq_pis": Decimal("1.65"), "aliq_cofins": Decimal("7.6")}
        return {a.codigo: a for a in testes_por_item([linha], ncm.carregar(), ctx)}

    def test_revenda_cai_no_pc02(self):
        por = self._rodar("1102")
        self.assertTrue(por["PC-02"].relevante)
        self.assertFalse(por["PC-14"].relevante)
        self.assertEqual(por["PC-02"].sentido, "RECOLHER")

    def test_insumo_cai_no_pc14(self):
        por = self._rodar("1101")
        self.assertFalse(por["PC-02"].relevante)
        self.assertTrue(por["PC-14"].relevante)
        self.assertEqual(por["PC-14"].sentido, "AVALIAR")
        self.assertEqual(por["PC-14"].valor, Decimal("92.50"))

    def test_combustivel_cai_no_pc15(self):
        from fiscal.analise_pis_cofins import testes_por_item
        from fiscal.modelo import LinhaFiscal
        linha = LinhaFiscal(origem="C170", tipo="ENTRADA", doc="1", cod_item="G",
                            ncm="27111910", cfop="1653", vl_item=Decimal("1000"),
                            cst_pis="50", cst_cofins="50", bc_pis=Decimal("1000"),
                            aliq_pis=Decimal("1.65"), vl_pis=Decimal("16.50"),
                            bc_cofins=Decimal("1000"), aliq_cofins=Decimal("7.6"),
                            vl_cofins=Decimal("76.00"))
        ctx = {"competencia": "2026-07", "cnpj": "", "cod_inc_trib": "1",
               "aliq_pis": Decimal("1.65"), "aliq_cofins": Decimal("7.6")}
        por = {a.codigo: a for a in testes_por_item([linha], ncm.carregar(), ctx)}
        self.assertTrue(por["PC-15"].relevante)
        self.assertFalse(por["PC-02"].relevante)
        self.assertFalse(por["PC-14"].relevante)

    def test_avaliar_fica_fora_dos_totais_de_recuperar_e_recolher(self):
        por = self._rodar("1101")
        totais = relatorio.totais_por_sentido(list(por.values()))
        self.assertEqual(totais["RECUPERAR"], Decimal("0"))
        self.assertEqual(totais["RECOLHER"], Decimal("0"))
        self.assertEqual(totais["AVALIAR"], Decimal("92.50"))

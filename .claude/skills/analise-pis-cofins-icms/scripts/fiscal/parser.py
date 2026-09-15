# -*- coding: utf-8 -*-
"""Parser generico e tolerante para arquivos SPED (EFD ICMS/IPI e EFD-Contribuicoes).

Principios:
  * nunca aborta por causa de um registro fora do layout esperado;
  * detecta automaticamente o tipo de escrituracao pelo registro 0000;
  * mantem a hierarquia pai/filho necessaria (C100 -> C170/C175/C190, etc.);
  * decimais sempre em Decimal (nunca float) para nao introduzir erro de arredondamento.
"""
from __future__ import annotations

import io
import os
from decimal import Decimal, InvalidOperation

from . import layouts

ENCODINGS = ("latin-1", "utf-8-sig", "utf-8", "cp1252")
ZERO = Decimal("0")


def to_decimal(valor, padrao=ZERO):
    """Converte campo SPED ('1.234,56', '1234,56', '') em Decimal."""
    if valor is None:
        return padrao
    if isinstance(valor, Decimal):
        return valor
    if isinstance(valor, (int,)):
        return Decimal(valor)
    if isinstance(valor, float):
        return Decimal(str(valor))
    texto = str(valor).strip()
    if not texto:
        return padrao
    negativo = texto.startswith("-")
    texto = texto.lstrip("+-").replace(" ", "")
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    try:
        numero = Decimal(texto)
    except InvalidOperation:
        return padrao
    return -numero if negativo else numero


def _ler_linhas(caminho):
    ultimo_erro = None
    for enc in ENCODINGS:
        try:
            with io.open(caminho, "r", encoding=enc) as fh:
                return fh.read().splitlines(), enc
        except UnicodeDecodeError as exc:  # tenta o proximo encoding
            ultimo_erro = exc
    raise UnicodeDecodeError(
        "sped", b"", 0, 1,
        "nao foi possivel decodificar %s (%s)" % (caminho, ultimo_erro),
    )


def _campos(linha):
    """Quebra a linha SPED em campos, tolerando ausencia do pipe final."""
    if not linha.startswith("|"):
        return []
    partes = linha.split("|")
    partes = partes[1:]
    if partes and partes[-1] == "":
        partes = partes[:-1]
    return partes


class Registro(dict):
    """Um registro SPED. Acesso por nome de campo, com metadados em chaves _*."""

    @property
    def reg(self):
        return self.get("REG", "")

    def dec(self, campo, padrao=ZERO):
        return to_decimal(self.get(campo), padrao)

    def txt(self, campo, padrao=""):
        valor = self.get(campo)
        return padrao if valor is None else str(valor).strip()


class Escrituracao(object):
    """Resultado do parse de um arquivo SPED."""

    def __init__(self, caminho, tipo, encoding):
        self.caminho = caminho
        self.arquivo = os.path.basename(caminho)
        self.tipo = tipo  # "EFD_ICMS_IPI" | "EFD_CONTRIBUICOES" | "DESCONHECIDO"
        self.encoding = encoding
        self.registros = {}          # {"C170": [Registro, ...]}
        self.ordem = []              # todos os registros na ordem do arquivo
        self.avisos = []
        self.linhas_invalidas = 0

    # -- acesso -------------------------------------------------------------
    def get(self, reg):
        return self.registros.get(reg, [])

    def primeiro(self, reg):
        lista = self.registros.get(reg)
        return lista[0] if lista else None

    # -- metadados ----------------------------------------------------------
    @property
    def abertura(self):
        return self.primeiro("0000") or Registro()

    @property
    def cnpj(self):
        return self.abertura.txt("CNPJ")

    @property
    def nome(self):
        return self.abertura.txt("NOME")

    @property
    def uf(self):
        return self.abertura.txt("UF")

    @property
    def dt_ini(self):
        return self.abertura.txt("DT_INI")

    @property
    def dt_fin(self):
        return self.abertura.txt("DT_FIN")

    @property
    def competencia(self):
        """Competencia no formato AAAA-MM a partir de DT_INI (DDMMAAAA)."""
        d = self.dt_ini
        if len(d) == 8:
            return "%s-%s" % (d[4:], d[2:4])
        return ""

    @property
    def regime_pis_cofins(self):
        """COD_INC_TRIB do registro 0110 (so existe na EFD-Contribuicoes)."""
        r = self.primeiro("0110")
        if not r:
            return None
        return r.txt("COD_INC_TRIB")

    @property
    def itens(self):
        """{COD_ITEM: Registro 0200} para enriquecer analises com NCM/descricao."""
        if not hasattr(self, "_itens_cache"):
            self._itens_cache = {r.txt("COD_ITEM"): r for r in self.get("0200")}
        return self._itens_cache

    @property
    def estabelecimentos(self):
        """{CNPJ: COD_EST} a partir do registro 0140."""
        if not hasattr(self, "_est_cache"):
            self._est_cache = {}
            for r in self.get("0140"):
                if r.txt("CNPJ"):
                    self._est_cache[r.txt("CNPJ")] = r.txt("COD_EST")
        return self._est_cache

    @property
    def participantes(self):
        if not hasattr(self, "_part_cache"):
            self._part_cache = {r.txt("COD_PART"): r for r in self.get("0150")}
        return self._part_cache

    def resumo(self):
        return {
            "arquivo": self.arquivo,
            "tipo": self.tipo,
            "cnpj": self.cnpj,
            "nome": self.nome,
            "uf": self.uf,
            "competencia": self.competencia,
            "dt_ini": self.dt_ini,
            "dt_fin": self.dt_fin,
            "cod_ver": self.abertura.txt("COD_VER"),
            "regime_pis_cofins": self.regime_pis_cofins,
            "qtd_registros": sum(len(v) for v in self.registros.values()),
            "avisos": list(self.avisos),
        }


def detectar_tipo(linhas):
    """Identifica a escrituracao pelo registro 0000.

    EFD ICMS/IPI:      |0000|COD_VER|COD_FIN|DT_INI|...  -> COD_FIN e 0/1
    EFD-Contribuicoes: |0000|COD_VER|TIPO_ESCRIT|IND_SIT_ESP|NUM_REC_ANTERIOR|DT_INI|...

    Heuristica robusta: a EFD-Contribuicoes tem DT_INI na 5a posicao apos REG e
    possui registros do bloco M; a EFD ICMS/IPI tem DT_INI na 3a e blocos C/E.
    """
    regs = set()
    campos_0000 = None
    for linha in linhas:
        c = _campos(linha)
        if not c:
            continue
        regs.add(c[0])
        if c[0] == "0000" and campos_0000 is None:
            campos_0000 = c

    if regs & {"M200", "M600", "M210", "M610", "0110"}:
        return "EFD_CONTRIBUICOES"
    if regs & {"E110", "E116", "C190", "E210", "H010"}:
        return "EFD_ICMS_IPI"

    if campos_0000:
        def eh_data(v):
            return len(v) == 8 and v.isdigit()
        if len(campos_0000) > 5 and eh_data(campos_0000[5]):
            return "EFD_CONTRIBUICOES"
        if len(campos_0000) > 3 and eh_data(campos_0000[3]):
            return "EFD_ICMS_IPI"
    return "DESCONHECIDO"


def _montar_registro(cod, valores, nomes_campos):
    reg = Registro()
    reg["REG"] = cod
    for i, nome in enumerate(nomes_campos):
        if i < len(valores):
            reg[nome] = valores[i]
    if len(valores) > len(nomes_campos):
        reg["_extras"] = valores[len(nomes_campos):]
    reg["_campos_lidos"] = len(valores)
    reg["_campos_layout"] = len(nomes_campos)
    return reg


def parse(caminho, tipo=None):
    """Le um arquivo SPED e devolve uma Escrituracao."""
    linhas, encoding = _ler_linhas(caminho)
    tipo = tipo or detectar_tipo(linhas)
    layout = layouts.LAYOUTS.get(tipo, {})
    esc = Escrituracao(caminho, tipo, encoding)
    if tipo == "DESCONHECIDO":
        esc.avisos.append(
            "Nao foi possivel identificar o tipo de escrituracao pelo registro 0000. "
            "Os registros foram lidos sem nomes de campo (use _valores)."
        )

    pai_c100 = None
    pai_d100 = None
    pai_a100 = None
    pai_m100 = None
    pai_m500 = None
    pai_c500 = None
    est_atual = ""
    pai_d500 = None
    sem_layout = set()

    for num, linha in enumerate(linhas, start=1):
        linha = linha.rstrip("\r\n")
        if not linha.strip():
            continue
        valores = _campos(linha)
        if not valores:
            esc.linhas_invalidas += 1
            continue
        cod = valores[0].strip().upper()
        nomes = layout.get(cod)
        if nomes is None:
            sem_layout.add(cod)
            reg = Registro()
            reg["REG"] = cod
            reg["_valores"] = valores[1:]
        else:
            reg = _montar_registro(cod, valores[1:], nomes)
        reg["_linha"] = num

        # os registros de abertura por estabelecimento definem a quem pertencem os
        # documentos seguintes - sem isso, arquivos de varias filiais viram um bolo so
        if cod in ("C010", "A010", "D010", "F010", "I010", "0140"):
            est_atual = reg.txt("CNPJ") or (reg.get("_valores", [""]) or [""])[0]
        reg["_cnpj_est"] = est_atual

        # hierarquia util para rastrear a nota de origem dos itens
        if cod == "C100":
            pai_c100 = reg
        elif cod in ("C170", "C175", "C190", "C181", "C185", "C191", "C195") and pai_c100 is not None:
            reg["_chv_nfe"] = pai_c100.txt("CHV_NFE")
            reg["_num_doc"] = pai_c100.txt("NUM_DOC")
            reg["_ser"] = pai_c100.txt("SER")
            reg["_cod_mod"] = pai_c100.txt("COD_MOD")
            reg["_cod_sit"] = pai_c100.txt("COD_SIT")
            reg["_dt_doc"] = pai_c100.txt("DT_DOC")
            reg["_ind_oper"] = pai_c100.txt("IND_OPER")
            reg["_ind_emit"] = pai_c100.txt("IND_EMIT")
            reg["_cod_part"] = pai_c100.txt("COD_PART")
            reg["_cnpj_est"] = pai_c100.get("_cnpj_est", "")
        elif cod == "C500":
            pai_c500 = reg
        elif cod in ("C501", "C505") and pai_c500 is not None:
            reg["_num_doc"] = pai_c500.txt("NUM_DOC")
            reg["_cod_part"] = pai_c500.txt("COD_PART")
            reg["_dt_doc"] = pai_c500.txt("DT_DOC")
            reg["_cod_mod"] = pai_c500.txt("COD_MOD")
        elif cod == "D500":
            pai_d500 = reg
        elif cod in ("D501", "D505") and pai_d500 is not None:
            reg["_num_doc"] = pai_d500.txt("NUM_DOC")
            reg["_cod_part"] = pai_d500.txt("COD_PART")
            reg["_dt_doc"] = pai_d500.txt("DT_DOC")
            reg["_cod_mod"] = pai_d500.txt("COD_MOD")
        elif cod == "D100":
            pai_d100 = reg
        elif cod in ("D101", "D105") and pai_d100 is not None:
            reg["_num_doc"] = pai_d100.txt("NUM_DOC")
            reg["_cod_part"] = pai_d100.txt("COD_PART")
            reg["_dt_doc"] = pai_d100.txt("DT_DOC")
        elif cod == "A100":
            pai_a100 = reg
        elif cod == "A170" and pai_a100 is not None:
            reg["_num_doc"] = pai_a100.txt("NUM_DOC")
            reg["_cod_part"] = pai_a100.txt("COD_PART")
            reg["_dt_doc"] = pai_a100.txt("DT_DOC")
            reg["_ind_oper"] = pai_a100.txt("IND_OPER")
            reg["_cod_sit"] = pai_a100.txt("COD_SIT")
        elif cod == "M100":
            pai_m100 = reg
        elif cod == "M105" and pai_m100 is not None:
            reg["_cod_cred"] = pai_m100.txt("COD_CRED")
        elif cod == "M500":
            pai_m500 = reg
        elif cod == "M505" and pai_m500 is not None:
            reg["_cod_cred"] = pai_m500.txt("COD_CRED")

        esc.registros.setdefault(cod, []).append(reg)
        esc.ordem.append(reg)

    if sem_layout:
        conhecidos = {"9999", "9900", "9990", "0001", "0990", "A001", "A990",
                      "C001", "C990", "D001", "D990", "E001", "E990", "F001",
                      "F990", "G001", "G990", "H001", "H990", "I001", "I990",
                      "K001", "K990", "M001", "M990", "P001", "P990", "1001",
                      "1990", "B001", "B990"}
        relevantes = sorted(sem_layout - conhecidos)
        if relevantes:
            esc.avisos.append(
                "Registros lidos sem layout nomeado (acessiveis via _valores): "
                + ", ".join(relevantes[:40])
                + (" ..." if len(relevantes) > 40 else "")
            )
    if esc.linhas_invalidas:
        esc.avisos.append("%d linha(s) ignorada(s) por nao iniciarem com '|'." % esc.linhas_invalidas)
    return esc


def parse_varios(caminhos):
    """Le varios arquivos e devolve (lista_icms_ipi, lista_contribuicoes, lista_desconhecidos)."""
    icms, contrib, outros = [], [], []
    for caminho in caminhos:
        esc = parse(caminho)
        if esc.tipo == "EFD_ICMS_IPI":
            icms.append(esc)
        elif esc.tipo == "EFD_CONTRIBUICOES":
            contrib.append(esc)
        else:
            outros.append(esc)
    chave = lambda e: (e.cnpj, e.dt_ini)
    return sorted(icms, key=chave), sorted(contrib, key=chave), outros

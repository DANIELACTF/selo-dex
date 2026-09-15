# -*- coding: utf-8 -*-
"""Leitura de .xls binário antigo (OLE2 + BIFF5/BIFF8) usando só a biblioteca padrão.

Sistemas contábeis brasileiros ainda exportam muito nesse formato, e nem sempre o
LibreOffice consegue abrir o que eles produzem. Este módulo lê o necessário para
uma planilha de dados tabulares: texto, números, datas formatadas e resultados de
fórmula. Não interpreta gráficos, macros nem formatação.

Estrutura: OLE2 (Compound File Binary) -> stream "Workbook" -> registros BIFF.
"""
from __future__ import annotations

import datetime
import struct

# --- registros BIFF que nos interessam ---
BOF = 0x0809
EOF_REC = 0x000A
BOUNDSHEET = 0x0085
SST = 0x00FC
CONTINUE = 0x003C
LABELSST = 0x00FD
LABEL = 0x0204
RSTRING = 0x00D6
RK = 0x027E
MULRK = 0x00BD
NUMBER = 0x0203
FORMULA = 0x0006
STRING = 0x0207
BOOLERR = 0x0205
BLANK = 0x0201
MULBLANK = 0x00BE
FORMAT = 0x041E
XF = 0x00E0
DATEMODE = 0x0022

LIVRE = 0xFFFFFFFF
FIM_CADEIA = 0xFFFFFFFE


class ErroXls(Exception):
    pass


# ---------------------------------------------------------------------------
# OLE2 / Compound File Binary
# ---------------------------------------------------------------------------
class _Ole(object):
    def __init__(self, dados):
        if dados[:8] != b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
            raise ErroXls("arquivo nao e um documento OLE2")
        self.d = dados
        shift, mini_shift = struct.unpack_from("<HH", dados, 30)
        self.ss = 1 << shift
        self.mss = 1 << mini_shift
        nfat, self.dir_inicio = struct.unpack_from("<II", dados, 44)
        (self.mini_corte, minifat_inicio, nminifat,
         difat_inicio, ndifat) = struct.unpack_from("<IIIII", dados, 56)
        self._monta_fat(nfat, difat_inicio, ndifat)
        self.minifat = self._le_minifat(minifat_inicio, nminifat)
        self.entradas = self._le_diretorio()
        raiz = self.entradas[0]
        self.mini_stream = self._le_cadeia(raiz["inicio"], raiz["tamanho"], mini=False)

    def _setor(self, n):
        inicio = 512 + n * self.ss
        return self.d[inicio:inicio + self.ss]

    def _monta_fat(self, nfat, difat_inicio, ndifat):
        difat = list(struct.unpack_from("<109I", self.d, 76))
        prox, restantes = difat_inicio, ndifat
        while restantes and prox not in (FIM_CADEIA, LIVRE):
            bloco = self._setor(prox)
            difat += list(struct.unpack_from("<%dI" % (self.ss // 4 - 1), bloco, 0))
            prox = struct.unpack_from("<I", bloco, self.ss - 4)[0]
            restantes -= 1
        self.fat = []
        for s in difat[:nfat]:
            if s in (FIM_CADEIA, LIVRE):
                continue
            self.fat += list(struct.unpack_from("<%dI" % (self.ss // 4), self._setor(s), 0))

    def _cadeia(self, inicio, fat):
        saida, s, visto = [], inicio, set()
        while s not in (FIM_CADEIA, LIVRE) and s < len(fat):
            if s in visto:
                break                      # cadeia circular: para em vez de travar
            visto.add(s)
            saida.append(s)
            s = fat[s]
        return saida

    def _le_minifat(self, inicio, n):
        if inicio in (FIM_CADEIA, LIVRE) or not n:
            return []
        bruto = b"".join(self._setor(s) for s in self._cadeia(inicio, self.fat))
        return list(struct.unpack_from("<%dI" % (len(bruto) // 4), bruto, 0))

    def _le_cadeia(self, inicio, tamanho, mini):
        if inicio in (FIM_CADEIA, LIVRE):
            return b""
        if mini:
            partes = []
            for s in self._cadeia(inicio, self.minifat):
                off = s * self.mss
                partes.append(self.mini_stream[off:off + self.mss])
        else:
            partes = [self._setor(s) for s in self._cadeia(inicio, self.fat)]
        return b"".join(partes)[:tamanho]

    def _le_diretorio(self):
        bruto = b"".join(self._setor(s) for s in self._cadeia(self.dir_inicio, self.fat))
        saida = []
        for i in range(len(bruto) // 128):
            e = bruto[i * 128:(i + 1) * 128]
            tam_nome = struct.unpack_from("<H", e, 64)[0]
            nome = e[:max(0, tam_nome - 2)].decode("utf-16-le", "replace")
            saida.append({
                "nome": nome,
                "tipo": e[66],
                "inicio": struct.unpack_from("<I", e, 116)[0],
                "tamanho": struct.unpack_from("<Q", e, 120)[0],
            })
        return saida

    def stream(self, *nomes):
        for entrada in self.entradas:
            if entrada["nome"] in nomes and entrada["tipo"] == 2:
                mini = entrada["tamanho"] < self.mini_corte
                return self._le_cadeia(entrada["inicio"], entrada["tamanho"], mini)
        return None


# ---------------------------------------------------------------------------
# BIFF
# ---------------------------------------------------------------------------
def _registros(fluxo):
    i, n = 0, len(fluxo)
    while i + 4 <= n:
        ident, tam = struct.unpack_from("<HH", fluxo, i)
        i += 4
        if i + tam > n:
            break
        yield ident, fluxo[i:i + tam]
        i += tam


def _texto_unicode(dados, pos, biff8=True):
    """Lê uma string Unicode do BIFF8. Devolve (texto, nova_posicao)."""
    if not biff8:
        tam = dados[pos]
        return dados[pos + 1:pos + 1 + tam].decode("latin-1", "replace"), pos + 1 + tam
    cch = struct.unpack_from("<H", dados, pos)[0]
    grbit = dados[pos + 2]
    pos += 3
    alto = grbit & 0x01
    rico = (grbit & 0x08) >> 3
    ext = (grbit & 0x04) >> 2
    cruns = cbext = 0
    if rico:
        cruns = struct.unpack_from("<H", dados, pos)[0]
        pos += 2
    if ext:
        cbext = struct.unpack_from("<i", dados, pos)[0]
        pos += 4
    nbytes = cch * 2 if alto else cch
    bruto = dados[pos:pos + nbytes]
    pos += nbytes
    texto = bruto.decode("utf-16-le" if alto else "latin-1", "replace")
    pos += cruns * 4 + max(0, cbext)
    return texto, pos


def _texto_curto(dados, pos, biff8=True):
    """ShortXLUnicodeString: contagem de caracteres em 1 byte (usada no BOUNDSHEET)."""
    if not biff8:
        tam = dados[pos]
        return dados[pos + 1:pos + 1 + tam].decode("latin-1", "replace"), pos + 1 + tam
    cch = dados[pos]
    grbit = dados[pos + 1]
    pos += 2
    alto = grbit & 0x01
    nbytes = cch * 2 if alto else cch
    bruto = dados[pos:pos + nbytes]
    texto = bruto.decode("utf-16-le" if alto else "latin-1", "replace")
    return texto, pos + nbytes


def _le_sst(blocos):
    """Reconstrói a tabela de strings compartilhadas, tratando os CONTINUE.

    Uma string pode ser cortada no meio por um CONTINUE, e a continuação começa
    com um novo byte de flags que pode inclusive mudar a codificação. Por isso a
    leitura acompanha as fronteiras entre blocos.
    """
    if not blocos:
        return []
    dados = b"".join(blocos)
    fronteiras = set()
    acumulado = 0
    for b in blocos[:-1]:
        acumulado += len(b)
        fronteiras.add(acumulado)

    total, unicos = struct.unpack_from("<ii", dados, 0)
    pos = 8
    strings = []
    limite = len(dados)
    for _ in range(max(0, unicos)):
        if pos + 3 > limite:
            break
        cch = struct.unpack_from("<H", dados, pos)[0]
        grbit = dados[pos + 2]
        pos += 3
        alto = grbit & 0x01
        rico = (grbit & 0x08) >> 3
        ext = (grbit & 0x04) >> 2
        cruns = cbext = 0
        if rico and pos + 2 <= limite:
            cruns = struct.unpack_from("<H", dados, pos)[0]
            pos += 2
        if ext and pos + 4 <= limite:
            cbext = struct.unpack_from("<i", dados, pos)[0]
            pos += 4

        partes, faltam = [], cch
        while faltam > 0 and pos < limite:
            # quantos caracteres cabem até a próxima fronteira de CONTINUE
            proxima = min((f for f in fronteiras if f > pos), default=limite)
            largura = 2 if alto else 1
            cabem = min(faltam, max(0, (proxima - pos) // largura))
            if cabem:
                bruto = dados[pos:pos + cabem * largura]
                partes.append(bruto.decode("utf-16-le" if alto else "latin-1", "replace"))
                pos += cabem * largura
                faltam -= cabem
            if faltam > 0:
                if pos >= limite:
                    break
                pos = proxima if proxima > pos else pos
                if pos >= limite:
                    break
                alto = dados[pos] & 0x01      # novo byte de flags da continuação
                pos += 1
        strings.append("".join(partes))
        pos += cruns * 4 + max(0, cbext)
    return strings


def _valor_rk(bruto):
    inteiro = bruto & 0x02
    cem = bruto & 0x01
    if inteiro:
        valor = float(bruto >> 2) if (bruto >> 2) < 0x20000000 else float((bruto >> 2) - 0x40000000)
    else:
        valor = struct.unpack("<d", struct.pack("<I", 0) + struct.pack("<I", bruto & 0xFFFFFFFC))[0]
    return valor / 100.0 if cem else valor


FORMATOS_DATA_PADRAO = set(range(14, 23)) | {27, 28, 29, 30, 31, 32, 33, 34, 35,
                                             36, 45, 46, 47, 50, 51, 52, 53, 54,
                                             55, 56, 57, 58}


def _eh_formato_data(codigo):
    if codigo in FORMATOS_DATA_PADRAO:
        return True
    return False


def _serial_para_data(numero, base_1904):
    """Converte o serial de data do Excel em texto dd/mm/aaaa."""
    try:
        if base_1904:
            origem = datetime.datetime(1904, 1, 1)
            dias = numero
        else:
            origem = datetime.datetime(1899, 12, 31)
            dias = numero - 1 if numero >= 61 else numero   # bug do ano bissexto de 1900
        data = origem + datetime.timedelta(days=dias)
        return data.strftime("%d/%m/%Y")
    except (OverflowError, ValueError):
        return str(numero)


def _formata_numero(valor):
    if valor == int(valor) and abs(valor) < 1e15:
        return str(int(valor))
    return repr(valor)


def ler(caminho, aba=None):
    """Lê um .xls binário. Devolve (nome_da_aba, matriz de texto)."""
    with open(caminho, "rb") as fh:
        dados = fh.read()
    ole = _Ole(dados)
    fluxo = ole.stream("Workbook", "Book")
    if fluxo is None:
        raise ErroXls("stream 'Workbook' nao encontrado no arquivo .xls")

    ident, corpo = next(iter(_registros(fluxo)), (None, b""))
    if ident != BOF:
        raise ErroXls("stream Workbook nao comeca com um registro BOF")
    versao = struct.unpack_from("<H", corpo, 0)[0] if len(corpo) >= 2 else 0
    biff8 = versao >= 0x0600

    # passo 1: globais - abas, SST, formatos
    abas, sst_blocos, formatos_xf, formatos = [], [], [], {}
    base_1904 = False
    coletando_sst = False
    profundidade = 0
    for ident, corpo in _registros(fluxo):
        if ident == BOF:
            profundidade += 1
            if profundidade > 1:
                break                      # começou a primeira planilha
            continue
        if ident == SST:
            sst_blocos = [corpo]
            coletando_sst = True
            continue
        if ident == CONTINUE and coletando_sst:
            sst_blocos.append(corpo)
            continue
        coletando_sst = False
        if ident == BOUNDSHEET:
            pos = struct.unpack_from("<I", corpo, 0)[0]
            nome, _ = _texto_curto(corpo, 6, biff8)
            abas.append({"nome": nome, "pos": pos})
        elif ident == DATEMODE:
            base_1904 = struct.unpack_from("<H", corpo, 0)[0] == 1
        elif ident == FORMAT:
            codigo = struct.unpack_from("<H", corpo, 0)[0]
            texto, _ = _texto_unicode(corpo, 2, biff8)
            formatos[codigo] = texto
        elif ident == XF:
            if len(corpo) >= 4:
                formatos_xf.append(struct.unpack_from("<H", corpo, 2)[0])

    strings = _le_sst(sst_blocos)
    if not abas:
        abas = [{"nome": "Planilha1", "pos": 0}]

    escolhida = abas[0]
    if aba:
        alvo = str(aba).strip().lower()
        for a in abas:
            if a["nome"].strip().lower() == alvo:
                escolhida = a
                break

    def data_pelo_xf(indice):
        if indice >= len(formatos_xf):
            return False
        codigo = formatos_xf[indice]
        if _eh_formato_data(codigo):
            return True
        texto = formatos.get(codigo, "")
        return bool(texto) and any(m in texto.lower() for m in ("yy", "dd/", "mm/", "aaa"))

    # passo 2: células da aba escolhida
    celulas = {}
    max_linha = max_coluna = -1
    pendente_formula = None
    bof_da_aba = False
    for ident, corpo in _registros(fluxo[escolhida["pos"]:]):
        if ident == BOF:
            if bof_da_aba:
                break               # comecou outra substream
            bof_da_aba = True
            continue
        if ident == EOF_REC:
            break
        valor = None
        linha = coluna = None
        if ident == LABELSST and len(corpo) >= 10:
            linha, coluna, _, isst = struct.unpack_from("<HHHI", corpo, 0)
            valor = strings[isst] if 0 <= isst < len(strings) else ""
        elif ident in (LABEL, RSTRING) and len(corpo) >= 6:
            linha, coluna = struct.unpack_from("<HH", corpo, 0)
            valor, _ = _texto_unicode(corpo, 6, biff8)
        elif ident == RK and len(corpo) >= 10:
            linha, coluna, xf, bruto = struct.unpack_from("<HHHI", corpo, 0)
            numero = _valor_rk(bruto)
            valor = _serial_para_data(numero, base_1904) if data_pelo_xf(xf) else _formata_numero(numero)
        elif ident == MULRK and len(corpo) >= 6:
            linha, col_ini = struct.unpack_from("<HH", corpo, 0)
            n = (len(corpo) - 6) // 6
            for k in range(n):
                xf, bruto = struct.unpack_from("<HI", corpo, 4 + k * 6)
                numero = _valor_rk(bruto)
                texto = (_serial_para_data(numero, base_1904) if data_pelo_xf(xf)
                         else _formata_numero(numero))
                celulas[(linha, col_ini + k)] = texto
                max_linha = max(max_linha, linha)
                max_coluna = max(max_coluna, col_ini + k)
            continue
        elif ident == NUMBER and len(corpo) >= 14:
            linha, coluna, xf = struct.unpack_from("<HHH", corpo, 0)
            numero = struct.unpack_from("<d", corpo, 6)[0]
            valor = _serial_para_data(numero, base_1904) if data_pelo_xf(xf) else _formata_numero(numero)
        elif ident == FORMULA and len(corpo) >= 20:
            linha, coluna, xf = struct.unpack_from("<HHH", corpo, 0)
            marcador = corpo[12:14]
            if marcador == b"\xff\xff":
                tipo = corpo[6]
                if tipo == 0:                      # resultado textual: vem no STRING seguinte
                    pendente_formula = (linha, coluna)
                    continue
                if tipo == 1:
                    valor = "1" if corpo[8] else "0"
                elif tipo == 2:
                    valor = "#ERRO"
                else:
                    valor = ""
            else:
                numero = struct.unpack_from("<d", corpo, 6)[0]
                valor = (_serial_para_data(numero, base_1904) if data_pelo_xf(xf)
                         else _formata_numero(numero))
        elif ident == STRING and pendente_formula:
            linha, coluna = pendente_formula
            pendente_formula = None
            valor, _ = _texto_unicode(corpo, 0, biff8)
        else:
            continue

        if linha is not None and valor is not None:
            celulas[(linha, coluna)] = valor
            max_linha = max(max_linha, linha)
            max_coluna = max(max_coluna, coluna)

    matriz = []
    for r in range(max_linha + 1):
        matriz.append([celulas.get((r, c), "") for c in range(max_coluna + 1)])
    return escolhida["nome"], matriz


def abas(caminho):
    """Lista os nomes das abas de um .xls."""
    with open(caminho, "rb") as fh:
        ole = _Ole(fh.read())
    fluxo = ole.stream("Workbook", "Book")
    if fluxo is None:
        raise ErroXls("stream 'Workbook' nao encontrado")
    nomes, profundidade = [], 0
    for ident, corpo in _registros(fluxo):
        if ident == BOF:
            profundidade += 1
            if profundidade > 1:
                break
        elif ident == BOUNDSHEET:
            nome, _ = _texto_curto(corpo, 6, True)
            nomes.append(nome)
    return nomes

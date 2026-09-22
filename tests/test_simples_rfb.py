"""Testa a lógica de parsing de onboarding/simples_rfb.py contra HTML
sintético no estilo ASP.NET WebForms (não é o HTML real da Receita — não
pôde ser capturado por causa do bloqueio de rede do sandbox; ver o aviso
no topo de onboarding/simples_rfb.py). Serve para garantir que a
descoberta de campos e a interpretação de resultado funcionam para o
formato geral esperado; ajuste/estenda assim que tiver o HTML real.
"""
from onboarding.simples_rfb import (
    _campos_ocultos,
    _descobrir_botao,
    _descobrir_campo_cnpj,
    _extrair_inputs,
    _interpretar_resultado,
)

HTML_FORMULARIO = """
<html><body>
<form id="form1">
<input type="hidden" name="__VIEWSTATE" value="abc123" />
<input type="hidden" name="__VIEWSTATEGENERATOR" value="XYZ" />
<input type="hidden" name="__EVENTVALIDATION" value="def456" />
<input name="ctl00$ContentPlaceHolder1$txtCNPJ" id="txtCNPJ" type="text" value="" />
<input name="ctl00$ContentPlaceHolder1$btnConsultar" id="btnConsultar" type="submit" value="Consultar" />
</form>
</body></html>
"""

HTML_RESULTADO_OPTANTE = """
<html><body>
<span id="lblResultado">
A empresa XYZ LTDA é optante pelo Simples Nacional desde 01/01/2020.
</span>
</body></html>
"""

HTML_RESULTADO_NAO_OPTANTE = """
<html><body>
<span id="lblResultado">
A empresa XYZ LTDA não é optante pelo Simples Nacional na data de hoje.
</span>
</body></html>
"""

HTML_RESULTADO_DESCONHECIDO = """
<html><body>
<span id="lblResultado">CNPJ inválido, verifique os dados informados.</span>
</body></html>
"""


def test_extrai_inputs_e_campos_ocultos():
    inputs = _extrair_inputs(HTML_FORMULARIO)
    ocultos = _campos_ocultos(inputs)
    assert ocultos == {"__VIEWSTATE": "abc123", "__VIEWSTATEGENERATOR": "XYZ", "__EVENTVALIDATION": "def456"}


def test_descobre_campo_cnpj_pelo_nome():
    inputs = _extrair_inputs(HTML_FORMULARIO)
    assert _descobrir_campo_cnpj(inputs) == "ctl00$ContentPlaceHolder1$txtCNPJ"


def test_descobre_botao_consultar():
    inputs = _extrair_inputs(HTML_FORMULARIO)
    botao = _descobrir_botao(inputs)
    assert botao == {"name": "ctl00$ContentPlaceHolder1$btnConsultar", "value": "Consultar"}


def test_interpreta_resultado_optante():
    optante, mensagem = _interpretar_resultado(HTML_RESULTADO_OPTANTE)
    assert optante is True
    assert "optante" in mensagem.lower()


def test_interpreta_resultado_nao_optante():
    optante, mensagem = _interpretar_resultado(HTML_RESULTADO_NAO_OPTANTE)
    assert optante is False


def test_interpreta_resultado_desconhecido_retorna_none():
    optante, mensagem = _interpretar_resultado(HTML_RESULTADO_DESCONHECIDO)
    assert optante is None

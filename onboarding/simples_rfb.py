"""Consulta oficial de opção pelo Simples Nacional na Receita Federal.

Usa a página pública "Consulta Optante do Simples Nacional"
(https://www8.receita.fazenda.gov.br/simplesnacional/aplicacoes.aspx?id=21),
indicada pelo usuário como a mesma fonte que já usam numa automação no
Cowork — sem captcha, só precisa do CNPJ.

Essa página é um formulário ASP.NET WebForms clássico (postback com
__VIEWSTATE/__EVENTVALIDATION). Em vez de fixar os nomes exatos desses
campos "na marra" (arriscado sem poder testar ao vivo — veja abaixo), este
módulo:

1. Faz um GET na página para pegar todo campo oculto (qualquer `name`
   começando por padrão ASP.NET) e descobrir, pelo próprio HTML, qual
   input é o campo de CNPJ e qual é o botão de consulta.
2. Faz um POST com esses campos + o CNPJ preenchido, mantendo os cookies
   de sessão entre as duas requisições (obrigatório em WebForms).
3. Procura por frases-chave típicas do resultado ("optante pelo Simples
   Nacional", "não é optante", "excluída do Simples") na resposta.

IMPORTANTE — NÃO VALIDADO AO VIVO: o ambiente onde este código foi escrito
bloqueia acesso a receita.fazenda.gov.br (mesma restrição de rede que
impediu testar a BrasilAPI — veja README). Na primeira execução real, fora
deste sandbox, rode:

    python -m onboarding.simples_rfb 68717251000125 --debug

Se `optante` vier `None` com um erro de "não consegui identificar o campo
de CNPJ" ou "não consegui interpretar o resultado", o `--debug` mostra os
campos do formulário e o HTML da resposta — ajuste `_descobrir_campo_cnpj`,
`_descobrir_botao` ou os regexes de `_interpretar_resultado` com o que
aparecer ali, e rode `pytest tests/test_simples_rfb.py` para conferir que
nada quebrou.
"""
from __future__ import annotations

import http.cookiejar
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

URL_CONSULTA = "https://www8.receita.fazenda.gov.br/simplesnacional/aplicacoes.aspx?id=21"

INPUT_TAG_RE = re.compile(r"<input\b[^>]*>", re.IGNORECASE)
NAME_ATTR_RE = re.compile(r'name=["\']([^"\']+)["\']', re.IGNORECASE)
VALUE_ATTR_RE = re.compile(r'value=["\']([^"\']*)["\']', re.IGNORECASE)
TYPE_ATTR_RE = re.compile(r'type=["\']([^"\']+)["\']', re.IGNORECASE)
ID_ATTR_RE = re.compile(r'id=["\']([^"\']+)["\']', re.IGNORECASE)

_POSITIVO_RE = re.compile(r"optante\s+pelo\s+simples\s+nacional", re.IGNORECASE)
_NEGATIVO_RE = re.compile(
    r"n[aã]o\s+(?:é|consta|se encontra)[^.]{0,40}optante|exclu[íi]d[ao]\s+do\s+simples",
    re.IGNORECASE,
)


@dataclass
class SimplesConsulta:
    cnpj: str
    optante: bool | None
    mensagem: str | None
    erro: str | None = None


def _somente_digitos(cnpj: str) -> str:
    return re.sub(r"\D", "", cnpj)


def _extrair_inputs(html: str) -> list[dict]:
    inputs = []
    for tag in INPUT_TAG_RE.findall(html):
        nome = NAME_ATTR_RE.search(tag)
        if not nome:
            continue
        valor = VALUE_ATTR_RE.search(tag)
        tipo = TYPE_ATTR_RE.search(tag)
        id_ = ID_ATTR_RE.search(tag)
        inputs.append({
            "name": nome.group(1),
            "value": valor.group(1) if valor else "",
            "type": (tipo.group(1) if tipo else "text").lower(),
            "id": id_.group(1) if id_ else "",
        })
    return inputs


def _campos_ocultos(inputs: list[dict]) -> dict[str, str]:
    return {i["name"]: i["value"] for i in inputs if i["type"] == "hidden"}


def _descobrir_campo_cnpj(inputs: list[dict]) -> str | None:
    candidatos = [
        i for i in inputs
        if i["type"] in ("text", "") and "cnpj" in (i["name"] + i["id"]).lower()
    ]
    return candidatos[0]["name"] if candidatos else None


def _descobrir_botao(inputs: list[dict]) -> dict[str, str] | None:
    candidatos = [
        i for i in inputs
        if i["type"] in ("submit", "button")
        and any(p in (i["name"] + i["id"] + i["value"]).lower() for p in ("consult", "pesquis", "buscar"))
    ]
    if not candidatos:
        candidatos = [i for i in inputs if i["type"] == "submit"]
    return {"name": candidatos[0]["name"], "value": candidatos[0]["value"]} if candidatos else None


def _interpretar_resultado(html: str) -> tuple[bool | None, str | None]:
    texto = re.sub(r"<[^>]+>", " ", html)
    texto = re.sub(r"\s+", " ", texto).strip()

    if _NEGATIVO_RE.search(texto):
        optante = False
    elif _POSITIVO_RE.search(texto):
        optante = True
    else:
        optante = None

    m = re.search(r"[^.]*optante[^.]*\.", texto, re.IGNORECASE)
    mensagem = m.group(0).strip() if m else None
    return optante, mensagem


def consultar_optante_simples(cnpj: str, timeout: int = 20, debug: bool = False) -> SimplesConsulta:
    cnpj_limpo = _somente_digitos(cnpj)
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; MoraexOnboarding/1.0)",
        "Accept": "text/html",
    }

    try:
        req1 = urllib.request.Request(URL_CONSULTA, headers=headers)
        with opener.open(req1, timeout=timeout) as resp1:
            html1 = resp1.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        return SimplesConsulta(cnpj=cnpj, optante=None, mensagem=None, erro=f"Falha ao abrir a página de consulta: {exc}")

    inputs = _extrair_inputs(html1)
    ocultos = _campos_ocultos(inputs)
    campo_cnpj = _descobrir_campo_cnpj(inputs)
    botao = _descobrir_botao(inputs)

    if debug:
        print(f"[debug] campos ocultos: {list(ocultos)}")
        print(f"[debug] campo CNPJ detectado: {campo_cnpj}")
        print(f"[debug] botão detectado: {botao}")

    if not campo_cnpj:
        return SimplesConsulta(
            cnpj=cnpj, optante=None, mensagem=None,
            erro="Não consegui identificar o campo de CNPJ no formulário da Receita — "
                 "rode com --debug para ver os campos disponíveis e ajustar _descobrir_campo_cnpj().",
        )

    dados = dict(ocultos)
    dados[campo_cnpj] = cnpj_limpo
    if botao:
        dados[botao["name"]] = botao["value"]

    try:
        corpo = urllib.parse.urlencode(dados).encode("utf-8")
        req2 = urllib.request.Request(URL_CONSULTA, data=corpo, headers=headers)
        with opener.open(req2, timeout=timeout) as resp2:
            html2 = resp2.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        return SimplesConsulta(cnpj=cnpj, optante=None, mensagem=None, erro=f"Falha ao enviar a consulta: {exc}")

    if debug:
        print("[debug] resposta bruta (primeiros 3000 chars):")
        print(html2[:3000])

    optante, mensagem = _interpretar_resultado(html2)
    erro = (
        None if optante is not None
        else "Não consegui interpretar o resultado automaticamente — confira manualmente "
             "(rode com --debug para ver a resposta completa)."
    )
    return SimplesConsulta(cnpj=cnpj, optante=optante, mensagem=mensagem, erro=erro)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Consulta optante pelo Simples Nacional (Receita Federal)")
    parser.add_argument("cnpj")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()
    print(consultar_optante_simples(args.cnpj, debug=args.debug))

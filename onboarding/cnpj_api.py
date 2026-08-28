"""Cliente para consulta de CNPJ via BrasilAPI.

BrasilAPI (https://brasilapi.com.br) é pública, gratuita e não exige chave.
Endpoint usado: GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}

Observação: o ambiente onde este código foi escrito bloqueia saída de rede
para domínios externos, então esta função não pôde ser testada ao vivo
durante o desenvolvimento. O formato de resposta abaixo é o documentado e
estável da BrasilAPI (campos como opcao_pelo_simples, opcao_pelo_mei,
descricao_situacao_cadastral). Confirme os nomes de campo rodando:

    python -m onboarding.cnpj_api 68717251000125

fora deste sandbox, na primeira execução real, e ajuste se algo tiver
mudado no contrato da API.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field

BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"


@dataclass
class CnaeSecundario:
    codigo: str
    descricao: str


@dataclass
class DadosCnpj:
    cnpj: str
    razao_social: str | None
    nome_fantasia: str | None
    situacao_cadastral: str | None
    data_situacao_cadastral: str | None
    data_inicio_atividade: str | None
    cnae_fiscal_codigo: str | None
    cnae_fiscal_descricao: str | None
    cnaes_secundarios: list[CnaeSecundario] = field(default_factory=list)
    natureza_juridica: str | None = None
    porte: str | None = None
    municipio: str | None = None
    uf: str | None = None
    bairro: str | None = None
    endereco: str | None = None
    optante_simples: bool | None = None
    optante_mei: bool | None = None
    erro: str | None = None


def _somente_digitos(cnpj: str) -> str:
    return re.sub(r"\D", "", cnpj)


def tipo_estabelecimento(cnpj: str) -> str:
    """'Matriz' se os 4 dígitos da ordem no CNPJ forem 0001, senão 'Filial'."""
    digitos = _somente_digitos(cnpj)
    if len(digitos) != 14:
        return "-"
    return "Matriz" if digitos[8:12] == "0001" else "Filial"


def consultar_cnpj(cnpj: str, timeout: int = 15) -> DadosCnpj:
    cnpj_limpo = _somente_digitos(cnpj)
    url = BRASILAPI_URL.format(cnpj=cnpj_limpo)
    req = urllib.request.Request(url, headers={"Accept": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return _erro(cnpj, f"HTTP {exc.code} ao consultar CNPJ {cnpj_limpo}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return _erro(cnpj, f"Falha de rede ao consultar CNPJ {cnpj_limpo}: {exc}")
    except json.JSONDecodeError as exc:
        return _erro(cnpj, f"Resposta inválida da BrasilAPI para {cnpj_limpo}: {exc}")

    secundarios = [
        CnaeSecundario(
            codigo=str(c.get("codigo", "")),
            descricao=c.get("descricao", ""),
        )
        for c in (payload.get("cnaes_secundarios") or [])
    ]

    endereco_partes = [
        payload.get("descricao_tipo_de_logradouro"),
        payload.get("logradouro"),
        payload.get("numero"),
        payload.get("complemento"),
        payload.get("bairro"),
        payload.get("municipio"),
        payload.get("uf"),
        payload.get("cep"),
    ]
    endereco = ", ".join(str(p) for p in endereco_partes if p)

    return DadosCnpj(
        cnpj=cnpj,
        razao_social=payload.get("razao_social"),
        nome_fantasia=payload.get("nome_fantasia"),
        situacao_cadastral=payload.get("descricao_situacao_cadastral"),
        data_situacao_cadastral=payload.get("data_situacao_cadastral"),
        data_inicio_atividade=payload.get("data_inicio_atividade"),
        cnae_fiscal_codigo=(
            str(payload["cnae_fiscal"]) if payload.get("cnae_fiscal") is not None else None
        ),
        cnae_fiscal_descricao=payload.get("cnae_fiscal_descricao"),
        cnaes_secundarios=secundarios,
        natureza_juridica=payload.get("descricao_natureza_juridica") or payload.get("natureza_juridica"),
        porte=payload.get("porte") or payload.get("descricao_porte"),
        municipio=payload.get("municipio"),
        uf=payload.get("uf"),
        bairro=payload.get("bairro"),
        endereco=endereco or None,
        optante_simples=payload.get("opcao_pelo_simples"),
        optante_mei=payload.get("opcao_pelo_mei"),
    )


def _erro(cnpj: str, mensagem: str) -> DadosCnpj:
    return DadosCnpj(
        cnpj=cnpj, razao_social=None, nome_fantasia=None, situacao_cadastral=None,
        data_situacao_cadastral=None, data_inicio_atividade=None,
        cnae_fiscal_codigo=None, cnae_fiscal_descricao=None, cnaes_secundarios=[],
        natureza_juridica=None, porte=None, municipio=None, uf=None, bairro=None,
        endereco=None, optante_simples=None, optante_mei=None, erro=mensagem,
    )


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("Uso: python -m onboarding.cnpj_api <cnpj>")
        raise SystemExit(1)
    print(consultar_cnpj(sys.argv[1]))

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
from dataclasses import dataclass

BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"


@dataclass
class DadosCnpj:
    cnpj: str
    razao_social: str | None
    nome_fantasia: str | None
    situacao_cadastral: str | None
    data_situacao_cadastral: str | None
    data_inicio_atividade: str | None
    cnae_fiscal_descricao: str | None
    natureza_juridica: str | None
    porte: str | None
    endereco: str | None
    optante_simples: bool | None
    optante_mei: bool | None
    erro: str | None = None


def _somente_digitos(cnpj: str) -> str:
    return re.sub(r"\D", "", cnpj)


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
        cnae_fiscal_descricao=payload.get("cnae_fiscal_descricao"),
        natureza_juridica=payload.get("descricao_natureza_juridica") or payload.get("natureza_juridica"),
        porte=payload.get("porte") or payload.get("descricao_porte"),
        endereco=endereco or None,
        optante_simples=payload.get("opcao_pelo_simples"),
        optante_mei=payload.get("opcao_pelo_mei"),
    )


def _erro(cnpj: str, mensagem: str) -> DadosCnpj:
    return DadosCnpj(
        cnpj=cnpj, razao_social=None, nome_fantasia=None, situacao_cadastral=None,
        data_situacao_cadastral=None, data_inicio_atividade=None,
        cnae_fiscal_descricao=None, natureza_juridica=None, porte=None,
        endereco=None, optante_simples=None, optante_mei=None, erro=mensagem,
    )


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("Uso: python -m onboarding.cnpj_api <cnpj>")
        raise SystemExit(1)
    print(consultar_cnpj(sys.argv[1]))

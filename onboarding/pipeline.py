"""Orquestra o processamento de um e-mail 'EMPRESA NOVA' da Thays:

1. Faz o parsing das empresas citadas no e-mail.
2. Consulta a Receita Federal (via BrasilAPI) para cada CNPJ: situação
   cadastral e opção pelo Simples Nacional, comparando com o que a Thays
   informou.
3. Verifica se o certificado digital (.pfx) da empresa veio anexado ao
   e-mail; se não veio, gera um alerta para cobrança.
4. Gera uma ficha de onboarding (Markdown) por empresa.
5. Adiciona as empresas na lista de empresas pendentes de distribuição
   (CSV), sem duplicar entradas já existentes (mesmo nº de cliente).
"""
from __future__ import annotations

import csv
import datetime as dt
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from onboarding.cnpj_api import DadosCnpj, consultar_cnpj
from onboarding.ficha_template import gerar_ficha
from onboarding.parser import EmpresaRaw, extrair_anexos_email, parse_email

# MEI normalmente não opera com e-CNPJ no dia a dia do escritório; ajuste
# para True se a Moraex também exigir certificado digital para MEIs.
MEI_EXIGE_CERTIFICADO = False

PENDENTES_CSV_COLUNAS = [
    "numero", "empresa", "cnpj", "regime_informado", "regime_simples_api",
    "divergencia_regime", "situacao_cadastral", "certificado_recebido",
    "alerta_certificado", "email_contato", "grupo_obs", "data_processamento",
    "status_distribuicao",
]


def _normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]", "", texto).upper()


def certificado_presente(nome_empresa: str, cnpj: str, anexos: list[str]) -> tuple[bool, str | None]:
    """Tenta casar a empresa com um dos arquivos anexados ao e-mail.

    Estratégia: primeiro tenta achar os dígitos do CNPJ dentro do nome do
    arquivo (muitos .pfx incluem o CNPJ no nome); se não achar, tenta um
    match tolerante pelo prefixo do nome da empresa (os nomes de arquivo às
    vezes vêm truncados ou com sufixos como "LTDA" cortados).
    """
    nome_norm = _normalizar(nome_empresa)
    cnpj_digitos = re.sub(r"\D", "", cnpj)
    prefixo = nome_norm[: max(6, int(len(nome_norm) * 0.6))]

    for anexo in anexos:
        anexo_norm = _normalizar(anexo)
        if cnpj_digitos and cnpj_digitos in anexo_norm:
            return True, anexo
        if prefixo and prefixo in anexo_norm:
            return True, anexo
    return False, None


def _checar_divergencia(regime_informado: str | None, dados: DadosCnpj) -> str | None:
    if dados.erro or regime_informado is None:
        return None
    if regime_informado == "Simples Nacional" and dados.optante_simples is False:
        return "Thays informou Simples Nacional, mas a Receita não confirma opção pelo Simples"
    if regime_informado in ("Lucro Presumido", "Lucro Real") and dados.optante_simples:
        return f"Thays informou {regime_informado}, mas a empresa consta como optante pelo Simples Nacional"
    if regime_informado == "MEI" and dados.optante_mei is False:
        return "Thays informou MEI, mas a Receita não confirma opção pelo MEI"
    return None


def _slug(nome: str) -> str:
    base = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:60]


def _dados_cnpj_vazios(cnpj: str, motivo: str) -> DadosCnpj:
    return DadosCnpj(
        cnpj=cnpj, razao_social=None, nome_fantasia=None, situacao_cadastral=None,
        data_situacao_cadastral=None, data_inicio_atividade=None,
        cnae_fiscal_descricao=None, natureza_juridica=None, porte=None,
        endereco=None, optante_simples=None, optante_mei=None, erro=motivo,
    )


@dataclass
class ResultadoEmpresa:
    raw: EmpresaRaw
    dados_cnpj: DadosCnpj
    certificado_ok: bool
    certificado_arquivo: str | None
    alerta_certificado: bool
    divergencia_regime: str | None
    ficha_path: Path


def processar_email(
    texto_email: str,
    fichas_dir: Path,
    pendentes_csv: Path,
    consultar: bool = True,
) -> list[ResultadoEmpresa]:
    empresas = parse_email(texto_email)
    anexos = extrair_anexos_email(texto_email)
    fichas_dir.mkdir(parents=True, exist_ok=True)
    pendentes_csv.parent.mkdir(parents=True, exist_ok=True)

    hoje = dt.date.today().isoformat()
    resultados: list[ResultadoEmpresa] = []
    novas_linhas: list[list[str]] = []

    for raw in empresas:
        dados = (
            consultar_cnpj(raw.cnpj)
            if consultar
            else _dados_cnpj_vazios(raw.cnpj, "Consulta de CNPJ desabilitada nesta execução")
        )

        cert_ok, cert_arquivo = certificado_presente(raw.nome, raw.cnpj, anexos)
        if raw.regime_informado == "MEI" and not MEI_EXIGE_CERTIFICADO:
            alerta_cert = False
        else:
            alerta_cert = not cert_ok

        divergencia = _checar_divergencia(raw.regime_informado, dados)

        ficha_path = fichas_dir / f"{raw.numero}-{_slug(raw.nome)}.md"
        ficha_path.write_text(
            gerar_ficha(raw, dados, cert_ok, cert_arquivo, divergencia), encoding="utf-8"
        )

        regime_simples_api = (
            "Sim" if dados.optante_simples is True
            else "Não" if dados.optante_simples is False
            else "?"
        )
        novas_linhas.append([
            raw.numero,
            raw.nome,
            raw.cnpj,
            raw.regime_informado or "",
            regime_simples_api,
            divergencia or "",
            dados.situacao_cadastral or "",
            "Sim" if cert_ok else "Não",
            "SIM - cobrar certificado" if alerta_cert else "",
            "; ".join(raw.email_contato),
            raw.observacao or "",
            hoje,
            "Pendente",
        ])

        resultados.append(
            ResultadoEmpresa(raw, dados, cert_ok, cert_arquivo, alerta_cert, divergencia, ficha_path)
        )

    _atualizar_pendentes_csv(pendentes_csv, novas_linhas)
    return resultados


def _atualizar_pendentes_csv(path: Path, novas_linhas: list[list[str]]) -> None:
    existe = path.exists()
    numeros_existentes: set[str] = set()
    if existe:
        with path.open("r", encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                numeros_existentes.add(row.get("numero", ""))

    with path.open("a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        if not existe:
            writer.writerow(PENDENTES_CSV_COLUNAS)
        for linha in novas_linhas:
            if linha[0] in numeros_existentes:
                continue  # empresa com esse Nº já está na lista, não duplica
            writer.writerow(linha)

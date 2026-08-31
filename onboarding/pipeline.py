"""Orquestra o processamento de um e-mail 'EMPRESA NOVA' da Thays:

1. Faz o parsing das empresas citadas no e-mail.
2. Consulta a Receita Federal para cada CNPJ: situação cadastral,
   atividade, porte e endereço via BrasilAPI, e a opção pelo Simples
   Nacional via consulta oficial (onboarding/simples_rfb.py, a mesma fonte
   usada numa automação do Cowork) — comparando com o que a Thays informou.
3. Verifica se o certificado digital (.pfx) da empresa veio anexado ao
   e-mail; se não veio, gera um alerta para cobrança.
4. Monta a "FICHA DE ABERTURA — ONBOARDING FISCAL" de cada empresa, no
   padrão real usado pelo Departamento Fiscal da Moraex, e grava em
   fichas/ (.pdf e .md).
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

from onboarding.cnpj_api import CnaeSecundario, DadosCnpj, consultar_cnpj, tipo_estabelecimento
from onboarding.ficha_template import FichaOnboarding, gerar_ficha_markdown, gerar_ficha_pdf
from onboarding.parser import EmpresaRaw, extrair_anexos_email, extrair_data_email, parse_email
from onboarding.simples_rfb import SimplesConsulta, consultar_optante_simples

# MEI normalmente não opera com e-CNPJ no dia a dia do escritório; ajuste
# para True se a Moraex também exigir certificado digital para MEIs.
MEI_EXIGE_CERTIFICADO = False

PENDENTES_CSV_COLUNAS = [
    "numero", "empresa", "cnpj", "regime_informado", "regime_simples_api",
    "divergencia_regime", "situacao_cadastral", "certificado_recebido",
    "alerta_certificado", "email_contato", "grupo_obs", "data_processamento",
    "status_distribuicao",
]

GENERIC_WORDS = {
    "E", "DE", "DA", "DO", "DOS", "DAS", "LTDA", "EIRELI", "ME", "EPP",
    "MEI", "SA", "S", "A", "COMERCIO", "SERVICOS", "SERVICO", "COMERCIAL",
}

SUFIXO_REGIME = {
    "Lucro Real": "PIS/COFINS não-cumulativo; apuração IRPJ/CSLL",
    "Lucro Presumido": "PIS/COFINS cumulativo; IRPJ/CSLL trimestral",
    "MEI": "DAS-MEI fixo mensal",
}

PALAVRAS_SERVICO_FATOR_R = (
    "escritorio", "administrativ", "intermediac", "agenciamento", "consultoria",
    "assessoria", "ensino", "treinamento", "advocacia", "engenharia", "auditoria",
    "corretagem", "representacao comercial",
)


def _normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]", "", texto).upper()


def _normalizar_livre(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return texto.lower()


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


def _optante_simples_resolvido(dados: DadosCnpj, simples: SimplesConsulta | None) -> bool | None:
    """Prioriza a consulta oficial (onboarding/simples_rfb.py); cai para o
    campo opcao_pelo_simples da BrasilAPI se a consulta oficial falhar ou
    não tiver sido feita."""
    if simples is not None and simples.optante is not None:
        return simples.optante
    return dados.optante_simples


def _checar_divergencia(
    regime_informado: str | None, dados: DadosCnpj, simples: SimplesConsulta | None
) -> str | None:
    if regime_informado is None:
        return None
    optante = _optante_simples_resolvido(dados, simples)
    if optante is None:
        return None
    if regime_informado == "Simples Nacional" and optante is False:
        return "Thays informou Simples Nacional, mas a Receita não confirma opção pelo Simples"
    if regime_informado in ("Lucro Presumido", "Lucro Real") and optante:
        return f"Thays informou {regime_informado}, mas a empresa consta como optante pelo Simples Nacional"
    if regime_informado == "MEI" and dados.optante_mei is False:
        return "Thays informou MEI, mas a Receita não confirma opção pelo MEI"
    return None


def _simples_para_ficha(simples: SimplesConsulta | None) -> tuple[str, bool]:
    """Monta o texto/checkbox da linha 'Simples Nacional' da seção 4 da
    ficha a partir do resultado da consulta oficial."""
    if simples is None:
        return "(a preencher)", False
    if simples.optante is True:
        return simples.mensagem or "Optante pelo Simples Nacional (confirmado na Receita).", True
    if simples.optante is False:
        return simples.mensagem or "Não optante pelo Simples Nacional (confirmado na Receita).", True
    if simples.erro:
        return f"Não consultado ({simples.erro})", False
    return "(a preencher)", False


def _simples_vazio(cnpj: str, motivo: str) -> SimplesConsulta:
    return SimplesConsulta(cnpj=cnpj, optante=None, mensagem=None, erro=motivo)


def slug_ficha(razao_social: str) -> str:
    """Aproxima o padrão de nome de arquivo visto nas fichas reais
    (ex: '1047_PRONTO_PIX_III.pdf'): primeiras palavras significativas da
    razão social, sem sufixos societários. É uma aproximação — ajuste o
    nome do arquivo manualmente se quiser bater exatamente com o padrão
    que o time já usa.
    """
    palavras = re.findall(r"[A-Za-zÀ-Ü0-9&]+", razao_social.upper())
    significativas = [p for p in palavras if p not in GENERIC_WORDS]
    escolhidas = (significativas or palavras)[:2]
    slug = "_".join(escolhidas)
    slug = unicodedata.normalize("NFKD", slug).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^A-Z0-9_]", "", slug.upper())
    return slug or "EMPRESA"


def _raiz_cnpj(cnpj: str) -> str:
    return re.sub(r"\D", "", cnpj)[:8]


def _nome_grupo_de_observacao(observacao: str | None) -> str | None:
    if not observacao:
        return None
    m = re.search(r"mesmo grupo\s+d[aoe]s?\s+(.+)", observacao, re.IGNORECASE)
    return m.group(1).strip(" .") if m else None


def _detectar_grupo_economico(idx: int, raws: list[EmpresaRaw], tipos: list[str]) -> str:
    obs_grupo = _nome_grupo_de_observacao(raws[idx].observacao)
    if obs_grupo:
        return obs_grupo

    raiz = _raiz_cnpj(raws[idx].cnpj)
    irmaos = [j for j in range(len(raws)) if j != idx and _raiz_cnpj(raws[j].cnpj) == raiz]
    if not irmaos:
        return "—"

    primeira_palavra = raws[idx].nome.split()[0].capitalize()
    tem_matriz = any(tipos[j] == "Matriz" for j in irmaos + [idx])
    sufixo = "(matriz+filial)" if tem_matriz else "(rede)"
    return f"{primeira_palavra} {sufixo}"


def _formatar_codigo_cnae(codigo: str) -> str:
    d = re.sub(r"\D", "", codigo).rjust(7, "0")
    return f"{d[0:2]}.{d[2:4]}-{d[4]}-{d[5:7]}"


def _formatar_cnae_principal(dados: DadosCnpj) -> str:
    if dados.erro:
        return "(não consultado — falha ao acessar a Receita)"
    if not dados.cnae_fiscal_codigo:
        return "-"
    codigo = _formatar_codigo_cnae(dados.cnae_fiscal_codigo)
    return f"{codigo} — {dados.cnae_fiscal_descricao}" if dados.cnae_fiscal_descricao else codigo


def _formatar_cnaes_secundarios(dados: DadosCnpj) -> str:
    if dados.erro:
        return "(não consultado)"
    secundarios: list[CnaeSecundario] = dados.cnaes_secundarios
    if not secundarios:
        return "Não informada"
    if len(secundarios) == 1:
        c = secundarios[0]
        return f"{_formatar_codigo_cnae(c.codigo)} — {c.descricao}"
    return "; ".join(_formatar_codigo_cnae(c.codigo) for c in secundarios)


def _regime_enquadramento(regime_informado: str | None, dados: DadosCnpj) -> str:
    if regime_informado is None:
        return "A definir — definir regime (não informado no e-mail)"
    if regime_informado == "Simples Nacional":
        cnae_norm = _normalizar_livre(dados.cnae_fiscal_descricao or "")
        if any(p in cnae_norm for p in PALAVRAS_SERVICO_FATOR_R):
            return "Simples Nacional — avaliar Fator R → Anexo III (folha ≥ 28% RBT12)"
        return "Simples Nacional — confirmar anexo pela atividade"
    sufixo = SUFIXO_REGIME.get(regime_informado)
    return f"{regime_informado} — {sufixo}" if sufixo else regime_informado


def _particularidades(
    raw: EmpresaRaw,
    dados: DadosCnpj,
    grupo: str,
    divergencia: str | None,
    certificado_ok: bool,
    todos_numeros: list[str],
) -> list[str]:
    bullets: list[str] = []

    if dados.erro:
        bullets.append(
            "CNAE, endereço e situação cadastral não confirmados automaticamente "
            f"(falha ao consultar a Receita: {dados.erro}) — conferir manualmente."
        )

    if dados.natureza_juridica and "individual" in dados.natureza_juridica.lower():
        bullets.append("EMPRESÁRIO INDIVIDUAL — não é sociedade; cadastro/procuração próprios do EI.")

    if grupo != "—":
        bullets.append(f"Mesmo grupo: {grupo}.")

    if divergencia:
        bullets.append(f"ATENÇÃO: {divergencia}.")

    if dados.uf and dados.uf.upper() != "RJ":
        bullets.append(
            f"ATENÇÃO: estabelecimento em {dados.municipio}/{dados.uf} — "
            "ISS/IM local, não no RJ (checar SEFAZ do estado correspondente)."
        )

    if not dados.erro and dados.cnae_fiscal_descricao:
        cnae_norm = _normalizar_livre(dados.cnae_fiscal_descricao)
        if any(p in cnae_norm for p in ("comerc", "varejista", "atacadista")):
            bullets.append("Atividade de comércio — atenção a ICMS (e possível ST, conforme NCM).")
        elif raw.regime_informado == "Simples Nacional" and any(p in cnae_norm for p in PALAVRAS_SERVICO_FATOR_R):
            bullets.append("Atividade de serviço — ISS/NFS-e; avaliar Fator R.")
        elif "servi" in cnae_norm:
            bullets.append("Atividade de serviço — ISS/NFS-e.")

    try:
        numero_int = int(raw.numero)
        outros = [int(n) for n in todos_numeros if n != raw.numero]
        if outros and numero_int < 1000 and any(o >= 1000 for o in outros):
            bullets.append(
                f"N° de cliente {raw.numero} fora da série atual — confirmar se é reativação/registro antigo."
            )
    except ValueError:
        pass

    if certificado_ok:
        bullets.append("Certificado A1 (.pfx) anexado — validar titularidade e validade.")

    if raw.email_contato and len(bullets) < 2:
        bullets.append(f"Contato: {'; '.join(raw.email_contato)}.")

    return bullets[:5]


def _dados_cnpj_vazios(cnpj: str, motivo: str) -> DadosCnpj:
    return DadosCnpj(
        cnpj=cnpj, razao_social=None, nome_fantasia=None, situacao_cadastral=None,
        data_situacao_cadastral=None, data_inicio_atividade=None,
        cnae_fiscal_codigo=None, cnae_fiscal_descricao=None, cnaes_secundarios=[],
        natureza_juridica=None, porte=None, municipio=None, uf=None, bairro=None,
        endereco=None, optante_simples=None, optante_mei=None, erro=motivo,
    )


@dataclass
class ResultadoEmpresa:
    raw: EmpresaRaw
    dados_cnpj: DadosCnpj
    simples_consulta: SimplesConsulta
    certificado_ok: bool
    certificado_arquivo: str | None
    alerta_certificado: bool
    divergencia_regime: str | None
    ficha: FichaOnboarding
    ficha_pdf: Path
    ficha_md: Path


def processar_email(
    texto_email: str,
    fichas_dir: Path,
    pendentes_csv: Path,
    consultar: bool = True,
) -> list[ResultadoEmpresa]:
    empresas = parse_email(texto_email)
    anexos = extrair_anexos_email(texto_email)
    data_email = extrair_data_email(texto_email)
    fichas_dir.mkdir(parents=True, exist_ok=True)
    pendentes_csv.parent.mkdir(parents=True, exist_ok=True)

    hoje = dt.date.today().isoformat()
    recebido_em = data_email or dt.date.today().strftime("%d/%m/%Y")
    todos_numeros = [e.numero for e in empresas]

    # 1ª passada: CNPJ + Simples Nacional + tipo de estabelecimento para
    # todas as empresas do lote, necessário para detectar matriz/filial do
    # mesmo grupo.
    lista_dados: list[DadosCnpj] = []
    lista_simples: list[SimplesConsulta] = []
    lista_tipos: list[str] = []
    for raw in empresas:
        if consultar:
            dados = consultar_cnpj(raw.cnpj)
            simples = consultar_optante_simples(raw.cnpj)
        else:
            dados = _dados_cnpj_vazios(raw.cnpj, "Consulta de CNPJ desabilitada nesta execução")
            simples = _simples_vazio(raw.cnpj, "Consulta de Simples Nacional desabilitada nesta execução")
        lista_dados.append(dados)
        lista_simples.append(simples)
        lista_tipos.append(tipo_estabelecimento(raw.cnpj))

    resultados: list[ResultadoEmpresa] = []
    novas_linhas: list[list[str]] = []

    for i, raw in enumerate(empresas):
        dados = lista_dados[i]
        simples = lista_simples[i]
        tipo = lista_tipos[i]

        cert_ok, cert_arquivo = certificado_presente(raw.nome, raw.cnpj, anexos)
        if raw.regime_informado == "MEI" and not MEI_EXIGE_CERTIFICADO:
            alerta_cert = False
        else:
            alerta_cert = not cert_ok

        divergencia = _checar_divergencia(raw.regime_informado, dados, simples)
        grupo = _detectar_grupo_economico(i, empresas, lista_tipos)
        simples_situacao, simples_ok = _simples_para_ficha(simples)

        ficha = FichaOnboarding(
            numero=raw.numero,
            recebido_em=recebido_em,
            razao_social=dados.razao_social or raw.nome,
            cnpj=raw.cnpj,
            tipo=tipo,
            abertura=dados.data_inicio_atividade or "-",
            porte=dados.porte or "-",
            municipio_uf=(f"{dados.municipio}/{dados.uf}" if dados.municipio and dados.uf else "-"),
            grupo_economico=grupo,
            email_cliente="; ".join(raw.email_contato) or "(não informado)",
            cnae_principal=_formatar_cnae_principal(dados),
            cnaes_secundarios=_formatar_cnaes_secundarios(dados),
            regime_enquadramento=_regime_enquadramento(raw.regime_informado, dados),
            certificado_status="recebido" if cert_ok else "pendente",
            senha_status="arquivada" if raw.senha_certificado else "pendente",
            simples_situacao=simples_situacao,
            simples_ok=simples_ok,
            particularidades=_particularidades(raw, dados, grupo, divergencia, cert_ok, todos_numeros),
        )

        base = fichas_dir / f"{raw.numero}_{slug_ficha(ficha.razao_social)}"
        ficha_pdf = base.with_suffix(".pdf")
        ficha_md = base.with_suffix(".md")
        gerar_ficha_pdf(ficha, ficha_pdf)
        ficha_md.write_text(gerar_ficha_markdown(ficha), encoding="utf-8")

        optante_resolvido = _optante_simples_resolvido(dados, simples)
        regime_simples_api = (
            "Sim" if optante_resolvido is True
            else "Não" if optante_resolvido is False
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
            ResultadoEmpresa(
                raw, dados, simples, cert_ok, cert_arquivo, alerta_cert, divergencia, ficha, ficha_pdf, ficha_md
            )
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

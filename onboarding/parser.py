"""Parser para os e-mails "EMPRESA NOVA" enviados pela Thays (Moraex).

O formato não é 100% padronizado entre os e-mails (bullet ou não, "CNPJ:"
com ou sem o rótulo, "N°"/"n°", espaçamento variável), então o parser usa
heurísticas de regex sobre blocos de texto delimitados pela ocorrência de
"<nome da empresa> CNPJ ... N°####". Se a Thays mudar o formato do e-mail,
ajuste os padrões abaixo e rode `pytest` para conferir contra os exemplos
reais em fixtures/.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

CNPJ_FMT_RE = re.compile(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}")

# Cabeçalho de bloco: [NOME DA EMPRESA] [CNPJ:]? CNPJ [espaço] N°/n° NUMERO
# Nome não inclui dígitos de propósito: evita que telefones/valores soltos
# no texto anterior sejam engolidos pelo grupo não-guloso "nome".
BLOCO_HEADER_RE = re.compile(
    r"(?P<nome>[A-ZÀ-Ü&,.\-\s]{4,}?)\s*"
    r"(?:CNPJ\s*:?\s*)?"
    r"(?P<cnpj>\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})\s*"
    r"[Nn]\W?°\s*(?P<numero>\d+)"
)

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
SENHA_RE = re.compile(r"senha\s*(?:certificado)?\s*:?\s*([^\n]+)", re.IGNORECASE)
CELULAR_RE = re.compile(r"celular\s*:?\s*([\d()\-\s+]{8,})", re.IGNORECASE)
ANEXOS_LINE_RE = re.compile(r"\d+\s+anexos?\s*\([^)]*\)\s*\n(?P<lista>[^\n]+)", re.IGNORECASE)

REGIME_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("MEI", re.compile(r"\bMEI\b", re.IGNORECASE)),
    ("Simples Nacional", re.compile(r"simples\s+nacional|optante\s+pelo\s+simples", re.IGNORECASE)),
    ("Lucro Presumido", re.compile(r"lucro\s+presumido", re.IGNORECASE)),
    ("Lucro Real", re.compile(r"lucro\s+real", re.IGNORECASE)),
]


@dataclass
class EmpresaRaw:
    numero: str
    nome: str
    cnpj: str
    regime_informado: str | None = None
    email_contato: list[str] = field(default_factory=list)
    senha_certificado: str | None = None
    celular: str | None = None
    observacao: str | None = None
    bloco_texto: str = ""


def _limpar_nome(nome: str) -> str:
    nome = nome.strip(" \t\n-•.")
    return re.sub(r"\s+", " ", nome)


def parse_email(texto: str) -> list[EmpresaRaw]:
    """Extrai as empresas citadas em um e-mail "EMPRESA NOVA" da Thays."""
    matches = list(BLOCO_HEADER_RE.finditer(texto))
    empresas: list[EmpresaRaw] = []

    for i, m in enumerate(matches):
        inicio_corpo = m.end()
        fim_corpo = matches[i + 1].start() if i + 1 < len(matches) else len(texto)
        corpo = texto[inicio_corpo:fim_corpo]

        regime = None
        for label, pat in REGIME_PATTERNS:
            if pat.search(corpo):
                regime = label
                break

        senha_m = SENHA_RE.search(corpo)
        celular_m = CELULAR_RE.search(corpo)

        obs = None
        obs_m = re.search(r"(?:obs\.?|observa[cç][aã]o)\s*:?\s*([^\n]+)", corpo, re.IGNORECASE)
        if obs_m:
            obs = obs_m.group(1).strip()
        else:
            grupo_m = re.search(r"mesmo grupo[^\n]*", corpo, re.IGNORECASE)
            if grupo_m:
                obs = grupo_m.group(0).strip()

        empresas.append(
            EmpresaRaw(
                numero=m.group("numero"),
                nome=_limpar_nome(m.group("nome")),
                cnpj=m.group("cnpj"),
                regime_informado=regime,
                email_contato=EMAIL_RE.findall(corpo),
                senha_certificado=senha_m.group(1).strip() if senha_m else None,
                celular=celular_m.group(1).strip() if celular_m else None,
                observacao=obs,
                bloco_texto=corpo.strip(),
            )
        )

    return empresas


def extrair_anexos_email(texto: str) -> list[str]:
    """Retorna os nomes de arquivo listados nas linhas 'N anexos (...)' do e-mail."""
    anexos: list[str] = []
    for m in ANEXOS_LINE_RE.finditer(texto):
        anexos.extend(n.strip() for n in m.group("lista").split(";") if n.strip())
    return anexos

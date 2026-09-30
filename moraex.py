#!/usr/bin/env python3
"""moraex — entrada única da rotina de onboarding do Dep. Fiscal (Moraex).

Antes, cada etapa era um comando diferente, com convenção de argumento
diferente. Agora é um script só, com subcomandos na ordem do fluxo:

    ETAPA 1 — chega o e-mail "EMPRESA NOVA" da Thays
      python moraex.py triagem  --email email.txt      fichas + lista de pendentes
      python moraex.py planilha                        formulário da reunião com o Paulo
      python moraex.py etapa1   --email email.txt      as duas de uma vez

    -- reunião com o Paulo; a planilha é preenchida à mão --

    ETAPA 2 — implantação
      python moraex.py pastas   --planilha p.xlsx      CSV do lote + comando PowerShell
      python moraex.py carteira --planilha p.xlsx --carteira c.xlsx
      python moraex.py etapa2   --planilha p.xlsx --carteira c.xlsx

    A QUALQUER MOMENTO
      python moraex.py status   --carteira c.xlsx      quem está em carência e quem libera
      python moraex.py skills                          valida/empacota as skills

Toda saída aceita `--json`, para quem estiver lendo o resultado por
programa em vez de ler na tela.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

FICHAS_DIR = Path("fichas")
PENDENTES_CSV = Path("data/empresas_pendentes_distribuicao.csv")
DATA_DIR = Path("data")
HOJE = dt.date.today().isoformat()


# --------------------------------------------------------------------
# apresentação
# --------------------------------------------------------------------

def _titulo(texto: str) -> None:
    print(f"\n{texto}\n{'-' * len(texto)}")


def _bloco(titulo: str, itens: list) -> None:
    if itens:
        print(f"\n{titulo} ({len(itens)}):")
        for i in itens:
            print(f"  - {i}")


def _proximo(*linhas: str) -> None:
    print("\nPróximo passo:")
    for linha in linhas:
        print(f"  {linha}")


def _emitir(dados: dict, args) -> int:
    """Em modo --json, imprime o resultado estruturado e cala o resto."""
    if getattr(args, "json", False):
        print(json.dumps(dados, ensure_ascii=False, indent=2, default=str))
    return 0


# --------------------------------------------------------------------
# etapa 1
# --------------------------------------------------------------------

def cmd_triagem(args) -> int:
    from onboarding.pipeline import processar_email

    texto = Path(args.email).read_text(encoding="utf-8")
    resultados = processar_email(
        texto, Path(args.fichas), Path(args.pendentes), consultar=not args.sem_consulta
    )
    if not resultados:
        print("Nenhuma empresa encontrada no texto informado. Confira o formato do e-mail.")
        return 1

    alertas_cert, divergencias, sem_consulta = [], [], []
    for r in resultados:
        if r.alerta_certificado:
            alertas_cert.append(f"{r.raw.nome} (N°{r.raw.numero}, CNPJ {r.raw.cnpj})")
        if r.divergencia_regime:
            divergencias.append(f"{r.raw.nome} (N°{r.raw.numero}): {r.divergencia_regime}")
        if r.dados_cnpj.erro or r.simples_consulta.erro:
            sem_consulta.append(
                f"{r.raw.nome}: {r.dados_cnpj.erro or r.simples_consulta.erro}"
            )

    dados = {
        "comando": "triagem",
        "empresas": [
            {
                "numero": r.raw.numero, "nome": r.raw.nome, "cnpj": r.raw.cnpj,
                "certificado": r.certificado_ok, "ficha": str(r.ficha_pdf),
            }
            for r in resultados
        ],
        "alertas_certificado": alertas_cert,
        "divergencias_regime": divergencias,
        "consultas_falhas": sem_consulta,
        "pendentes_csv": str(args.pendentes),
    }
    if args.json:
        return _emitir(dados, args)

    _titulo(f"Triagem — {len(resultados)} empresa(s)")
    for r in resultados:
        marca = "OK " if r.certificado_ok else "SEM CERT"
        print(f"  N°{r.raw.numero}  {r.raw.nome}  [{marca}]  -> {r.ficha_pdf}")

    _bloco("Certificado a cobrar da Thays", alertas_cert)
    _bloco("Divergência de regime (informado × Receita)", divergencias)
    _bloco("Consulta que falhou — conferir à mão", sem_consulta)
    print(f"\nLista de pendentes atualizada: {args.pendentes}")
    _proximo("python moraex.py planilha    # formulário para a reunião com o Paulo")
    return 0


def cmd_planilha(args) -> int:
    from onboarding.planilha_particularidades import gerar

    pendentes = Path(args.pendentes)
    if not pendentes.exists():
        print(f"Não achei {pendentes}. Rode antes: python moraex.py triagem --email <arquivo>")
        return 1

    saida = Path(args.saida or DATA_DIR / f"particularidades-{HOJE}.xlsx")
    caminho = gerar(pendentes, saida, args.competencia)

    dados = {"comando": "planilha", "planilha": str(caminho)}
    if args.json:
        return _emitir(dados, args)

    _titulo("Planilha de particularidades")
    print(f"  {caminho}")
    print(
        "\n  As colunas em amarelo são de preenchimento manual. Na reunião com o\n"
        "  Paulo, cada definição vai em uma coluna 'Particularidade N (Paulo)'.\n"
        "  'Competência entrada' já vem preenchida — é ela que conta a carência.\n"
        "  'Responsável (analista)' é quem assume QUANDO a carência vencer;\n"
        "  preencher não antecipa a distribuição."
    )
    _proximo(
        "-- reunião com o Paulo, planilha preenchida à mão --",
        f"python moraex.py etapa2 --planilha {caminho} --carteira <carteira.xlsx>",
    )
    return 0


# --------------------------------------------------------------------
# etapa 2
# --------------------------------------------------------------------

def cmd_pastas(args) -> int:
    from onboarding.pastas import gerar

    saida = Path(args.saida or DATA_DIR / f"clientes-novos-{HOJE}.csv")
    r = gerar(Path(args.planilha), saida, args.raiz)

    dados = {"comando": "pastas", **{k: str(v) if isinstance(v, Path) else v for k, v in r.items()}}
    if args.json:
        return _emitir(dados, args)

    _titulo(f"Pastas na rede — {len(r['pastas'])} cliente(s)")
    for p in r["pastas"]:
        print(f"  {p}\\  (Apuracao\\<ano>\\<meses>  +  Certificado\\)")
    _bloco("Sem razão social na planilha — pasta não gerada", r["sem_nome"])
    print(f"\nCSV do lote: {r['csv']}")
    print(
        "\nEste passo roda no drive de rede, não aqui. Copie o CSV para a pasta\n"
        f"estrutura-pastas/ e rode no PowerShell:\n\n  {r['comando']}"
    )
    return 0


def cmd_carteira(args) -> int:
    from onboarding.alimentar_carteira import MESES_CARENCIA, alimentar

    carteira = Path(args.carteira)
    saida = Path(args.saida or carteira.with_name(f"{carteira.stem}-atualizada-{HOJE}.xlsx"))
    r = alimentar(Path(args.planilha), carteira, saida, args.competencia)

    dados = {"comando": "carteira", **{k: str(v) if isinstance(v, Path) else v for k, v in r.items()}}
    if args.json:
        return _emitir(dados, args)

    _titulo("Carteira Tributária Fiscal")
    print(f"  Arquivo novo: {r['saida']}   (a carteira original não foi tocada)")
    print(f"  Competência de referência: {r['referencia']} | carência: {MESES_CARENCIA} competências")
    _bloco("Entraram em carência (Pendentes Daniela)", r["entraram_carencia"])
    _bloco("Distribuídas para a carteira do analista", r["distribuidas"])
    _bloco("Ainda em carência", r["em_carencia"])
    _bloco("Carência vencida, mas SEM responsável definido", r["liberadas_sem_responsavel"])
    _bloco("Já estavam na carteira, ignoradas", r["ja_na_carteira"])
    _bloco("Competência inválida — corrija na planilha", r["competencia_invalida"])
    print("\nAbra no Excel para o 'Resumo Equipe' recalcular as contagens.")
    return 0


# --------------------------------------------------------------------
# consulta e manutenção
# --------------------------------------------------------------------

def cmd_status(args) -> int:
    from onboarding.alimentar_carteira import MESES_CARENCIA, situacao_carencia

    r = situacao_carencia(Path(args.carteira), args.competencia)

    if args.json:
        return _emitir({"comando": "status", **r}, args)

    _titulo(f"Carência — referência {r['referencia']} ({MESES_CARENCIA} competências)")
    if not r["total"]:
        print("  Nenhuma empresa em 'Pendentes Daniela'.")
        return 0

    _bloco(
        "PRONTAS PARA DISTRIBUIR (carência vencida)",
        [f"N°{i['numero']} {i['nome']} — entrou {i['entrada']}"
         + (f", sugestão: {i['sugestao']}" if i["sugestao"] else ", sem sugestão de analista")
         for i in r["liberadas"]],
    )
    _bloco(
        "Em carência",
        [f"N°{i['numero']} {i['nome']} — libera em {i['libera_em']} "
         f"({i['faltam']} competência{'s' if i['faltam'] > 1 else ''})"
         for i in r["em_carencia"]],
    )
    _bloco(
        "Sem competência de entrada registrada — não dá para calcular",
        [f"N°{i['numero']} {i['nome']}" for i in r["sem_competencia"]],
    )
    if r["liberadas"]:
        _proximo(
            "Distribuir é decisão de gente: defina o responsável na planilha e rode",
            "python moraex.py carteira --planilha <p.xlsx> --carteira <c.xlsx>",
        )
    return 0


def cmd_skills(args) -> int:
    from onboarding.skills_pack import LIMITE_DESCRICAO, processar

    destino = Path(args.empacotar) if args.empacotar else None
    resultados = processar(Path(args.dir), destino)

    falhas = [r for r in resultados if not r.ok]
    if args.json:
        _emitir({
            "comando": "skills",
            "skills": [
                {"nome": r.pasta.name, "ok": r.ok, "descricao": r.tamanho_descricao,
                 "erros": r.erros, "zip": str(r.zip) if r.zip else None}
                for r in resultados
            ],
        }, args)
        return 1 if falhas else 0

    _titulo("Skills")
    for r in resultados:
        marca = "OK " if r.ok else "ERRO"
        print(f"  [{marca}] {r.pasta.name}  (description: {r.tamanho_descricao}/{LIMITE_DESCRICAO})")
        for e in r.erros:
            print(f"         ! {e}")
        if r.zip:
            print(f"         zip: {r.zip}")

    if falhas:
        print(f"\n{len(falhas)} skill(s) com problema — o uploader vai recusar assim.")
        return 1
    if destino:
        print(
            "\nSKILL.md está na raiz de cada zip, como o uploader espera.\n"
            "Suba em claude.ai → Settings → Capabilities → Skills."
        )
    return 0


# --------------------------------------------------------------------
# etapas encadeadas
# --------------------------------------------------------------------

def cmd_etapa1(args) -> int:
    codigo = cmd_triagem(args)
    if codigo:
        return codigo
    return cmd_planilha(args)


def cmd_etapa2(args) -> int:
    args.saida = args.saida_csv
    codigo = cmd_pastas(args)
    if codigo:
        return codigo
    args.saida = args.saida_carteira
    codigo = cmd_carteira(args)
    if codigo:
        return codigo
    print(
        "\nFalta o que não é automatizável daqui:\n"
        "  - Fichas Cadastrais definitivas: peça ao Claude (skill implantacao-cliente-fiscal)\n"
        "  - Cadastro no G-Click: siga roteiro-gclick.md"
    )
    return 0


# --------------------------------------------------------------------

def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="moraex", description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--json", action="store_true", help="Imprime o resultado em JSON")
    sub = p.add_subparsers(dest="comando", required=True)

    def add(nome, func, ajuda):
        sp = sub.add_parser(nome, help=ajuda, description=ajuda)
        sp.set_defaults(func=func)
        sp.add_argument("--json", dest="json_sub", action="store_true", help=argparse.SUPPRESS)
        return sp

    def arg_email(sp):
        sp.add_argument("--email", required=True, help="Arquivo .txt com o corpo do e-mail da Thays")
        sp.add_argument("--sem-consulta", action="store_true",
                        help="Não consulta Receita/BrasilAPI (offline ou teste rápido)")
        sp.add_argument("--fichas", default=str(FICHAS_DIR), help="Pasta de saída das fichas")

    def arg_planilha_saida(sp):
        sp.add_argument("--pendentes", default=str(PENDENTES_CSV), help="CSV de pendentes de distribuição")
        sp.add_argument("--competencia", help="Competência de referência MM/AAAA (padrão: mês atual)")

    sp = add("triagem", cmd_triagem, "Etapa 1: e-mail da Thays → fichas + lista de pendentes")
    arg_email(sp)
    sp.add_argument("--pendentes", default=str(PENDENTES_CSV), help="CSV de pendentes de distribuição")

    sp = add("planilha", cmd_planilha, "Etapa 1: formulário de particularidades para a reunião")
    arg_planilha_saida(sp)
    sp.add_argument("--saida", help="Arquivo .xlsx de saída")

    sp = add("etapa1", cmd_etapa1, "Triagem + planilha, de uma vez")
    arg_email(sp)
    arg_planilha_saida(sp)
    sp.add_argument("--saida", help="Arquivo .xlsx da planilha")

    sp = add("pastas", cmd_pastas, "Etapa 2: CSV do lote + comando do PowerShell")
    sp.add_argument("--planilha", required=True, help="Planilha de particularidades preenchida")
    sp.add_argument("--saida", help="Arquivo .csv de saída")
    sp.add_argument("--raiz", help="Caminho da raiz de clientes no drive de rede")

    sp = add("carteira", cmd_carteira, "Etapa 2: alimenta a Carteira respeitando a carência")
    sp.add_argument("--planilha", required=True, help="Planilha de particularidades preenchida")
    sp.add_argument("--carteira", required=True, help="Carteira Tributária Fiscal (.xlsx)")
    sp.add_argument("--saida", help="Arquivo .xlsx de saída (padrão: arquivo novo, datado)")
    sp.add_argument("--competencia", help="Competência de referência MM/AAAA (padrão: mês atual)")

    sp = add("etapa2", cmd_etapa2, "Pastas + carteira, de uma vez")
    sp.add_argument("--planilha", required=True, help="Planilha de particularidades preenchida")
    sp.add_argument("--carteira", required=True, help="Carteira Tributária Fiscal (.xlsx)")
    sp.add_argument("--saida-carteira", help="Arquivo .xlsx de saída da carteira")
    sp.add_argument("--saida-csv", help="Arquivo .csv do lote de pastas")
    sp.add_argument("--raiz", help="Caminho da raiz de clientes no drive de rede")
    sp.add_argument("--competencia", help="Competência de referência MM/AAAA (padrão: mês atual)")

    sp = add("status", cmd_status, "Quem está em carência e quem já pode ser distribuído")
    sp.add_argument("--carteira", required=True, help="Carteira Tributária Fiscal (.xlsx)")
    sp.add_argument("--competencia", help="Competência de referência MM/AAAA (padrão: mês atual)")

    sp = add("skills", cmd_skills, "Valida (e empacota) as skills antes de subir no claude.ai")
    sp.add_argument("--dir", default=".claude/skills", help="Pasta das skills")
    sp.add_argument("--empacotar", nargs="?", const="dist/skills",
                    help="Gera os zips na pasta indicada (padrão: dist/skills)")

    return p


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    # `--json` vale antes ou depois do subcomando.
    args.json = args.json or args.json_sub
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

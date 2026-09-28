#!/usr/bin/env python3
"""Monta o guia de instalação do app do Sheets, com o código real embutido.

O app é instalado copiando arquivo por arquivo para o Apps Script, e navegar
pelo repositório no meio disso é ruim. O guia traz cada arquivo num cartão
com botão de copiar e marca o que já foi feito.

    python ferramentas/gerar_guia.py [saida.html]

Vive no repositório de propósito: a versão anterior morava num diretório
temporário e se perdeu numa limpeza, deixando o guia publicado defasado.
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
GAS = RAIZ / "gas"

MANIFESTO = ("appsscript.json", "manifesto",
    "Declara os escopos de Drive, rede e barra lateral que o app usa. "
    "Este arquivo JÁ EXISTE no projeto — vem escondido, e você só revela e substitui o conteúdo.")

# (arquivo, tipo, o que faz) — na ordem em que fazem sentido para quem cola.
ARQUIVOS = [
    ("Config.gs", "script", "Equipe, listas suspensas, nomes das abas, cores, carência, e o mapa de qual arquivo define o quê."),
    ("Competencia.gs", "script", "Aritmética de competência e a regra dos três meses de carência."),
    ("Parser.gs", "script", "Lê o e-mail da Thays: empresas, CNPJ, regime, anexos, data."),
    ("Regras.gs", "script", "Matriz/filial, grupo econômico, enquadramento, certificado, particularidades."),
    ("Consultas.gs", "script", "BrasilAPI, ReceitaWS e a consulta oficial do Simples Nacional."),
    ("Comprovante.gs", "script", "Lê o que dá para aproveitar do comprovante escaneado, sempre marcado para conferência."),
    ("PdfTexto.gs", "script", "Converte o PDF ou a imagem do e-mail em texto, com OCR, pelo Drive."),
    ("Planilha.gs", "script", "Utilidades de aba, cabeçalho, leitura e escrita."),
    ("Etapa1.gs", "script", "A etapa 1 em três passos curtos — é o que faz a barra de progresso andar."),
    ("Particularidades.gs", "script", "O formato da aba única: colunas do app em cinza, as suas em amarelo."),
    ("Fichas.gs", "script", "Ficha de Abertura em PDF, no padrão do Dep. Fiscal."),
    ("Pastas.gs", "script", "Pastas do cliente no Drive e o CSV para o PowerShell da rede."),
    ("Carteira.gs", "script", "Carência, distribuição e o status de quem já liberou."),
    ("Gestao.gs", "script", "As três operações cliente a cliente: distribuir, dar baixa e trocar responsável."),
    ("Menu.gs", "script", "O menu 🏢 Onboarding Fiscal e o que cada item faz."),
    ("Instalar.gs", "script", "Cria as abas que faltarem, na primeira execução."),
    ("Sidebar.html", "html", "A barra lateral da etapa 1, com a barra de progresso."),
    ("Gestao.html", "html", "O painel de gestão de carteira, com os três modos."),
]

TIPO_ROTULO = {"script": "Script", "html": "HTML", "manifesto": "Manifesto"}


def versao_do_app() -> str:
    texto = (GAS / "Config.gs").read_text(encoding="utf-8")
    return re.search(r"var VERSAO_APP = '([^']+)'", texto).group(1)


def montar_card(indice: int, nome: str, tipo: str, descricao: str, rotulo: str) -> str:
    conteudo = (GAS / nome).read_text(encoding="utf-8")
    base = nome.rsplit(".", 1)[0]
    if tipo == "manifesto":
        instrucao = ('<strong class="perigo">Não crie arquivo novo.</strong> '
                     'Revele o manifesto nas Configurações do projeto e substitua o conteúdo dele.')
    else:
        instrucao = f'Novo arquivo · <strong>{TIPO_ROTULO[tipo]}</strong> · nome <code>{base}</code>'
    classe = " manifesto" if tipo == "manifesto" else ""
    return f"""
      <article class="arquivo{classe}" data-tipo="{tipo}">
        <div class="arquivo-topo">
          <div class="arquivo-id">
            <span class="arquivo-n">{rotulo}</span>
            <div>
              <h3>{html.escape(nome)}</h3>
              <p class="arquivo-como">{instrucao}</p>
            </div>
          </div>
          <button class="copiar" type="button" data-alvo="src-{indice}" aria-label="Copiar {html.escape(nome)}">Copiar</button>
        </div>
        <p class="arquivo-desc">{html.escape(descricao)}</p>
        <details>
          <summary>Ver o código ({len(conteudo.splitlines())} linhas)</summary>
          <pre id="src-{indice}"><code>{html.escape(conteudo)}</code></pre>
        </details>
      </article>"""


def conferir() -> list[str]:
    """A lista do guia e o conteúdo de gas/ precisam bater — senão o guia
    manda copiar arquivo que não existe, ou esquece um que existe."""
    problemas = []
    listados = {nome for nome, _, _ in ARQUIVOS}
    no_disco = {p.name for p in GAS.iterdir() if p.suffix in (".gs", ".html")}

    for nome in sorted(listados - no_disco):
        problemas.append(f"o guia lista {nome}, que não existe em gas/")
    for nome in sorted(no_disco - listados):
        problemas.append(f"gas/{nome} existe mas o guia não lista")
    return problemas


def main() -> int:
    problemas = conferir()
    if problemas:
        for p in problemas:
            print(f"ERRO: {p}", file=sys.stderr)
        return 1

    versao = versao_do_app()
    pagina = (RAIZ / "ferramentas" / "guia-modelo.html").read_text(encoding="utf-8")
    pagina = (pagina
              .replace("{{VERSAO}}", versao)
              .replace("{{TOTAL}}", str(len(ARQUIVOS) + 1))
              .replace("{{N_ARQUIVOS}}", str(len(ARQUIVOS)))
              .replace("{{CARD_MANIFESTO}}", montar_card(0, *MANIFESTO, "⚙"))
              .replace("{{CARDS}}", "\n".join(
                  montar_card(i, nome, tipo, descricao, f"{i:02d}")
                  for i, (nome, tipo, descricao) in enumerate(ARQUIVOS, start=1))))

    saida = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "dist" / "guia-instalacao-sheets.html"
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(pagina, encoding="utf-8")
    print(f"{saida} ({len(pagina)} bytes, app v{versao}, {len(ARQUIVOS) + 1} arquivos)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

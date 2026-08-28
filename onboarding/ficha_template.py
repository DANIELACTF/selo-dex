"""Geração da ficha de onboarding (Markdown) para uma empresa nova.

Não existe hoje um modelo formal de "ficha de onboarding" acessível para
este projeto seguir — a estrutura abaixo é uma PROPOSTA, montada a partir
dos campos que aparecem de forma consistente nos e-mails reais da Thays
(nome, CNPJ, nº de cliente, regime tributário, e-mail, certificado). Ajuste
livremente depois de validar com o time da Moraex.
"""
from __future__ import annotations

from onboarding.cnpj_api import DadosCnpj
from onboarding.parser import EmpresaRaw


def gerar_ficha(
    raw: EmpresaRaw,
    dados: DadosCnpj,
    certificado_ok: bool,
    certificado_arquivo: str | None,
    divergencia_regime: str | None,
) -> str:
    linhas: list[str] = []

    linhas.append(f"# Ficha de Onboarding — {raw.nome}")
    linhas.append("")
    linhas.append(f"**Nº cliente (Moraex):** {raw.numero}  ")
    linhas.append(f"**CNPJ:** {raw.cnpj}")
    linhas.append("")

    linhas.append("## Dados cadastrais (Receita Federal)")
    if dados.erro:
        linhas.append(f"> ⚠️ Não foi possível consultar o CNPJ automaticamente: {dados.erro}")
    else:
        linhas.append(f"- Razão social: {dados.razao_social or '-'}")
        linhas.append(f"- Nome fantasia: {dados.nome_fantasia or '-'}")
        linhas.append(f"- Situação cadastral: {dados.situacao_cadastral or '-'}")
        linhas.append(f"- Data de abertura: {dados.data_inicio_atividade or '-'}")
        linhas.append(f"- Natureza jurídica: {dados.natureza_juridica or '-'}")
        linhas.append(f"- Porte: {dados.porte or '-'}")
        linhas.append(f"- CNAE principal: {dados.cnae_fiscal_descricao or '-'}")
        linhas.append(f"- Endereço: {dados.endereco or '-'}")
    linhas.append("")

    linhas.append("## Regime tributário")
    linhas.append(f"- Informado pela Thays: **{raw.regime_informado or 'não informado'}**")
    if not dados.erro:
        if dados.optante_simples is True:
            simples_txt = "Sim"
        elif dados.optante_simples is False:
            simples_txt = "Não"
        else:
            simples_txt = "não disponível"
        linhas.append(f"- Optante pelo Simples Nacional (Receita): **{simples_txt}**")
    if divergencia_regime:
        linhas.append(f"- ⚠️ **Divergência encontrada:** {divergencia_regime}")
    linhas.append("")

    linhas.append("## Certificado digital")
    if certificado_ok:
        linhas.append(f"- ✅ Recebido junto ao e-mail da Thays (arquivo: `{certificado_arquivo}`)")
    else:
        linhas.append("- 🚨 **NÃO recebido — cobrar emissão/envio à Thays**")
    if raw.senha_certificado:
        linhas.append(f"- Senha informada: `{raw.senha_certificado}`")
    linhas.append("")

    linhas.append("## Contato")
    if raw.email_contato:
        linhas.extend(f"- {email}" for email in raw.email_contato)
    else:
        linhas.append("- (nenhum e-mail informado pela Thays)")
    if raw.celular:
        linhas.append(f"- Celular: {raw.celular}")
    linhas.append("")

    if raw.observacao:
        linhas.append("## Observações")
        linhas.append(f"- {raw.observacao}")
        linhas.append("")

    linhas.append("## Checklist de distribuição")
    linhas.append("- [ ] Cadastrar no sistema contábil")
    linhas.append("- [ ] Distribuir para Dep. Pessoal")
    linhas.append("- [ ] Distribuir para Dep. Fiscal")
    linhas.append("- [ ] Distribuir para Dep. Contábil")
    if certificado_ok:
        linhas.append("- [x] Certificado digital recebido")
    else:
        linhas.append("- [ ] Cobrar certificado digital da Thays")
    linhas.append("")

    linhas.append("---")
    linhas.append("_Gerado automaticamente a partir do e-mail da Thays. Bloco de origem:_")
    linhas.append("```")
    linhas.append(raw.bloco_texto)
    linhas.append("```")

    return "\n".join(linhas) + "\n"

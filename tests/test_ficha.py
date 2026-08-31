from onboarding.cnpj_api import CnaeSecundario, DadosCnpj, tipo_estabelecimento
from onboarding.parser import EmpresaRaw
from onboarding.pipeline import (
    _checar_divergencia,
    _detectar_grupo_economico,
    _formatar_cnae_principal,
    _formatar_cnaes_secundarios,
    _optante_simples_resolvido,
    _particularidades,
    _regime_enquadramento,
    _simples_para_ficha,
    slug_ficha,
)
from onboarding.simples_rfb import SimplesConsulta


def _dados(**kwargs) -> DadosCnpj:
    base = dict(
        cnpj="00.000.000/0001-00", razao_social="EMPRESA TESTE LTDA", nome_fantasia=None,
        situacao_cadastral="ATIVA", data_situacao_cadastral="01/01/2020",
        data_inicio_atividade="01/01/2020", cnae_fiscal_codigo="8211300",
        cnae_fiscal_descricao="Serviços combinados de escritório e apoio administrativo",
        cnaes_secundarios=[], natureza_juridica="Sociedade Empresária Limitada",
        porte="ME", municipio="Rio de Janeiro", uf="RJ", bairro="Barra da Tijuca",
        endereco=None, optante_simples=True, optante_mei=None, erro=None,
    )
    base.update(kwargs)
    return DadosCnpj(**base)


def _raw(**kwargs) -> EmpresaRaw:
    base = dict(numero="1001", nome="EMPRESA TESTE LTDA", cnpj="00.000.000/0001-00")
    base.update(kwargs)
    return EmpresaRaw(**base)


def test_tipo_estabelecimento():
    assert tipo_estabelecimento("68.717.251/0001-25") == "Matriz"
    assert tipo_estabelecimento("23.881.640/0023-69") == "Filial"


def test_slug_ficha_remove_sufixos_societarios():
    assert slug_ficha("INJECT PHARMA LTDA") == "INJECT_PHARMA"
    assert slug_ficha("DM3 ASSESSORIA E INTERMEDIACOES LTDA") == "DM3_ASSESSORIA"


def test_regime_enquadramento_lucro_real_e_presumido():
    assert _regime_enquadramento("Lucro Real", _dados()) == (
        "Lucro Real — PIS/COFINS não-cumulativo; apuração IRPJ/CSLL"
    )
    assert _regime_enquadramento("Lucro Presumido", _dados()) == (
        "Lucro Presumido — PIS/COFINS cumulativo; IRPJ/CSLL trimestral"
    )


def test_regime_enquadramento_simples_servico_avalia_fator_r():
    dados = _dados(cnae_fiscal_descricao="Serviços combinados de escritório e apoio administrativo")
    assert "Fator R" in _regime_enquadramento("Simples Nacional", dados)


def test_regime_enquadramento_simples_outra_atividade():
    dados = _dados(cnae_fiscal_descricao="Produção cinematográfica, de vídeos e de TV")
    assert _regime_enquadramento("Simples Nacional", dados) == "Simples Nacional — confirmar anexo pela atividade"


def test_regime_enquadramento_nao_informado():
    assert _regime_enquadramento(None, _dados()) == "A definir — definir regime (não informado no e-mail)"


def test_grupo_economico_via_observacao():
    raws = [_raw(observacao="Obs. mesmo grupo da Multidrinks")]
    tipos = [tipo_estabelecimento(raws[0].cnpj)]
    assert _detectar_grupo_economico(0, raws, tipos) == "Multidrinks"


def test_grupo_economico_matriz_filial_mesma_raiz():
    raws = [
        _raw(numero="1055", nome="TATY PRODUCOES ARTISTICAS LTDA", cnpj="28.505.745/0001-21"),
        _raw(numero="1056", nome="TATY PRODUCOES ARTISTICAS EIRELI", cnpj="28.505.745/0002-02"),
    ]
    tipos = [tipo_estabelecimento(r.cnpj) for r in raws]
    assert _detectar_grupo_economico(0, raws, tipos) == "Taty (matriz+filial)"
    assert _detectar_grupo_economico(1, raws, tipos) == "Taty (matriz+filial)"


def test_grupo_economico_rede_sem_matriz():
    raws = [
        _raw(numero="1052", nome="ERFOLG ESTACIONAMENTOS LTDA", cnpj="23.881.640/0023-69"),
        _raw(numero="1054", nome="ERFOLG ESTACIONAMENTOS LTDA", cnpj="23.881.640/0024-40"),
    ]
    tipos = [tipo_estabelecimento(r.cnpj) for r in raws]
    assert _detectar_grupo_economico(0, raws, tipos) == "Erfolg (rede)"


def test_grupo_economico_sem_relacao():
    raws = [_raw()]
    tipos = [tipo_estabelecimento(raws[0].cnpj)]
    assert _detectar_grupo_economico(0, raws, tipos) == "—"


def test_formatar_cnae_principal_e_secundarios():
    dados = _dados(
        cnae_fiscal_codigo="4771702",
        cnae_fiscal_descricao="Com. varejista de produtos farmacêuticos",
        cnaes_secundarios=[CnaeSecundario(codigo="4645101", descricao="Atacadista de instrumentos médicos")],
    )
    assert _formatar_cnae_principal(dados) == "47.71-7-02 — Com. varejista de produtos farmacêuticos"
    assert _formatar_cnaes_secundarios(dados) == "46.45-1-01 — Atacadista de instrumentos médicos"

    dados_varios = _dados(
        cnaes_secundarios=[
            CnaeSecundario(codigo="6612605", descricao="x"),
            CnaeSecundario(codigo="6619302", descricao="y"),
        ]
    )
    assert _formatar_cnaes_secundarios(dados_varios) == "66.12-6-05; 66.19-3-02"
    assert _formatar_cnaes_secundarios(_dados(cnaes_secundarios=[])) == "Não informada"


def test_particularidades_empresario_individual():
    raw = _raw(nome="JOAO PEDRO N. BARROS DE BARCELLOS")
    dados = _dados(natureza_juridica="Empresário (Individual)")
    bullets = _particularidades(raw, dados, "—", None, False, ["1001"])
    assert any("EMPRESÁRIO INDIVIDUAL" in b for b in bullets)


def test_particularidades_uf_fora_do_rj():
    raw = _raw()
    dados = _dados(municipio="São Paulo", uf="SP")
    bullets = _particularidades(raw, dados, "—", None, False, ["1001"])
    assert any("São Paulo/SP" in b for b in bullets)


def test_particularidades_numero_fora_de_serie():
    raw = _raw(numero="717")
    dados = _dados()
    bullets = _particularidades(raw, dados, "—", None, False, ["717", "1047", "1048"])
    assert any("fora da série" in b for b in bullets)


def _simples(**kwargs) -> SimplesConsulta:
    base = dict(cnpj="00.000.000/0001-00", optante=None, mensagem=None, erro=None)
    base.update(kwargs)
    return SimplesConsulta(**base)


def test_optante_simples_prioriza_consulta_oficial_sobre_brasilapi():
    dados = _dados(optante_simples=True)  # BrasilAPI diz que é optante
    simples = _simples(optante=False)  # mas a consulta oficial diz que não é
    assert _optante_simples_resolvido(dados, simples) is False


def test_optante_simples_cai_para_brasilapi_quando_consulta_oficial_falha():
    dados = _dados(optante_simples=True)
    simples = _simples(optante=None, erro="Falha ao abrir a página de consulta")
    assert _optante_simples_resolvido(dados, simples) is True


def test_checar_divergencia_usa_consulta_oficial():
    raw = _raw(regime_informado="Simples Nacional")
    dados = _dados(optante_simples=True)  # BrasilAPI diz que sim
    simples = _simples(optante=False)  # Receita (oficial) diz que não
    divergencia = _checar_divergencia(raw.regime_informado, dados, simples)
    assert divergencia is not None
    assert "Simples" in divergencia


def test_simples_para_ficha_optante():
    situacao, ok = _simples_para_ficha(_simples(optante=True, mensagem="É optante pelo Simples Nacional."))
    assert ok is True
    assert "optante" in situacao.lower()


def test_simples_para_ficha_nao_consultado():
    situacao, ok = _simples_para_ficha(_simples(optante=None, erro="Falha ao abrir a página de consulta"))
    assert ok is False
    assert "Não consultado" in situacao


def test_simples_para_ficha_none():
    situacao, ok = _simples_para_ficha(None)
    assert ok is False
    assert situacao == "(a preencher)"

from pathlib import Path

from onboarding.parser import extrair_anexos_email, parse_email
from onboarding.pipeline import certificado_presente

FIXTURES = Path(__file__).parent.parent / "fixtures"


def _ler(nome: str) -> str:
    return (FIXTURES / nome).read_text(encoding="utf-8")


def test_extrai_todas_as_empresas_do_email_com_grupo():
    texto = _ler("exemplo_thays_2026-08-25.txt")
    empresas = parse_email(texto)
    numeros = [e.numero for e in empresas]
    assert numeros == ["1083", "1084", "1085", "1086", "1087", "1089", "1090", "1088"]


def test_campos_basicos_c_lorena_e_grafica_square():
    texto = _ler("exemplo_thays_2026-08-26.txt")
    empresas = parse_email(texto)
    assert len(empresas) == 2

    lorena = empresas[0]
    assert lorena.numero == "1091"
    assert lorena.cnpj == "68.717.251/0001-25"
    assert "LORENA" in lorena.nome
    assert lorena.regime_informado == "Lucro Real"
    assert lorena.email_contato == ["financeiro@unibrands.com.br"]
    assert lorena.observacao and "Multidrinks" in lorena.observacao

    grafica = empresas[1]
    assert grafica.numero == "1092"
    assert grafica.regime_informado == "Simples Nacional"


def test_regime_sem_rotulo_cnpj_aham():
    texto = _ler("exemplo_thays_2026-08-12_1721.txt")
    empresas = parse_email(texto)
    aham = empresas[0]
    assert aham.numero == "1076"
    assert aham.cnpj == "68.496.263/0001-77"
    assert aham.regime_informado == "Simples Nacional"


def test_mei_celular_e_senha_certificado():
    texto = _ler("exemplo_thays_2026-08-12_1655.txt")
    empresas = parse_email(texto)
    patricia = empresas[0]
    assert patricia.regime_informado == "MEI"
    assert patricia.celular

    texto2 = _ler("exemplo_thays_2026-08-20.txt")
    empresas2 = parse_email(texto2)
    gabriele = next(e for e in empresas2 if e.numero == "1080")
    assert gabriele.senha_certificado == "V8Uwx1Dc"


def test_certificado_presente_quando_cnpj_esta_no_nome_do_anexo():
    texto = _ler("exemplo_thays_2026-08-25.txt")
    empresas = {e.numero: e for e in parse_email(texto)}
    anexos = extrair_anexos_email(texto)

    ok, arquivo = certificado_presente(empresas["1083"].nome, empresas["1083"].cnpj, anexos)
    assert ok is True
    assert "43191935000105" in arquivo


def test_certificado_ausente_quando_nao_ha_anexo_correspondente():
    texto = _ler("exemplo_thays_2026-08-25.txt")
    empresas = {e.numero: e for e in parse_email(texto)}
    anexos = extrair_anexos_email(texto)

    lopo_ok, _ = certificado_presente(empresas["1090"].nome, empresas["1090"].cnpj, anexos)
    teixeira_ok, _ = certificado_presente(empresas["1088"].nome, empresas["1088"].cnpj, anexos)
    assert lopo_ok is False
    assert teixeira_ok is False


def test_certificado_ausente_quando_email_nao_tem_anexos():
    texto = _ler("exemplo_thays_2026-08-12_1655.txt")
    empresas = parse_email(texto)
    anexos = extrair_anexos_email(texto)
    assert anexos == []
    for e in empresas:
        ok, _ = certificado_presente(e.nome, e.cnpj, anexos)
        assert ok is False

# -*- coding: utf-8 -*-
"""Layouts dos registros SPED utilizados na analise de PIS/COFINS e ICMS.

Cada entrada mapeia o codigo do registro para a lista ORDENADA de nomes de campo,
ja EXCLUINDO o campo REG (que e o proprio codigo do registro).

Os layouts mudam entre versoes do Guia Pratico (campos sao acrescentados no fim ou
no meio de alguns registros). Por isso o parser e tolerante: campos que nao existem
no arquivo ficam ausentes e campos excedentes vao para a chave "_extras".
Sempre confira o Guia Pratico da versao declarada no campo COD_VER do registro 0000.
"""

# ---------------------------------------------------------------------------
# EFD ICMS/IPI (SPED Fiscal)
# ---------------------------------------------------------------------------
EFD_ICMS_IPI = {
    "0000": [
        "COD_VER", "COD_FIN", "DT_INI", "DT_FIN", "NOME", "CNPJ", "CPF", "UF",
        "IE", "COD_MUN", "IM", "SUFRAMA", "IND_PERFIL", "IND_ATIV",
    ],
    "0005": [
        "FANTASIA", "CEP", "ENDERECO", "NUM", "COMPL", "BAIRRO", "FONE", "FAX", "EMAIL",
    ],
    "0150": [
        "COD_PART", "NOME", "COD_PAIS", "CNPJ", "CPF", "IE", "COD_MUN",
        "SUFRAMA", "ENDERECO", "NUM", "COMPL", "BAIRRO",
    ],
    "0190": ["UNID", "DESCR"],
    "0200": [
        "COD_ITEM", "DESCR_ITEM", "COD_BARRA", "COD_ANT_ITEM", "UNID_INV",
        "TIPO_ITEM", "COD_NCM", "EX_IPI", "COD_GEN", "COD_LST", "ALIQ_ICMS", "CEST",
    ],
    "0220": ["UNID_CONV", "FAT_CONV", "COD_BARRA"],
    "0400": ["COD_NAT", "DESCR_NAT"],
    "C100": [
        "IND_OPER", "IND_EMIT", "COD_PART", "COD_MOD", "COD_SIT", "SER", "NUM_DOC",
        "CHV_NFE", "DT_DOC", "DT_E_S", "VL_DOC", "IND_PGTO", "VL_DESC", "VL_ABAT_NT",
        "VL_MERC", "IND_FRT", "VL_FRT", "VL_SEG", "VL_OUT_DA", "VL_BC_ICMS", "VL_ICMS",
        "VL_BC_ICMS_ST", "VL_ICMS_ST", "VL_IPI", "VL_PIS", "VL_COFINS",
        "VL_PIS_ST", "VL_COFINS_ST",
    ],
    "C170": [
        "NUM_ITEM", "COD_ITEM", "DESCR_COMPL", "QTD", "UNID", "VL_ITEM", "VL_DESC",
        "IND_MOV", "CST_ICMS", "CFOP", "COD_NAT", "VL_BC_ICMS", "ALIQ_ICMS", "VL_ICMS",
        "VL_BC_ICMS_ST", "ALIQ_ST", "VL_ICMS_ST", "IND_APUR", "CST_IPI", "COD_ENQ",
        "VL_BC_IPI", "ALIQ_IPI", "VL_IPI", "CST_PIS", "VL_BC_PIS", "ALIQ_PIS",
        "QUANT_BC_PIS", "ALIQ_PIS_QUANT", "VL_PIS", "CST_COFINS", "VL_BC_COFINS",
        "ALIQ_COFINS", "QUANT_BC_COFINS", "ALIQ_COFINS_QUANT", "VL_COFINS",
        "COD_CTA", "VL_ABAT_NT",
    ],
    "C190": [
        "CST_ICMS", "CFOP", "ALIQ_ICMS", "VL_OPR", "VL_BC_ICMS", "VL_ICMS",
        "VL_BC_ICMS_ST", "VL_ICMS_ST", "VL_RED_BC", "VL_IPI", "COD_OBS",
    ],
    "E100": ["DT_INI", "DT_FIN"],
    "E110": [
        "VL_TOT_DEBITOS", "VL_AJ_DEBITOS", "VL_TOT_AJ_DEBITOS", "VL_ESTORNOS_CRED",
        "VL_TOT_CREDITOS", "VL_AJ_CREDITOS", "VL_TOT_AJ_CREDITOS", "VL_ESTORNOS_DEB",
        "VL_SLD_CREDOR_ANT", "VL_SLD_APURADO", "VL_TOT_DED", "VL_ICMS_RECOLHER",
        "VL_SLD_CREDOR_TRANSPORTAR", "DEB_ESP",
    ],
    "E111": ["COD_AJ_APUR", "DESCR_COMPL_AJ", "VL_AJ_APUR"],
    "E116": [
        "COD_OR", "VL_OR", "DT_VCTO", "COD_REC", "NUM_PROC", "IND_PROC", "PROC",
        "TXT_COMPL", "MES_REF",
    ],
    "E200": ["UF", "DT_INI", "DT_FIN"],
    "E210": [
        "IND_MOV_ST", "VL_SLD_CRED_ANT_ST", "VL_DEVOL_ST", "VL_RESSARC_ST",
        "VL_OUT_CRED_ST", "VL_AJ_CREDITOS_ST", "VL_RETENCAO_ST", "VL_OUT_DEB_ST",
        "VL_AJ_DEBITOS_ST", "VL_SLD_DEV_ANT_ST", "VL_DEDUCOES_ST", "VL_ICMS_RECOL_ST",
        "VL_SLD_CRED_ST_TRANSPORTAR", "DEB_ESP_ST",
    ],
    "C500": [
        "IND_OPER", "IND_EMIT", "COD_PART", "COD_MOD", "COD_SIT", "SER", "SUB",
        "COD_CONS", "NUM_DOC", "DT_DOC", "DT_E_S", "VL_DOC", "VL_DESC",
        "VL_FORN", "VL_SERV_NT", "VL_TERC", "VL_DA", "VL_BC_ICMS", "VL_ICMS",
        "VL_BC_ICMS_ST", "VL_ICMS_ST", "COD_INF", "VL_PIS", "VL_COFINS",
        "TP_LIGACAO", "COD_GRUPO_TENSAO",
    ],
    "C590": [
        "CST_ICMS", "CFOP", "ALIQ_ICMS", "VL_OPR", "VL_BC_ICMS", "VL_ICMS",
        "VL_BC_ICMS_ST", "VL_ICMS_ST", "VL_RED_BC", "COD_OBS",
    ],
    "D100": [
        "IND_OPER", "IND_EMIT", "COD_PART", "COD_MOD", "COD_SIT", "SER", "SUB",
        "NUM_DOC", "CHV_CTE", "DT_DOC", "DT_A_P", "TP_CT-e", "CHV_CTE_REF",
        "VL_DOC", "VL_DESC", "IND_FRT", "VL_SERV", "VL_BC_ICMS", "VL_ICMS",
        "VL_NT", "COD_INF", "COD_CTA", "COD_MUN_ORIG", "COD_MUN_DEST",
    ],
    "D190": [
        "CST_ICMS", "CFOP", "ALIQ_ICMS", "VL_OPR", "VL_BC_ICMS", "VL_ICMS",
        "VL_RED_BC", "COD_OBS",
    ],
    "E300": ["UF", "DT_INI", "DT_FIN"],
    "E310": [
        "IND_MOV_FCP_DIFAL", "VL_SLD_CRED_ANT_DIFAL", "VL_TOT_DEBITO_DIFAL",
        "VL_OUT_DEB_DIFAL", "VL_TOT_CREDITO_DIFAL", "VL_OUT_CRED_DIFAL",
        "VL_SLD_DEV_ANT_DIFAL", "VL_DEDUCOES_DIFAL", "VL_RECOL_DIFAL",
        "VL_SLD_CRED_TRANSPORTAR_DIFAL", "DEB_ESP_DIFAL", "VL_SLD_CRED_ANT_FCP",
        "VL_TOT_DEB_FCP", "VL_OUT_DEB_FCP", "VL_TOT_CRED_FCP", "VL_OUT_CRED_FCP",
        "VL_SLD_DEV_ANT_FCP", "VL_DEDUCOES_FCP", "VL_RECOL_FCP",
        "VL_SLD_CRED_TRANSPORTAR_FCP", "DEB_ESP_FCP",
    ],
    "G110": [
        "DT_INI", "DT_FIN", "SALDO_IN_ICMS", "SOM_PARC", "VL_TRIB_EXP", "VL_TOTAL",
        "IND_PER_SAI", "ICMS_APROP", "SOM_ICMS_OC",
    ],
    "H005": ["DT_INV", "VL_INV", "MOT_INV"],
    "H010": [
        "COD_ITEM", "UNID", "QTD", "VL_UNIT", "VL_ITEM", "IND_PROP", "COD_PART",
        "TXT_COMPL", "COD_CTA", "VL_ITEM_IR",
    ],
}

# ---------------------------------------------------------------------------
# EFD-Contribuicoes (PIS/PASEP e COFINS)
# ---------------------------------------------------------------------------
EFD_CONTRIBUICOES = {
    "0000": [
        "COD_VER", "TIPO_ESCRIT", "IND_SIT_ESP", "NUM_REC_ANTERIOR", "DT_INI",
        "DT_FIN", "NOME", "CNPJ", "UF", "COD_MUN", "SUFRAMA", "IND_NAT_PJ", "IND_ATIV",
    ],
    "0110": ["COD_INC_TRIB", "IND_APRO_CRED", "COD_TIPO_CONT", "IND_REG_CUM"],
    "0140": ["COD_EST", "NOME", "CNPJ", "UF", "IE", "COD_MUN", "IM", "SUFRAMA"],
    "0150": EFD_ICMS_IPI["0150"],
    "0190": EFD_ICMS_IPI["0190"],
    "0200": EFD_ICMS_IPI["0200"],
    "A100": [
        "IND_OPER", "IND_EMIT", "COD_PART", "COD_SIT", "SER", "SUB", "NUM_DOC",
        "CHV_NFSE", "DT_DOC", "DT_EXE_SERV", "VL_DOC", "IND_PGTO", "VL_DESC",
        "VL_BC_PIS", "VL_PIS", "VL_BC_COFINS", "VL_COFINS", "VL_PIS_RET",
        "VL_COFINS_RET", "VL_ISS",
    ],
    "A170": [
        "NUM_ITEM", "COD_ITEM", "DESCR_COMPL", "VL_ITEM", "VL_DESC", "NAT_BC_CRED",
        "IND_ORIG_CRED", "CST_PIS", "VL_BC_PIS", "ALIQ_PIS", "VL_PIS", "CST_COFINS",
        "VL_BC_COFINS", "ALIQ_COFINS", "VL_COFINS", "COD_CTA", "COD_CCUS",
    ],
    "C100": EFD_ICMS_IPI["C100"],
    "C170": EFD_ICMS_IPI["C170"],
    "C175": [
        "CFOP", "VL_OPR", "VL_DESC", "CST_PIS", "VL_BC_PIS", "ALIQ_PIS", "VL_PIS",
        "CST_COFINS", "VL_BC_COFINS", "ALIQ_COFINS", "VL_COFINS", "COD_CTA", "INFO_COMPL",
    ],
    "C181": [
        "CST_PIS", "CFOP", "VL_ITEM", "VL_DESC", "VL_BC_PIS", "ALIQ_PIS",
        "QUANT_BC_PIS", "ALIQ_PIS_QUANT", "VL_PIS", "COD_CTA",
    ],
    "C185": [
        "CST_COFINS", "CFOP", "VL_ITEM", "VL_DESC", "VL_BC_COFINS", "ALIQ_COFINS",
        "QUANT_BC_COFINS", "ALIQ_COFINS_QUANT", "VL_COFINS", "COD_CTA",
    ],
    "C191": [
        "CNPJ_CPF_PART", "CST_PIS", "CFOP", "VL_ITEM", "VL_DESC", "VL_BC_PIS",
        "ALIQ_PIS", "QUANT_BC_PIS", "ALIQ_PIS_QUANT", "VL_PIS", "COD_CTA",
    ],
    "C195": [
        "CNPJ_CPF_PART", "CST_COFINS", "CFOP", "VL_ITEM", "VL_DESC", "VL_BC_COFINS",
        "ALIQ_COFINS", "QUANT_BC_COFINS", "ALIQ_COFINS_QUANT", "VL_COFINS", "COD_CTA",
    ],
    "C395": ["COD_MOD", "COD_PART", "SER", "SUB_SER", "NUM_DOC", "DT_DOC", "VL_DOC"],
    "C396": [
        "COD_ITEM", "VL_ITEM", "VL_DESC", "NAT_BC_CRED", "CST_PIS", "VL_BC_PIS",
        "ALIQ_PIS", "VL_PIS", "CST_COFINS", "VL_BC_COFINS", "ALIQ_COFINS",
        "VL_COFINS", "COD_CTA",
    ],
    "D100": [
        "IND_OPER", "IND_EMIT", "COD_PART", "COD_MOD", "COD_SIT", "SER", "SUB",
        "NUM_DOC", "CHV_CTE", "DT_DOC", "DT_A_P", "TP_CT-e", "CHV_CTE_REF",
        "VL_DOC", "VL_DESC", "IND_FRT", "VL_SERV", "VL_BC_ICMS", "VL_ICMS",
        "VL_NT", "COD_INF", "COD_CTA",
    ],
    "D101": [
        "IND_NAT_FRT", "VL_ITEM", "CST_PIS", "NAT_BC_CRED", "VL_BC_PIS", "ALIQ_PIS",
        "VL_PIS", "COD_CTA",
    ],
    "D105": [
        "IND_NAT_FRT", "VL_ITEM", "CST_COFINS", "NAT_BC_CRED", "VL_BC_COFINS",
        "ALIQ_COFINS", "VL_COFINS", "COD_CTA",
    ],
    "C500": [
        "COD_PART", "COD_MOD", "COD_SIT", "SER", "SUB", "NUM_DOC", "DT_DOC",
        "DT_ENT", "VL_DOC", "VL_ICMS", "COD_INF", "VL_PIS", "VL_COFINS", "CHV_DOCe",
    ],
    "C501": [
        "CST_PIS", "VL_ITEM", "NAT_BC_CRED", "VL_BC_PIS", "ALIQ_PIS", "VL_PIS", "COD_CTA",
    ],
    "C505": [
        "CST_COFINS", "VL_ITEM", "NAT_BC_CRED", "VL_BC_COFINS", "ALIQ_COFINS",
        "VL_COFINS", "COD_CTA",
    ],
    "D500": [
        "IND_OPER", "COD_PART", "COD_MOD", "COD_SIT", "SER", "SUB", "NUM_DOC",
        "DT_DOC", "DT_A_P", "VL_DOC", "VL_DESC", "VL_SERV", "VL_SERV_NT", "VL_TERC",
        "VL_DA", "VL_BC_ICMS", "VL_ICMS", "COD_INF", "VL_PIS", "VL_COFINS",
    ],
    "D501": [
        "CST_PIS", "VL_ITEM", "NAT_BC_CRED", "VL_BC_PIS", "ALIQ_PIS", "VL_PIS", "COD_CTA",
    ],
    "D505": [
        "CST_COFINS", "VL_ITEM", "NAT_BC_CRED", "VL_BC_COFINS", "ALIQ_COFINS",
        "VL_COFINS", "COD_CTA",
    ],
    "F100": [
        "IND_OPER", "COD_PART", "COD_ITEM", "DT_OPER", "VL_OPER", "CST_PIS",
        "VL_BC_PIS", "ALIQ_PIS", "VL_PIS", "CST_COFINS", "VL_BC_COFINS",
        "ALIQ_COFINS", "VL_COFINS", "NAT_BC_CRED", "IND_ORIG_CRED", "COD_CTA",
        "COD_CCUS", "DESC_DOC_OPER",
    ],
    "F600": [
        "IND_NAT_RET", "DT_RET", "VL_BC_RET", "VL_RET", "COD_REC", "IND_NAT_REC",
        "CNPJ", "VL_RET_PIS", "VL_RET_COFINS", "IND_DEC",
    ],
    "F120": [
        "NAT_BC_CRED", "IDENT_BEM_IMOB", "IND_ORIG_CRED", "IND_UTIL_BEM_IMOB",
        "VL_OPER_DEP", "PARC_OPER_NAO_BC_CRED", "CST_PIS", "VL_BC_PIS", "ALIQ_PIS",
        "VL_PIS", "CST_COFINS", "VL_BC_COFINS", "ALIQ_COFINS", "VL_COFINS",
        "COD_CTA", "COD_CCUS", "DESC_BEM_IMOB",
    ],
    "F130": [
        "NAT_BC_CRED", "IDENT_BEM_IMOB", "IND_ORIG_CRED", "IND_UTIL_BEM_IMOB",
        "MES_OPER_AQUIS", "VL_OPER_AQUIS", "PARC_OPER_NAO_BC_CRED", "VL_BC_CRED",
        "IND_NR_PARC", "CST_PIS", "VL_BC_PIS", "ALIQ_PIS", "VL_PIS", "CST_COFINS",
        "VL_BC_COFINS", "ALIQ_COFINS", "VL_COFINS", "COD_CTA", "COD_CCUS",
        "DESC_BEM_IMOB",
    ],
    # --- Bloco M: apuracao ---
    "M100": [
        "COD_CRED", "IND_CRED_ORI", "VL_BC_PIS", "ALIQ_PIS", "QUANT_BC_PIS",
        "ALIQ_PIS_QUANT", "VL_CRED", "VL_AJUS_ACRES", "VL_AJUS_REDUC",
        "VL_CRED_DIF", "VL_CRED_DISP", "IND_DESC_CRED", "VL_CRED_DESC", "SLD_CRED",
    ],
    "M105": [
        "NAT_BC_CRED", "CST_PIS", "VL_BC_PIS_TOT", "VL_BC_PIS_CUM", "VL_BC_PIS_NC",
        "VL_BC_PIS", "QUANT_BC_PIS_TOT", "QUANT_BC_PIS", "DESC_CRED",
    ],
    "M200": [
        "VL_TOT_CONT_NC_PER", "VL_TOT_CRED_DESC", "VL_TOT_CRED_DESC_ANT",
        "VL_TOT_CONT_NC_DEV", "VL_RET_NC", "VL_OUT_DED_NC", "VL_CONT_NC_REC",
        "VL_TOT_CONT_CUM_PER", "VL_RET_CUM", "VL_OUT_DED_CUM", "VL_CONT_CUM_REC",
        "VL_TOT_CONT_REC",
    ],
    "M210": [
        "COD_CONT", "VL_REC_BRT", "VL_BC_CONT", "VL_AJUS_ACRES_BC_PIS",
        "VL_AJUS_REDUC_BC_PIS", "VL_BC_CONT_AJUS", "ALIQ_PIS", "QUANT_BC_PIS",
        "ALIQ_PIS_QUANT", "VL_CONT_APUR", "VL_AJUS_ACRES", "VL_AJUS_REDUC",
        "VL_CONT_DIFER", "VL_CONT_DIFER_ANT", "VL_CONT_PER",
    ],
    "M400": ["CST_PIS", "VL_TOT_REC", "COD_CTA", "DESC_COMPL"],
    "M410": ["NAT_REC", "VL_REC", "COD_CTA", "DESC_COMPL"],
    "M500": [
        "COD_CRED", "IND_CRED_ORI", "VL_BC_COFINS", "ALIQ_COFINS", "QUANT_BC_COFINS",
        "ALIQ_COFINS_QUANT", "VL_CRED", "VL_AJUS_ACRES", "VL_AJUS_REDUC",
        "VL_CRED_DIF", "VL_CRED_DISP", "IND_DESC_CRED", "VL_CRED_DESC", "SLD_CRED",
    ],
    "M505": [
        "NAT_BC_CRED", "CST_COFINS", "VL_BC_COFINS_TOT", "VL_BC_COFINS_CUM",
        "VL_BC_COFINS_NC", "VL_BC_COFINS", "QUANT_BC_COFINS_TOT",
        "QUANT_BC_COFINS", "DESC_CRED",
    ],
    "M600": [
        "VL_TOT_CONT_NC_PER", "VL_TOT_CRED_DESC", "VL_TOT_CRED_DESC_ANT",
        "VL_TOT_CONT_NC_DEV", "VL_RET_NC", "VL_OUT_DED_NC", "VL_CONT_NC_REC",
        "VL_TOT_CONT_CUM_PER", "VL_RET_CUM", "VL_OUT_DED_CUM", "VL_CONT_CUM_REC",
        "VL_TOT_CONT_REC",
    ],
    "M610": [
        "COD_CONT", "VL_REC_BRT", "VL_BC_CONT", "VL_AJUS_ACRES_BC_COFINS",
        "VL_AJUS_REDUC_BC_COFINS", "VL_BC_CONT_AJUS", "ALIQ_COFINS",
        "QUANT_BC_COFINS", "ALIQ_COFINS_QUANT", "VL_CONT_APUR", "VL_AJUS_ACRES",
        "VL_AJUS_REDUC", "VL_CONT_DIFER", "VL_CONT_DIFER_ANT", "VL_CONT_PER",
    ],
    "M800": ["CST_COFINS", "VL_TOT_REC", "COD_CTA", "DESC_COMPL"],
    "M810": ["NAT_REC", "VL_REC", "COD_CTA", "DESC_COMPL"],
    "1100": [
        "PER_APU_CRED", "ORIG_CRED", "CNPJ_SUC", "COD_CRED", "VL_CRED_APU",
        "VL_CRED_EXT_APU", "VL_TOT_CRED_APU", "VL_CRED_DESC_PA_ANT",
        "VL_CRED_PER_PA_ANT", "VL_CRED_DCOMP_PA_ANT", "SD_CRED_DISP_EFD",
        "VL_CRED_DESC_EFD", "VL_CRED_PER_EFD", "VL_CRED_DCOMP_EFD",
        "VL_CRED_TRANS", "VL_CRED_OUT", "SLD_CRED_FIM",
    ],
    "1500": [
        "PER_APU_CRED", "ORIG_CRED", "CNPJ_SUC", "COD_CRED", "VL_CRED_APU",
        "VL_CRED_EXT_APU", "VL_TOT_CRED_APU", "VL_CRED_DESC_PA_ANT",
        "VL_CRED_PER_PA_ANT", "VL_CRED_DCOMP_PA_ANT", "SD_CRED_DISP_EFD",
        "VL_CRED_DESC_EFD", "VL_CRED_PER_EFD", "VL_CRED_DCOMP_EFD",
        "VL_CRED_TRANS", "VL_CRED_OUT", "SLD_CRED_FIM",
    ],
}

# Campos que devem ser convertidos para Decimal quando presentes.
CAMPOS_NUMERICOS_PREFIXOS = ("VL_", "ALIQ_", "QTD", "QUANT_", "FAT_CONV", "SLD_", "SD_", "PARC_")

LAYOUTS = {
    "EFD_ICMS_IPI": EFD_ICMS_IPI,
    "EFD_CONTRIBUICOES": EFD_CONTRIBUICOES,
}

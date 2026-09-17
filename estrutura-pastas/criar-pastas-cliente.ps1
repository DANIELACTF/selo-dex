<#
.SYNOPSIS
    Cria a pasta padrão de um cliente novo no drive de rede do Dep. Fiscal.

.DESCRIPTION
    Estrutura criada:

        <Raiz>\<N°> - <NOME DO CLIENTE>\
            Apuracao\
                <ano>\
                    01 Janeiro ... 12 Dezembro
            Certificado\

    A Ficha Cadastral do Cliente fica na raiz da pasta do cliente.

    O script é seguro para rodar de novo: pasta que já existe é mantida
    como está, nada é apagado nem sobrescrito.

.PARAMETER Raiz
    Caminho do drive de rede onde ficam as pastas de cliente.
    Ex.: \\servidor\Fiscal\Clientes  ou  F:\Clientes

.PARAMETER Numero
    N° do cliente (ex.: 1048).

.PARAMETER Nome
    Nome do cliente para a pasta (ex.: INJECT PHARMA).

.PARAMETER Ano
    Ano da subpasta de apuração. Padrão: ano atual.

.PARAMETER SemMeses
    Cria só a pasta do ano, sem as 12 subpastas de mês.

.PARAMETER Lote
    CSV com as colunas Numero,Nome para criar várias de uma vez.

.EXAMPLE
    .\criar-pastas-cliente.ps1 -Raiz "\\servidor\Fiscal\Clientes" -Numero 1048 -Nome "INJECT PHARMA"

.EXAMPLE
    .\criar-pastas-cliente.ps1 -Raiz "F:\Clientes" -Lote .\clientes-novos.csv
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Raiz,
    [string]$Numero,
    [string]$Nome,
    [int]$Ano = (Get-Date).Year,
    [switch]$SemMeses,
    [string]$Lote
)

$ErrorActionPreference = 'Stop'

$Meses = @(
    '01 Janeiro', '02 Fevereiro', '03 Marco', '04 Abril', '05 Maio', '06 Junho',
    '07 Julho', '08 Agosto', '09 Setembro', '10 Outubro', '11 Novembro', '12 Dezembro'
)

# Caracteres proibidos em nome de pasta no Windows.
function Limpar-Nome([string]$texto) {
    $limpo = $texto -replace '[\\/:*?"<>|]', ' '
    return ($limpo -replace '\s+', ' ').Trim()
}

function Novo-Diretorio([string]$caminho) {
    if (Test-Path -LiteralPath $caminho) {
        Write-Host "  ja existe : $caminho" -ForegroundColor DarkGray
        return $false
    }
    New-Item -ItemType Directory -Path $caminho -Force | Out-Null
    Write-Host "  criada    : $caminho" -ForegroundColor Green
    return $true
}

function Criar-PastaCliente([string]$num, [string]$nomeCliente) {
    $num = $num.Trim()
    $nomeLimpo = Limpar-Nome $nomeCliente
    if (-not $num -or -not $nomeLimpo) {
        Write-Warning "Linha ignorada: numero ou nome vazio."
        return
    }

    $pastaCliente = Join-Path $Raiz ("{0} - {1}" -f $num, $nomeLimpo)
    Write-Host "`n$num - $nomeLimpo" -ForegroundColor Cyan

    [void](Novo-Diretorio $pastaCliente)
    $apuracao = Join-Path $pastaCliente 'Apuracao'
    [void](Novo-Diretorio $apuracao)
    [void](Novo-Diretorio (Join-Path $pastaCliente 'Certificado'))

    $pastaAno = Join-Path $apuracao $Ano
    [void](Novo-Diretorio $pastaAno)
    if (-not $SemMeses) {
        foreach ($mes in $Meses) { [void](Novo-Diretorio (Join-Path $pastaAno $mes)) }
    }
}

if (-not (Test-Path -LiteralPath $Raiz)) {
    throw "Raiz nao encontrada ou sem acesso: $Raiz"
}

if ($Lote) {
    if (-not (Test-Path -LiteralPath $Lote)) { throw "CSV nao encontrado: $Lote" }
    $linhas = Import-Csv -LiteralPath $Lote
    $faltando = @('Numero', 'Nome') | Where-Object { $_ -notin $linhas[0].PSObject.Properties.Name }
    if ($faltando) { throw "CSV precisa das colunas Numero e Nome. Faltando: $($faltando -join ', ')" }

    foreach ($l in $linhas) { Criar-PastaCliente $l.Numero $l.Nome }
    Write-Host "`n$($linhas.Count) cliente(s) processado(s)." -ForegroundColor Cyan
}
elseif ($Numero -and $Nome) {
    Criar-PastaCliente $Numero $Nome
}
else {
    throw "Informe -Numero e -Nome, ou -Lote <arquivo.csv>."
}

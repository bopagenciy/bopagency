#Requires -Version 5.1
<#
.SYNOPSIS
    Phase 6 - Precheck de integracion LOCAL BopIAgency <-> n8n.

.DESCRIPTION
    Verifica el entorno local antes de ejecutar cualquier dispatch real:
    - Supabase local activo (puertos)
    - n8n local activo (puerto)
    - Next.js local responde (puerto 3200)
    - La ruta de callback rechaza metodos incorrectos de forma segura
    - Variables de entorno requeridas estan presentes (sin imprimir valores)
    - El workflow local de Phase 6 esta disponible y es JSON valido
    - Ninguna URL configurada apunta a un entorno de produccion

    Este script NO ejecuta ningun dispatch, NO activa el workflow, NO
    modifica archivos y NUNCA imprime el valor de ningun secreto.

.NOTES
    Ubicacion esperada: scripts/local/verify-phase6-n8n.ps1
    Uso:
        cd <raiz-del-repo>
        pwsh -File scripts/local/verify-phase6-n8n.ps1
        # o, en Windows PowerShell:
        powershell -ExecutionPolicy Bypass -File scripts/local/verify-phase6-n8n.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$script:HasFailure = $false
$script:HasWarning = $false

function Write-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][ValidateSet('PASS', 'FAIL', 'WARN', 'INFO')][string]$Status,
        [string]$Detail = ''
    )
    $color = 'Gray'
    switch ($Status) {
        'PASS' { $color = 'Green' }
        'FAIL' { $color = 'Red' }
        'WARN' { $color = 'Yellow' }
        'INFO' { $color = 'Cyan' }
    }
    $line = "[{0,-4}] {1}" -f $Status, $Name
    if ($Detail -ne '') { $line = "$line - $Detail" }
    Write-Host $line -ForegroundColor $color
    if ($Status -eq 'FAIL') { $script:HasFailure = $true }
    if ($Status -eq 'WARN') { $script:HasWarning = $true }
}

function Invoke-Abort {
    param([Parameter(Mandatory = $true)][string]$Reason)
    Write-Host ''
    Write-Host "ABORT: $Reason" -ForegroundColor Red
    Write-Host 'No se realizo ninguna accion adicional (sin dispatch, sin cambios).' -ForegroundColor Red
    exit 2
}

# ─── Resolucion de rutas (relativas a la raiz del repo) ─────────────────────

$RepoRoot     = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$WebEnvPath   = Join-Path $RepoRoot 'apps\web\.env.local'
$N8nEnvPath   = Join-Path $RepoRoot 'n8n-local\.env'
$ComposePath  = Join-Path $RepoRoot 'n8n-local\docker-compose.yml'
$WorkflowPath = Join-Path $RepoRoot 'n8n-local\workflows\phase6-local-runtime-test.json'

Write-Host '=== Phase 6 - Precheck local BopIAgency <-> n8n ===' -ForegroundColor Cyan
Write-Host "Repo root: $RepoRoot"
Write-Host ''

# ─── 0. Guarda anti-produccion: escanear archivos locales por patrones prohibidos ───
# Aborta INMEDIATAMENTE si detecta cualquier indicio de apuntar a produccion.

$ForbiddenPatterns = @(
    'supabase\.co',
    '\.supabase\.io',
    'n8n\.bopagency\.com',
    'bopagency\.com'
)

function Test-NoForbiddenPatterns {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Label)
    if (-not (Test-Path $Path)) { return }
    $lines = Get-Content -Path $Path -ErrorAction SilentlyContinue
    if (-not $lines) { return }
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        foreach ($pattern in $ForbiddenPatterns) {
            if ($trimmed -match $pattern) {
                Invoke-Abort "Patron de produccion detectado en $Label (coincide con '$pattern'). Revisar y corregir antes de continuar."
            }
        }
    }
}

Test-NoForbiddenPatterns -Path $WebEnvPath -Label 'apps/web/.env.local'
Test-NoForbiddenPatterns -Path $N8nEnvPath -Label 'n8n-local/.env'
Test-NoForbiddenPatterns -Path $ComposePath -Label 'n8n-local/docker-compose.yml'

Write-Check -Name 'Guarda anti-produccion (sin patrones prohibidos)' -Status 'PASS'

# ─── 1. Helpers ───────────────────────────────────────────────────────────────

function Get-EnvMap {
    param([Parameter(Mandatory = $true)][string]$Path)
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    $lines = Get-Content -Path $Path -ErrorAction SilentlyContinue
    foreach ($rawLine in $lines) {
        $line = $rawLine.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { continue }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        $map[$key] = $val
    }
    return $map
}

function Test-UrlIsLocal {
    param(
        [string]$Url,
        [Parameter(Mandatory = $true)][string]$VarName,
        [Parameter(Mandatory = $true)][string]$FilePath
    )
    if ([string]::IsNullOrWhiteSpace($Url)) { return }
    $allowedHosts = @('localhost', '127.0.0.1', 'host.docker.internal', '::1')
    try {
        $uri = [Uri]$Url
        if ($allowedHosts -notcontains $uri.Host) {
            Invoke-Abort "$VarName en $FilePath apunta a un host no local: $($uri.Host)"
        }
        Write-Check -Name "$VarName es una URL local" -Status 'PASS' -Detail $uri.Host
    } catch {
        Write-Check -Name "$VarName parseable como URL" -Status 'WARN' -Detail 'No se pudo interpretar como URI absoluta'
    }
}

function Test-PortOpen {
    param(
        [Parameter(Mandatory = $true)][string]$TargetHost,
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutMs = 1500
    )
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $asyncResult = $client.BeginConnect($TargetHost, $Port, $null, $null)
        $signaled = $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMs)
        if ($signaled -and $client.Connected) {
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

# ─── 2. Archivos de entorno presentes ─────────────────────────────────────────

if (Test-Path $WebEnvPath) {
    Write-Check -Name 'apps/web/.env.local existe' -Status 'PASS'
} else {
    Write-Check -Name 'apps/web/.env.local existe' -Status 'FAIL' -Detail 'No encontrado - copiar desde apps/web/.env.example'
}

if (Test-Path $N8nEnvPath) {
    Write-Check -Name 'n8n-local/.env existe' -Status 'PASS'
} else {
    Write-Check -Name 'n8n-local/.env existe' -Status 'FAIL' -Detail 'No encontrado - copiar desde n8n-local/.env.example'
}

$WebEnv = Get-EnvMap -Path $WebEnvPath
$N8nEnv = Get-EnvMap -Path $N8nEnvPath

# ─── 3. Variables requeridas (sin imprimir valores) ──────────────────────────

$RequiredWebVars = @(
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_APP_URL',
    'N8N_BASE_URL',
    'AUTOMATION_WEBHOOK_SECRET'
)
$OptionalWebVars = @(
    'N8N_WEBHOOK_PATH',
    'N8N_API_KEY',
    'N8N_DISPATCH_TIMEOUT_MS',
    'AUTOMATION_WEBHOOK_TOLERANCE_SECONDS'
)

foreach ($v in $RequiredWebVars) {
    if ($WebEnv.ContainsKey($v) -and $WebEnv[$v].Length -gt 0) {
        $len = $WebEnv[$v].Length
        Write-Check -Name "apps/web/.env.local: $v" -Status 'PASS' -Detail "presente ($len caracteres, valor no mostrado)"
    } else {
        Write-Check -Name "apps/web/.env.local: $v" -Status 'FAIL' -Detail 'ausente o vacia'
    }
}
foreach ($v in $OptionalWebVars) {
    if ($WebEnv.ContainsKey($v) -and $WebEnv[$v].Length -gt 0) {
        Write-Check -Name "apps/web/.env.local: $v (opcional)" -Status 'PASS' -Detail 'presente'
    } else {
        Write-Check -Name "apps/web/.env.local: $v (opcional)" -Status 'WARN' -Detail 'ausente - se usara el default del codigo'
    }
}

if ($WebEnv.ContainsKey('AUTOMATION_WEBHOOK_SECRET')) {
    if ($WebEnv['AUTOMATION_WEBHOOK_SECRET'].Length -lt 32) {
        Write-Check -Name 'AUTOMATION_WEBHOOK_SECRET longitud minima' -Status 'FAIL' -Detail 'Debe tener al menos 32 caracteres (ver hmac.ts)'
    } else {
        Write-Check -Name 'AUTOMATION_WEBHOOK_SECRET longitud minima' -Status 'PASS'
    }
}

foreach ($v in @('N8N_ENCRYPTION_KEY', 'AUTOMATION_WEBHOOK_SECRET')) {
    if ($N8nEnv.ContainsKey($v) -and $N8nEnv[$v].Length -gt 0) {
        $len = $N8nEnv[$v].Length
        Write-Check -Name "n8n-local/.env: $v" -Status 'PASS' -Detail "presente ($len caracteres, valor no mostrado)"
    } else {
        Write-Check -Name "n8n-local/.env: $v" -Status 'FAIL' -Detail 'ausente o vacia'
    }
}

# Comparar que el secreto compartido coincida, SIN imprimirlo en ningun caso.
if ($WebEnv.ContainsKey('AUTOMATION_WEBHOOK_SECRET') -and $N8nEnv.ContainsKey('AUTOMATION_WEBHOOK_SECRET')) {
    if ($WebEnv['AUTOMATION_WEBHOOK_SECRET'] -ceq $N8nEnv['AUTOMATION_WEBHOOK_SECRET']) {
        Write-Check -Name 'AUTOMATION_WEBHOOK_SECRET coincide en ambos archivos' -Status 'PASS'
    } else {
        Write-Check -Name 'AUTOMATION_WEBHOOK_SECRET coincide en ambos archivos' -Status 'FAIL' -Detail 'Los valores difieren - la verificacion HMAC fallara'
    }
} else {
    Write-Check -Name 'AUTOMATION_WEBHOOK_SECRET coincide en ambos archivos' -Status 'WARN' -Detail 'No se pudo comparar (falta en alguno de los dos archivos)'
}

# ─── 4. Ninguna URL configurada apunta a produccion ──────────────────────────

Test-UrlIsLocal -Url $WebEnv['N8N_BASE_URL']        -VarName 'N8N_BASE_URL'        -FilePath 'apps/web/.env.local'
Test-UrlIsLocal -Url $WebEnv['NEXT_PUBLIC_APP_URL']  -VarName 'NEXT_PUBLIC_APP_URL' -FilePath 'apps/web/.env.local'

if ($WebEnv.ContainsKey('NEXT_PUBLIC_SUPABASE_URL')) {
    $SupaUrl = $WebEnv['NEXT_PUBLIC_SUPABASE_URL']
    if ($SupaUrl -match 'supabase\.co') {
        Invoke-Abort "NEXT_PUBLIC_SUPABASE_URL apunta a Supabase CLOUD ($SupaUrl). Este script solo valida integraciones LOCALES."
    }
    Test-UrlIsLocal -Url $SupaUrl -VarName 'NEXT_PUBLIC_SUPABASE_URL' -FilePath 'apps/web/.env.local'
}

# ─── 5. Puertos esperados ─────────────────────────────────────────────────────

$Ports = @(
    @{ Name = 'Next.js local (3200)';      TargetHost = 'localhost';  Port = 3200 },
    @{ Name = 'n8n local (5678)';          TargetHost = '127.0.0.1';  Port = 5678 },
    @{ Name = 'Supabase local API (54321)'; TargetHost = '127.0.0.1'; Port = 54321 },
    @{ Name = 'Supabase local DB (54322)';  TargetHost = '127.0.0.1'; Port = 54322 }
)

foreach ($p in $Ports) {
    $open = Test-PortOpen -TargetHost $p.TargetHost -Port $p.Port
    if ($open) {
        Write-Check -Name $p.Name -Status 'PASS' -Detail 'puerto abierto'
    } else {
        Write-Check -Name $p.Name -Status 'FAIL' -Detail 'puerto no responde - verificar que el servicio este iniciado'
    }
}

# ─── 6. Next.js local responde ────────────────────────────────────────────────

try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:3200' -UseBasicParsing -TimeoutSec 5
    Write-Check -Name 'Next.js responde en :3200' -Status 'PASS' -Detail "HTTP $($resp.StatusCode)"
} catch {
    if ($_.Exception.Response) {
        $code = [int]$_.Exception.Response.StatusCode
        Write-Check -Name 'Next.js responde en :3200' -Status 'PASS' -Detail "HTTP $code (respuesta recibida del servidor)"
    } else {
        Write-Check -Name 'Next.js responde en :3200' -Status 'FAIL' -Detail 'Sin respuesta - verificar que "npm run dev" este activo'
    }
}

# ─── 7. La ruta de callback rechaza metodos incorrectos de forma segura ───────
# La ruta solo exporta POST (ver apps/web/src/app/api/webhooks/n8n/route.ts) y
# se autentica por HMAC (no por sesion), por lo que NUNCA debe pasar por el
# middleware de auth basado en cookies de Supabase. Un GET debe devolver un
# error controlado (404/405), nunca 200 ni una redireccion a /login.
#
# IMPORTANTE: -MaximumRedirection 0 desactiva el seguimiento automatico de
# redirecciones. Sin esto, Invoke-WebRequest sigue una 302 hacia /login de
# forma silenciosa y el check reporta un falso HTTP 200 (la pagina de login,
# no la respuesta real de la ruta). Con -MaximumRedirection 0, tanto en
# Windows PowerShell 5.1 como en PowerShell 7 una respuesta 3xx se entrega
# como excepcion (no se sigue), igual que ya ocurre hoy con 4xx/5xx.

function Get-LocationHeaderSafe {
    # Extrae unicamente el header Location (nunca cookies ni otros headers).
    # Compatible con HttpWebResponse (Windows PowerShell 5.1) y con
    # HttpResponseMessage (PowerShell 7), cuyas APIs de headers difieren.
    param($ResponseObject)
    if (-not $ResponseObject) { return $null }
    try {
        if ($ResponseObject.Headers -and $ResponseObject.Headers.Location) {
            return $ResponseObject.Headers.Location.ToString()
        }
    } catch { }
    try {
        $val = $ResponseObject.GetResponseHeader('Location')
        if ($val) { return $val }
    } catch { }
    try {
        $val = $ResponseObject.Headers['Location']
        if ($val) { return $val }
    } catch { }
    return $null
}

function Test-CallbackRouteRejectsGet {
    $uri = 'http://localhost:3200/api/webhooks/n8n'

    try {
        $resp = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0
        $code = [int]$resp.StatusCode

        if ($code -eq 404 -or $code -eq 405) {
            Write-Check -Name 'Callback route rechaza GET' -Status 'PASS' -Detail "HTTP $code"
            return
        }

        if ($code -ge 300 -and $code -lt 400) {
            $loc = Get-LocationHeaderSafe -ResponseObject $resp.BaseResponse
            $detail = "HTTP $code"
            if ($loc) { $detail = "$detail - Location: $loc" }
            if ($loc -and $loc -match '/login') {
                Write-Check -Name 'Callback route rechaza GET' -Status 'FAIL' -Detail "$detail (la ruta esta siendo interceptada por el middleware de autenticacion; el callback debe autenticarse por HMAC, no por sesion)"
            } else {
                Write-Check -Name 'Callback route rechaza GET' -Status 'FAIL' -Detail "$detail (redireccion inesperada, no se sigue)"
            }
            return
        }

        if ($code -eq 200) {
            $contentType = $resp.Headers['Content-Type']
            if ($contentType -match 'text/html') {
                Write-Check -Name 'Callback route rechaza GET' -Status 'FAIL' -Detail "HTTP 200 con Content-Type $contentType (respondio HTML - la ruta solo exporta POST)"
            } else {
                Write-Check -Name 'Callback route rechaza GET' -Status 'FAIL' -Detail "HTTP 200 con Content-Type $contentType (GET handler inesperado - la ruta solo debe exportar POST)"
            }
            return
        }

        Write-Check -Name 'Callback route rechaza GET' -Status 'WARN' -Detail "HTTP $code (no es 404/405 - revisar manualmente)"
    } catch {
        $response = $_.Exception.Response
        if (-not $response) {
            Write-Check -Name 'Callback route rechaza GET' -Status 'FAIL' -Detail 'Next.js no esta respondiendo en esa ruta'
            return
        }

        $code = [int]$response.StatusCode

        if ($code -eq 404 -or $code -eq 405) {
            Write-Check -Name 'Callback route rechaza GET' -Status 'PASS' -Detail "HTTP $code"
            return
        }

        if ($code -ge 300 -and $code -lt 400) {
            $loc = Get-LocationHeaderSafe -ResponseObject $response
            $detail = "HTTP $code"
            if ($loc) { $detail = "$detail - Location: $loc" }
            if ($loc -and $loc -match '/login') {
                Write-Check -Name 'Callback route rechaza GET' -Status 'FAIL' -Detail "$detail (la ruta esta siendo interceptada por el middleware de autenticacion; el callback debe autenticarse por HMAC, no por sesion)"
            } else {
                Write-Check -Name 'Callback route rechaza GET' -Status 'FAIL' -Detail "$detail (redireccion inesperada, no se sigue)"
            }
            return
        }

        if ($code -eq 200) {
            Write-Check -Name 'Callback route rechaza GET' -Status 'FAIL' -Detail 'HTTP 200 (GET handler inesperado - la ruta solo debe exportar POST)'
            return
        }

        Write-Check -Name 'Callback route rechaza GET' -Status 'WARN' -Detail "HTTP $code (no es 404/405 - revisar manualmente)"
    }
}

Test-CallbackRouteRejectsGet

# ─── 8. Workflow local disponible ─────────────────────────────────────────────

if (Test-Path $WorkflowPath) {
    try {
        $wfRaw = Get-Content -Path $WorkflowPath -Raw
        $wfJson = $wfRaw | ConvertFrom-Json
        $nodeCount = $wfJson.nodes.Count
        Write-Check -Name 'Workflow local (phase6-local-runtime-test.json)' -Status 'PASS' -Detail "$nodeCount nodos, JSON valido"
        if ($wfJson.active -eq $true) {
            Write-Check -Name 'Workflow no esta activo en el export' -Status 'WARN' -Detail 'El JSON exportado tiene active=true; se recomienda activarlo manualmente solo tras revisarlo en la UI'
        } else {
            Write-Check -Name 'Workflow no esta activo en el export' -Status 'PASS'
        }
    } catch {
        Write-Check -Name 'Workflow local (phase6-local-runtime-test.json)' -Status 'FAIL' -Detail 'El archivo existe pero no es JSON valido'
    }
} else {
    Write-Check -Name 'Workflow local (phase6-local-runtime-test.json)' -Status 'FAIL' -Detail 'No encontrado en n8n-local/workflows/'
}

# ─── 9. Resumen ────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '=== Resumen ===' -ForegroundColor Cyan
Write-Host 'Este script NO ejecuto ningun dispatch ni activo ningun workflow.' -ForegroundColor Cyan

if ($script:HasFailure) {
    Write-Host 'Resultado: FAIL - hay verificaciones fallidas. Corregir antes de continuar.' -ForegroundColor Red
    exit 1
} elseif ($script:HasWarning) {
    Write-Host 'Resultado: PASS CON ADVERTENCIAS - revisar los WARN antes de continuar.' -ForegroundColor Yellow
    exit 0
} else {
    Write-Host 'Resultado: PASS - entorno local listo para el siguiente paso manual del runbook.' -ForegroundColor Green
    exit 0
}

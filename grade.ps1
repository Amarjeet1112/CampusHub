# ==============================================================================
# CampusHub Grading and Compliance Verification Script (PowerShell Edition)
# ==============================================================================

$passed = 0
$failed = 0
$total = 0

function Pass-Check($msg) {
    $script:total++
    $script:passed++
    Write-Host "  [PASS] $msg" -ForegroundColor Green
}

function Fail-Check($msg) {
    $script:total++
    $script:failed++
    Write-Host "  [FAIL] $msg" -ForegroundColor Red
}

function Section($title) {
    Write-Host "`n=== $title ===" -ForegroundColor Cyan
}

Write-Host "====================================================" -ForegroundColor DarkCyan
Write-Host "   CampusHub Exam Specification Auto-Grader (PS)   " -ForegroundColor DarkCyan
Write-Host "====================================================" -ForegroundColor DarkCyan

Section "1. Verifying Docker Compose Configuration"
if (Test-Path "docker-compose.yml") {
    Pass-Check "docker-compose.yml file is present in project root"
} else {
    Fail-Check "docker-compose.yml is missing"
}

$compose = Get-Content "docker-compose.yml" -Raw

Section "2. Verifying Required Services (Exactly 9 Services)"
$requiredServices = @("gateway", "frontend", "api", "worker", "postgres", "redis", "rabbitmq", "minio", "mailhog")
foreach ($s in $requiredServices) {
    if ($compose -match "(?m)^  ${s}:") {
        Pass-Check "Service '$s' defined in docker-compose.yml"
    } else {
        Fail-Check "Service '$s' is NOT defined in docker-compose.yml"
    }
}

Section "3. Verifying Dockerfiles"
if (Test-Path "app/frontend/Dockerfile") { Pass-Check "Frontend Dockerfile exists" } else { Fail-Check "Frontend Dockerfile missing" }
if (Test-Path "app/api/Dockerfile") { Pass-Check "API & Worker single shared Dockerfile exists" } else { Fail-Check "API Dockerfile missing" }
if (Test-Path "gateway/Dockerfile") { Pass-Check "Gateway Dockerfile exists" } else { Fail-Check "Gateway Dockerfile missing" }

Section "4. Verifying .dockerignore Files"
if (Test-Path ".dockerignore") { Pass-Check "Root .dockerignore exists" } else { Fail-Check "Root .dockerignore missing" }
if (Test-Path "app/frontend/.dockerignore") { Pass-Check "Frontend .dockerignore exists" } else { Fail-Check "Frontend .dockerignore missing" }
if (Test-Path "app/api/.dockerignore") { Pass-Check "API .dockerignore exists" } else { Fail-Check "API .dockerignore missing" }
if (Test-Path "gateway/.dockerignore") { Pass-Check "Gateway .dockerignore exists" } else { Fail-Check "Gateway .dockerignore missing" }

Section "5. Verifying Network Segmentation"
foreach ($net in @("frontend", "backend", "data")) {
    if ($compose -match "(?m)^  ${net}:") {
        Pass-Check "Network '$net' declared in docker-compose.yml"
    } else {
        Fail-Check "Network '$net' missing from docker-compose.yml"
    }
}

Section "6. Verifying Named Volumes"
foreach ($vol in @("postgres_data", "minio_data")) {
    if ($compose -match "(?m)^  ${vol}:") {
        Pass-Check "Named volume '$vol' declared in docker-compose.yml"
    } else {
        Fail-Check "Named volume '$vol' missing from docker-compose.yml"
    }
}

Section "7. Verifying Healthchecks & Worker Override"
if ($compose -match "(?s)postgres:.*?healthcheck:") { Pass-Check "PostgreSQL has a healthcheck defined" } else { Fail-Check "PostgreSQL healthcheck missing" }
if ($compose -match "(?s)redis:.*?healthcheck:") { Pass-Check "Redis has a healthcheck defined" } else { Fail-Check "Redis healthcheck missing" }
if ($compose -match "(?s)rabbitmq:.*?healthcheck:") { Pass-Check "RabbitMQ has a healthcheck defined" } else { Fail-Check "RabbitMQ healthcheck missing" }
if ($compose -match "(?s)minio:.*?healthcheck:") { Pass-Check "MinIO has a healthcheck defined" } else { Fail-Check "MinIO healthcheck missing" }
if ($compose -match "(?s)worker:.*?disable:\s*true") { Pass-Check "Worker properly disables inherited API healthcheck" } else { Fail-Check "Worker does not disable healthcheck" }

Section "8. Verifying Secrets & Environment Variable Usage"
if (Test-Path ".env.example") { Pass-Check ".env.example exists with placeholder parameters" } else { Fail-Check ".env.example missing" }
$gitignore = Get-Content ".gitignore" -Raw
if ($gitignore -match "\.env") { Pass-Check ".env is safely ignored in .gitignore" } else { Fail-Check ".env not in .gitignore" }
$dockerignore = Get-Content ".dockerignore" -Raw
if ($dockerignore -match "\.env") { Pass-Check ".env is excluded in root .dockerignore" } else { Fail-Check ".env not in .dockerignore" }
if ($compose -notmatch '(?i)password:\s*"[a-zA-Z0-9_-]+"') { Pass-Check "No hardcoded plain passwords found in docker-compose.yml" } else { Fail-Check "Hardcoded passwords found" }

Section "9. Verifying Port Security and Interface Binding"
if ($compose -match "(?s)gateway:.*?8080") { Pass-Check "Gateway exposes ingress port" } else { Fail-Check "Gateway ingress port missing" }
$pgBlock = [regex]::Match($compose, "(?ms)^  postgres:.*?(?=^  \w+:|\z)").Value
if ($pgBlock -notmatch "ports:") { Pass-Check "Service 'postgres' is not directly exposed on host ports" } else { Fail-Check "Postgres exposes host port" }
$redisBlock = [regex]::Match($compose, "(?ms)^  redis:.*?(?=^  \w+:|\z)").Value
if ($redisBlock -notmatch "ports:") { Pass-Check "Service 'redis' is not directly exposed on host ports" } else { Fail-Check "Redis exposes host port" }
$mailhogBlock = [regex]::Match($compose, "(?ms)^  mailhog:.*?(?=^  \w+:|\z)").Value
if ($mailhogBlock -match "127\.0\.0\.1") { Pass-Check "Service 'mailhog' is safely restricted to 127.0.0.1" } else { Fail-Check "Mailhog not bound to 127.0.0.1" }
$rabbitmqBlock = [regex]::Match($compose, "(?ms)^  rabbitmq:.*?(?=^  \w+:|\z)").Value
if ($rabbitmqBlock -match "127\.0\.0\.1") { Pass-Check "Service 'rabbitmq' is safely restricted to 127.0.0.1" } else { Fail-Check "RabbitMQ not bound to 127.0.0.1" }
$minioBlock = [regex]::Match($compose, "(?ms)^  minio:.*?(?=^  \w+:|\z)").Value
if ($minioBlock -match "127\.0\.0\.1") { Pass-Check "Service 'minio' is safely restricted to 127.0.0.1" } else { Fail-Check "MinIO not bound to 127.0.0.1" }

Section "10. Verifying Non-Root Configuration"
$frontDock = Get-Content "app/frontend/Dockerfile" -Raw
if ($frontDock -match "USER\s+nginx") { Pass-Check "Frontend Dockerfile specifies non-root user (USER nginx)" } else { Fail-Check "Frontend non-root missing" }
$apiDock = Get-Content "app/api/Dockerfile" -Raw
if ($apiDock -match "USER\s+node") { Pass-Check "API Dockerfile specifies non-root user (USER node)" } else { Fail-Check "API non-root missing" }
$gwDock = Get-Content "gateway/Dockerfile" -Raw
if ($gwDock -match "USER\s+nginx") { Pass-Check "Gateway Dockerfile specifies non-root user (USER nginx)" } else { Fail-Check "Gateway non-root missing" }

Section "11. Verifying Resource Limits & Restart Policies"
$restartCount = ([regex]::Matches($compose, "restart:\s*unless-stopped")).Count
if ($restartCount -ge 9) { Pass-Check "All 9 services have restart: unless-stopped configured" } else { Fail-Check "Restart policies missing ($restartCount/9)" }
$limitsCount = ([regex]::Matches($compose, "limits:")).Count
if ($limitsCount -ge 9) { Pass-Check "All 9 services have CPU and Memory limits defined" } else { Fail-Check "Resource limits missing ($limitsCount/9)" }

Section "12. Checking API Image Size (if present)"
try {
    $imgSize = docker inspect --format='{{.Size}}' campushub-api:latest 2>$null
    if ($imgSize) {
        $sizeMB = [math]::Round([int64]$imgSize / 1MB, 2)
        if ($sizeMB -lt 250) {
            Pass-Check "campushub-api:latest image size is $sizeMB MB (< 250MB threshold)"
        } else {
            Fail-Check "campushub-api:latest image size is $sizeMB MB (exceeds 250MB threshold)"
        }
    } else {
        Write-Host "  [INFO] Image campushub-api:latest not yet built locally (build to verify size)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [INFO] Docker check skipped" -ForegroundColor Yellow
}

Write-Host "`n====================================================" -ForegroundColor DarkCyan
Write-Host "                 Grading Summary                   " -ForegroundColor DarkCyan
Write-Host "====================================================" -ForegroundColor DarkCyan
Write-Host "Total Checks:  $total"
Write-Host "Passed Checks: $passed" -ForegroundColor Green
Write-Host "Failed Checks: $failed" -ForegroundColor Red

if ($failed -eq 0) {
    Write-Host "`n🎉 EXCELLENT! 100% of the tested exam specifications PASSED!`n" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n⚠️ Some specifications require attention. Review the FAIL logs above.`n" -ForegroundColor Red
    exit 1
}

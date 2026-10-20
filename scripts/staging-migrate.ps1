[CmdletBinding()]
param(
  [ValidateSet('Preflight', 'Apply')]
  [string]$Mode = 'Preflight',
  [string]$ConfirmApply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path $PSScriptRoot -Parent
$backendRoot = Join-Path $repoRoot 'backend'
$psqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$stagingHost = 'db.pqdqhfohvoqgwhtznjdw.supabase.co'
$stagingPort = 5432
$stagingDatabase = 'postgres'
$stagingUser = 'postgres'
$stagingCaPath = Join-Path $backendRoot 'certs\supabase-staging-ca.crt'

$expectedMigrations = @(
  '20260922000000_init',
  '20261015000000_booking_v2_foundation',
  '20261017000000_recurring_booking_foundation'
)

$expectedApplicationTables = @(
  'amenities', 'auth_sessions', 'bank_accounts', 'booking_series', 'booking_slots',
  'bookings', 'cancellation_policies', 'content_pages', 'court_blocks',
  'court_slot_locks', 'courts', 'facilities', 'facility_amenities',
  'facility_images', 'favorites', 'notifications', 'owner_profiles',
  'owner_requests', 'password_reset_tokens', 'payment_proofs', 'price_rules',
  'refunds', 'review_images', 'reviews', 'users'
) | Sort-Object

$restoreEnvironment = @{}
foreach ($name in @('DATABASE_URL', 'DIRECT_URL', 'DATABASE_CA_PATH')) {
  $restoreEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

function Invoke-Native {
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [Parameter(Mandatory)][string[]]$Arguments,
    [Parameter(Mandatory)][string]$FailureCode,
    [int[]]$AllowedExitCodes = @(0)
  )

  $previousPreference = $ErrorActionPreference
  try {
    # Prisma can emit informational diagnostics on stderr. Its actual process
    # exit code, rather than PowerShell stderr behavior, decides success.
    $ErrorActionPreference = 'Continue'
    $output = @(& $FilePath @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }

  if ($exitCode -notin $AllowedExitCodes) {
    throw "$FailureCode (exit $exitCode)"
  }

  return [PSCustomObject]@{ ExitCode = $exitCode; Output = @($output) }
}

function Invoke-StagingPsqlScalar {
  param([Parameter(Mandatory)][string]$Sql)

  $result = Invoke-Native -FilePath $psqlPath -Arguments @(
    '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-A', '-t',
    '-h', $stagingHost, '-p', "$stagingPort", '-U', $stagingUser,
    '-d', $stagingDatabase, '-c', $Sql
  ) -FailureCode 'STAGING_READ_ONLY_PSQL_CHECK_FAILED'

  $lines = @($result.Output | ForEach-Object { "$($_)".Trim() } | Where-Object { $_.Length -gt 0 })
  if ($lines.Count -ne 1) { throw 'STAGING_PSQL_SCALAR_RESULT_INVALID' }
  return $lines[0]
}

function Invoke-StagingPsqlLines {
  param([Parameter(Mandatory)][string]$Sql)

  $result = Invoke-Native -FilePath $psqlPath -Arguments @(
    '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-A', '-t',
    '-h', $stagingHost, '-p', "$stagingPort", '-U', $stagingUser,
    '-d', $stagingDatabase, '-c', $Sql
  ) -FailureCode 'STAGING_READ_ONLY_PSQL_CHECK_FAILED'

  return @($result.Output | ForEach-Object { "$($_)".Trim() } | Where-Object { $_.Length -gt 0 })
}

function Assert-RepositoryGuard {
  $branch = (git -C $repoRoot branch --show-current).Trim()
  $head = (git -C $repoRoot rev-parse HEAD).Trim()
  $originHead = (git -C $repoRoot rev-parse origin/main).Trim()
  $status = @(git -C $repoRoot status --short)
  if ($branch -ne 'main' -or $head -ne $originHead -or $status.Count -ne 0) {
    throw 'REPOSITORY_GUARD_FAILED'
  }
}

function Assert-MigrationDirectorySet {
  $actual = @(
    Get-ChildItem (Join-Path $backendRoot 'prisma\migrations') -Directory |
      Sort-Object Name |
      ForEach-Object Name
  )
  if (@(Compare-Object $expectedMigrations $actual).Count -ne 0) {
    throw 'COMMITTED_MIGRATION_SET_MISMATCH'
  }
}

function Assert-StagingTargetAndTls {
  $targetPass = Invoke-StagingPsqlScalar @'
SELECT CASE WHEN
  current_database() = 'postgres'
  AND current_user = 'postgres'
  AND EXISTS (
    SELECT 1 FROM pg_stat_ssl
    WHERE pid = pg_backend_pid() AND ssl IS TRUE AND version LIKE 'TLSv%'
  )
THEN 'PASS' ELSE 'FAIL' END;
'@
  if ($targetPass -ne 'PASS') { throw 'STAGING_IDENTITY_OR_TLS_GUARD_FAILED' }

  $tlsVersion = Invoke-StagingPsqlScalar @'
SELECT version FROM pg_stat_ssl WHERE pid = pg_backend_pid();
'@
  if ($tlsVersion -notmatch '^TLSv') { throw 'STAGING_TLS_VERSION_INVALID' }
  return $tlsVersion
}

function Assert-EmptyPublicSchema {
  $baseTableCount = Invoke-StagingPsqlScalar @'
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
'@
  $migrationTableState = Invoke-StagingPsqlScalar @'
SELECT CASE WHEN to_regclass('public._prisma_migrations') IS NULL
  THEN 'ABSENT' ELSE 'PRESENT' END;
'@
  if ($baseTableCount -ne '0' -or $migrationTableState -ne 'ABSENT') {
    throw 'STAGING_SCHEMA_NOT_EMPTY'
  }
  return [PSCustomObject]@{ BaseTables = $baseTableCount; MigrationTable = $migrationTableState }
}

function Assert-PrismaPendingMigrationState {
  $result = Invoke-Native -FilePath $script:nodePath -Arguments @(
    '.\node_modules\prisma\build\index.js', 'migrate', 'status',
    '--config', '.\prisma.config.js'
  ) -FailureCode 'PRISMA_MIGRATE_STATUS_FAILED' -AllowedExitCodes @(0, 1)

  $text = (@($result.Output | ForEach-Object { "$_" }) -join "`n")
  foreach ($migration in $expectedMigrations) {
    if ($text -notmatch [regex]::Escape($migration)) {
      throw 'PRISMA_STATUS_PENDING_MIGRATION_SET_MISMATCH'
    }
  }
  if ($text -match '(?i)drift|diverg|failed migration|migration history.*conflict') {
    throw 'PRISMA_STATUS_MIGRATION_HISTORY_INVALID'
  }
}

function Assert-PostMigrationSchema {
  $actualTables = @(Invoke-StagingPsqlLines @'
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
'@) | Sort-Object
  $expectedTables = @('_prisma_migrations') + $expectedApplicationTables | Sort-Object
  if (@(Compare-Object $expectedTables $actualTables).Count -ne 0) {
    throw 'POST_MIGRATION_TABLE_SET_MISMATCH'
  }

  $applied = @(Invoke-StagingPsqlLines @'
SELECT migration_name FROM public._prisma_migrations
WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
ORDER BY migration_name;
'@)
  $invalidRows = Invoke-StagingPsqlScalar @'
SELECT count(*) FROM public._prisma_migrations
WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;
'@
  if ($invalidRows -ne '0' -or @(Compare-Object $expectedMigrations $applied).Count -ne 0) {
    throw 'POST_MIGRATION_HISTORY_INVALID'
  }

  foreach ($table in $expectedApplicationTables) {
    $rows = Invoke-StagingPsqlScalar "SELECT count(*) FROM public.`"$table`";"
    if ($rows -ne '0') { throw "UNEXPECTED_STAGING_APPLICATION_DATA:$table" }
  }

  return $actualTables.Count
}

function Invoke-PrismaRuntimeSelect {
  $runtimeCheck = @'
import { prisma } from './src/config/prisma.js';
try {
  const rows = await prisma.$queryRawUnsafe('SELECT 1 AS value');
  if (!rows[0] || String(rows[0].value) !== '1') throw new Error('PRISMA_SELECT_RESULT_INVALID');
  console.log('PRISMA_STAGING_CONNECTION=PASS');
  console.log('PRISMA_SELECT=PASS');
} finally {
  await prisma.$disconnect();
}
'@
  $result = Invoke-Native -FilePath $script:nodePath -Arguments @(
    '--input-type=module', '--eval', $runtimeCheck
  ) -FailureCode 'PRISMA_RUNTIME_CONNECTION_FAILED'
  $text = (@($result.Output | ForEach-Object { "$_" }) -join "`n")
  if ($text -notmatch 'PRISMA_STAGING_CONNECTION=PASS' -or $text -notmatch 'PRISMA_SELECT=PASS') {
    throw 'PRISMA_RUNTIME_SELECT_RESULT_INVALID'
  }
}

function Restore-Environment {
  foreach ($name in $restoreEnvironment.Keys) {
    if ($null -eq $restoreEnvironment[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable($name, $restoreEnvironment[$name], 'Process') }
  }
  foreach ($name in @('STAGING_DATABASE_PASSWORD', 'PGPASSWORD', 'PGSSLROOTCERT', 'PGSSLMODE', 'PGCONNECT_TIMEOUT')) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
}

try {
  if (-not (Test-Path -LiteralPath $psqlPath -PathType Leaf)) { throw 'PSQL_EXECUTABLE_MISSING' }
  if ([string]::IsNullOrWhiteSpace($env:STAGING_DATABASE_PASSWORD)) { throw 'STAGING_DATABASE_PASSWORD_MISSING' }
  if (-not (Test-Path -LiteralPath $stagingCaPath -PathType Leaf)) { throw 'STAGING_CA_FILE_MISSING' }

  $script:nodePath = (Get-Command node -ErrorAction Stop).Source
  Invoke-Native -FilePath $script:nodePath -Arguments @(
    '--input-type=module', '--eval',
    "import { readFileSync } from 'node:fs'; import { X509Certificate } from 'node:crypto'; new X509Certificate(readFileSync(process.argv[1]));", $stagingCaPath
  ) -FailureCode 'STAGING_CA_CERTIFICATE_INVALID' | Out-Null

  Assert-RepositoryGuard
  Assert-MigrationDirectorySet

  $password = [Environment]::GetEnvironmentVariable('STAGING_DATABASE_PASSWORD', 'Process')
  $escapedPassword = [Uri]::EscapeDataString($password)
  $stagingUrl = "postgresql://${stagingUser}:${escapedPassword}@${stagingHost}:$stagingPort/$stagingDatabase"
  $target = [Uri]$stagingUrl
  if ($target.Host -ne $stagingHost -or $target.Port -ne $stagingPort -or
      $target.AbsolutePath.TrimStart('/') -ne $stagingDatabase -or $target.UserInfo.Split(':')[0] -ne $stagingUser) {
    throw 'STAGING_URL_TARGET_GUARD_FAILED'
  }

  # dotenv may read backend/.env, but cannot override these process values.
  # Both Prisma CLI candidates are therefore staging-only for this invocation.
  $env:DATABASE_URL = $stagingUrl
  $env:DIRECT_URL = $stagingUrl
  $env:DATABASE_CA_PATH = $stagingCaPath
  $env:PGPASSWORD = $password
  $env:PGSSLMODE = 'verify-full'
  $env:PGSSLROOTCERT = $stagingCaPath
  $env:PGCONNECT_TIMEOUT = '12'

  $tlsVersion = Assert-StagingTargetAndTls
  $emptySchema = Assert-EmptyPublicSchema

  Push-Location $backendRoot
  try {
    Invoke-Native -FilePath $script:nodePath -Arguments @(
      '.\node_modules\prisma\build\index.js', 'validate', '--config', '.\prisma.config.js'
    ) -FailureCode 'PRISMA_VALIDATE_FAILED' | Out-Null
    Invoke-Native -FilePath $script:nodePath -Arguments @(
      '.\node_modules\prisma\build\index.js', 'generate', '--config', '.\prisma.config.js'
    ) -FailureCode 'PRISMA_GENERATE_FAILED' | Out-Null
    Assert-PrismaPendingMigrationState
  }
  finally { Pop-Location }

  # Final mutation gate: rerun all target-sensitive checks immediately before Apply.
  $tlsVersion = Assert-StagingTargetAndTls
  $emptySchema = Assert-EmptyPublicSchema
  Assert-RepositoryGuard

  Write-Host 'FINAL MUTATION GATE: PASS'
  Write-Host "TARGET: ${stagingHost}:$stagingPort/$stagingDatabase"
  Write-Host "USER: $stagingUser"
  Write-Host "TLS: verify-full PASS ($tlsVersion)"
  Write-Host "PUBLIC BASE TABLES: $($emptySchema.BaseTables)"
  Write-Host "_prisma_migrations: $($emptySchema.MigrationTable)"
  Write-Host "EXPECTED MIGRATIONS: $($expectedMigrations.Count)"
  Write-Host 'PRODUCTION DATABASE: NOT USED'
  Write-Host 'SEED: NOT RUN'

  if ($Mode -eq 'Preflight') {
    Write-Host 'MIGRATION: NOT RUN'
    return
  }

  if ($ConfirmApply -cne 'APPLY_STAGING_MIGRATIONS') { throw 'APPLY_CONFIRMATION_REQUIRED' }

  Push-Location $backendRoot
  try {
    Invoke-Native -FilePath $script:nodePath -Arguments @(
      '.\node_modules\prisma\build\index.js', 'migrate', 'deploy', '--config', '.\prisma.config.js'
    ) -FailureCode 'PRISMA_MIGRATE_DEPLOY_FAILED' | Out-Null
  }
  finally { Pop-Location }

  $tlsVersion = Assert-StagingTargetAndTls
  $tableCount = Assert-PostMigrationSchema
  Push-Location $backendRoot
  try { Invoke-PrismaRuntimeSelect }
  finally { Pop-Location }
  Assert-RepositoryGuard

  Write-Host 'PRISMA MIGRATE DEPLOY: PASS'
  Write-Host "POST-MIGRATION TABLES: $tableCount"
  Write-Host 'MIGRATION HISTORY: PASS'
  Write-Host 'STAGING BUSINESS DATA: NOT CREATED'
}
finally {
  $password = $null
  $escapedPassword = $null
  $stagingUrl = $null
  Restore-Environment
  Write-Host 'TEMPORARY CREDENTIAL CLEANUP: PASS'
}

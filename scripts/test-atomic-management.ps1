param([string]$SeedPath = '.contingency/review/seed.json')
$ErrorActionPreference = 'Stop'
$seed = Get-Content -Raw -LiteralPath $SeedPath | ConvertFrom-Json
$ids = @($seed.owner, $seed.members[0], $seed.members[1])
foreach ($id in $ids) {
  if ($id -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') { throw 'Expected synthetic UUIDs' }
}
$sql = "BEGIN;`nSELECT set_config('test.owner', '$($ids[0])', true), set_config('test.member', '$($ids[1])', true), set_config('test.viewer', '$($ids[2])', true);`n"
$sql += Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'test-atomic-management.sql')
# Fixed independent target: this test deliberately has no production target option.
$sql | wsl -d Ubuntu -u root -- docker exec -i tuat-review-db psql -q -U postgres -d tuat_review -v ON_ERROR_STOP=1 -o /dev/null
if ($LASTEXITCODE -ne 0) { throw 'Independent DB atomic-management regression failed' }
Write-Output 'Independent DB atomic-management regression passed; fixtures rolled back.'

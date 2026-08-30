$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$V1 = Resolve-Path (Join-Path $Here "..")
$Lock = Get-Content (Join-Path $V1 "upstream/doocs-md.lock.json") -Raw | ConvertFrom-Json
$Target = Join-Path $V1 "upstream/doocs-md"
if (-not (Test-Path $Target)) { git clone --filter=blob:none --no-checkout $Lock.repository $Target }
git -C $Target fetch --depth=1 origin $Lock.commit
git -C $Target checkout --detach $Lock.commit
Write-Host "doocs/md pinned at $($Lock.commit)"

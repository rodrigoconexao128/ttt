param(
  [int]$Rounds = 3,
  [string]$BaseUrl = "http://localhost:5000",
  [string]$Email = "rodrigoconexao128@gmail.com",
  [string]$Password = "Ibira2019!"
)

$ErrorActionPreference = 'Stop'
$cookie = Join-Path $env:TEMP "agentezap_admin_cookies.txt"

function Wait-ForServer([string]$url, [int]$timeoutSeconds = 30) {
  $uri = [Uri]$url
  $hostName = $uri.Host
  $port = if ($uri.Port -gt 0) { $uri.Port } else { 80 }

  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $ok = Test-NetConnection -ComputerName $hostName -Port $port -InformationLevel Quiet
      if ($ok) { return }
    } catch {
      # ignore and retry
    }
    Start-Sleep -Milliseconds 300
  }

  throw "Server not reachable at $url"
}

function Test-AdminBurst([int]$round) {
  Remove-Item -Force $cookie -ErrorAction SilentlyContinue
  Write-Host "\n=== ROUND $round ==="

  Wait-ForServer "$BaseUrl/api/admin/session"

  $loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
  $loginSw = [System.Diagnostics.Stopwatch]::StartNew()
  $null = & curl.exe -s -c $cookie -H "Content-Type: application/json" -d $loginBody "$BaseUrl/api/admin/login"
  $loginSw.Stop()
  Write-Host ("login: {0:n0}ms" -f $loginSw.Elapsed.TotalMilliseconds)

  $endpoints = @(
    "/api/admin/session",
    "/api/admin/stats",
    "/api/admin/users",
    "/api/admin/plans",
    "/api/admin/subscriptions",
    "/api/admin/payments/pending",
    "/api/admin/config"
  )

  $jobs = @()
  foreach ($path in $endpoints) {
    $url = "$BaseUrl$path"
    $jobs += Start-Job -ArgumentList $url, $cookie -ScriptBlock {
      param($u, $cookiePath)
      $sw = [System.Diagnostics.Stopwatch]::StartNew()
      $out = & curl.exe -s -b $cookiePath $u
      $sw.Stop()
      $outStr = [string]$out
      [PSCustomObject]@{ url = $u; ms = [math]::Round($sw.Elapsed.TotalMilliseconds,0); ok = ($outStr.Length -gt 0) }
    }
  }

  $results = Receive-Job -Job $jobs -Wait
  Remove-Job -Job $jobs

  $results | Sort-Object ms -Descending | Format-Table -AutoSize url, ms, ok
}

for ($i = 1; $i -le $Rounds; $i++) {
  Test-AdminBurst -round $i
}

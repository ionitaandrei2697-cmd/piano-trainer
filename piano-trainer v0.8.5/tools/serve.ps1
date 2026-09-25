# ============================================================================
# serve.ps1 - serve Piano Trainer at http://127.0.0.1:<Port>/
# ----------------------------------------------------------------------------
# Why this exists: a MIDI keyboard needs the page to come from a web address
# rather than a file on disk in some browser setups. This is the smallest web
# server that can do that with nothing installed - it uses only PowerShell,
# which every Windows PC has.
#
# Design notes
#  * TcpListener on the loopback address, not HttpListener. HttpListener goes
#    through http.sys, which can refuse to listen without administrator rights
#    ("Access is denied"). A plain socket on 127.0.0.1 needs no rights and is
#    reachable from this computer only.
#  * One thread, but it never waits on a silent connection. Browsers open
#    speculative connections that send nothing; a server that blocked reading
#    one would freeze the page for seconds. Instead every open socket is polled
#    and served as soon as its request is complete; idle ones are dropped.
#  * A FIXED address (127.0.0.1 and a fixed port). The browser keeps saved
#    pieces and settings per address, so the address must never change.
#  * Pure ASCII on purpose: Windows PowerShell 5.1 reads a script without a
#    byte-order mark in the legacy code page.
# Compatible with Windows PowerShell 5.1 and PowerShell 7.
# ============================================================================
param(
  [int]$Port = 8765,
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$url  = "http://127.0.0.1:$Port/"

$mime = @{
  '.html' = 'text/html; charset=utf-8';   '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8';    '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
  '.png'  = 'image/png';  '.ico' = 'image/x-icon'; '.mp3' = 'audio/mpeg'
  '.mid'  = 'audio/midi'; '.midi' = 'audio/midi'
  '.xml'  = 'application/xml'; '.musicxml' = 'application/xml'; '.mxl' = 'application/vnd.recordare.musicxml'
  '.woff2' = 'font/woff2'; '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
}

function Send-Response($stream, [string]$status, [string]$type, [byte[]]$body, [bool]$headOnly) {
  $len = 0
  if ($body) { $len = $body.Length }
  $head = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $len`r`n" +
          "Cache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
  $h = [System.Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($h, 0, $h.Length)
  if (-not $headOnly -and $len -gt 0) { $stream.Write($body, 0, $len) }
  $stream.Flush()
}

function Serve-Request($stream, [string]$request) {
  $line = ($request -split "`r`n")[0]
  $parts = $line -split ' '
  if ($parts.Length -lt 2) { Send-Response $stream '400 Bad Request' 'text/plain' ([System.Text.Encoding]::ASCII.GetBytes('bad request')) $false; return }
  $method = $parts[0]
  if ($method -ne 'GET' -and $method -ne 'HEAD') {
    Send-Response $stream '405 Method Not Allowed' 'text/plain' ([System.Text.Encoding]::ASCII.GetBytes('method not allowed')) $false; return
  }
  $path = ($parts[1] -split '\?')[0]
  $path = [System.Uri]::UnescapeDataString($path)
  if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
  $rel  = $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
  # Never serve anything outside the app folder (".." tricks).
  $inside = $full.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
  if (-not $inside -or -not [System.IO.File]::Exists($full)) {
    Send-Response $stream '404 Not Found' 'text/plain' ([System.Text.Encoding]::ASCII.GetBytes('not found')) ($method -eq 'HEAD'); return
  }
  $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
  $type = $mime[$ext]
  if (-not $type) { $type = 'application/octet-stream' }
  $bytes = [System.IO.File]::ReadAllBytes($full)
  Send-Response $stream '200 OK' $type $bytes ($method -eq 'HEAD')
}

# ---- start, or recognise that we are already running ----------------------
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
try {
  $listener.Start()
} catch {
  $ours = $false
  try {
    $probe = Invoke-WebRequest -Uri ($url + 'index.html') -UseBasicParsing -TimeoutSec 3
    if ($probe.Content -match 'Piano Trainer') { $ours = $true }
  } catch { }
  if ($ours) {
    Write-Host "Piano Trainer is already running - opening $url"
    if (-not $NoBrowser) { Start-Process $url }
    exit 0
  }
  Write-Host "Port $Port is taken by another program."
  Write-Host "Edit 'Start Piano Trainer.cmd' and change 8765 to another number (keep it the same from then on)."
  exit 1
}

Write-Host ""
Write-Host "  Piano Trainer is running at $url"
Write-Host "  Keep this window open while you play. Close it to stop."
Write-Host ""
if (-not $NoBrowser) { Start-Process $url }

# ---- serve ----------------------------------------------------------------
$clients = New-Object System.Collections.ArrayList
try {
  while ($true) {
    while ($listener.Pending()) {
      $c = $listener.AcceptTcpClient()
      $c.NoDelay = $true
      [void]$clients.Add(@{ Client = $c; Since = [DateTime]::UtcNow; Buffer = (New-Object System.IO.MemoryStream) })
    }
    $busy = $false
    foreach ($entry in @($clients)) {
      $c = $entry.Client
      $done = $false
      try {
        $stream = $c.GetStream()
        $chunk = New-Object byte[] 8192
        while ($stream.DataAvailable) {
          $n = $stream.Read($chunk, 0, $chunk.Length)
          if ($n -le 0) { break }
          $entry.Buffer.Write($chunk, 0, $n)
        }
        $text = [System.Text.Encoding]::ASCII.GetString($entry.Buffer.ToArray())
        if ($text.Contains("`r`n`r`n")) {
          Serve-Request $stream $text
          $done = $true; $busy = $true
        } elseif (([DateTime]::UtcNow - $entry.Since).TotalSeconds -gt 10) {
          $done = $true   # a speculative connection that never asked for anything
        }
      } catch {
        $done = $true
      }
      if ($done) {
        try { $c.Client.Shutdown([System.Net.Sockets.SocketShutdown]::Send) } catch { }
        try { $c.Close() } catch { }
        $clients.Remove($entry)
      }
    }
    # Idle cost matters on a battery: with nobody connected, poll ~40x a second
    # instead of ~250x. A new connection waits at most 25 ms to be picked up.
    if (-not $busy) {
      if ($clients.Count -eq 0) { Start-Sleep -Milliseconds 25 } else { Start-Sleep -Milliseconds 4 }
    }
  }
} finally {
  $listener.Stop()
}

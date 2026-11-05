# Renders in chunks (a fresh Chrome per chunk keeps RAM low on this laptop), joins them,
# then levels the audio. Run: powershell -File scripts\render.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$ff = 'node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe'
$total = [int](npx remotion compositions src/index.ts --browser-executable=$chrome 2>$null | Select-String 'DostabGuide' | ForEach-Object { ($_ -split '\s+')[3] })
$size = 400
$parts = @()
for ($s = 0; $s -lt $total; $s += $size) {
  $e = [math]::Min($s + $size, $total) - 1
  $out = "out/part_$s.mp4"
  npx remotion render src/index.ts DostabGuide $out --codec h264 --crf 18 --concurrency 1 --frames="$s-$e" --overwrite --browser-executable=$chrome 2>&1 | Select-Object -Last 1
  if (-not (Test-Path $out)) { throw "chunk $s-$e failed" }
  $parts += "file '$((Resolve-Path $out).Path -replace '\\','/')'"
}
[IO.File]::WriteAllLines("$PWD\out\parts.txt", $parts)
& $ff -v error -y -f concat -safe 0 -i out\parts.txt -c:v copy -af "loudnorm=I=-15:TP=-1.5:LRA=11" -ac 1 -c:a aac -b:a 128k out\Dostab_Guide.mp4
Remove-Item out\part_*.mp4, out\parts.txt
Get-Item out\Dostab_Guide.mp4 | Select-Object Length, LastWriteTime

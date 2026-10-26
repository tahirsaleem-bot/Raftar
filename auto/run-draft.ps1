# Drafts any exit interview records waiting in the agent's queue.
#
# Runs headless Claude Code on this machine, which is what lets the drafting use the
# Claude subscription rather than a metered API key. The cloud routine cannot do this job:
# its egress proxy refuses the Railway host.
#
# Scheduled hourly. Almost every run finds an empty queue and finishes in seconds.
#
# This is PowerShell rather than a .cmd on purpose. The batch version ran through a
# console window, and when that window went away the run died with 0xC000013A. Launched
# hidden from PowerShell there is no console to lose.

$ErrorActionPreference = 'Continue'
$work = 'C:\Raftar\exit-interview-agent\auto'
$log  = Join-Path $work 'draft.log'

function Note($line) { Add-Content -Path $log -Value $line -Encoding utf8 }

Note ''
Note ("===== " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + " =====")

try {
  $prompt = Get-Content (Join-Path $work 'draft-prompt.txt') -Raw

  # Tools are scoped to curl and to this folder, so an unattended run cannot wander.
  $out = $prompt | claude -p --add-dir $work --allowedTools "Read" "Write" "Bash(curl:*)" 2>&1

  Note ($out | Out-String).TrimEnd()
  Note "ok"
}
catch {
  Note ("ERROR: " + $_.Exception.Message)
}

# Keep the log from growing without bound - a year of hourly runs is a lot of "nothing
# was waiting".
try {
  $lines = Get-Content $log -ErrorAction Stop
  if ($lines.Count -gt 4000) { $lines | Select-Object -Last 2000 | Set-Content $log -Encoding utf8 }
} catch { }

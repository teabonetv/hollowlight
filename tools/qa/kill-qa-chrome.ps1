Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match 'hollowlight-qa-profile' } |
  ForEach-Object { Write-Output ("KILL " + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }
Write-Output DONE

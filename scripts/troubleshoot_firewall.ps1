Write-Host "Checking network profile..."
Get-NetConnectionProfile

Write-Host "Attempting to open Port 5000 for EMS Backend..."
try {
    New-NetFirewallRule -DisplayName "EMS Backend Port 5000" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
    Write-Host "Success! Port 5000 is now open." -ForegroundColor Green
} catch {
    Write-Host "Error: Failed to add firewall rule. Please run this script as Administrator." -ForegroundColor Red
}

Write-Host "Please verify connection by opening http://192.168.1.4:5000/api/health (or similar) in your mobile browser."
Pause

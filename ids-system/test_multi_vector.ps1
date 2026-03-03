# Simulation Testing Script: Multi-Vector Attack (Phishing + Ransomware)
# Menjalankan simulasi serangan gabungan dalam jendela waktu 5 detik.

$eventId = "multi-vector-demo-" + (Get-Date -Format "HHmmss")
$collectorUrl = "http://localhost:5001/event"

Write-Host "--- Simulasi Serangan Multi-Vektor Berjalan ---" -ForegroundColor Cyan
Write-Host "Event ID: $eventId"

# 1. Kirim Indikasi Phishing (Domain Palsu)
$phishingBody = @{
    event_id = $eventId
    event_type = "navigation_committed"
    url = "http://payment-update-security.com/login"
    domain = "payment-update-security.com"
} | ConvertTo-Json

Write-Host "[1/2] Mengirim Log Phishing..." -ForegroundColor Yellow
Invoke-RestMethod -Uri $collectorUrl -Method Post -Body $phishingBody -ContentType "application/json"

# Tunggu 1 detik
Start-Sleep -Seconds 1

# 2. Kirim Indikasi Ransomware (Download File Mencurigakan)
$ransomwareBody = @{
    event_id = $eventId
    event_type = "file_download"
    file_context = @{
        file_name = "update_security.locked"
        file_extension = "locked"
    }
} | ConvertTo-Json

Write-Host "[2/2] Mengirim Log Ransomware..." -ForegroundColor Yellow
Invoke-RestMethod -Uri $collectorUrl -Method Post -Body $ransomwareBody -ContentType "application/json"

Write-Host "--- Simulasi Selesai ---" -ForegroundColor Green
Write-Host "Tunggu 5-10 detik untuk notifikasi gabungan muncul di browser."

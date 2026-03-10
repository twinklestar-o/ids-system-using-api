# Advanced Phishing Simulation (Expert System + XAI)
$eventId = "adv-phishing-" + (Get-Date -Format "HHmmss")
$collectorUrl = "http://localhost:5001/event"

Write-Host "--- Simulasi Phishing Tingkat Lanjut (XAI) ---" -ForegroundColor Cyan
Write-Host "Event ID: $eventId"

# Skenario: Halaman Phishing "Google" pada domain IP dengan mismatch form action
$payload = @{
    event_id = $eventId
    event_type = "suspicious_telemetry"
    url = "http://192.168.1.50/login-google"
    data = @{
        url = "http://192.168.1.50/login-google"
        page_context = @{
            has_password_field = $true
            form_action_mismatch = $true
            suspicious_keywords_count = 5
            suspicious_keywords_list = @("login", "password", "verify", "account", "google")
        }
        script_context = @{
            script_obfuscation = $true
        }
    }
} | ConvertTo-Json -Depth 5

Write-Host "Mengirim Pemuatan (Payload) Phishing..." -ForegroundColor Yellow
Invoke-RestMethod -Uri $collectorUrl -Method Post -Body $payload -ContentType "application/json"

Write-Host "--- Simulasi Selesai ---" -ForegroundColor Green
Write-Host "Tunggu 5-10 detik untuk notifikasi XAI (IDENTIFIKASI -> KORELASI -> KESIMPULAN)."

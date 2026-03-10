# IDS Automated Security Testing Script
# Run this to verify Phishing, Ransomware, Cryptojacking and Multi-Attack detection.

$baseUrl = "http://localhost:5001/event"
$headers = @{ "Content-Type" = "application/json" }

function Send-TestEvent($name, $payload) {
    Write-Host "`n[TEST] Sending $name..." -ForegroundColor Cyan
    try {
        $response = Invoke-RestMethod -Uri $baseUrl -Method Post -Headers $headers -Body ($payload | ConvertTo-Json -Depth 10)
        Write-Host "Response: $($response.status) - Event ID: $($response.event_id)" -ForegroundColor Green
    } catch {
        Write-Host "Error sending ${name}: $_" -ForegroundColor Red
    }
}

# --- 1. SINGLE ATTACK SCENARIOS ---

# Phishing
$phishingPayload = @{
    type = "phishing"
    data = @{
        url = "http://192.168.1.50/secure-login-bank-bca"
        page_context = @{ has_password_field = $true; suspicious_keywords_count = 5 }
    }
    event_id = "test-phishing-$(Get-Date -Format 'HHmmss')"
}
Send-TestEvent "Phishing (Single)" $phishingPayload

# Ransomware 
$ransomPayload = @{
    type = "file_event"
    data = @{
        file_context = @{ file_name = "document.locked"; file_extension = "locked" }
    }
    event_id = "test-ransom-$(Get-Date -Format 'HHmmss')"
}
Send-TestEvent "Ransomware (Single)" $ransomPayload

# --- 2. MULTI-ATTACK SCENARIO (Aggregation Test) ---
Write-Host "`n[MULTI-ATTACK] Starting Aggregation Test (Phishing + Cryptojacking)..." -ForegroundColor Yellow
$multiId = "multi-$(Get-Date -Format 'HHmmss')"

$p1 = @{
    type = "phishing"
    data = @{ url = "http://bad-website.com/login" }
    event_id = $multiId
}
$p2 = @{
    type = "performance_event"
    data = @{ performance_context = @{ cpu_usage_percent = 95 } }
    event_id = $multiId
}

Send-TestEvent "Multi Part 1 (Phishing)" $p1
Start-Sleep -Milliseconds 500
Send-TestEvent "Multi Part 2 (Cryptojacking)" $p2

Write-Host "`n[DONE] Semua test telah dikirim." -ForegroundColor Cyan
Write-Host "Buka Dashboard: http://localhost:5001/dashboard?key=rahasia123" -ForegroundColor Cyan

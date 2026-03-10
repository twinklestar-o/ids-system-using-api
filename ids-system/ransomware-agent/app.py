import requests
import os
import re
from flask import Flask, request, jsonify

app = Flask(__name__)
MORPHEUS_URL = os.getenv("MORPHEUS_URL", "http://morpheus:7000/message")

@app.route("/health", methods=["GET"])
def health():
    return {"status": "ransomware-agent-ok"}

def calculate_ransomware_score(event_data):
    score = 0.0
    triggered_rules = []

    data = event_data.get("data", {})
    file_ctx = data.get("file_context") or {}
    filename = file_ctx.get("file_name", "")
    
    # 1. High Risk Extension (+0.4)
    high_risk_ext = [".exe", ".bat", ".cmd", ".scr", ".ps1", ".vbs"]
    if any(filename.lower().endswith(ext) for ext in high_risk_ext):
        score += 0.4
        triggered_rules.append("high_risk_extension")

    # 2. Ransomware Specific Extension (+0.6) - Immediate High Risk
    ransom_ext = [".locked", ".crypt", ".enc", ".rnsmwr"]
    if any(filename.lower().endswith(ext) for ext in ransom_ext):
        score += 0.6
        triggered_rules.append("ransomware_extension_match")

    # 3. Automatic Download / Drive-by (+0.3)
    if data.get("download_trigger") == "automatic" or "automatic" in str(event_data).lower():
        score += 0.3
        triggered_rules.append("drive_by_download")

    # 4. Unknown/IP Source Domain (+0.2)
    url = data.get("url", "")
    ip_pattern = r"https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    if re.search(ip_pattern, url):
        score += 0.2
        triggered_rules.append("suspicious_source_domain")

    # Final Score
    final_score = min(score, 1.0)
    
    risk_level = "normal"
    if final_score >= 0.8: risk_level = "critical"
    elif final_score >= 0.6: risk_level = "high risk"
    elif final_score > 0.3: risk_level = "suspicious"

    return final_score, risk_level, triggered_rules

@app.route("/analyze", methods=["POST"])
def analyze():
    event = request.get_json()
    score, risk, rules = calculate_ransomware_score(event)
    
    if score > 0.3:
        try:
            requests.post(MORPHEUS_URL, json={
                "event_id": event.get("event_id"),
                "agent": "ransomware",
                "type": "ransomware_detected",
                "risk_level": risk,
                "confidence_score": round(score, 2),
                "triggered_rules": rules,
                "data": event
            }, timeout=2)
        except:
            pass

    return jsonify({
        "agent": "ransomware",
        "event_id": event.get("event_id"),
        "threat_detected": score > 0.3,
        "score": round(score, 2),
        "risk_level": risk
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6002)

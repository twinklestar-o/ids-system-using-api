import requests
import os
import re
from flask import Flask, request, jsonify

app = Flask(__name__)
MORPHEUS_URL = os.getenv("MORPHEUS_URL", "http://morpheus:7000/message")

@app.route("/health", methods=["GET"])
def health():
    return {"status": "phishing-agent-ok"}

def calculate_phishing_score(event_data):
    score = 0.0
    triggered_rules = []

    data = event_data.get("data", {})
    page_ctx = data.get("page_context", {})
    url = data.get("url") or event_data.get("url", "")

    # 1. URL Pattern: IP address detected (+0.4)
    ip_pattern = r"https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    if re.search(ip_pattern, url):
        score += 0.4
        triggered_rules.append("ip_based_url")

    # 2. URL Pattern: Suspicious keyword in URL (+0.15 per unique word)
    url_keywords = ["login", "verify", "account", "bank", "secure", "update-security", "password", "phishing", "test-"]
    for word in url_keywords:
        if word in url.lower():
            score += 0.15
            triggered_rules.append(f"url_keyword_{word}")

    # 3. Page Content: Password field + Form (+0.25)
    if page_ctx.get("has_password_field"):
        score += 0.25
        triggered_rules.append("password_field_detected")

    # 4. Page Content: Form Action Mismatch (+0.3)
    if page_ctx.get("form_action_mismatch"):
        score += 0.3
        triggered_rules.append("form_action_mismatch")

    # 5. Page Content: High volume of suspicious keywords (+0.1)
    if page_ctx.get("suspicious_keywords_count", 0) >= 3:
        score += 0.1
        triggered_rules.append("high_keyword_density")

    # 6. Typosquatting detection (+0.3)
    common_domains = ["google", "facebook", "bank", "groq", "bca", "mandiri", "gmail"]
    domain = event_data.get("domain", "")
    for cd in common_domains:
        # Simple check: if domain contains the keyword but is not the exact domain
        if cd in domain.lower() and domain.lower() != f"{cd}.com" and domain.lower() != f"{cd}.id":
            score += 0.3
            triggered_rules.append(f"typosquatting_detected_{cd}")
            break

    # Normalize score
    final_score = min(score, 1.0)
    
    # Classification
    risk_level = "normal"
    if final_score >= 0.8: risk_level = "critical"
    elif final_score >= 0.6: risk_level = "high risk"
    elif final_score > 0.3: risk_level = "suspicious"

    return final_score, risk_level, triggered_rules

@app.route("/analyze", methods=["POST"])
def analyze():
    event = request.get_json()
    score, risk, rules = calculate_phishing_score(event)
    
    # Only forward to Morpheus if suspicious or higher (Threshold > 0.25)
    if score > 0.25:
        try:
            requests.post(MORPHEUS_URL, json={
                "event_id": event.get("event_id"),
                "agent": "phishing",
                "type": "phishing_detected",
                "risk_level": risk,
                "confidence_score": round(score, 2),
                "triggered_rules": rules,
                "data": event
            }, timeout=2)
        except:
            pass

    return jsonify({
        "agent": "phishing",
        "event_id": event.get("event_id"),
        "threat_detected": score > 0.3,
        "score": round(score, 2),
        "risk_level": risk
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6001)

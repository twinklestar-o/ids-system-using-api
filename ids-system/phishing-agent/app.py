import requests
import os
import re
from flask import Flask, request, jsonify

app = Flask(__name__)
MORPHEUS_URL = os.getenv("MORPHEUS_URL", "http://morpheus:7000/message")

@app.route("/health", methods=["GET"])
def health():
    return {"status": "phishing-agent-ok"}

@app.route("/analyze", methods=["POST"])
def analyze():
    event = request.get_json()
    # Normalize event source data
    data = event.get("data", {})
    url = data.get("url") or event.get("url", "")
    
    suspicious_keywords = ["login", "verify", "account", "bank", "secure", "update-security", "password"]
    is_phishing = any(word in url.lower() for word in suspicious_keywords)
    
    # Detect IP-based URL
    ip_pattern = r"https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    if re.search(ip_pattern, url):
        is_phishing = True

    if is_phishing:
        try:
            requests.post(MORPHEUS_URL, json={
                "event_id": event.get("event_id"),
                "agent": "phishing",
                "type": "phishing_detected",
                "data": event
            }, timeout=2)
        except:
            pass

    return jsonify({
        "agent": "phishing",
        "event_id": event.get("event_id"),
        "threat_detected": is_phishing,
        "confidence": 0.85 if is_phishing else 0.1
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6001)

import requests
import os
from flask import Flask, request, jsonify

app = Flask(__name__)
MORPHEUS_URL = os.getenv("MORPHEUS_URL", "http://morpheus:7000/message")

@app.route("/health", methods=["GET"])
def health():
    return {"status": "ransomware-agent-ok"}

@app.route("/analyze", methods=["POST"])
def analyze():
    event = request.get_json()
    data = event.get("data", {})
    file_ctx = data.get("file_context") or event.get("file_context") or {}
    filename = file_ctx.get("file_name", "")
    
    suspicious_ext = [".exe", ".bat", ".cmd", ".scr", ".locked", ".crypt", ".enc"]
    is_ransomware = any(filename.lower().endswith(ext) for ext in suspicious_ext)
    
    # Check for direct ransomware indication in type or status
    if "ransomware" in str(event).lower() or "access_denied" in str(event).lower():
        is_ransomware = True

    if is_ransomware:
        try:
            requests.post(MORPHEUS_URL, json={
                "event_id": event.get("event_id"),
                "agent": "ransomware",
                "type": "ransomware_detected",
                "data": event
            }, timeout=2)
        except:
            pass

    return jsonify({
        "agent": "ransomware",
        "event_id": event.get("event_id"),
        "threat_detected": is_ransomware,
        "confidence": 0.9 if is_ransomware else 0.05
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6002)

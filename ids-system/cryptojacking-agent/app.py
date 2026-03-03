import requests
import os
from flask import Flask, request, jsonify

app = Flask(__name__)
MORPHEUS_URL = os.getenv("MORPHEUS_URL", "http://morpheus:7000/message")

@app.route("/health", methods=["GET"])
def health():
    return {"status": "cryptojacking-agent-ok"}

@app.route("/analyze", methods=["POST"])
def analyze():
    event = request.get_json()
    data = event.get("data", {})
    perf = data.get("performance_context") or event.get("performance_context") or {}
    cpu = perf.get("cpu_usage_percent", 0)
    
    # Mining pool detection
    payload_str = str(event).lower()
    mining_keywords = ["stratum", "pool", "monero", "xmr", "cryptonight", "xmrig"]
    is_mining_pool = any(word in payload_str for word in mining_keywords)

    is_crypto = cpu > 80 or is_mining_pool

    if is_crypto:
        try:
            requests.post(MORPHEUS_URL, json={
                "event_id": event.get("event_id"),
                "agent": "cryptojacking",
                "type": "cryptojacking_detected",
                "data": event
            }, timeout=2)
        except:
            pass

    return jsonify({
        "agent": "cryptojacking",
        "event_id": event.get("event_id"),
        "threat_detected": is_crypto,
        "confidence": 0.9 if is_crypto else 0.1
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6003)

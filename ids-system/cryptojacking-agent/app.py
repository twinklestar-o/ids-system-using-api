import requests
import os
from flask import Flask, request, jsonify

app = Flask(__name__)
MORPHEUS_URL = os.getenv("MORPHEUS_URL", "http://morpheus:7000/message")

@app.route("/health", methods=["GET"])
def health():
    return {"status": "cryptojacking-agent-ok"}

def calculate_crypto_score(event_data):
    score = 0.0
    triggered_rules = []

    data = event_data.get("data", {})
    perf = data.get("performance_context") or {}
    script_ctx = data.get("script_context") or {}
    user_ctx = data.get("user_context") or {}
    
    cpu = perf.get("cpu_usage_percent", 0)
    duration = perf.get("cpu_usage_duration_sec", 0)

    # 1. High CPU Usage (> 70%) (+0.4)
    if cpu > 70:
        score += 0.4
        triggered_rules.append("high_cpu_usage")

    # 2. Mining pool detection (+0.5)
    payload_str = str(event_data).lower()
    mining_keywords = ["stratum", "pool", "monero", "xmr", "cryptonight", "xmrig", "coinhive", "miner"]
    if any(word in payload_str for word in mining_keywords):
        score += 0.5
        triggered_rules.append("mining_pool_connection")

    # 3. WebAssembly Execution (+0.2)
    if script_ctx.get("wasm_loaded") or script_ctx.get("wasm_detected"):
        score += 0.2
        triggered_rules.append("wasm_execution")

    # 4. Background Mining Behavior (+0.3)
    if user_ctx.get("tab_visibility") == "background" and cpu > 30:
        score += 0.3
        triggered_rules.append("background_mining")

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
    score, risk, rules = calculate_crypto_score(event)
    
    if score > 0.3:
        try:
            requests.post(MORPHEUS_URL, json={
                "event_id": event.get("event_id"),
                "agent": "cryptojacking",
                "type": "cryptojacking_detected",
                "risk_level": risk,
                "confidence_score": round(score, 2),
                "triggered_rules": rules,
                "data": event
            }, timeout=2)
        except:
            pass

    return jsonify({
        "agent": "cryptojacking",
        "event_id": event.get("event_id"),
        "threat_detected": score > 0.3,
        "score": round(score, 2),
        "risk_level": risk
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6003)

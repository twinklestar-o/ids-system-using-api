from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/health", methods=["GET"])
def health():
    return {"status": "cryptojacking-agent-ok"}

@app.route("/analyze", methods=["POST"])
def analyze():
    event = request.get_json()

    perf = event.get("performance_context", {})
    cpu = perf.get("cpu_usage_percent", 0)

    is_crypto = cpu > 80

    return jsonify({
        "agent": "cryptojacking",
        "event_id": event.get("event_id"),
        "threat_detected": is_crypto,
        "confidence": 0.9 if is_crypto else 0.1
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6003)

from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/health", methods=["GET"])
def health():
    return {"status": "phishing-agent-ok"}

@app.route("/analyze", methods=["POST"])
def analyze():
    event = request.get_json()

    url = event.get("url", "")
    suspicious_keywords = ["login", "verify", "account", "password"]

    is_phishing = any(word in url.lower() for word in suspicious_keywords)

    return jsonify({
        "agent": "phishing",
        "event_id": event.get("event_id"),
        "threat_detected": is_phishing,
        "confidence": 0.85 if is_phishing else 0.1
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6001)

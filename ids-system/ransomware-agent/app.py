from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/health", methods=["GET"])
def health():
    return {"status": "ransomware-agent-ok"}

@app.route("/analyze", methods=["POST"])
def analyze():
    event = request.get_json()

    file_ctx = event.get("file_context", {})
    filename = file_ctx.get("file_name", "")

    suspicious_ext = [".exe", ".bat", ".cmd", ".scr"]
    is_ransomware = any(filename.lower().endswith(ext) for ext in suspicious_ext)

    return jsonify({
        "agent": "ransomware",
        "event_id": event.get("event_id"),
        "threat_detected": is_ransomware,
        "confidence": 0.9 if is_ransomware else 0.05
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6002)

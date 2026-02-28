from flask_cors import CORS
from flask import Flask, request, jsonify
from datetime import datetime
import logging
import json
import os
import threading
import requests
from typing import Dict, Any

from event_schema import (
    EventSource,
    create_normalized_event,
)

from config import (
    PHISHING_AGENT_URL,
    RANSOMWARE_AGENT_URL,
    CRYPTOJACKING_AGENT_URL,
    MORPHEUS_URL,
)

# =========================
# Setup logging
# =========================
os.makedirs("logs", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("logs/event.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)

logger = logging.getLogger("event_collector")

app = Flask(__name__)
CORS(app)

# =========================
# Health check
# =========================
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy"}), 200


# =========================
# Adapter extension → schema
# =========================
def adapt_extension_event(raw_event: Dict[str, Any]) -> Dict[str, Any]:
    # Jika sudah dalam format internal, langsung pakai
    if "type" in raw_event and "data" in raw_event:
        return raw_event

    # Jika dari extension (pakai event_type)
    if "event_type" in raw_event:
        return {
            "type": raw_event["event_type"],
            "data": raw_event
        }

    # fallback
    return raw_event



# =========================
# Forward to agents
# =========================
def forward_to_agents(event: Dict[str, Any]):
    agent_urls = [
        PHISHING_AGENT_URL,
        RANSOMWARE_AGENT_URL,
        CRYPTOJACKING_AGENT_URL,
        MORPHEUS_URL,
    ]

    def send(url):
        try:
            requests.post(url, json=event, timeout=3)
            logger.info(f"Event {event['event_id']} sent to {url}")
        except Exception as e:
            logger.warning(f"Failed to send to {url}: {e}")

    for url in agent_urls:
        threading.Thread(target=send, args=(url,), daemon=True).start()


# =========================
# Event validation
# =========================
def validate_event(event: Dict[str, Any]):
    if "type" not in event:
        return {"valid": False, "error": "Missing field: type"}

    if "data" not in event:
        return {"valid": False, "error": "Missing field: data"}

    if not isinstance(event["data"], dict):
        return {"valid": False, "error": "data must be object"}
    
    return {"valid": True, "error": None}


# =========================
# Main endpoint
# =========================
@app.route("/event", methods=["POST"])
def receive_event():
    print("=== REQUEST MASUK KE /event ===")
    try:
        if not request.is_json:
            print("[ERROR] Request bukan JSON")
            return jsonify({"status": "rejected"}), 400

        raw_event = request.get_json()

        print("\n========== EVENT FROM EXTENSION ==========")
        print(json.dumps(raw_event, indent=2))
        print("==========================================\n")

        # adapt ke schema internal
        raw_event = adapt_extension_event(raw_event)

        # validate
        validation = validate_event(raw_event)
        if not validation["valid"]:
            print("[ERROR] Validation gagal:", validation["error"])
            return jsonify(validation), 400

        # normalize
        normalized_event = create_normalized_event(
            event_type=raw_event["type"],
            data=raw_event["data"],
            source=EventSource.BROWSER_EXTENSION.value,
        )

        print("\n========== NORMALIZED EVENT ==========")
        print(json.dumps(normalized_event, indent=2))
        print("======================================\n")

        # forward ke agent
        forward_to_agents(normalized_event)

        return jsonify({
            "status": "accepted",
            "event_id": normalized_event["event_id"]
        }), 200

    except Exception as e:
        print("[FATAL ERROR]", str(e))
        return jsonify({"status": "error"}), 500


# =========================
# Run
# =========================
if __name__ == "__main__":
    logger.info("Starting Event Collector on port 5000")
    app.run(host="0.0.0.0", port=5000)

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
# Shared State for Alerts
# =========================
alerts_buffer = []
buffer_lock = threading.Lock()

# =========================
# Forward to agents
# =========================
def forward_to_agents(event: Dict[str, Any]):
    # Only forward to rule-based filtering agents. 
    # Morpheus is now called by agents themselves upon detection.
    agent_urls = [
        PHISHING_AGENT_URL,
        RANSOMWARE_AGENT_URL,
        CRYPTOJACKING_AGENT_URL,
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
# Feedback Loop Endpoints
# =========================
@app.route("/notify", methods=["POST"])
def receive_notification():
    """Received analysis result from Morpheus."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error"}), 400
        
        with buffer_lock:
            alerts_buffer.append({
                "event_id": data.get("event_id"),
                "analysis": data.get("analysis"),
                "severity_label": data.get("severity_label", "[INFO]"),
                "timestamp": datetime.now().isoformat()
            })
            # Keep buffer small (last 50 alerts)
            if len(alerts_buffer) > 50:
                alerts_buffer.pop(0)

        logger.info(f"Received Morpheus notification for event {data.get('event_id')}")
        return jsonify({"status": "received"}), 200
    except Exception as e:
        logger.error(f"Error in /notify: {e}")
        return jsonify({"status": "error"}), 500

@app.route("/alerts", methods=["GET"])
def get_alerts():
    """Endpoint for browser extension to poll for alerts."""
    with buffer_lock:
        # Return all pending alerts and clear the buffer for this caller
        # (In a real system, we'd use session/tab IDs, but this is fine for a demo)
        current_alerts = list(alerts_buffer)
        alerts_buffer.clear()
    
    return jsonify({
        "alerts": current_alerts,
        "count": len(current_alerts)
    }), 200


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
    logger.info("=== REQUEST MASUK KE /event ===")
    try:
        if not request.is_json:
            return jsonify({"status": "rejected"}), 400

        raw_event = request.get_json()

        # adapt ke schema internal
        raw_event = adapt_extension_event(raw_event)

        # validate
        validation = validate_event(raw_event)
        if not validation["valid"]:
            logger.error(f"Validation gagal: {validation['error']}")
            return jsonify(validation), 400

        # normalize
        event_id = raw_event.get("event_id") or raw_event.get("data", {}).get("event_id")
        normalized_event = create_normalized_event(
            event_type=raw_event["type"],
            data=raw_event["data"],
            source=EventSource.BROWSER_EXTENSION.value,
            event_id=event_id
        )

        logger.info(f"Processing event {normalized_event['event_id']}")

        # forward ke agent
        forward_to_agents(normalized_event)

        return jsonify({
            "status": "accepted",
            "event_id": normalized_event["event_id"]
        }), 200

    except Exception as e:
        logger.error(f"Fatal error: {e}")
        return jsonify({"status": "error"}), 500


# =========================
# Run
# =========================
if __name__ == "__main__":
    logger.info("Starting Event Collector on port 5000")
    app.run(host="0.0.0.0", port=5000)

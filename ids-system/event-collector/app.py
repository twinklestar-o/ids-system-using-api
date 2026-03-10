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
# Shared State for Alerts & Dashboard
# =========================
alerts_buffer = []
dashboard_alerts = [] # Persistent for dashboard view
stats = {"total": 0, "threats": 0, "blocks": 0}
buffer_lock = threading.Lock()

# =========================
# Forward to agents
# =========================
def forward_to_agents(event: Dict[str, Any]):
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
# Dashboard Routes
# =========================
@app.route("/dashboard")
def dashboard():
    # Admin Access Key check
    key = request.args.get("key")
    if key != "rahasia123":
        return "<h1>⚠️ Access Denied</h1><p>Gunakan Access Key yang benar (contoh: <code>?key=rahasia123</code>).</p>", 403

    with open("dashboard.html", "r", encoding="utf-8") as f:
        return f.read()

@app.route("/dashboard-data")
def dashboard_data():
    # Load from file if memory buffer is empty (e.g. after restart)
    global dashboard_alerts
    if not dashboard_alerts and os.path.exists("logs/alerts.jsonlines"):
        try:
            with open("logs/alerts.jsonlines", "r", encoding="utf-8") as f:
                lines = f.readlines()
                dashboard_alerts = [json.loads(line) for line in lines[-100:]]
                # Re-sync basic stats
                stats["threats"] = len(dashboard_alerts)
                stats["blocks"] = sum(1 for a in dashboard_alerts if a.get("block_instruction"))
        except: pass

    with buffer_lock:
        return jsonify({
            "stats": stats,
            "alerts": dashboard_alerts[::-1][:20] # Last 20 alerts
        })

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
            alert = {
                "event_id": data.get("event_id"),
                "analysis": data.get("analysis"),
                "severity_label": data.get("severity_label", "[INFO]"),
                "block_instruction": data.get("block_instruction", False),
                "timestamp": datetime.now().isoformat()
            }
            alerts_buffer.append(alert)
            dashboard_alerts.append(alert)
            
            # Update stats
            stats["threats"] += 1
            if alert["block_instruction"]:
                stats["blocks"] += 1
            
            # Persist to file (Historical Audit Log)
            try:
                with open("logs/alerts.jsonlines", "a", encoding="utf-8") as f:
                    f.write(json.dumps(alert) + "\n")
            except Exception as e:
                logger.error(f"Failed to persist alert: {e}")

            # Keep buffers manageable
            if len(alerts_buffer) > 50: alerts_buffer.pop(0)
            if len(dashboard_alerts) > 100: dashboard_alerts.pop(0)

        logger.info(f"Received Morpheus notification for event {data.get('event_id')} (Block: {alert['block_instruction']})")
        return jsonify({"status": "received"}), 200
    except Exception as e:
        logger.error(f"Error in /notify: {e}")
        return jsonify({"status": "error"}), 500

@app.route("/alerts", methods=["GET"])
def get_alerts():
    """Endpoint for browser extension to poll for alerts."""
    with buffer_lock:
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

        with buffer_lock:
            stats["total"] += 1

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

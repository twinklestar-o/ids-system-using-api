from enum import Enum
from datetime import datetime
import uuid


class EventSource(str, Enum):
    BROWSER_EXTENSION = "browser_extension"


def create_normalized_event(event_type, data, source, event_id=None):
    now = datetime.utcnow().isoformat() + "Z"

    return {
        "event_id": event_id if event_id else str(uuid.uuid4()),
        "type": event_type,
        "source": source,
        "data": data,
        "metadata": {
            "received_at": now,
            "version": "1.0"
        }
    }

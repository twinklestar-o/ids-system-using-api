import os
from dotenv import load_dotenv

load_dotenv()

PHISHING_AGENT_URL = os.getenv(
    "PHISHING_AGENT_URL",
    "http://phishing-agent:6001/analyze"
)

RANSOMWARE_AGENT_URL = os.getenv(
    "RANSOMWARE_AGENT_URL",
    "http://ransomware-agent:6002/analyze"
)

CRYPTOJACKING_AGENT_URL = os.getenv(
    "CRYPTOJACKING_AGENT_URL",
    "http://cryptojacking-agent:6003/analyze"
)

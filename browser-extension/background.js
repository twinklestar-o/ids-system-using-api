import { generateEventId, safeHostname } from "./utils.js";

const EVENT_COLLECTOR_URL = "http://localhost:5001/event";
const ALERT_POLL_URL = "http://localhost:5001/alerts";

// ===== GLOBAL STATE =====
const INTERACTION_WINDOW_MS = 4000;
const POLL_INTERVAL_MS = 3000;
const shownEventIds = new Set(); // Prevent duplicate alerts
const tabSessionEventIds = new Map(); // [NEW] Sticky Event ID per session (Tab + URL)

// ===== State per tab =====
const snapshotByTab = new Map();
const navStateByTab = new Map();
const redirectStateByTab = new Map();
const interactionByTab = new Map();

// ===== Helpers =====
function nowIso() {
  return new Date().toISOString();
}

function getTabState(tabId) {
  if (!navStateByTab.has(tabId)) {
    navStateByTab.set(tabId, {
      lastUrl: null,
      lastDomain: null,
      lastNavTs: null,
    });
  }
  if (!redirectStateByTab.has(tabId)) {
    redirectStateByTab.set(tabId, { count: 0 });
  }
  if (!interactionByTab.has(tabId)) {
    interactionByTab.set(tabId, {
      lastClickTs: null,
      lastInputTs: null,
      lastAnyTs: null
    });
  }
  return {
    nav: navStateByTab.get(tabId),
    redir: redirectStateByTab.get(tabId),
    inter: interactionByTab.get(tabId)
  };
}

async function postEvent(payload) {
  try {
    console.log("Sending event:", payload);
    const res = await fetch(EVENT_COLLECTOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log("Collector response:", res.status);
  } catch (e) {
    console.error("Post failed:", e);
  }
}

// ===== Alert Polling (Feedback Loop) =====
async function pollAlerts() {
  try {
    const res = await fetch(ALERT_POLL_URL);
    if (res.ok) {
      const data = await res.json();
      if (data.alerts && data.alerts.length > 0) {
        data.alerts.forEach(alert => {
          // DEDUPLICATION: Only show if event_id is new
          if (!shownEventIds.has(alert.event_id)) {
            showNotification(alert);
            shownEventIds.add(alert.event_id);
            // Optional: Limit cache size
            if (shownEventIds.size > 100) {
                const first = shownEventIds.values().next().value;
                shownEventIds.delete(first);
            }
          }
        });
      }
    }
  } catch (e) {
    console.error("Polling failed:", e);
  }
}

function showNotification(alert) {
  const notificationId = "alert-" + Date.now();
  
  // Clean text for native notification (remove markdown stars)
  const cleanMessage = (alert.analysis || "Ancaman terdeteksi oleh sistem.")
    .replace(/\*\*/g, "");

  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: alert.severity_label || "Security Alert",
    message: cleanMessage,
    contextMessage: "Morpheus Intelligence",
    priority: 2,
    requireInteraction: true,
    buttons: [{ title: "Baca Selengkapnya" }]
  });

  // [NEW] Fitur Timeout: Notifikasi akan hilang otomatis setelah 3 detik
  setTimeout(() => {
    chrome.notifications.clear(notificationId);
  }, 3000);

  // Store the full analysis (with markdown) for the details page
  chrome.storage.local.set({ [notificationId]: alert.analysis });
}

// Handle notification body clicks
chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith("alert-")) {
    chrome.tabs.create({
      url: `alert_details.html?id=${id}`
    });
  }
});

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((id, index) => {
  if (index === 0) {
    // Open the polished alert details page
    chrome.tabs.create({
      url: `alert_details.html?id=${id}`
    });
  }
});

// Start polling
setInterval(pollAlerts, POLL_INTERVAL_MS);

// ===== Payload Builder =====
function buildPayload({ event_type, url, domain, referrer, tabId, mergeCtx = {} }) {
  // [NEW] Logika Sticky Event ID: Gunakan ID yang sama jika masih di tab & domain yang sama
  let eventId;
  const sessionKey = tabId != null ? `tab-${tabId}-${domain || safeHostname(url)}` : null;
  
  if (sessionKey && tabSessionEventIds.has(sessionKey)) {
    eventId = tabSessionEventIds.get(sessionKey);
  } else {
    eventId = generateEventId();
    if (sessionKey) tabSessionEventIds.set(sessionKey, eventId);
  }

  const snap = tabId != null ? snapshotByTab.get(tabId) : null;
  const { nav, redir, inter } = tabId != null ? getTabState(tabId) : { nav: {}, redir: {}, inter: {} };

  const tNow = Date.now();
  const base = {
    event_id: eventId,
    event_type,
    source: "browser_extension",
    timestamp: nowIso(),
    url: url ?? snap?.url ?? null,
    domain: domain ?? safeHostname(url ?? snap?.url) ?? snap?.domain ?? null,
    referrer: referrer ?? snap?.referrer ?? null,
    user_context: {
      user_click: snap?.user_context?.user_click ?? false,
      tab_visibility: snap?.user_context?.tab_visibility ?? "background",
      user_interaction: snap?.user_context?.user_interaction ?? false,
    },
    navigation_context: {
      redirect_count: redir?.count ?? 0,
    },
    file_context: mergeCtx.file_context || {
      file_name: null,
      file_extension: null
    },
    page_context: snap?.page_context || {},
    script_context: snap?.script_context || {},
    performance_context: snap?.performance_context || {},
    metadata: { browser: "Chrome", os: "Windows" }
  };
  return base;
}

// ===== Listeners =====

// Detect Downloads (Ransomware Sensor)
chrome.downloads.onCreated.addListener((downloadItem) => {
  console.log("Download detected:", downloadItem.filename);
  const payload = buildPayload({
    event_type: "file_download",
    url: downloadItem.url,
    mergeCtx: {
      file_context: {
        file_name: downloadItem.filename,
        file_extension: downloadItem.filename.split('.').pop(),
        file_size_kb: Math.round(downloadItem.fileSize / 1024)
      }
    }
  });
  postEvent(payload);
});

// Detect Navigation (Phishing Sensor)
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) { // Only main frame
    const tabState = getTabState(details.tabId);
    tabState.nav.lastUrl = details.url;
    tabState.nav.lastDomain = safeHostname(details.url);
    
    postEvent(buildPayload({
      event_type: "navigation_committed",
      tabId: details.tabId,
      url: details.url
    }));
  }
});

// Snapshot Listener
chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender?.tab?.id;
  if (msg?.action === "telemetrySnapshot" && tabId != null) {
    snapshotByTab.set(tabId, msg.snapshot);
    const snap = msg.snapshot;

    // Send important snapshots
    if (snap.page_context?.suspicious_keywords?.length > 0 || 
        snap.performance_context?.cpu_usage_percent > 50 ||
        snap.script_context?.script_obfuscation) {
      postEvent(buildPayload({
        event_type: "suspicious_telemetry",
        tabId,
        url: snap.url
      }));
    }
  }
});

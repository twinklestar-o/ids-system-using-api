import { generateEventId, safeHostname } from "./utils.js";

const EVENT_COLLECTOR_URL = "http://localhost:5001/event";
const ALERT_POLL_URL = "http://localhost:5001/alerts";

// ===== GLOBAL STATE (Note: These clear on Service Worker idle) =====
const INTERACTION_WINDOW_MS = 4000;
const shownEventIds = new Set();
const tabSessionEventIds = new Map();
const snapshotByTab = new Map();
const navStateByTab = new Map();
const redirectStateByTab = new Map();
const interactionByTab = new Map();

// ===== Persistent State for Active Defense (MV3 Storage) =====
async function getTabIdForEvent(eventId) {
  const data = await chrome.storage.session.get("eventIdToTabId");
  const tabId = data.eventIdToTabId?.[eventId];
  console.log(`Checking TabID for Event ${eventId}:`, tabId);
  return tabId;
}

async function saveTabIdForEvent(eventId, tabId) {
  const data = await chrome.storage.session.get("eventIdToTabId");
  const mapping = data.eventIdToTabId || {};
  mapping[eventId] = tabId;
  await chrome.storage.session.set({ eventIdToTabId: mapping });
}

// ===== Helpers =====
function nowIso() {
  return new Date().toISOString();
}

console.warn("IDS Background Worker Started at:", nowIso());

function getTabState(tabId) {
  if (!navStateByTab.has(tabId)) {
    navStateByTab.set(tabId, { lastUrl: null, lastDomain: null, lastNavTs: null, currentEventId: null });
  }
  if (!redirectStateByTab.has(tabId)) {
    redirectStateByTab.set(tabId, { count: 0 });
  }
  if (!interactionByTab.has(tabId)) {
    interactionByTab.set(tabId, { lastClickTs: null, lastInputTs: null, lastAnyTs: null });
  }
  return {
    nav: navStateByTab.get(tabId),
    redir: redirectStateByTab.get(tabId),
    inter: interactionByTab.get(tabId)
  };
}

async function postEvent(payload) {
  // OPTIMIZATION: Check local heuristics if possible before sending (Simulation)
  // For now, let's just log and send, but we could add filters here.
  // Real implementation: if (payload.event_type !== "navigation" && ...) return;
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
  console.warn(">>> POLLING ALERTS FROM COLLECTOR <<<");
  try {
    const res = await fetch(ALERT_POLL_URL);
    if (res.ok) {
      const data = await res.json();
      if (data.alerts && data.alerts.length > 0) {
        for (const alert of data.alerts) {
          console.log("Processing alert:", alert.event_id, "Block:", alert.block_instruction);
          
          // Block instruction should always be processed, regardless of notification deduplication
          if (alert.block_instruction) {
            const targetTabId = await getTabIdForEvent(alert.event_id);
            if (targetTabId) {
              console.error("!!! ACTIVE DEFENSE: CLOSING MALICIOUS TAB !!!", targetTabId);
              chrome.tabs.remove(targetTabId).catch(err => {
                console.warn("Tab already closed or missing:", err.message);
              });
            }
          }

          // DEDUPLICATION: Hanya munculkan NOTIFIKASI jika event_id ini belum pernah ditampilkan
          if (!shownEventIds.has(alert.event_id)) {
            console.log("Showing notification for NEW event:", alert.event_id);
            showNotification(alert);
            shownEventIds.add(alert.event_id);
            
            // Batasi memory agar tidak bengkak
            if (shownEventIds.size > 100) {
              const first = shownEventIds.values().next().value;
              shownEventIds.delete(first);
            }
          } else {
            console.log("Notifikasi duplikat dicegah untuk:", alert.event_id);
          }
        }
      }
    }
  } catch (e) {
    console.error("Polling error:", e);
  }
}

// Use Alarms for MV3 instead of setInterval
if (chrome.alarms) {
  chrome.alarms.create("poll-alerts", { periodInMinutes: 0.1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "poll-alerts") {
      pollAlerts();
    }
  });
} else {
  console.error("chrome.alarms is undefined. Make sure 'alarms' permission is in manifest and extension is reloaded.");
  // Fallback to setInterval if alarms are missing (though not ideal for MV3)
  setInterval(pollAlerts, 10000);
}

// Immediate first poll
pollAlerts();

function showNotification(alert) {
  if (!chrome.notifications) {
    console.error("chrome.notifications is undefined.");
    return;
  }
  const notificationId = "alert-" + Date.now();
  
  // PARSING: Extract sections, strip quotes and stars
  const cleanAnalysis = (alert.analysis || "").replace(/["*#]/g, "");
  
  function getSection(text, label) {
    const regex = new RegExp(`${label}:?\\s*([\\s\\S]+?)(?=\\s*\\[|\\s*$|\\s*[A-Z_]{5,}\\]|$)`, "i");
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  let alasan = getSection(cleanAnalysis, "\\[ALASAN_USER\\]") || getSection(cleanAnalysis, "ALASAN_USER") || "Aktivitas mencurigakan terdeteksi.";
  let mitigasi = getSection(cleanAnalysis, "\\[RINGKASAN_MITIGASI\\]") || getSection(cleanAnalysis, "RINGKASAN_MITIGASI") || "Sila waspada saat mengakses situs ini.";
  
  let title = "🔍 Peringatan Keamanan";
  let message = `${alasan}\n\nTindakan: ${mitigasi}`;

  if (alert.block_instruction) {
    title = "⚠️ Akses Dibatasi";
    message = `Situs diblokir untuk melindungi Anda.\n\nAlasan: ${alasan}`;
  }

  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: title,
    message: message.substring(0, 160),
    contextMessage: "Morpheus Intelligence",
    priority: 2,
    requireInteraction: true,
    buttons: [{ title: "Lihat Detail & Analisis Lanjut" }]
  });

  chrome.storage.local.set({ [notificationId]: alert.analysis });
}

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith("alert-")) {
    chrome.tabs.create({ url: `alert_details.html?id=${id}` });
  }
});

chrome.notifications.onButtonClicked.addListener((id, index) => {
  if (index === 0) {
    chrome.tabs.create({ url: `alert_details.html?id=${id}` });
  }
});

// ===== Payload Builder =====
async function buildPayload({ event_type, url, domain, referrer, tabId, mergeCtx = {} }) {
  const { nav, redir, inter } = tabId != null ? getTabState(tabId) : { nav: {}, redir: {}, inter: {} };
  
  // STICKY ID LOGIC: Use existing ID for tab if available, else create new
  let eventId;
  if (tabId != null && nav.currentEventId) {
    eventId = nav.currentEventId;
  } else {
    eventId = generateEventId();
    if (tabId != null) nav.currentEventId = eventId;
  }
  const snap = tabId != null ? snapshotByTab.get(tabId) : null;

  if (tabId != null) {
    await saveTabIdForEvent(eventId, tabId);
  }

  return {
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
    navigation_context: { redirect_count: redir?.count ?? 0 },
    file_context: mergeCtx.file_context || { file_name: null, file_extension: null },
    page_context: snap?.page_context || {},
    script_context: snap?.script_context || {},
    performance_context: snap?.performance_context || {},
    metadata: { browser: "Chrome", os: "Windows" }
  };
}

// ===== Listeners =====

chrome.downloads.onCreated.addListener(async (downloadItem) => {
  const payload = await buildPayload({
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

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId === 0) {
    // STOP TRACKING DASHBOARD ITSELF
    if (details.url.includes("localhost:5001") || details.url.startsWith("chrome://")) {
      return;
    }
    
    const tabState = getTabState(details.tabId);
    tabState.nav.lastUrl = details.url;
    tabState.nav.lastDomain = safeHostname(details.url);
    tabState.nav.currentEventId = null; // RESET Sticky ID on new navigation
    
    const payload = await buildPayload({
      event_type: "navigation_committed",
      tabId: details.tabId,
      url: details.url
    });
    postEvent(payload);
  }
});

chrome.runtime.onMessage.addListener(async (msg, sender) => {
  const tabId = sender?.tab?.id;
  if (msg?.action === "telemetrySnapshot" && tabId != null) {
    const snap = msg.snapshot;
    
    // PREVENT LOOP: Jangan proses telemetri dari dashboard sendiri
    if (snap.url && (snap.url.includes("localhost:5001") || snap.url.startsWith("chrome"))) {
      return;
    }

    snapshotByTab.set(tabId, msg.snapshot);

    if (snap.page_context?.suspicious_keywords_count > 0 || 
        snap.page_context?.has_password_field ||
        snap.page_context?.form_action_mismatch ||
        snap.performance_context?.cpu_usage_percent > 50 ||
        snap.script_context?.script_obfuscation) {
      const payload = await buildPayload({
        event_type: "suspicious_telemetry",
        tabId,
        url: snap.url
      });
      postEvent(payload);
    }
  }
});

// [NEW] Listen for manual sync requests from Popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "manualSync") {
    console.warn("Manual sync requested from popup...");
    pollAlerts();
    sendResponse({ status: "sync_started" });
  }
});

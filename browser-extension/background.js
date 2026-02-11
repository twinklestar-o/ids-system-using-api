import { generateEventId, safeHostname } from "./utils.js";

const EVENT_COLLECTOR_URL = "http://localhost:5000/event";

// ===== GLOBAL THRESHOLDS =====
const INTERACTION_WINDOW_MS = 4000;
const REDIRECT_THRESHOLD = 3;

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
      lastCommittedTs: null
    });
  }
  if (!redirectStateByTab.has(tabId)) {
    redirectStateByTab.set(tabId, {
      count: 0,
      firstUrl: null,
      lastUrl: null,
      lastTs: null
    });
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

// ===== FIXED postEvent (NO DOUBLE FETCH) =====
async function postEvent(payload) {
  try {
    console.log("Sending event:", payload);

    const res = await fetch(EVENT_COLLECTOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log("Response status:", res.status);
  } catch (e) {
    console.error("Post failed:", e);
  }
}

// ===== Payload Builder =====
function buildPayload({ event_type, url, domain, referrer, tabId, mergeCtx = {} }) {
  const eventId = generateEventId();
  const snap = tabId != null ? snapshotByTab.get(tabId) : null;
  const { nav, redir, inter } =
    tabId != null ? getTabState(tabId) : { nav: {}, redir: {}, inter: {} };

  const tNow = Date.now();
  const recentClick =
    inter?.lastClickTs != null &&
    tNow - inter.lastClickTs <= INTERACTION_WINDOW_MS;

  const recentInput =
    inter?.lastInputTs != null &&
    tNow - inter.lastInputTs <= INTERACTION_WINDOW_MS;

  const recentAny =
    inter?.lastAnyTs != null &&
    tNow - inter.lastAnyTs <= INTERACTION_WINDOW_MS;

  const openDurationSec =
    nav?.lastNavTs != null
      ? Math.max(0, Math.round((tNow - nav.lastNavTs) / 1000))
      : null;

  const base = {
    event_id: eventId,
    event_type,
    source: "browser_extension",
    timestamp: nowIso(),

    url: url ?? snap?.url ?? null,
    domain:
      domain ??
      safeHostname(url ?? snap?.url) ??
      snap?.domain ??
      null,
    referrer: referrer ?? snap?.referrer ?? null,

    user_context: {
      user_click: snap?.user_context?.user_click ?? recentClick ?? false,
      tab_visibility: snap?.user_context?.tab_visibility ?? "background",
      user_interaction:
        snap?.user_context?.user_interaction ??
        (recentAny || recentInput) ??
        false,
      page_open_duration_sec: openDurationSec
    },

    navigation_context: {
      redirect_count: redir?.count ?? null,
      cross_domain_navigation: null,
      from_domain: nav?.lastDomain ?? null,
      silent_redirect: null
    },

    file_context: {
      file_name: null,
      file_extension: null,
      mime_type: null,
      file_size_kb: null,
      download_trigger: null,
      cross_domain_download: null
    },

    page_context: {
      has_form: snap?.page_context?.has_form ?? null,
      has_login_form: snap?.page_context?.has_login_form ?? null,
      has_password_field: snap?.page_context?.has_password_field ?? null,
      form_action_domain: snap?.page_context?.form_action_domain ?? null,
      current_domain: snap?.page_context?.current_domain ?? domain ?? null,
      suspicious_keywords: snap?.page_context?.suspicious_keywords ?? []
    },

    script_context: {
      script_obfuscation: snap?.script_context?.script_obfuscation ?? null,
      wasm_loaded: snap?.script_context?.wasm_loaded ?? false,
      webworker_active: snap?.script_context?.webworker_active ?? false,
      worker_count: snap?.script_context?.worker_count ?? 0
    },

    performance_context: {
      cpu_usage_percent:
        snap?.performance_context?.cpu_usage_percent ?? null,
      cpu_usage_duration_sec:
        snap?.performance_context?.cpu_usage_duration_sec ?? null
    },

    metadata: {
      browser: "Chrome",
      os:
        self.navigator && self.navigator.platform
          ? self.navigator.platform
          : "Windows",
      ip_hash: "abc123"
    }
  };

  return deepMerge(base, mergeCtx);
}

function deepMerge(target, patch) {
  if (!patch || typeof patch !== "object") return target;
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(out[k] ?? {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ===== Message listener =====
chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender?.tab?.id;

  if (msg?.action === "telemetrySnapshot" && tabId != null) {
    snapshotByTab.set(tabId, msg.snapshot);

    const snap = msg.snapshot;

    if (snap?.script_context?.script_obfuscation) {
      postEvent(buildPayload({
        event_type: "script_execution",
        tabId,
        url: snap.url,
        domain: snap.domain,
        referrer: snap.referrer
      }));
    }

    if (snap?.script_context?.wasm_loaded) {
      postEvent(buildPayload({
        event_type: "wasm_loaded",
        tabId,
        url: snap.url,
        domain: snap.domain,
        referrer: snap.referrer
      }));
    }

    if (snap?.script_context?.webworker_active) {
      postEvent(buildPayload({
        event_type: "webworker_active",
        tabId,
        url: snap.url,
        domain: snap.domain,
        referrer: snap.referrer
      }));
    }
  }
});

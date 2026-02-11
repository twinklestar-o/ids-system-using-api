(function () {
  let lastClickTs = null;
  let lastInputTs = null;
  let lastAnyTs = null;

  function sendInteraction(kind) {
    chrome.runtime.sendMessage({
      action: "userInteraction",
      kind,
      timestamp: new Date().toISOString()
    });
  }

  document.addEventListener("click", () => {
    const t = Date.now();
    lastClickTs = t;
    lastAnyTs = t;
    sendInteraction("click");
  }, true);

  document.addEventListener("keydown", () => {
    const t = Date.now();
    lastInputTs = t;
    lastAnyTs = t;
    sendInteraction("input");
  }, true);

  document.addEventListener("mousemove", () => {
    lastAnyTs = Date.now();
  }, { passive: true });

  // ===== performance heuristic =====
  let longTaskTotalMsWindow = 0;
  let windowStart = Date.now();

  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskTotalMsWindow += entry.duration;
      }
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch {}

  function computePerformanceHeuristic() {
    const now = Date.now();
    const elapsedMs = Math.max(1, now - windowStart);

    const ratio = Math.min(1, longTaskTotalMsWindow / elapsedMs);

    const cpuUsagePercent = Math.round(ratio * 100);
    const cpuUsageDurationSec = Math.round(longTaskTotalMsWindow / 1000);

    if (elapsedMs >= 10000) {
      windowStart = now;
      longTaskTotalMsWindow = 0;
    }

    return {
      cpu_usage_percent: cpuUsagePercent,
      cpu_usage_duration_sec: cpuUsageDurationSec
    };
  }

  function collectTelemetry() {
    const passwordField = document.querySelector('input[type="password"]');
    const forms = document.querySelectorAll("form");

    let formActionDomain = null;
    if (forms.length > 0 && forms[0].action) {
      try {
        formActionDomain = new URL(forms[0].action).hostname;
      } catch {}
    }

    const keywords = ["verify", "account", "urgent", "login", "password"];
    const bodyText = (document.body?.innerText || "").toLowerCase();
    const suspiciousKeywords = keywords.filter(k => bodyText.includes(k));

    const scriptObfuscation =
      /eval\(|atob\(|Function\(|unescape\(|fromCharCode\(/i
        .test(document.documentElement.innerHTML);

    const perf = computePerformanceHeuristic();

    return {
      page_context: {
        has_form: forms.length > 0,
        has_login_form: !!passwordField,
        has_password_field: !!passwordField,
        form_action_domain: formActionDomain,
        current_domain: location.hostname,
        suspicious_keywords: suspiciousKeywords
      },
      script_context: {
        script_obfuscation: scriptObfuscation,
        wasm_loaded: typeof WebAssembly === "object",
        webworker_active: typeof Worker === "function",
        worker_count: navigator.hardwareConcurrency || 0
      },
      performance_context: perf,
      user_context: {
        user_click:
          lastClickTs != null && Date.now() - lastClickTs <= 4000,
        user_interaction:
          lastAnyTs != null && Date.now() - lastAnyTs <= 4000,
        tab_visibility:
          document.visibilityState === "visible"
            ? "foreground"
            : "background"
      },
      url: location.href,
      domain: location.hostname,
      referrer: document.referrer || null
    };
  }

  function sendSnapshot() {
    chrome.runtime.sendMessage({
      action: "telemetrySnapshot",
      snapshot: collectTelemetry(),
      timestamp: new Date().toISOString()
    });
  }

  sendSnapshot();
  document.addEventListener("visibilitychange", sendSnapshot);
  setInterval(sendSnapshot, 5000);
})();

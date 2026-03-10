(function () {
  // PREVENT LOOP: Jangan monitor dashboard sendiri atau halaman internal chrome
  if (location.href.includes("localhost:5001") || location.href.startsWith("chrome")) {
    console.log("Morpheus: Skipping telemetry for monitoring/internal page.");
    return;
  }

  let lastClickTs = null;
  let lastAnyTs = null;

  // Track interactions
  document.addEventListener("click", () => {
    lastClickTs = Date.now();
    lastAnyTs = lastClickTs;
  }, true);

  document.addEventListener("keydown", () => {
    lastAnyTs = Date.now();
  }, true);

  // Performance monitoring for Cryptojacking
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

  function computePerformance() {
    const now = Date.now();
    const elapsedMs = Math.max(1, now - windowStart);
    const ratio = Math.min(1, longTaskTotalMsWindow / elapsedMs);
    
    // Reset window every 10s
    if (elapsedMs >= 10000) {
      windowStart = now;
      longTaskTotalMsWindow = 0;
    }

    return {
      cpu_usage_percent: Math.round(ratio * 100),
      cpu_usage_duration_sec: Math.round(longTaskTotalMsWindow / 1000)
    };
  }

  function collectTelemetry() {
    const bodyText = (document.body?.innerText || "").toLowerCase();
    
    // Phishing keywords
    const keywords = ["verify", "account", "urgent", "login", "password", "bank", "secure", "update-security"];
    const suspiciousKeywords = keywords.filter(k => bodyText.includes(k));

    // Advanced: Form Action Mismatch
    let formActionMismatch = false;
    const forms = document.querySelectorAll("form");
    forms.forEach(form => {
        try {
            const actionUrl = new URL(form.action, location.href);
            if (actionUrl.hostname && actionUrl.hostname !== location.hostname) {
                formActionMismatch = true;
            }
        } catch (e) {}
    });

    // Advanced: Script Obfuscation Heuristic
    const scripts = document.querySelectorAll("script");
    let scriptObfuscation = false;
    scripts.forEach(s => {
        const src = s.innerText || "";
        if (src.length > 500 && (src.includes("eval(") || src.includes("unescape("))) {
            scriptObfuscation = true;
        }
    });

    return {
      page_context: {
        has_form: forms.length > 0,
        has_password_field: !!document.querySelector('input[type="password"]'),
        form_action_mismatch: formActionMismatch,
        current_domain: location.hostname,
        suspicious_keywords_count: suspiciousKeywords.length,
        suspicious_keywords_list: suspiciousKeywords
      },
      script_context: {
        script_obfuscation: scriptObfuscation,
        wasm_loaded: typeof WebAssembly === "object"
      },
      performance_context: computePerformance(),
      user_context: {
        user_click: lastClickTs != null && Date.now() - lastClickTs <= 5000,
        user_interaction: lastAnyTs != null && Date.now() - lastAnyTs <= 5000,
        tab_visibility: document.visibilityState
      },
      url: location.href,
      domain: location.hostname,
      referrer: document.referrer || null
    };
  }

  function sendSnapshot() {
    // SAFETY CHECK: Pastikan konteks ekstensi masih valid (belum direfresh)
    if (!chrome.runtime?.id) {
      console.warn("Morpheus: Extension context invalidated. Stopping telemetry.");
      return;
    }

    try {
      chrome.runtime.sendMessage({
        action: "telemetrySnapshot",
        snapshot: collectTelemetry(),
        timestamp: new Date().toISOString()
      }, (response) => {
        // Handle potential error from closed connection
        if (chrome.runtime.lastError) {
          // Context is likely invalidated, ignore silently
        }
      });
    } catch (e) {
      // Ignore context invalidation errors
    }
  }

  // Real-time triggers
  sendSnapshot();
  document.addEventListener("visibilitychange", sendSnapshot);
  
  // Frequent polling for CPU usage
  setInterval(sendSnapshot, 3000);
})();

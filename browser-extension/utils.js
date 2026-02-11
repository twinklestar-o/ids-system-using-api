export function generateEventId() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = Math.random().toString(16).slice(2, 6);
  return `evt-${ts}-${rand}`;
}

export function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// First-party marketing attribution. No cookies, no third-party scripts, no personal data.
// Stores the UTM tags a visitor arrived with so a trial request can be traced back to the
// post that produced it, and sends anonymous page-view events to /api/track.

const ATTR_KEY = "cc_attr";
const SID_KEY = "cc_sid";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  referrer?: string;
  landing_path?: string;
};

// Only public marketing pages are tracked. The signed-in app is never tracked.
const MARKETING_PATHS = ["/", "/trial", "/sandbox", "/about", "/press", "/investors", "/security", "/manual"];

export function isMarketingPath(path: string | null): boolean {
  return !!path && MARKETING_PATHS.includes(path);
}

/** Remember how this visitor arrived. A visit with UTM tags replaces what was stored; one without does not. */
export function captureAttribution(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const hasUtm = UTM_KEYS.some((k) => params.get(k));
    if (window.localStorage.getItem(ATTR_KEY) && !hasUtm) return;
    const attr: Attribution = { landing_path: window.location.pathname };
    for (const k of UTM_KEYS) {
      const v = params.get(k);
      if (v) attr[k] = v.slice(0, 120);
    }
    const ref = document.referrer;
    if (ref && !ref.includes(window.location.host)) attr.referrer = ref.slice(0, 300);
    window.localStorage.setItem(ATTR_KEY, JSON.stringify(attr));
  } catch {
    // Storage unavailable (private mode): attribution is simply not recorded.
  }
}

export function getAttribution(): Attribution {
  try {
    return JSON.parse(window.localStorage.getItem(ATTR_KEY) || "{}") as Attribution;
  } catch {
    return {};
  }
}

function sessionId(): string {
  try {
    let sid = window.sessionStorage.getItem(SID_KEY);
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.sessionStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return "";
  }
}

export type TrackEvent = "page_view" | "trial_request" | "cta_click";

/** Fire-and-forget. Never throws and never blocks the page. */
export function track(event: TrackEvent, extra?: { label?: string }): void {
  try {
    const body = JSON.stringify({
      event,
      path: window.location.pathname,
      session_id: sessionId(),
      label: extra?.label,
      ...getAttribution(),
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

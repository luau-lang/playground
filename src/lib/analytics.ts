const ANALYTICS_ID = "G-1QYCKBLLEE";

let analyticsScheduled = false;

function loadGoogleAnalytics(): void {
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`;
  document.head.append(script);

  window.dataLayer = window.dataLayer || [];
  function gtag(...args: unknown[]) {
    window.dataLayer?.push(arguments);
  }
  gtag('js', new Date());
  gtag('config', ANALYTICS_ID);
}

function runAfterLoad(): void {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(loadGoogleAnalytics, { timeout: 2000 });
    return;
  }

  setTimeout(loadGoogleAnalytics, 1);
}

export function initAnalytics(): void {
  if (import.meta.env.DEV || analyticsScheduled) return;

  analyticsScheduled = true;

  if (document.readyState === 'complete') {
    runAfterLoad();
    return;
  }

  window.addEventListener('load', runAfterLoad, { once: true });
}

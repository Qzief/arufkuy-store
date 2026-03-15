export const AFFILIATE_COOKIE_NAME = 'affiliate_ref';
export const AFFILIATE_COOKIE_DAYS = 30;
export const DEFAULT_AFFILIATE_COMMISSION_PERCENT = 8;

export function sanitizeAffiliateCode(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,24}$/.test(normalized)) return null;
  return normalized;
}

function readCookie(name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function readAffiliateCookie() {
  return sanitizeAffiliateCode(readCookie(AFFILIATE_COOKIE_NAME));
}

export function captureAffiliateAttribution(currentUrl = window.location.href) {
  const url = new URL(currentUrl, window.location.origin);
  const refFromUrl = sanitizeAffiliateCode(url.searchParams.get('ref'));

  if (refFromUrl) {
    writeCookie(AFFILIATE_COOKIE_NAME, refFromUrl, AFFILIATE_COOKIE_DAYS);
    return {
      code: refFromUrl,
      source: 'url',
      landingPath: `${url.pathname}${url.search}`,
      capturedAt: new Date().toISOString()
    };
  }

  const refFromCookie = readAffiliateCookie();
  if (!refFromCookie) return null;

  return {
    code: refFromCookie,
    source: 'cookie',
    landingPath: `${url.pathname}${url.search}`,
    capturedAt: null
  };
}

export async function trackAffiliateVisit(workerBaseUrl, attribution, extra = {}) {
  if (!workerBaseUrl || !attribution || attribution.source !== 'url' || !attribution.code) {
    return;
  }

  const sessionKey = `affiliate_click_logged:${attribution.code}:${attribution.landingPath}`;
  if (sessionStorage.getItem(sessionKey)) return;

  try {
    const response = await fetch(`${workerBaseUrl}/affiliate/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: attribution.code,
        landingPath: attribution.landingPath,
        capturedAt: attribution.capturedAt,
        referrer: document.referrer || '',
        ...extra
      })
    });

    if (response.ok) {
      sessionStorage.setItem(sessionKey, '1');
    }
  } catch (error) {
    console.warn('Failed to log affiliate click:', error);
  }
}

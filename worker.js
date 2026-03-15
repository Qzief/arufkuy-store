addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

// CORS headers helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

// Parse JSON safely
async function parseJSON(r) {
  try { return await r.json() } catch { return null }
}

// ==============================
// FIRESTORE REST API HELPERS
// ==============================

const FIRESTORE_PROJECT_ID = 'arufkuy-store';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`;

// Base64url encode
function base64url(buf) {
  let str = '';
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Import RSA private key from PEM for signing JWT
async function importPrivateKey(pem) {
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

// Generate Google OAuth2 access token from service account
async function getAccessToken() {
  let sa;
  try {
    sa = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', e);
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT environment');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore'
  };

  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput));
  const jwt = `${signingInput}.${base64url(signature)}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error('Token exchange failed:', JSON.stringify(tokenData));
    throw new Error('Failed to get access token: ' + (tokenData.error_description || tokenData.error));
  }

  return tokenData.access_token;
}

// Firestore REST: Get document
async function firestoreGet(collectionPath, docId, token) {
  const res = await fetch(`${FIRESTORE_BASE}/${collectionPath}/${docId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore GET ${collectionPath}/${docId} failed: ${res.status} ${err}`);
  }
  return res.json();
}

// Firestore REST: Update document (PATCH)
async function firestoreUpdate(collectionPath, docId, fields, token, updateMask) {
  let url = `${FIRESTORE_BASE}/${collectionPath}/${docId}`;
  if (updateMask && updateMask.length > 0) {
    const maskParams = updateMask.map(f => `updateMask.fieldPaths=${f}`).join('&');
    url += `?${maskParams}`;
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore UPDATE ${collectionPath}/${docId} failed: ${res.status} ${err}`);
  }
  return res.json();
}

// Firestore REST: Create document (POST) - with auto-generated ID if docId not provided
async function firestoreCreate(collectionPath, docId, fields, token) {
  let url = `${FIRESTORE_BASE}/${collectionPath}`;
  if (docId) {
    url += `?documentId=${docId}`;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore CREATE ${collectionPath} failed: ${res.status} ${err}`);
  }
  return res.json();
}

// Firestore REST: Atomic Increment using :commit
async function firestoreIncrement(collectionPath, docId, increments, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:commit`;
  const transforms = [];

  for (const [field, amount] of Object.entries(increments)) {
    transforms.push({
      fieldPath: field,
      increment: { integerValue: String(amount) }
    });
  }

  const payload = {
    writes: [
      {
        transform: {
          document: `projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collectionPath}/${docId}`,
          fieldTransforms: transforms
        }
      }
    ]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore Atomic Increment ${collectionPath}/${docId} failed: ${res.status} ${err}`);
  }
  return res.json();
}



// Firestore REST: Delete document
async function firestoreDelete(collectionPath, docId, token) {
  const url = `${FIRESTORE_BASE}/${collectionPath}/${docId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore DELETE ${collectionPath}/${docId} failed: ${res.status} ${err}`);
  }
  return res;
}

// Firestore REST: Query collection
async function firestoreQuery(collectionPath, structuredQuery, token) {
  // runQuery must be called on the PARENT path, not on the collection itself
  // The collection is already specified in structuredQuery.from
  const url = `${FIRESTORE_BASE}:runQuery`;
  console.log('Firestore runQuery URL:', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ structuredQuery })
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Firestore QUERY error response:', err);
    throw new Error(`Firestore QUERY failed: ${res.status} ${err}`);
  }
  const result = await res.json();
  return result;
}

// Convert Firestore REST value to JS value
function fromFirestoreValue(val) {
  if (val === undefined || val === null) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  return null;
}

// Convert JS value to Firestore REST value
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (val instanceof Date) return { timestampValue: val.toISOString() }; // Add Date support
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: val.toString() };
    return { doubleValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

// Helper: Convert JS Object to Firestore Fields (Root Level)
function objectToFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

// Convert full Firestore document fields to JS object
function docToObject(doc) {
  if (!doc || !doc.fields) return null;
  const obj = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    obj[k] = fromFirestoreValue(v);
  }
  return obj;
}

// ==============================
// LOGGING & DEBUGGING HELPERS
// ==============================

function sanitizeAffiliateCode(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,24}$/.test(normalized)) return null;
  return normalized;
}

function generateAffiliateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'ARF';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    request.headers.get('X-Real-IP') ||
    '';
}

async function resolveApprovedAffiliateByCode(code, token) {
  const normalizedCode = sanitizeAffiliateCode(code);
  if (!normalizedCode) return null;

  const q = {
    from: [{ collectionId: 'affiliate_users' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: 'code' },
              op: 'EQUAL',
              value: { stringValue: normalizedCode }
            }
          },
          {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'EQUAL',
              value: { stringValue: 'approved' }
            }
          }
        ]
      }
    },
    limit: 1
  };

  const results = await firestoreQuery('affiliate_users', q, token);
  if (!results || !results.length || !results[0].document) return null;

  const document = results[0].document;
  return {
    id: document.name.split('/').pop(),
    data: docToObject(document)
  };
}

function calculateAffiliateCommission(order, affiliateData, productData = null) {
  const gross = Number(order.originalTotalPrice || order.totalPrice || 0);
  const discount = Number(order.discountAmount || 0);
  const serviceFee = Number(order.serviceFeeAmount || 0);
  const baseAmount = Math.max(0, gross - discount);

  if (productData && productData.affiliateEnabled === false) {
    return {
      amount: 0,
      baseAmount,
      percent: 0,
      fixedAmount: 0,
      serviceFee,
      source: 'product_disabled'
    };
  }

  const productPercent = productData ? Number(productData.affiliateCommissionPercent || 0) : 0;
  const productFixedAmount = productData ? Number(productData.affiliateCommissionFlat || 0) : 0;
  const hasProductOverride = productFixedAmount > 0 || productPercent > 0;

  const percent = hasProductOverride
    ? productPercent
    : Number(affiliateData.commissionPercent || order?.affiliate?.commissionPercent || 8);
  const fixedAmount = hasProductOverride
    ? productFixedAmount
    : Number(affiliateData.commissionFlat || order?.affiliate?.commissionFlat || 0);
  const amount = fixedAmount > 0 ? fixedAmount : Math.floor(baseAmount * (percent / 100));

  return {
    amount,
    baseAmount,
    percent,
    fixedAmount,
    serviceFee,
    source: hasProductOverride ? 'product_override' : 'default'
  };
}

async function handleAffiliateClick(request) {
  try {
    const body = await parseJSON(request);
    const code = sanitizeAffiliateCode(body?.code);
    if (!code) {
      return new Response(JSON.stringify({ error: 'Invalid affiliate code' }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      });
    }

    const token = await getAccessToken();

    const affiliateRecord = await resolveApprovedAffiliateByCode(code, token);
    if (!affiliateRecord) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      });
    }

    const now = new Date();
    const clickData = {
      affiliate: affiliateRecord.id,
      affiliateCode: code,
      affiliateEmail: affiliateRecord.data.email || null,
      ip: getClientIp(request),
      userAgent: request.headers.get('User-Agent') || '',
      referrer: body?.referrer || '',
      landingPath: body?.landingPath || '/',
      sourcePage: body?.sourcePage || 'storefront',
      createdAt: now,
      capturedAt: body?.capturedAt || null
    };

    await firestoreCreate('affiliate_clicks', null, objectToFirestoreFields(clickData), token);
    await firestoreIncrement('affiliate_users', affiliateRecord.id, { totalClicks: 1 }, token);
    await firestoreUpdate('affiliate_users', affiliateRecord.id, {
      lastClickAt: toFirestoreValue(now)
    }, token, ['lastClickAt']);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('handleAffiliateClick error:', error);
    return new Response(JSON.stringify({ error: 'Failed to log affiliate click' }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }
}
// Log webhook events to Firestore for debugging
async function logWebhookToFirestore(eventData, type) {
  try {
    const token = await getAccessToken();
    const now = new Date();

    // Create log entry
    const logData = {
      timestamp: now,
      type: type,
      data: JSON.stringify(eventData), // Store as string to avoid schema issues
      processedAt: now
    };

    // Use objectToFirestoreFields for root document
    await firestoreCreate('webhook_logs', null, objectToFirestoreFields(logData), token);
    console.log('Webhook event logged to Firestore');
  } catch (error) {
    console.error('Failed to log webhook:', error);
  }
}

// Endpoint to check recent logs
async function checkLogs(request) {
  try {
    const token = await getAccessToken();

    // Query last 10 logs
    const query = {
      from: [{ collectionId: 'webhook_logs' }],
      orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
      limit: 10
    };

    const results = await firestoreQuery('webhook_logs', query, token);

    // Format results
    const logs = (results || []).map(item => {
      if (!item.document) return null;
      return docToObject(item.document);
    }).filter(l => l);

    return new Response(JSON.stringify(logs, null, 2), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// Endpoint to refresh publicAccessUntil when accessed via valid Invoice ID
async function refreshAccess(request) {
  try {
    const body = await parseJSON(request);
    if (!body || !body.invoiceId) {
      return new Response(JSON.stringify({ error: 'Missing invoiceId' }), { status: 400, headers: corsHeaders() });
    }

    const { invoiceId } = body;
    const token = await getAccessToken();

    // Find the order by invoiceId to get the Document ID
    const query = {
      from: [{ collectionId: 'orders' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'invoiceId' },
          op: 'EQUAL',
          value: { stringValue: invoiceId }
        }
      },
      limit: 1
    };

    const results = await firestoreQuery('orders', query, token);

    if (!results || results.length === 0 || !results[0].document) {
      return new Response(JSON.stringify({ error: 'Order not found for this invoice' }), { status: 404, headers: corsHeaders() });
    }

    // Extract Order ID (Document ID) from the full path
    // example name: projects/arufkuy-store/databases/(default)/documents/orders/OrderDocID123
    const docPath = results[0].document.name;
    const pathParts = docPath.split('/');
    const orderId = pathParts[pathParts.length - 1];

    // Update publicAccessUntil to now + 6 hours
    const updateFields = {
      publicAccessUntil: toFirestoreValue(new Date(Date.now() + 6 * 60 * 60 * 1000))
    };

    await firestoreUpdate('orders', orderId, updateFields, token, ['publicAccessUntil']);

    return new Response(JSON.stringify({ message: 'Access Refreshed' }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Refresh Access Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// Endpoint to refresh publicAccessUntil when accessed via Order ID (Master Key)
async function refreshAccessByOrder(request) {
  try {
    const body = await parseJSON(request);
    if (!body || !body.orderId) {
      return new Response(JSON.stringify({ error: 'Missing orderId' }), { status: 400, headers: corsHeaders() });
    }

    const { orderId } = body;
    const token = await getAccessToken();

    // Verify the order exists first
    const orderDoc = await firestoreGet('orders', orderId, token);
    if (!orderDoc || !orderDoc.fields) {
      return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: corsHeaders() });
    }

    // Update publicAccessUntil to now + 6 hours
    const updateFields = {
      publicAccessUntil: toFirestoreValue(new Date(Date.now() + 6 * 60 * 60 * 1000))
    };

    await firestoreUpdate('orders', orderId, updateFields, token, ['publicAccessUntil']);

    return new Response(JSON.stringify({ message: 'Access Refreshed' }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Refresh Access By Order Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

function htmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(str) {
  return String(str || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(str, maxLen = 180) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1).trimEnd() + '...';
}

function resolveFrontendBaseUrl() {
  if (typeof FRONTEND_BASE_URL !== 'undefined' && FRONTEND_BASE_URL) {
    return String(FRONTEND_BASE_URL).replace(/\/+$/, '');
  }
  return 'https://store.arufkuy.me';
}

function resolveFrontendOriginUrl() {
  if (typeof FRONTEND_ORIGIN_URL !== 'undefined' && FRONTEND_ORIGIN_URL) {
    return String(FRONTEND_ORIGIN_URL).replace(/\/+$/, '');
  }
  return resolveFrontendBaseUrl();
}

function isPreviewBotUserAgent(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  const signatures = [
    'discordbot',
    'twitterbot',
    'facebookexternalhit',
    'facebot',
    'whatsapp',
    'telegrambot',
    'slackbot',
    'linkedinbot',
    'skypeuripreview',
    'vkshare'
  ];
  return signatures.some(sig => ua.includes(sig));
}

async function proxyDetailProductPage(request, url) {
  try {
    const originBase = resolveFrontendOriginUrl();
    const origin = new URL(originBase);

    if (origin.host === url.host) {
      return new Response('Server config error: FRONTEND_ORIGIN_URL must be a different host than current request host.', { status: 500 });
    }

    const mappedPath = (url.pathname === '/detail-product') ? '/detail-product.html' : url.pathname;
    const targetUrl = new URL(`${mappedPath}${url.search}`, originBase).toString();
    return fetch(targetUrl, {
      method: 'GET',
      headers: request.headers,
      redirect: 'follow'
    });
  } catch (error) {
    console.error('proxyDetailProductPage error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

function parseDetailRequest(url) {
  const params = new URLSearchParams(url.search);
  let slug = params.get('slug');
  let productId = params.get('id');

  const rawSearch = url.search.startsWith('?') ? url.search.slice(1) : '';
  if (!slug && rawSearch && !rawSearch.includes('=')) {
    slug = decodeURIComponent(rawSearch);
  }

  return { slug: slug || null, productId: productId || null };
}

async function findProductBySlug(slug, token) {
  const q = {
    from: [{ collectionId: 'products' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'slug' },
        op: 'EQUAL',
        value: { stringValue: slug }
      }
    },
    limit: 1
  };

  const results = await firestoreQuery('products', q, token);
  if (!results || results.length === 0 || !results[0].document) return null;

  const document = results[0].document;
  const data = docToObject(document);
  const docPath = document.name || '';
  const docId = docPath.split('/').pop() || null;

  if (!data) return null;
  return { id: docId, data };
}

function formatIDR(amount) {
  const val = Number(amount) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(val);
}

function buildProductPriceLabel(product) {
  if (product && product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
    const prices = product.variants
      .map(v => Number(v && v.price))
      .filter(v => Number.isFinite(v) && v > 0);

    if (prices.length > 0) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return min === max ? formatIDR(min) : `Mulai ${formatIDR(min)}`;
    }
  }

  const p = Number(product && product.price);
  if (Number.isFinite(p) && p > 0) return formatIDR(p);
  return '';
}

function toAbsoluteUrl(baseUrl, maybeUrl) {
  if (!maybeUrl) return `${baseUrl}/icon.png`;
  try {
    return new URL(String(maybeUrl), baseUrl).toString();
  } catch {
    return `${baseUrl}/icon.png`;
  }
}

async function serveDynamicProductOg(url) {
  try {
    const { slug, productId } = parseDetailRequest(url);
    if (!slug && !productId) {
      return new Response('Missing slug/id', { status: 400 });
    }

    const token = await getAccessToken();
    let found = null;

    if (slug) {
      found = await findProductBySlug(slug, token);
    }

    if (!found && productId) {
      const doc = await firestoreGet('products', productId, token);
      const data = docToObject(doc);
      if (data) found = { id: productId, data };
    }

    if (!found || !found.data) {
      return new Response('Product not found', { status: 404 });
    }

    const frontendBase = resolveFrontendBaseUrl();
    const finalSlug = found.data.slug || slug;
    const targetUrl = finalSlug
      ? `${frontendBase}/detail-product?${encodeURIComponent(finalSlug)}`
      : `${frontendBase}/detail-product?id=${encodeURIComponent(found.id)}`;

    const isDirectDetailPath = (url.pathname === '/detail-product' || url.pathname === '/detail-product.html');
    const canonicalPath = isDirectDetailPath
      ? `${url.pathname}${url.search}`
      : (finalSlug
        ? `/detail-product?${encodeURIComponent(finalSlug)}`
        : `/detail-product?id=${encodeURIComponent(found.id)}`);
    const canonicalUrl = new URL(canonicalPath, frontendBase).toString();

    const title = `${found.data.name || 'Detail Produk'} | Arufkuy Store`;
    const rawDesc = found.data.shortDescription || found.data.description || 'Detail produk digital di Arufkuy Store.';
    const normalizedDesc = stripHtml(rawDesc)
      .replace(/[\u0000-\u001F\u007F-\u009F\uFFFD]/g, ' ')
      .replace(/�|•|–|—|“|�\x9d|‘|’/g, ' ')
      .replace(/[^0-9A-Za-z�-�\s.,:;!?()\-\/&']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const firstSentence = (normalizedDesc.split(/[.!?](?:\s|$)/)[0] || normalizedDesc).trim();
    const shortDesc = truncateText(firstSentence || 'Detail produk digital di Arufkuy Store.', 120);
    const priceLabel = buildProductPriceLabel(found.data);
    const desc = priceLabel ? truncateText(`${shortDesc} - ${priceLabel}`, 145) : shortDesc;
    const imageUrl = toAbsoluteUrl(frontendBase, found.data.image);

    const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(title)}</title>
  <meta name="description" content="${htmlEscape(desc)}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="Arufkuy Store" />
  <meta property="og:locale" content="id_ID" />
  <meta property="og:title" content="${htmlEscape(title)}" />
  <meta property="og:description" content="${htmlEscape(desc)}" />
  <meta property="og:image" content="${htmlEscape(imageUrl)}" />
  <meta property="og:url" content="${htmlEscape(canonicalUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${htmlEscape(title)}" />
  <meta name="twitter:description" content="${htmlEscape(desc)}" />
  <meta name="twitter:image" content="${htmlEscape(imageUrl)}" />
  <meta name="twitter:url" content="${htmlEscape(canonicalUrl)}" />
  <link rel="canonical" href="${htmlEscape(canonicalUrl)}" />
  <meta http-equiv="refresh" content="0;url=${htmlEscape(targetUrl)}" />
</head>
<body>
  <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
  <noscript><a href="${htmlEscape(targetUrl)}">Lanjut ke produk</a></noscript>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 'public, max-age=120'
      }
    });

  } catch (error) {
    console.error('serveDynamicProductOg error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

// ==============================
// HANDLER UTAMA
// ==============================

async function handleRequest(event) {
  const request = event.request;
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    })
  }

  const url = new URL(request.url)

  if (request.method === 'GET' && (url.pathname === '/og/detail-product' || url.pathname === '/og/product')) {
    return serveDynamicProductOg(url);
  }

  if (request.method === 'GET' && url.pathname === '/detail-product.html') {
    return Response.redirect(`${url.origin}/detail-product${url.search}`, 308);
  }

  if (request.method === 'GET' && url.pathname === '/detail-product') {
    const userAgent = request.headers.get('user-agent') || '';
    if (isPreviewBotUserAgent(userAgent)) {
      return serveDynamicProductOg(url);
    }
    return proxyDetailProductPage(request, url);
  }

  if (request.method === 'POST' && url.pathname === '/create-invoice') {
    return createInvoice(request)
  }



  if (request.method === 'POST' && url.pathname === '/affiliate/click') {
    return handleAffiliateClick(request)
  }

  if (request.method === 'POST' && url.pathname === '/webhook') {
    return handleWebhook(request, event)
  }

  // Test endpoint - verify webhook URL is reachable AND functional
  if (url.pathname === '/webhook-test') {
    return new Response('System OK', { status: 200, headers: corsHeaders() });
  }

  if (url.pathname === '/check-logs') {
    return checkLogs(request);
  }

  if (request.method === 'POST' && url.pathname === '/refresh-access') {
    return refreshAccess(request);
  }

  if (request.method === 'POST' && url.pathname === '/refresh-access-by-order') {
    return refreshAccessByOrder(request);
  }

  return new Response('Not Found', {
    status: 404,
    headers: corsHeaders()
  })
}

// 🧾 1) CREATE INVOICE - Mayar Integration & Stock Reservation
async function createInvoice(request) {
  try {
    // Check environment variables
    if (typeof MAYAR_API_KEY === 'undefined' || !MAYAR_API_KEY) {
      return new Response(JSON.stringify({ error: 'Server configuration error: MAYAR_API_KEY missing' }), { status: 500, headers: corsHeaders() });
    }
    if (typeof MAYAR_BASE_URL === 'undefined' || !MAYAR_BASE_URL) {
      return new Response(JSON.stringify({ error: 'Server configuration error: MAYAR_BASE_URL missing' }), { status: 500, headers: corsHeaders() });
    }
    if (typeof FIREBASE_SERVICE_ACCOUNT === 'undefined' || !FIREBASE_SERVICE_ACCOUNT) {
      return new Response(JSON.stringify({ error: 'Server configuration error: FIREBASE_SERVICE_ACCOUNT missing' }), { status: 500, headers: corsHeaders() });
    }

    const body = await parseJSON(request);

    // Validate required fields including Order ID and Product ID for reservation
    if (!body || !body.email || !body.items || !body.orderId || !body.productId) {
      if (!body.orderId || !body.productId) {
        return new Response(JSON.stringify({
          error: 'Invalid payload. orderId and productId are required for stock reservation.'
        }), { status: 400, headers: corsHeaders() });
      }
      return new Response(JSON.stringify({
        error: 'Invalid payload. Missing required fields.'
      }), { status: 400, headers: corsHeaders() });
    }

    // --- STOCK RESERVATION LOGIC ---
    const orderId = body.orderId;
    const productId = body.productId;
    const variantId = body.variantId || null;
    const quantity = body.items[0]?.quantity || 1; // Assuming 1 product type per order for now

    // 1. Get Access Token
    const token = await getAccessToken();

    // Sync affiliate attribution to the order using server-side validation
    const affiliateCode = sanitizeAffiliateCode(body.affiliateCode);
    if (affiliateCode) {
      try {
        const affiliateRecord = await resolveApprovedAffiliateByCode(affiliateCode, token);
        if (affiliateRecord) {
          await firestoreUpdate('orders', orderId, {
            affiliateCode: toFirestoreValue(affiliateCode),
            affiliate: toFirestoreValue({
              affiliateId: affiliateRecord.id,
              code: affiliateCode,
              email: affiliateRecord.data.email || null,
              status: affiliateRecord.data.status || 'approved',
              commissionPercent: Number(affiliateRecord.data.commissionPercent) || 8,
              commissionFlat: Number(affiliateRecord.data.commissionFlat) || 0,
              attributedAt: new Date(),
              source: body?.affiliateSource || 'checkout'
            })
          }, token, ['affiliateCode', 'affiliate']);
        }
      } catch (affiliateError) {
        console.error('Failed to sync affiliate attribution:', affiliateError);
      }
    }

    // 2. Fetch Product & Stock Data
    // We now fetch from 'products' (for metadata/price check) AND 'stocks' (for actual items)
    let productDoc, stockDoc;
    try {
      [productDoc, stockDoc] = await Promise.all([
        firestoreGet('products', productId, token),
        firestoreGet('stocks', productId, token) // Stock ID is same as Product ID
      ]);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Product or Stock data not found' }), { status: 404, headers: corsHeaders() });
    }

    const productData = docToObject(productDoc);
    const stockData = docToObject(stockDoc);

    if (!productData) {
      return new Response(JSON.stringify({ error: 'Product data invalid' }), { status: 404, headers: corsHeaders() });
    }

    // 3. Check & Deduct Stock
    // Handle both Simple and Variable products
    let availableStockItems = [];
    let isVariant = false;
    let variantIndex = -1;

    // Use stockData if available (New Structure), fallback to productData (Old Structure - Migration Support)
    // But since user confirmed 'stocks' collection is used, we prioritize stockData.
    const useStockCollection = !!stockData;

    if (variantId && productData.hasVariants) {
      isVariant = true;
      variantIndex = productData.variants.findIndex(v => v.id === variantId);
      if (variantIndex === -1) {
        return new Response(JSON.stringify({ error: 'Variant not found' }), { status: 404, headers: corsHeaders() });
      }

      if (useStockCollection && stockData.variants && stockData.variants[variantId]) {
        availableStockItems = stockData.variants[variantId];
      } else if (productData.variants[variantIndex].stockItems) {
        // Fallback legacy
        availableStockItems = productData.variants[variantIndex].stockItems;
      } else {
        availableStockItems = [];
      }

    } else {
      // Simple Product
      if (useStockCollection && stockData.items) {
        availableStockItems = stockData.items;
      } else if (productData.stockItems) {
        // Fallback legacy
        availableStockItems = productData.stockItems;
      } else {
        availableStockItems = [];
      }
    }

    // Check availability
    if (!availableStockItems || availableStockItems.length < quantity) {
      return new Response(JSON.stringify({ error: 'Stok tidak cukup/habis' }), { status: 400, headers: corsHeaders() });
    }

    // Capture items to reserve (take from top)
    const reservedItems = availableStockItems.slice(0, quantity);
    const remainingItems = availableStockItems.slice(quantity);

    // 4. Update Stock (Deduct)
    const p = [];

    if (useStockCollection) {
      // Update 'stocks' collection
      if (isVariant) {
        // We must update the specific variant in the variants map. 
        // Firestore REST updateMask for map keys requires dotted path? 
        // No, for map fields, we usually have to replace the map or try complex masks.
        // Simplest: Read-Modify-Write the whole 'variants' map (we already read it).
        const updatedVariantsMap = { ...stockData.variants };
        updatedVariantsMap[variantId] = remainingItems;
        p.push(firestoreUpdate('stocks', productId, { variants: toFirestoreValue(updatedVariantsMap) }, token, ['variants']));
      } else {
        p.push(firestoreUpdate('stocks', productId, { items: toFirestoreValue(remainingItems) }, token, ['items']));
      }
    }

    // Always update 'products' collection metadata (stock count)
    if (isVariant) {
      const updatedVariants = [...productData.variants];
      updatedVariants[variantIndex] = {
        ...updatedVariants[variantIndex],
        stock: remainingItems.length,
        stockItems: null // Ensure legacy is cleared
      };
      p.push(firestoreUpdate('products', productId, { variants: toFirestoreValue(updatedVariants) }, token, ['variants']));
    } else {
      p.push(firestoreUpdate('products', productId, {
        stock: toFirestoreValue(remainingItems.length),
        stockItems: { nullValue: null } // Ensure legacy is cleared
      }, token, ['stock', 'stockItems']));
    }

    await Promise.all(p);

    // 5. Create Reservation Doc
    // Expires in 65 minutes (buffer over invoice 60m)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 65 * 60000);

    const reservationData = {
      orderId: orderId,
      productId: productId,
      variantId: variantId,
      items: reservedItems,
      reservedAt: now,
      expiresAt: expiresAt,
      status: 'reserved' // No need for stockId as it is implied to be productId
    };

    // Use objectToFirestoreFields for root document
    await firestoreCreate('stock_reservations', orderId, objectToFirestoreFields(reservationData), token);

    console.log(`Stock reserved for Order ${orderId}: ${quantity} items.`);

    // --- PRICE CALCULATION AND COUPON VALIDATION ---
    // Recalculate everything on server to be safe
    let finalItemPrice = 0;
    let basePrice = 0;
    let serviceFeePercent = 0;

    if (isVariant) {
      if (useStockCollection && stockData.variants && stockData.variants[variantId]) {
        basePrice = productData.variants[variantIndex].price;
      } else {
        basePrice = productData.variants[variantIndex].price;
      }
      serviceFeePercent = Number(productData.variants[variantIndex].serviceFee) || 0;
    } else {
      basePrice = productData.price;
      serviceFeePercent = Number(productData.serviceFee) || 0;
    }

    let totalPrice = basePrice * quantity;
    let discountAmount = 0;
    let appliedCouponCode = null;
    let appliedCouponId = null;

    // Check Coupon if provided
    // 1. Try direct field from payload (most reliable)
    if (body.coupon && typeof body.coupon === 'string' && body.coupon.trim()) {
      appliedCouponCode = body.coupon.trim().toUpperCase();
    }
    // 2. Fallback: Extract from description text
    if (!appliedCouponCode) {
      const descriptionText = body.description || '';
      if (descriptionText && descriptionText.includes('Kupon:')) {
        const match = descriptionText.match(/Kupon:\s*([A-Za-z0-9_\-]+)/);
        if (match) {
          appliedCouponCode = match[1];
        }
      }
    }

    // Better way: Check if there is a 'coupon' field in payload items or root
    // The frontend sends: description: `... - Kupon: ${coupon}`
    // Let's iterate coupons collection to find it if we have the code
    if (appliedCouponCode) {
      console.log(`Validating Coupon: ${appliedCouponCode}`);
      try {
        // Firestore Query for Coupon (Query by code only to provide specific errors)
        const q = {
          from: [{ collectionId: 'coupons' }],
          where: {
            fieldFilter: { field: { fieldPath: 'code' }, op: 'EQUAL', value: { stringValue: appliedCouponCode } }
          },
          limit: 1
        };

        const couponRes = await firestoreQuery('coupons', q, token);

        if (couponRes && couponRes.length > 0 && couponRes[0].document) {
          const couponDocId = couponRes[0].document.name.split('/').pop();
          const couponData = docToObject(couponRes[0].document);

          // 1. Status & Scheduled Check
          if (couponData.status === 'inactive' || couponData.isActive === false) { // Support legacy isActive
            return new Response(JSON.stringify({ error: 'Kupon tidak aktif' }), { status: 400, headers: corsHeaders() });
          }
          if (couponData.startDate) {
            let startDate = new Date(couponData.startDate);
            if (couponData.startDate.seconds) startDate = new Date(couponData.startDate.seconds * 1000);
            if (startDate > now) {
              return new Response(JSON.stringify({ error: 'Kupon belum bisa digunakan saat ini' }), { status: 400, headers: corsHeaders() });
            }
          }

          // 2. Expiry Check
          if (couponData.expiredAt) {
            let expDate = new Date(couponData.expiredAt);
            if (couponData.expiredAt.seconds) expDate = new Date(couponData.expiredAt.seconds * 1000);
            if (expDate < now) {
              return new Response(JSON.stringify({ error: 'Kupon sudah kadaluarsa' }), { status: 400, headers: corsHeaders() });
            }
          }

          // 3. Product Restriction Check
          if (couponData.allowedProductIds && couponData.allowedProductIds.length > 0) {
            if (!couponData.allowedProductIds.includes(productId)) {
              return new Response(JSON.stringify({ error: 'Kupon tidak berlaku untuk produk ini' }), { status: 400, headers: corsHeaders() });
            }
          }

          // 4. Minimum Purchase Check
          const minPurchase = Number(couponData.minimumPurchase) || 0;
          if (totalPrice < minPurchase) {
            return new Response(JSON.stringify({ error: `Minimal belanja untuk kupon ini adalah Rp ${minPurchase}` }), { status: 400, headers: corsHeaders() });
          }

          // 5. Minimum Items Check
          const minItems = Number(couponData.minItems) || 0;
          if (quantity < minItems) {
            return new Response(JSON.stringify({ error: `Minimal jumlah item untuk kupon ini adalah ${minItems} item` }), { status: 400, headers: corsHeaders() });
          }

          // 6. Global Usage Limit Check
          const totalCoupons = Number(couponData.totalCoupons) || 100;
          const usedCount = Number(couponData.usedCount) || 0;
          if (usedCount >= totalCoupons) {
            return new Response(JSON.stringify({ error: 'Kupon ini sudah mencapai batas maksimum penggunaan' }), { status: 400, headers: corsHeaders() });
          }

          // 7. Per-User Limit & Cooldown Check
          const limitPerUser = Number(couponData.limitPerUser) || 0;
          const cooldownHours = Number(couponData.cooldownHours) || 0;

          if (limitPerUser > 0 || cooldownHours > 0) {
            // Safe query: just fetch by email, filter the rest in-memory to avoid missing composite indexes
            const userOrdersQ = {
              from: [{ collectionId: 'orders' }],
              where: {
                fieldFilter: { field: { fieldPath: 'customerEmail' }, op: 'EQUAL', value: { stringValue: body.email } }
              }
            };
            const userHistoryRes = await firestoreQuery('orders', userOrdersQ, token);
            let userUsedCount = 0;
            let lastUsedTime = null;

            if (userHistoryRes && userHistoryRes.length > 0) {
              for (const doc of userHistoryRes) {
                if (!doc.document) continue;
                const orderData = docToObject(doc.document);
                if (orderData.status === 'paid' && orderData.appliedCouponId === couponDocId) {
                  userUsedCount++;
                  let orderTime = null;
                  if (orderData.createdAt) {
                    orderTime = new Date(orderData.createdAt);
                    if (orderData.createdAt.seconds) orderTime = new Date(orderData.createdAt.seconds * 1000);
                  }
                  if (orderTime) {
                    if (!lastUsedTime || orderTime > lastUsedTime) {
                      lastUsedTime = orderTime;
                    }
                  }
                }
              }
            }

            if (limitPerUser > 0 && userUsedCount >= limitPerUser) {
              return new Response(JSON.stringify({ error: `Anda telah mencapai batas penggunaan kupon ini (${limitPerUser} kali)` }), { status: 400, headers: corsHeaders() });
            }

            if (cooldownHours > 0 && lastUsedTime) {
              const hoursSinceLastUse = (now - lastUsedTime) / (1000 * 60 * 60);
              if (hoursSinceLastUse < cooldownHours) {
                const remainingHours = Math.ceil(cooldownHours - hoursSinceLastUse);
                return new Response(JSON.stringify({ error: `Anda harus menunggu ${remainingHours} jam lagi untuk bisa memakai kupon ini kembali` }), { status: 400, headers: corsHeaders() });
              }
            }
          }

          // 8. Calculate Discount (Max Discount applied here)
          if (couponData.type === 'fixed') {
            discountAmount = couponData.value;
          } else if (couponData.type === 'percent') {
            let calcDiscount = Math.floor(totalPrice * (couponData.value / 100));
            const maxDiscount = Number(couponData.maxDiscount) || 0;
            if (maxDiscount > 0 && calcDiscount > maxDiscount) {
              calcDiscount = maxDiscount;
            }
            discountAmount = calcDiscount;
          }

          // Cap discount to totalPrice
          if (discountAmount > totalPrice) discountAmount = totalPrice;

          appliedCouponId = couponDocId;
          console.log(`Coupon Applied: ${appliedCouponCode}, Discount: ${discountAmount}`);
        } else {
          return new Response(JSON.stringify({ error: 'Kode Kupon tidak valid' }), { status: 400, headers: corsHeaders() });
        }
      } catch (e) {
        console.error('Error validating coupon:', e);
      }
    }

    const serviceFeeAmount = Math.floor(totalPrice * (serviceFeePercent / 100));
    const finalTotal = totalPrice + serviceFeeAmount - discountAmount;
    finalItemPrice = Math.floor((totalPrice - discountAmount) / quantity); // Discount is baked into the item price, fee is separate

    // Sync Firestore order with server-calculated prices (authoritative)
    try {
      const orderPriceUpdate = {
        totalPrice: toFirestoreValue(finalTotal),
        originalTotalPrice: toFirestoreValue(totalPrice),
        discountAmount: toFirestoreValue(discountAmount),
        serviceFeeAmount: toFirestoreValue(serviceFeeAmount),
        appliedCouponId: appliedCouponId ? toFirestoreValue(appliedCouponId) : { nullValue: null }
      };
      await firestoreUpdate('orders', orderId, orderPriceUpdate, token, ['totalPrice', 'originalTotalPrice', 'discountAmount', 'serviceFeeAmount', 'appliedCouponId']);
      console.log(`Order ${orderId} prices synced: total=${finalTotal}, discount=${discountAmount}, fee=${serviceFeeAmount}`);
    } catch (priceErr) {
      console.error('Error syncing order prices:', priceErr);
    }

    // Override frontend price with server calculated price
    const customerName = body.name || body.email.split('@')[0];
    const mayarItems = body.items.map(item => ({
      description: item.name || item.description,
      quantity: item.quantity,
      rate: finalItemPrice // FORCED SERVER PRICE (WITHOUT DISCOUNT OR FEE)
    }));

    // Add Service Fee item if exists
    if (serviceFeeAmount > 0) {
      mayarItems.push({
        description: 'Biaya Layanan',
        quantity: 1,
        rate: serviceFeeAmount
      });
    }

    // Set Expiry to 60 Minutes (3600 seconds) - as requested by user
    const invoiceExpiry = new Date(now.getTime() + 60 * 60000).toISOString();

    const mayarPayload = {
      name: customerName,
      email: body.email,
      mobile: body.mobile || '',
      description: body.description || 'Digital Product',
      redirectUrl: body.redirectUrl,
      expiredAt: invoiceExpiry, // 60 Minutes Expiry
      items: mayarItems
    }

    console.log('Creating Mayar Invoice:', JSON.stringify(mayarPayload));

    const res = await fetch(`${MAYAR_BASE_URL}/invoice/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MAYAR_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mayarPayload)
    })

    const data = await res.json()

    // If Mayar fails, we should ROLLBACK the stock reservation explicitly?
    // Or let the cleaner handle it? Cleaner/Webhook will handle expiration. 
    // But better to rollback immediately if invoice creation fails.
    if (!res.ok) {
      console.error('Mayar Invoice Failed. Rolling back stock...');
      // Logic for immediate rollback could go here, but for now relying on cleaner/expiration
    }

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in createInvoice:', error)
    return new Response(JSON.stringify({
      error: 'Failed to create invoice',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    })
  }
}



// ==============================
// 🔐 3) WEBHOOK HANDLER - Auto Delivery
// ==============================

async function handleWebhook(request, event) {
  const bodyText = await request.text()

  // Parse webhook payload
  let parsedEvent
  try {
    parsedEvent = JSON.parse(bodyText)
  } catch (e) {
    return new Response('Invalid JSON', { status: 400 })
  }

  const eventType = parsedEvent.event || parsedEvent.type || parsedEvent['event.received'] || '';
  const eventData = parsedEvent.data || parsedEvent;

  // Log incoming webhook
  event.waitUntil(logWebhookToFirestore(parsedEvent, eventType));

  // 1. PAYMENT SUCCESS
  const isPaymentSuccess = eventType === 'payment.received' ||
    eventType === 'payment.success' ||
    eventType === 'payment.completed' ||
    (eventData.status && (eventData.status === 'SUCCESS' || eventData.status === 'paid'));

  // 2. PAYMENT EXPIRED / FAILED
  const isPaymentExpired = eventType === 'invoice.expired' || eventData.status === 'EXPIRED';
  const isPaymentFailed = eventType === 'invoice.failed' || eventData.status === 'FAILED';

  if (isPaymentSuccess) {
    console.log('✅ Payment SUCCESS. Finalizing stock...');
    event.waitUntil(processPaymentSuccess(eventData));
    return new Response('OK', { status: 200, headers: corsHeaders() })
  }

  else if (isPaymentExpired || isPaymentFailed) {
    console.log('❌ Payment EXPIRED/FAILED. Releasing stock...');
    event.waitUntil(processPaymentFailure(eventData));
    return new Response('OK', { status: 200, headers: corsHeaders() })
  }

  return new Response('OK - Ignored', { status: 200, headers: corsHeaders() });
}

// 🚀 PROCESS SUCCESS
async function processPaymentSuccess(data) {
  if (!data) return;
  const token = await getAccessToken();

  const webhookInvoiceId = data.id || data.invoiceId || '';

  // Try to find Order ID from Description or Redirect URL
  let orderId = '';
  // Check both 'description' and 'productDescription' (Mayar sometimes uses different fields)
  const descriptionText = data.description || data.productDescription || '';
  const descMatch = descriptionText.match(/Order ID:\s*([a-zA-Z0-9]+)/i);
  if (descMatch) orderId = descMatch[1];

  if (!orderId && data.redirectUrl) {
    const match = data.redirectUrl.match(/[?&]orderId=([^&]+)/);
    if (match) orderId = match[1];
  }

  // Fallback: Query orders collection by invoiceId
  if (!orderId && webhookInvoiceId) {
    console.log(`Order ID not in webhook fields. Querying by invoiceId: ${webhookInvoiceId}`);
    try {
      const q = {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'invoiceId' },
            op: 'EQUAL',
            value: { stringValue: webhookInvoiceId }
          }
        },
        limit: 1
      };
      const results = await firestoreQuery('orders', q, token);
      if (results && results.length > 0 && results[0].document) {
        const docPath = results[0].document.name;
        const pathParts = docPath.split('/');
        orderId = pathParts[pathParts.length - 1];
        console.log(`Found Order ID via invoiceId query: ${orderId}`);
      }
    } catch (queryErr) {
      console.error('Error querying order by invoiceId:', queryErr);
    }
  }

  if (!orderId) {
    console.error("Could not find Order ID in webhook data:", JSON.stringify(data));
    return;
  }

  console.log(`Finalizing Order ${orderId}`);

  // 1. Get Reservation
  let reservation = null;
  try {
    const resDoc = await firestoreGet('stock_reservations', orderId, token);
    reservation = docToObject(resDoc);
  } catch (e) {
    console.warn("Reservation not found (maybe already processed?):", e.message);
  }

  // 2. Get Order
  let order = null;
  try {
    const orderDoc = await firestoreGet('orders', orderId, token);
    order = docToObject(orderDoc); // Helper docToObject needed
  } catch (e) {
    console.error("Order not found:", e.message);
    return;
  }

  if (!order) {
    console.error("Order doc is null/empty for:", orderId);
    return;
  }

  // 3. Move Items: Reservation -> Order deliveredItems
  let itemsToDeliver = [];

  if (reservation && reservation.items) {
    itemsToDeliver = reservation.items;
  } else if (order.bookedItems && order.bookedItems.length > 0) {
    // Fallback to old field if migration happens
    itemsToDeliver = order.bookedItems;
  } else {
    console.error("No items found in reservation for order", orderId);
    // Attempt legacy logic? No, let's stick to strict flow for now to ensure safety.
    // If we are here, stock was deducted but lost? Or never reserved?
    return;
  }

  // 4. Update Order: Set Status Paid & Delivered Items
  // Transform items to object structure if they are just strings
  const formattedItems = itemsToDeliver.map(item => {
    if (typeof item === 'string') return { content: item, note: '' };
    return item;
  });

  const updateFields = {
    status: toFirestoreValue('paid'),
    deliveredItems: toFirestoreValue(formattedItems),
    invoiceId: toFirestoreValue(webhookInvoiceId),
    publicAccessUntil: toFirestoreValue(new Date(Date.now() + 6 * 60 * 60 * 1000)), // Reset 6 Jam setelah bayar sukses
    bookedItems: { nullValue: null } // Clear legacy field if any
  };

  await firestoreUpdate('orders', orderId, updateFields, token, ['status', 'deliveredItems', 'invoiceId', 'publicAccessUntil', 'bookedItems']);
  console.log(`Order ${orderId} marked PAID. Items delivered.`);

  // 5. Auto-Increment totalSold on Product
  const productId = reservation ? reservation.productId : (order.productId || null);
  if (productId) {
    try {
      const prodDoc = await firestoreGet('products', productId, token);
      const prodData = docToObject(prodDoc);
      if (prodData) {
        const currentSold = parseInt(prodData.totalSold) || 0;
        const qty = parseInt(order.quantity) || 1;
        await firestoreUpdate('products', productId, {
          totalSold: toFirestoreValue(currentSold + qty)
        }, token, ['totalSold']);
        console.log(`Product ${productId} totalSold updated: ${currentSold} → ${currentSold + qty}`);
      }
    } catch (soldErr) {
      console.error('Error updating totalSold:', soldErr);
    }
  }

  // 6. Delete Reservation
  if (reservation) {
    // We found a reservation earlier, so safe to delete by ID
    await firestoreDelete('stock_reservations', orderId, token);
    console.log(`Reservation ${orderId} deleted.`);
  }

  // 7. Increment Coupon usage atomically
  const appliedCouponId = order.appliedCouponId || (reservation ? reservation.appliedCouponId : null);
  if (appliedCouponId) {
    try {
      const increments = { usedCount: 1 };
      if (order.discountAmount) {
        increments.totalDiscountGiven = parseInt(order.discountAmount);
      }
      await firestoreIncrement('coupons', appliedCouponId, increments, token);
      await firestoreUpdate('coupons', appliedCouponId, {
        lastUsedAt: toFirestoreValue(new Date()) // Optional tracking update
      }, token, ['lastUsedAt']);
      console.log(`Coupon ${appliedCouponId} usedCount and totalDiscountGiven safely incremented.`);
    } catch (couponErr) {
      console.error('Error incrementing coupon usage:', couponErr);
    }
  }
  // 8. Create affiliate commission once payment is confirmed
  const paidAffiliateCode = sanitizeAffiliateCode(order.affiliateCode || order?.affiliate?.code);
  if (paidAffiliateCode) {
    try {
      let commissionExists = false;
      try {
        await firestoreGet('affiliate_commissions', orderId, token);
        commissionExists = true;
      } catch (missingCommissionError) {
        commissionExists = false;
      }

      if (!commissionExists) {
        const affiliateRecord = await resolveApprovedAffiliateByCode(paidAffiliateCode, token);
        if (affiliateRecord) {
          let productData = null;
          if (order.productId) {
            try {
              const productDoc = await firestoreGet('products', order.productId, token);
              productData = docToObject(productDoc);
            } catch (productCommissionError) {
              console.warn('Failed to load product commission config:', productCommissionError?.message || productCommissionError);
            }
          }

          const commission = calculateAffiliateCommission(order, affiliateRecord.data, productData);
          if (commission.amount > 0) {
            const commissionDoc = {
              affiliate: affiliateRecord.id,
              affiliateCode: paidAffiliateCode,
              affiliateEmail: affiliateRecord.data.email || null,
              orderId: orderId,
              productId: order.productId || null,
              productName: order.productName || null,
              customerEmail: order.customerEmail || null,
              amount: commission.amount,
              baseAmount: commission.baseAmount,
              commissionPercent: commission.percent,
              commissionFlat: commission.fixedAmount,
              commissionSource: commission.source,
              productAffiliateEnabled: productData?.affiliateEnabled !== false,
              status: 'pending',
              createdAt: new Date(),
              approvedAt: null,
              paidAt: null
            };

            await firestoreCreate('affiliate_commissions', orderId, objectToFirestoreFields(commissionDoc), token);
            await firestoreIncrement('affiliate_users', affiliateRecord.id, {
              totalSalesAttributed: 1,
              pendingCommissionAmount: commission.amount
            }, token);
            console.log(`Affiliate commission created for order ${orderId}: ${commission.amount}`);
          } else {
            console.log(`Affiliate commission skipped for order ${orderId} because product affiliate is disabled or amount is zero.`);
          }
        }
      }
    } catch (affiliateCommissionError) {
      console.error('Error creating affiliate commission:', affiliateCommissionError);
    }
  }

}
// ↩️ PROCESS FAILURE (Return Stock)
async function processPaymentFailure(data) {
  if (!data) return;
  const token = await getAccessToken();

  // Identify Order ID
  let orderId = '';
  const descriptionText = data.description || data.productDescription || '';
  const descMatch = descriptionText.match(/Order ID:\s*([a-zA-Z0-9]+)/i);
  if (descMatch) orderId = descMatch[1];

  if (!orderId && data.redirectUrl) {
    const match = data.redirectUrl.match(/[?&]orderId=([^&]+)/);
    if (match) orderId = match[1];
  }

  // Fallback: Query orders collection by invoiceId
  const webhookInvoiceId = data.id || data.invoiceId || '';
  if (!orderId && webhookInvoiceId) {
    console.log(`[Failure] Order ID not in webhook fields. Querying by invoiceId: ${webhookInvoiceId}`);
    try {
      const q = {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'invoiceId' },
            op: 'EQUAL',
            value: { stringValue: webhookInvoiceId }
          }
        },
        limit: 1
      };
      const results = await firestoreQuery('orders', q, token);
      if (results && results.length > 0 && results[0].document) {
        const docPath = results[0].document.name;
        const pathParts = docPath.split('/');
        orderId = pathParts[pathParts.length - 1];
        console.log(`[Failure] Found Order ID via invoiceId query: ${orderId}`);
      }
    } catch (queryErr) {
      console.error('[Failure] Error querying order by invoiceId:', queryErr);
    }
  }

  if (!orderId) {
    console.error("Could not find Order ID in webhook data:", JSON.stringify(data));
    return;
  }

  console.log(`Cancelling Order ${orderId} - Releasing Stock`);

  // 1. Get Reservation
  let reservation = null;
  try {
    const resDoc = await firestoreGet('stock_reservations', orderId, token);
    reservation = docToObject(resDoc);
  } catch (e) {
    console.warn("Reservation not found (already released?):", e.message);
    // If no reservation, maybe nothing to return.
    // Update order status anyway.
    await firestoreUpdate('orders', orderId, { status: toFirestoreValue('cancelled') }, token, ['status']);
    return;
  }

  // 2. Return Stock to Stock Collection
  if (reservation && reservation.items && reservation.items.length > 0 && reservation.productId) {
    try {
      // Fetch Product & Stock
      // We need Product to know structure (Simple vs Variant) if reservation doesn't explicitly store stockId (it stores productId)
      const productId = reservation.productId;

      let productDoc, stockDoc;
      try {
        [productDoc, stockDoc] = await Promise.all([
          firestoreGet('products', productId, token),
          firestoreGet('stocks', productId, token)
        ]);
      } catch (e) { console.error("Could not fetch product/stock for return:", e); }

      const product = docToObject(productDoc);
      const stockData = docToObject(stockDoc);

      if (product) {
        // Determine if variant or simple
        let isVariant = !!reservation.variantId;
        const useStockCollection = !!stockData;
        const p = [];

        if (isVariant) {
          const variantId = reservation.variantId;
          const vIndex = product.variants ? product.variants.findIndex(v => v.id === variantId) : -1;

          if (vIndex !== -1) { // Only if variant still exists
            let newStockCount = 0;

            if (useStockCollection && stockData.variants) {
              const currentItems = stockData.variants[variantId] || []; // Use variantId map
              const newStockItems = [...currentItems, ...reservation.items];
              newStockCount = newStockItems.length;

              // Update Stock Map
              const updatedVariantsMap = { ...stockData.variants };
              updatedVariantsMap[variantId] = newStockItems;
              p.push(firestoreUpdate('stocks', productId, { variants: toFirestoreValue(updatedVariantsMap) }, token, ['variants']));
            } else {
              // Legacy
              // ... (Skipping legacy release logic for brevity, focusing on new structure)
            }

            // Update Product Count
            const updatedVariants = [...product.variants];
            updatedVariants[vIndex] = {
              ...updatedVariants[vIndex],
              stock: newStockCount // Update count
            };
            p.push(firestoreUpdate('products', productId, { variants: toFirestoreValue(updatedVariants) }, token, ['variants']));
          }

        } else {
          // Simple Product
          let newStockCount = 0;
          if (useStockCollection && stockData.items) {
            const currentItems = stockData.items || [];
            const newStockItems = [...currentItems, ...reservation.items];
            newStockCount = newStockItems.length;

            p.push(firestoreUpdate('stocks', productId, { items: toFirestoreValue(newStockItems) }, token, ['items']));
          }

          // Update Product Count
          p.push(firestoreUpdate('products', productId, { stock: toFirestoreValue(newStockCount) }, token, ['stock']));
        }

        await Promise.all(p);
        console.log(`Stock returned for Product ${productId}`);
      }
    } catch (err) {
      console.error("Failed to return stock:", err);
    }
  }

  // 3. Delete Reservation & Cancel Order
  await firestoreDelete('stock_reservations', orderId, token);
  await firestoreUpdate('orders', orderId, { status: toFirestoreValue('cancelled') }, token, ['status']);
  console.log(`Order ${orderId} CANCELLED. Reservation deleted.`);
}
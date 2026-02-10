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
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT environment variable');
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

// Firestore REST: Query collection
async function firestoreQuery(collectionPath, structuredQuery, token) {
  // runQuery must be called on the PARENT path, not on the collection itself
  // The collection is already specified in structuredQuery.from
  const url = `${FIRESTORE_BASE}:runQuery`;
  console.log('Firestore runQuery URL:', url);
  console.log('Firestore runQuery body:', JSON.stringify({ structuredQuery }));

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
  console.log('Firestore query raw result count:', Array.isArray(result) ? result.length : 'not-array');
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

  if (request.method === 'POST' && url.pathname === '/create-invoice') {
    return createInvoice(request)
  }

  if (request.method === 'POST' && url.pathname === '/create-coupon') {
    return createCoupon(request)
  }

  if (request.method === 'POST' && url.pathname === '/webhook') {
    return handleWebhook(request, event)
  }

  // Test endpoint - verify webhook URL is reachable AND functional
  if (url.pathname === '/webhook-test') {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      checks: {}
    };

    try {
      // 1. Check Env
      diagnostics.checks.env = {
        MAYAR_API_KEY: typeof MAYAR_API_KEY !== 'undefined' ? 'OK' : 'MISSING',
        MAYAR_BASE_URL: typeof MAYAR_BASE_URL !== 'undefined' ? 'OK' : 'MISSING',
        FIREBASE_SERVICE_ACCOUNT: typeof FIREBASE_SERVICE_ACCOUNT !== 'undefined' ? 'OK' : 'MISSING'
      };

      if (diagnostics.checks.env.FIREBASE_SERVICE_ACCOUNT !== 'OK') {
        throw new Error('Service Account missing');
      }

      // 2. Test Auth
      const t0 = Date.now();
      const token = await getAccessToken();
      const t1 = Date.now();
      diagnostics.checks.auth = { status: 'OK', latencyMs: t1 - t0, tokenPrefix: token.substring(0, 10) + '...' };

      // 3. Test Firestore
      const t2 = Date.now();
      // Simple query: get 1 order
      const queryResult = await firestoreQuery('orders', {
        from: [{ collectionId: 'orders' }],
        limit: 1
      }, token);
      const t3 = Date.now();
      diagnostics.checks.firestore = {
        status: 'OK',
        latencyMs: t3 - t2,
        foundOrders: Array.isArray(queryResult) ? queryResult.length : 0
      };

      return new Response(JSON.stringify({
        ok: true,
        message: 'System diagnostics passed',
        diagnostics
      }, null, 2), {
        status: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      })

    } catch (error) {
      return new Response(JSON.stringify({
        ok: false,
        message: 'System diagnostics FAILED',
        error: error.message,
        stack: error.stack,
        diagnostics
      }, null, 2), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      })
    }
  }

  // Debug Endpoint: View last 10 webhook logs
  if (url.pathname === '/check-logs') {
    try {
      const token = await getAccessToken();

      // Query logs (auto-indexed single field sorting should work)
      // If index missing, it might fail, so we might need to fetch without sort and sort in memory
      let logs = [];
      try {
        logs = await firestoreQuery('webhook_logs', {
          from: [{ collectionId: 'webhook_logs' }],
          orderBy: [{ field: { fieldPath: 'receivedAt' }, direction: 'DESCENDING' }],
          limit: 10
        }, token);
      } catch (e) {
        // Fallback if index error: fetch generic and sort
        console.log('Index error on logs, fetching unsorted');
        logs = await firestoreQuery('webhook_logs', {
          from: [{ collectionId: 'webhook_logs' }],
          limit: 15
        }, token);
        // Sort in memory
        logs.sort((a, b) => {
          const tA = a.document.fields?.receivedAt?.timestampValue || '';
          const tB = b.document.fields?.receivedAt?.timestampValue || '';
          return tB.localeCompare(tA);
        });
      }

      // Format for display
      const formattedLogs = logs.map(l => {
        const d = docToObject(l.document);
        return {
          id: l.document.name.split('/').pop(),
          receivedAt: d.receivedAt,
          status: d.status,
          matchedOrderId: d.matchedOrderId,
          payload: d.payload ? JSON.parse(d.payload) : null
        };
      });

      return new Response(JSON.stringify({
        ok: true,
        count: formattedLogs.length,
        logs: formattedLogs
      }, null, 2), {
        status: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: corsHeaders()
      });
    }
  }

  return new Response('Not Found', {
    status: 404,
    headers: corsHeaders()
  })
}

// 🧾 1) CREATE INVOICE - Mayar Integration
async function createInvoice(request) {
  try {
    // Check environment variables first
    if (typeof MAYAR_API_KEY === 'undefined' || !MAYAR_API_KEY) {
      console.error('MAYAR_API_KEY is not set')
      return new Response(JSON.stringify({
        error: 'Server configuration error',
        details: 'MAYAR_API_KEY environment variable is not set. Please configure it in Cloudflare Workers settings.'
      }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      })
    }

    if (typeof MAYAR_BASE_URL === 'undefined' || !MAYAR_BASE_URL) {
      console.error('MAYAR_BASE_URL is not set')
      return new Response(JSON.stringify({
        error: 'Server configuration error',
        details: 'MAYAR_BASE_URL environment variable is not set. Please configure it in Cloudflare Workers settings.'
      }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      })
    }

    const body = await parseJSON(request)

    // Validate required fields
    if (!body || !body.email) {
      return new Response(JSON.stringify({
        error: 'Invalid payload. Required: email, mobile, description, items'
      }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      })
    }

    // Validate items array
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return new Response(JSON.stringify({
        error: 'Items array is required with at least one item'
      }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      })
    }

    // Transform items to Mayar API format
    // Frontend sends: {name, quantity, price}
    // Mayar expects: {description, quantity, rate}
    const customerName = body.name || body.email.split('@')[0];
    const mayarItems = body.items.map(item => ({
      description: item.name || item.description,
      quantity: item.quantity,
      rate: item.price || item.rate
    }));

    // Build Mayar API request according to documentation
    const mayarPayload = {
      name: customerName, // Customer name
      email: body.email,
      mobile: body.mobile || '',
      description: body.description || 'Digital Product Purchase',
      redirectUrl: body.redirectUrl || 'https://store.arufkuy.me/detail-order.html', // Redirect to order detail after payment
      expiredAt: body.expiredAt || new Date(Date.now() + 24 * 3600e3).toISOString(), // 24 hours
      items: mayarItems
    }

    console.log('Calling Mayar API:', MAYAR_BASE_URL + '/invoice/create')
    console.log('Payload:', JSON.stringify(mayarPayload))

    // Call Mayar API - Correct endpoint from documentation
    const res = await fetch(`${MAYAR_BASE_URL}/invoice/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MAYAR_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mayarPayload)
    })

    console.log('Mayar API response status:', res.status)

    const data = await res.json()
    console.log('Mayar API response data:', JSON.stringify(data))

    // Return Mayar response with CORS headers
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error in createInvoice:', error)
    return new Response(JSON.stringify({
      error: 'Failed to create invoice',
      details: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    })
  }
}

// 🎟️ 2) CREATE COUPON - Mayar Integration
async function createCoupon(request) {
  try {
    if (typeof MAYAR_API_KEY === 'undefined' || !MAYAR_API_KEY) {
      return new Response(JSON.stringify({
        error: 'Server configuration error',
        details: 'MAYAR_API_KEY not set'
      }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      })
    }

    if (typeof MAYAR_BASE_URL === 'undefined' || !MAYAR_BASE_URL) {
      return new Response(JSON.stringify({
        error: 'Server configuration error',
        details: 'MAYAR_BASE_URL not set'
      }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      })
    }

    const body = await parseJSON(request)

    if (!body || !body.discount) {
      return new Response(JSON.stringify({
        error: 'Invalid payload. Required: discount array'
      }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      })
    }

    console.log('Creating coupon in Mayar:', JSON.stringify(body))

    // Call Mayar API (correct endpoint: /coupon/create)
    const res = await fetch(`${MAYAR_BASE_URL}/coupon/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MAYAR_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    console.log('Mayar coupon creation response status:', res.status)

    const data = await res.json()
    console.log('Mayar coupon creation response data:', JSON.stringify(data))

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error in createCoupon:', error)
    return new Response(JSON.stringify({
      error: 'Failed to create coupon',
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

  // === RAW WEBHOOK LOGGING (for debugging) ===
  console.log('=== WEBHOOK RECEIVED ===');
  console.log('Raw body:', bodyText);

  // Parse webhook payload
  let parsedEvent
  try {
    parsedEvent = JSON.parse(bodyText)
  } catch (e) {
    console.error('Failed to parse webhook JSON:', e.message);
    return new Response('Invalid JSON', { status: 400 })
  }

  // Detect event type from multiple possible field names
  // Mayar may use: event.event, event.type, or event['event.received']
  const eventType = parsedEvent.event || parsedEvent.type || parsedEvent['event.received'] || '';
  console.log('Detected event type:', eventType);

  // Extract data - could be top-level or nested under 'data'
  const eventData = parsedEvent.data || parsedEvent;

  // Handle payment.received event from Mayar
  // Also accept variations like payment.success, payment.completed
  const isPaymentEvent = eventType === 'payment.received' ||
    eventType === 'payment.success' ||
    eventType === 'payment.completed' ||
    (eventData.status && (eventData.status === 'SUCCESS' || eventData.status === true || eventData.status === 'paid'));

  if (parsedEvent && isPaymentEvent) {
    console.log('✅ Payment event detected. Scheduling auto-delivery in background...');

    // Process in background using event.waitUntil
    // This allows returning 200 OK immediately to Mayar
    event.waitUntil(
      processPaymentReceived(eventData)
        .then(() => console.log('Background processing finished successfully'))
        .catch(err => console.error('Background processing FAILED:', err))
    );

    return new Response('OK', {
      status: 200,
      headers: corsHeaders()
    })
  } else {
    console.log('ℹ️ Non-payment event or unrecognized format, skipping. Event type:', eventType);
    return new Response('OK - Ignored', { // Return 200 to acknowledge receipt even if ignored
      status: 200,
      headers: corsHeaders()
    })
  }
}

// 🚀 Auto-delivery: Process payment.received webhook
async function processPaymentReceived(data) {
  if (!data) throw new Error('No data in webhook event');

  // Check if FIREBASE_SERVICE_ACCOUNT is configured
  if (typeof FIREBASE_SERVICE_ACCOUNT === 'undefined' || !FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
  }

  // Extract fields with multiple possible field name patterns (camelCase + snake_case)
  const webhookInvoiceId = data.id || data.invoiceId || data.invoice_id || data.transactionId || data.transaction_id || '';
  const webhookEmail = data.customerEmail || data.customer_email || data.email || data.buyerEmail || data.buyer_email || '';
  const webhookAmount = data.amount || data.total || data.subtotal || data.grandTotal || data.grand_total || 0;
  const webhookStatus = data.status;
  const webhookMobile = data.mobile || data.customerMobile || data.customer_mobile || data.phone || '';
  const webhookDescription = data.description || data.productName || data.product_name || '';
  const webhookRedirectUrl = data.redirectUrl || data.redirect_url || '';

  // 1. Try to extract Order ID from Description (Most Robust - Silver Bullet)
  // Format: "Order ID: XYZ - Product Name"
  let webhookOrderId = '';
  const descMatch = webhookDescription.match(/Order ID:\s*([a-zA-Z0-9]+)/i);
  if (descMatch && descMatch[1]) {
    webhookOrderId = descMatch[1];
    console.log('🎯 Extracted Order ID from Description:', webhookOrderId);
  }

  // 2. Fallback: Try to extract Order ID from redirect URL
  // URL format: .../detail-order.html?orderId=XYZ
  if (!webhookOrderId && webhookRedirectUrl) {
    const match = webhookRedirectUrl.match(/[?&]orderId=([^&]+)/);
    if (match && match[1]) {
      webhookOrderId = match[1];
      console.log('🎯 Extracted Order ID from Redirect URL:', webhookOrderId);
    }
  }

  console.log('=== PROCESSING PAYMENT ===');
  console.log('Invoice ID:', webhookInvoiceId);
  console.log('Email:', webhookEmail);
  console.log('Amount:', webhookAmount);
  console.log('Target Order ID:', webhookOrderId);
  console.log('Status:', webhookStatus);
  console.log('Mobile:', webhookMobile);
  console.log('Description:', webhookDescription);
  console.log('All data fields:', JSON.stringify(data));

  // Step 1: Get Firestore access token
  const accessToken = await getAccessToken();
  console.log('Got Firestore access token');

  // Step 1.5: Log Webhook to Firestore for Debugging
  try {
    await logWebhookToFirestore(data, webhookOrderId, accessToken);
  } catch (logError) {
    console.error('Failed to log webhook to Firestore:', logError);
    // Continue processing even if logging fails
  }

  // Step 2: Find matching pending order
  // Query orders with status "pending" — NO orderBy to avoid composite index requirement
  let queryResult;
  try {
    queryResult = await firestoreQuery('orders', {
      from: [{ collectionId: 'orders' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'EQUAL',
          value: { stringValue: 'pending' }
        }
      },
      limit: 100
    }, accessToken);
    console.log('Firestore query returned', queryResult.length, 'results');

    // CRITICAL: Sort in-memory because we removed database-level orderBy
    // Sort by createdAt descending (newest first)
    queryResult.sort((a, b) => {
      const timeA = a.document.createTime ? new Date(a.document.createTime).getTime() : 0;
      const timeB = b.document.createTime ? new Date(b.document.createTime).getTime() : 0;
      // Also check fields.createdAt if available
      const fieldsTimeA = a.document.fields?.createdAt?.timestampValue ? new Date(a.document.fields.createdAt.timestampValue).getTime() : 0;
      const fieldsTimeB = b.document.fields?.createdAt?.timestampValue ? new Date(b.document.fields.createdAt.timestampValue).getTime() : 0;

      const valA = Math.max(timeA, fieldsTimeA);
      const valB = Math.max(timeB, fieldsTimeB);
      return valB - valA; // Descending
    });

  } catch (queryError) {
    console.error('❌ Firestore query FAILED:', queryError.message);
    console.error('This is likely a permissions or index issue.');
    throw queryError;
  }

  // Find matching order by email and/or amount
  let matchedOrderId = null;
  let matchedOrderData = null;
  let matchScore = 0; // Track best match quality

  console.log(`Found ${queryResult.length} pending orders, searching for match...`);

  for (const result of queryResult) {
    if (!result.document) continue;

    const orderData = docToObject(result.document);
    if (!orderData) continue;

    // Extract doc ID from document name
    const docName = result.document.name;
    const docId = docName.split('/').pop();

    console.log(`  Checking order ${docId}: email=${orderData.customerEmail}, amount=${orderData.totalPrice}`);

    // Match by Explicit Order ID (Best Match)
    if (webhookOrderId && docId === webhookOrderId) {
      console.log(`  🎯 EXACT MATCH by Order ID: ${docId}`);
      matchedOrderId = docId;
      matchedOrderData = orderData;
      break; // Stop searching immediately
    }

    // Match by email (primary match)
    const emailMatch = orderData.customerEmail &&
      webhookEmail &&
      orderData.customerEmail.toLowerCase() === webhookEmail.toLowerCase();

    // Match by amount (secondary confirmation)
    const amountMatch = orderData.totalPrice && webhookAmount &&
      Math.abs(orderData.totalPrice - webhookAmount) < 100; // Allow small rounding difference

    // Match by phone (fallback)
    const phoneMatch = orderData.customerPhone && webhookMobile &&
      (orderData.customerPhone.replace(/\D/g, '').endsWith(webhookMobile.replace(/\D/g, '').slice(-8)) ||
        webhookMobile.replace(/\D/g, '').endsWith(orderData.customerPhone.replace(/\D/g, '').slice(-8)));

    let currentScore = 0;
    if (emailMatch && amountMatch) currentScore = 3;
    else if (emailMatch) currentScore = 2;
    else if (phoneMatch && amountMatch) currentScore = 2;
    else if (amountMatch) currentScore = 1;
    else if (phoneMatch) currentScore = 1;

    if (currentScore > matchScore) {
      matchScore = currentScore;
      matchedOrderId = docId;
      matchedOrderData = orderData;
      console.log(`  ✅ Best match so far: ${docId} (score: ${currentScore}, email:${emailMatch}, amount:${amountMatch}, phone:${phoneMatch})`);

      if (currentScore >= 3) break; // Perfect match, stop searching
    }
  }

  // Last resort: if no match by email/amount/phone, take the most recent pending order
  if (!matchedOrderId && queryResult.length > 0) {
    for (const result of queryResult) {
      if (!result.document) continue;
      const orderData = docToObject(result.document);
      if (!orderData) continue;
      const docId = result.document.name.split('/').pop();
      matchedOrderId = docId;
      matchedOrderData = orderData;
      console.log(`  ⚠️ No match found by email/amount/phone. Using most recent pending order as fallback: ${docId}`);
      break;
    }
  }

  if (!matchedOrderId || !matchedOrderData) {
    console.warn('❌ No pending orders found at all. Webhook data:', { webhookEmail, webhookAmount, webhookMobile });
    return;
  }

  console.log('Processing order:', matchedOrderId, 'Product:', matchedOrderData.productName);

  // Step 3: Get product document to read stock
  const productId = matchedOrderData.productId;
  if (!productId) {
    console.warn('Order has no productId, skipping auto-delivery');
    // Still update status
    await firestoreUpdate('orders', matchedOrderId, {
      status: toFirestoreValue('paid'),
      invoiceId: toFirestoreValue(webhookInvoiceId || ''),
      paidAt: { timestampValue: new Date().toISOString() }
    }, accessToken, ['status', 'invoiceId', 'paidAt']);
    return;
  }

  const productDoc = await firestoreGet('products', productId, accessToken);
  const productData = docToObject(productDoc);

  if (!productData) {
    console.warn('Product not found:', productId);
    await firestoreUpdate('orders', matchedOrderId, {
      status: toFirestoreValue('paid'),
      invoiceId: toFirestoreValue(webhookInvoiceId || ''),
      paidAt: { timestampValue: new Date().toISOString() }
    }, accessToken, ['status', 'invoiceId', 'paidAt']);
    return;
  }

  // Step 4: Pick stock items
  const quantity = matchedOrderData.quantity || 1;
  const variantId = matchedOrderData.variantId;
  let deliveredItems = [];
  let updatedProductFields = {};
  let productUpdateMask = [];

  if (variantId && productData.hasVariants && Array.isArray(productData.variants)) {
    // ---- VARIANT PRODUCT ----
    console.log('Variant product, looking for variant:', variantId);

    const variantIndex = productData.variants.findIndex(v => v.id === variantId);
    if (variantIndex === -1) {
      console.warn('Variant not found:', variantId);
    } else {
      const variant = productData.variants[variantIndex];
      const stockItems = variant.stockItems || [];

      if (stockItems.length === 0) {
        console.warn('Variant stock empty for:', variantId);
      } else {
        // Pick N items FIFO
        const pickCount = Math.min(quantity, stockItems.length);
        const pickedItems = stockItems.slice(0, pickCount);
        const remainingItems = stockItems.slice(pickCount);

        deliveredItems = pickedItems.map(item => ({
          content: item.content || '',
          note: item.note || ''
        }));

        // Update the variant's stockItems in the full variants array
        const updatedVariants = [...productData.variants];
        updatedVariants[variantIndex] = {
          ...updatedVariants[variantIndex],
          stockItems: remainingItems
        };

        updatedProductFields.variants = toFirestoreValue(updatedVariants);
        productUpdateMask.push('variants');

        console.log(`Picked ${pickCount} items from variant ${variantId}, ${remainingItems.length} remaining`);
      }
    }
  } else {
    // ---- SIMPLE PRODUCT ----
    const stockItems = productData.stockItems || [];

    if (stockItems.length === 0) {
      console.warn('Product stock empty for:', productId);
    } else {
      // Pick N items FIFO
      const pickCount = Math.min(quantity, stockItems.length);
      const pickedItems = stockItems.slice(0, pickCount);
      const remainingItems = stockItems.slice(pickCount);

      deliveredItems = pickedItems.map(item => ({
        content: typeof item === 'string' ? item : (item.content || ''),
        note: typeof item === 'string' ? '' : (item.note || '')
      }));

      updatedProductFields.stockItems = toFirestoreValue(remainingItems);
      productUpdateMask.push('stockItems');

      console.log(`Picked ${pickCount} items from product, ${remainingItems.length} remaining`);
    }
  }

  // Step 5: Update product (remove used stock)
  if (productUpdateMask.length > 0) {
    await firestoreUpdate('products', productId, updatedProductFields, accessToken, productUpdateMask);
    console.log('Product stock updated');
  }

  // Step 6: Update order (status + deliveredItems + invoiceId)
  const orderUpdateFields = {
    status: toFirestoreValue('paid'),
    invoiceId: toFirestoreValue(webhookInvoiceId || ''),
    paidAt: { timestampValue: new Date().toISOString() }
  };
  const orderUpdateMask = ['status', 'invoiceId', 'paidAt'];

  if (deliveredItems.length > 0) {
    orderUpdateFields.deliveredItems = toFirestoreValue(deliveredItems);
    orderUpdateMask.push('deliveredItems');
  }

  await firestoreUpdate('orders', matchedOrderId, orderUpdateFields, accessToken, orderUpdateMask);
  console.log(`✅ Order ${matchedOrderId} auto-delivered! ${deliveredItems.length} items sent.`);
}
// Helper: Log webhook payload to Firestore for debugging
async function logWebhookToFirestore(data, matchedOrderId, token) {
  const logId = `webhook_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const logData = {
    receivedAt: { timestampValue: new Date().toISOString() },
    payload: { stringValue: JSON.stringify(data) },
    matchedOrderId: { stringValue: matchedOrderId || 'NONE' },
    status: { stringValue: 'processed' }
  };

  // Use firestoreUpdate logic (PATCH) but usually better to create via commit or runQuery?
  // firestoreUpdate helper uses PATCH which works fine for creating if document doesn't exist? 
  // REST API PATCH creates document if missing by default? Yes for updateMask?
  // Let's use custom fetch for CREATE (commit) or just PATCH with no mask to create/overwrite

  // Simplest: Use PATCH on doc path
  await firestoreUpdate('webhook_logs', logId, logData, token, []);
  console.log('Webhook logged to Firestore:', logId);
}

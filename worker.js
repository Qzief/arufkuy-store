addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
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

// Handler utama
async function handleRequest(request) {
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
    return handleWebhook(request)
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

// 🔐 3) WEBHOOK HANDLER - Mayar Events
async function handleWebhook(request) {
  const bodyText = await request.text()

  // Parse webhook payload
  let event
  try {
    event = JSON.parse(bodyText)
  } catch (e) {
    return new Response('Invalid JSON', { status: 400 })
  }

  // Handle payment.received event from Mayar
  if (event && event.event === 'payment.received') {
    const invoiceId = event.data?.id
    const transactionId = event.data?.transaction_id
    const status = event.data?.status

    // TODO: Implement your business logic here
    // Examples:
    // - Update order status in Firestore
    // - Deliver digital product to customer
    // - Send email confirmation
    // - Reduce stock count

    console.log('Payment received:', {
      invoiceId,
      transactionId,
      status
    })
  }

  return new Response('OK', {
    status: 200,
    headers: corsHeaders()
  })
}

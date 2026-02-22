export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);

    // Serve detail-product.html content while keeping the /p/slug URL intact in the browser
    const assetUrl = new URL('/detail-product.html', url.origin);

    const response = await fetch(assetUrl, {
        headers: request.headers,
    });

    // Return the response with a new Headers object to avoid immutability issues
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-Slug-Route', 'true');

    return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
    });
}

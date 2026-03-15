# Linked Files Maintenance Guide: Product Details & Slug Routing

> [!IMPORTANT]
> **CRITICAL:** `detail-product.html` and `404.html` contain DUPLICATE LOGIC. 
> Any change to one **MUST** be applied to the other.

## The Relationship

- **`detail-product.html`**: Handles product requests via ID parameter (e.g., `?id=...`).
- **`404.html`**: Handles product requests via URL Slug (e.g., `/p/nama-produk`) on Firebase Hosting.
  - Since Firebase Hosting returns 404 for unknown paths (like `/p/...`), the `404.html` file acts as a Single Page Application (SPA) router to fetch the product by slug.

## Critical Sync Points

If you modify any of the following in `detail-product.html`, you **MUST** copy the changes to `404.html`:

1.  **Order Payload Construction**:
    - The `order-form` submit handler.
    - Specifically the `payload` object sent to `create-invoice`.
    - **Logic:** `orderId`, `productId`, `items` structure, and stock reservation logic.

2.  **`loadProduct()` Function**:
    - Logic for fetching data (Slug vs ID).
    - Setting the global `productId` variable.
    - **Crucial:** Setting `document.getElementById('order-form').dataset.productId` for backup verification.

3.  **Stock & Price Calculation**:
    - `updateTotalPrice()`
    - `selectVariant()`
    - Coupon calculation logic.

4.  **Version Logging**:
    - When debugging, ensure both files log their version (e.g., `VERSION: V4` vs `VERSION: V4 (404)`) to easily identify which file is being loaded by the browser.

## Checklist for Future Updates

- [ ] Made changes to `detail-product.html`?
- [ ] copied exact same logic to `404.html`?
- [ ] Updated version string in both files?
- [ ] Tested both `?id=` URL and `/p/slug` URL?

## Common Issues

- **"Invalid Payload" / Missing Product ID**: Usually means `404.html` has outdated payload construction logic compared to `detail-product.html`.
- **Slug URL errors but ID URL works**: `404.html` is out of sync.

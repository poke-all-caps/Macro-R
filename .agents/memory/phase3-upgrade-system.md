---
    name: Phase 3 tiered upgrade/payments system
    description: Where the tier upgrade + admin approval + config flow lives, and a security pitfall to avoid re-adding
    ---

    The tiered upgrade system (trial -> basic/premium, canInvite unlock) spans:
    - api-server routes/config.ts (public GET /config, admin GET/PUT /admin/config for tiers+paymentMethods JSON blobs)
    - api-server routes/upgrades.ts (POST /upgrade/request, GET /upgrade/status, admin GET/PUT /admin/upgrades)
    - api-server routes/admin.ts inline dashboard HTML/JS — has "Upgrade Requests" approve/reject UI and a raw JSON tier/payment-method editor
    - mobile app/upgrade.tsx — trial users pick a tier and submit transactionId/receiptLink

    **Why:** admin.ts renders user-submitted `receiptLink` values as clickable links in the admin dashboard. HTML-escaping alone does not block dangerous URL schemes (javascript:, data:) — only escaping quotes/tags, not the scheme itself.
    **How to apply:** any admin UI that turns user-submitted URLs into `<a href>` must validate the scheme is http/https (see `safeHttpUrl` in admin.ts) before making it clickable, and add rel="noopener noreferrer". Never trust esc() alone for URL contexts.
    
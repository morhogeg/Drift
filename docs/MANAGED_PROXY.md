# Managed-key proxy + Pro tier (ACTION_PLAN item 8)

Removes the BYOK onboarding cliff: users stream through Drift's own server using
a server-held key instead of pasting their own. A free daily allowance on a
cheap model converts to a ~$8/mo Pro subscription.

**This is a high-effort, server-side, billing-bearing feature.** It depends on
item 2 (cloud accounts — for the verified user identity the proxy authorizes
against) and item 4 (CI). What ships in this branch is the **client/server
contract + a reference proxy**, not a production service.

## What's in the repo now

- `server/proxy.mjs` — reference Node proxy. Streams Gemini (`:streamGenerateContent?alt=sse`) and OpenRouter (`/chat/completions stream`), re-emitting a uniform `data: {delta}` / `data: {done:true}` SSE. In-memory quota, **unverified** token decode (shape only).
- `src/services/proxyClient.ts` — client. `streamViaProxy()` async-generates text deltas; `QuotaExceededError` on HTTP 402; inert unless `VITE_PROXY_URL` is set.

The contract is deliberately the same SSE-delta shape the existing `gemini.ts`/`openrouter.ts` streaming consumers already use, so wiring it into the chat send path is a localized change once the server is real.

## To productionize (owner / server work)

1. **Auth** — verify the Firebase ID token with `firebase-admin` (`verifyIdToken`); read tier from a custom claim or `users/{uid}/billing`. Replace `decodeUid()`.
2. **Quota store** — durable, per-uid, reset on billing anchor (Firestore counter or Redis). Replace the in-memory `usage` Map. Track per-model cost, not just request count.
3. **Billing** — App Store auto-renewable subscription (StoreKit 2) + web checkout (Stripe). Verify receipts/webhooks server-side; set the `pro` claim on entitlement changes.
4. **Abuse controls** — per-IP and per-uid rate limits, max tokens/request, request-size caps, a model allowlist.
5. **Secrets/deploy** — keys in the host's secret manager (never in the bundle); deploy as a Cloud Run / Fly / Workers service; lock CORS to the app origins.
6. **Client wiring** — in the chat send path, prefer `streamViaProxy()` when `isProxyEnabled() && signed-in`, falling back to BYOK; on `QuotaExceededError` show the existing-style upgrade sheet.

## Verify (once built)

- Signed-in free user streams a reply with no personal key set; the (N+1)th request past the daily cap returns 402 and the upgrade prompt appears.
- Pro user is uncapped; cancelling Pro drops them back to the free allowance by the next period.
- No server key ever reaches the client bundle (gitleaks + bundle grep).

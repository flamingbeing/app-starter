# 0003: Content-Security-Policy, Report-Only first

Status: accepted (2026-10-25)

Context: a strict CSP stops injected scripts, but a wrong one breaks sign-in or sync on the phones, and Google
sign-in, Firestore and the design kit need several origins allowed.

Decision: `worker/headers.js` sends the policy as `Content-Security-Policy-Report-Only`. The browser tests listen for
`securitypolicyviolation` and fail on any report. Once a live app's sign-in, sync and update show no reports, set
`CSP_ENFORCE` to true (one line) and record it here.

Consequences: no protection from the CSP until it is enforced; the other headers (HSTS, nosniff, frame-ancestors,
Referrer-Policy, Permissions-Policy) apply from the first deploy.

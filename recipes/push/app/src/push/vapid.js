// The Web Push public key (VAPID), public by design: the page subscribes with it and the Worker signs with its private half,
// the Worker secret VAPID_PRIVATE_KEY (never in the repo). `node tools/push-keys.mjs` makes the pair, puts the private half
// on the Worker (wrangler secret put) and writes the public half here. Empty: push is off (nothing subscribes or sends).
export const VAPID_PUBLIC_KEY = '';

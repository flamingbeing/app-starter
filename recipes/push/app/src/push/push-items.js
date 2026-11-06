// What the Worker is asked to send as Web Push (the push recipe; push-wire.js posts it to /api/push/schedule), and what the
// Worker checks again just before it sends (worker/push.js imports itemPath and stampOf from here, so both sides agree).
// The template's rule: an open item with a due day and a due time is notified at that time. An app makes these its own
// (reminders some minutes before, a daily summary): pushItems decides what and when, stampOf what must still hold at send time.
import { COLL } from '../items.js';

/** how far ahead the Worker's queue is filled (it takes up to 8 days) */
export const AHEAD_MS = 7 * 24 * 3600 * 1000;
/** the Worker sends what is due within 30 s of now; later than this from now is the queue's, so a re-post cannot bring one back */
export const MIN_AHEAD_MS = 60 * 1000;
/** the Worker's cap */
export const MAX_ITEMS = 200;

/** the item's document, which the Worker reads at send time (cloud.js: the single group '_') @param {string} itemId */
export const itemPath = itemId => `spaces/_/${COLL}/${itemId}`;

/** what a notification depends on: '' when there is nothing to notify (done, deleted, no due time); a queued one goes out only
 * while its item's stamp is unchanged @param {any} item @returns {string} */
export function stampOf(item) {
  if (!item || item.done || item._deleted || typeof item.due !== 'string' || typeof item.dueTime !== 'string' || !item.due || !item.dueTime) return '';
  return `${item.due} ${item.dueTime}`;
}

/** @typedef {{ key: string, at: number, title: string, body: string, itemId: string, stamp: string }} PushItem */

/** The notifications to queue, soonest first: each item's due time (local), later than a minute from now and within a week.
 * @param {import('../items.js').Item[]} items @param {number} now @returns {PushItem[]} */
export function pushItems(items, now) {
  const out = [];
  for (const it of items) {
    const stamp = stampOf(it);
    if (!stamp || it.id.includes('/')) continue;
    const at = new Date(`${it.due}T${it.dueTime}`).getTime();
    if (!Number.isFinite(at) || at <= now + MIN_AHEAD_MS || at > now + AHEAD_MS) continue;
    out.push({ key: `${it.id}|${stamp}`, at, title: (it.text || 'Task').slice(0, 200), body: `Due at ${it.dueTime}`, itemId: it.id, stamp });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_ITEMS);
}

// Several API keys for one provider, used in turn: when Google says a key has reached its free limit, the next
// saved key takes over, and the tired one rests until its limit resets. Pure functions; the panel stores the ring
// (as JSON) in the same secret storage as the keys themselves.

/** A ring is [{ k: key, rest: ms-epoch until which it is resting (0 = ready) }], most recently added first. */
export function parseRing(json, legacyKey = '') {
  let ring = [];
  try { const v = JSON.parse(json || '[]'); if (Array.isArray(v)) ring = v.filter(e => e && typeof e.k === 'string' && e.k).map(e => ({ k: e.k, rest: +e.rest || 0 })); } catch {}
  if (legacyKey && !ring.some(e => e.k === legacyKey)) ring.unshift({ k: legacyKey, rest: 0 }); // the single key saved before rings existed
  return ring;
}
export const ringJSON = ring => JSON.stringify(ring.map(e => ({ k: e.k, rest: e.rest || 0 })));

/** Adds a key (or moves it to the front if already there) and marks it ready. */
export function addKey(ring, key) { key = String(key || '').trim(); if (!key) return ring; return [{ k: key, rest: 0 }, ...ring.filter(e => e.k !== key)]; }
export const removeKey = (ring, key) => ring.filter(e => e.k !== key);

/** The keys to try, in order: ready ones first, then resting ones soonest-to-wake (a limit may have lifted early). */
export function keyOrder(ring, now = Date.now()) {
  const ready = ring.filter(e => !(e.rest > now)), resting = ring.filter(e => e.rest > now).sort((a, b) => a.rest - b.rest);
  return [...ready, ...resting].map(e => e.k);
}

/** Is this error Google saying the key has reached a limit (as opposed to a bad key or a busy server)? */
export const isLimit = msg => /answered 429|RESOURCE_EXHAUSTED|quota/i.test(String(msg || ''));

/**
 * How long a key that hit a limit should rest. A daily quota resets at midnight Pacific time; anything else
 * (requests or tokens per minute) clears within a minute.
 */
export function restUntil(msg, now = Date.now()) {
  const m = String(msg || '');
  if (/PerDay|per day|daily/i.test(m)) return nextPacificMidnight(now);
  const retry = m.match(/retry(?:Delay|[ _-]?after| in)?["':\s]*"?(\d+(?:\.\d+)?)s/i);
  return now + (retry ? Math.min(600, Math.ceil(+retry[1])) : 60) * 1000;
}
/** Midnight in Los Angeles, without relying on time-zone data (panels may not have it): PDT mid-March to early November. */
export function nextPacificMidnight(now = Date.now()) {
  const d = new Date(now), y = d.getUTCFullYear();
  const nthSunday = (month, n) => { const first = new Date(Date.UTC(y, month, 1)); return 1 + ((7 - first.getUTCDay()) % 7) + 7 * (n - 1); };
  const dstStart = Date.UTC(y, 2, nthSunday(2, 2), 10), dstEnd = Date.UTC(y, 10, nthSunday(10, 1), 9); // 2am local
  const off = now >= dstStart && now < dstEnd ? 7 : 8; // hours behind UTC
  const local = new Date(now - off * 3600e3);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) + off * 3600e3;
}

/** A key shown without giving it away. */
export const maskKey = k => (k.length > 10 ? k.slice(0, 4) + '…' + k.slice(-4) : '…' + k.slice(-2));

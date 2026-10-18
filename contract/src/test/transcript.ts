/**
 * Helpers for asserting on what a circuit call writes into its PUBLIC
 * transcript — the part of a transaction every node and indexer can read.
 * Ledger-state assertions alone cannot catch a privacy leak that lives in the
 * transcript (a query argument is not a state change), which is exactly how
 * the wave-1 `authorize` leak went unnoticed by its own 16-test suite.
 */

const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/** Serializes everything reachable from `value` to one lowercase-hex-friendly
 * string: byte arrays become hex, bigints decimal, class instances (e.g.
 * runtime StateValue/Op wrappers) are walked via their own enumerable fields
 * and, where present, their encoded form. */
export function flattenToHex(value: unknown, seen = new WeakSet<object>()): string {
  if (value instanceof Uint8Array) return toHex(value);
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return String(value);
  if (seen.has(value as object)) return '';
  seen.add(value as object);
  const anyV = value as any;
  const parts: string[] = [];
  if (typeof anyV.encode === 'function') {
    try {
      const enc = anyV.encode();
      if (enc instanceof Uint8Array) parts.push(toHex(enc));
    } catch {
      /* not every wrapper is encodable on its own */
    }
  }
  if (Array.isArray(value)) for (const v of value) parts.push(flattenToHex(v, seen));
  else for (const v of Object.values(anyV)) parts.push(flattenToHex(v, seen));
  return parts.join('|');
}

/** The public transcript of the most recent circuit call on `ctx`. */
export function lastTranscript(ctx: { callProofDataTrace?: any[] }): unknown {
  const trace = ctx.callProofDataTrace ?? [];
  const last = trace[trace.length - 1];
  if (!last) throw new Error('no proof data recorded for the last call');
  return last.publicTranscript;
}

export function transcriptContains(ctx: { callProofDataTrace?: any[] }, needle: Uint8Array): boolean {
  return flattenToHex(lastTranscript(ctx)).includes(toHex(needle));
}

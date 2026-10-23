let counter = 0

/** Opaque stable ID, e.g. `ci_3f9a1c2e`. Uses crypto when available. */
export function newId(prefix: string): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return `${prefix}_${c.randomUUID().replace(/-/g, '').slice(0, 12)}`
  counter += 1
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** Seeded PRNG (mulberry32) — used only for deterministic demo data. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

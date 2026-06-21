// Маленький детерминированный ГСЧ (mulberry32) с сохраняемым состоянием.
// Один и тот же seed даёт один и тот же поток чисел: это держит онлайн-комнату
// синхронной (каждый наблюдатель видит одну и ту же раздачу и один и тот же
// допрос) и делает тесты воспроизводимыми.

export interface Rng {
  next(): number // [0, 1)
  readonly state: number
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    get state() {
      return a >>> 0
    },
    next() {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

// Перемешивание Фишера-Йейтса на месте по заданному ГСЧ.
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function pick<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng.next() * arr.length)]
}

export function randomSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
}

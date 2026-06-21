// ============================================================================
// Мозги ботов. Драйвер (соло-стор или онлайн-комната) зовёт эти функции, чтобы
// заполнить действия каждого нечеловеческого места: кого спросить, не пора ли
// созвать голосование и за кого голосовать. Решения читают общую модель
// подозрения, поэтому голоса и обвинения ботов совпадают с тем, что показывает
// лента допроса, ровно как у Уно и Ночи.
//
// Импорт из движка только типовой; локальный ГСЧ, посоленный от живого rngState,
// даёт правдоподобную вариативность, не трогая состояние движка.
// ============================================================================

import type { GameState, EnginePlayer, Action } from './engine'
import { makeRng } from './rng'
import { questionFor } from './interrogation'

// Чем сильнее случайность красит решение бота. Новичок гуляет (больше шума =
// мягче, ошибается чаще), мастер цепляется за лучший вариант почти без люфта.
const NOISE: Record<string, number> = { easy: 2.4, normal: 1, hard: 0.4 }
const nz = (s: GameState) => NOISE[s.difficulty] ?? 1

const others = (s: GameState, id: string) => s.players.filter(p => p.id !== id)

function localRng(s: GameState, salt: number) {
  return makeRng((s.rngState ^ (salt * 0x9e3779b1)) >>> 0)
}

// средняя «теплота» стола к targetId (ниже = больше доверяют)
function avgSuspicion(s: GameState, targetId: string): number {
  let sum = 0
  let n = 0
  for (const owner of s.players) {
    if (owner.id === targetId) continue
    sum += s.suspicion[owner.id]?.[targetId] ?? 0
    n++
  }
  return n ? sum / n : 0
}

// игрок, которому стол доверяет меньше всех (зреющий консенсус)
function townConsensus(s: GameState, excludeId: string): EnginePlayer | null {
  const c = s.players.filter(p => p.id !== excludeId)
  if (!c.length) return null
  return c.reduce((best, p) => (avgSuspicion(s, p.id) > avgSuspicion(s, best.id) ? p : best))
}

// топ-подозреваемый в глазах владельца (опционально минуя самого крота)
function topSuspect(s: GameState, ownerId: string, avoidMole: boolean): EnginePlayer | null {
  const view = s.suspicion[ownerId] ?? {}
  const cands = others(s, ownerId).filter(p => !(avoidMole && p.isMole))
  if (!cands.length) return null
  return cands.reduce((best, p) => ((view[p.id] ?? 0) > (view[best.id] ?? 0) ? p : best))
}

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── допрос ────────────────────────────────────────────────────────────────────

// Кого и о чём спросит бот в свой ход. Город чаще пытает того, кого подозревает;
// крот спрашивает почти наугад, лишь бы выглядеть включённым.
export function botAsk(s: GameState, askerId: string): { targetId: string; question: string } {
  const rng = localRng(s, 11 + s.turnsTaken * 13 + hash(askerId))
  const asker = s.players.find(p => p.id === askerId)!
  const pool = others(s, askerId)
  let target: EnginePlayer
  if (asker.isMole || rng.next() < 0.3) {
    target = pool[Math.floor(rng.next() * pool.length)]
  } else {
    const view = s.suspicion[askerId] ?? {}
    target = pool
      .map(p => ({ p, score: (view[p.id] ?? 0) + rng.next() * 26 * nz(s) }))
      .sort((a, b) => b.score - a.score)[0].p
  }
  return { targetId: target.id, question: questionFor(rng, target.name) }
}

// Стоит ли боту в свой ход вместо вопроса созвать голосование. Только со второго
// круга и только если стол реально на кого-то косится; мастер решительнее.
export function botShouldCallVote(s: GameState, askerId: string): boolean {
  if (s.round < 1) return false
  const owner = s.players.find(p => p.id === askerId)!
  const top = topSuspect(s, askerId, owner.isMole)
  if (!top) return false
  const heat = avgSuspicion(s, top.id)
  const threshold = s.difficulty === 'hard' ? 44 : s.difficulty === 'normal' ? 54 : 66
  if (heat < threshold) return false
  const rng = localRng(s, 77 + s.turnsTaken * 7 + hash(askerId))
  const chance = s.difficulty === 'hard' ? 0.5 : s.difficulty === 'normal' ? 0.32 : 0.18
  return rng.next() < (owner.isMole ? chance * 0.7 : chance)
}

// ── голосование ────────────────────────────────────────────────────────────────

export function botVote(s: GameState, voterId: string): string | null {
  const voter = s.players.find(p => p.id === voterId)
  if (!voter) return null
  const view = s.suspicion[voterId] ?? {}
  const rng = localRng(s, 404 + s.turnsTaken * 3 + hash(voterId))
  const pool = others(s, voterId)
  if (!pool.length) return null

  if (voter.isMole) {
    // крот валит на самого подозреваемого НЕ-крота: едет на волне и прячется сам
    const cand = pool.filter(p => !p.isMole)
    if (!cand.length) return null
    return cand
      .map(p => ({ p, score: avgSuspicion(s, p.id) + rng.next() * 16 * nz(s) }))
      .sort((a, b) => b.score - a.score)[0].p.id
  }

  // город: обычно собственный топ-подозреваемый, иногда едет на консенсусе стола
  if (rng.next() < 0.35) {
    const c = townConsensus(s, voterId)
    if (c) return c.id
  }
  const ranked = pool
    .map(p => ({ p, score: (view[p.id] ?? 0) + rng.next() * 22 * nz(s) }))
    .sort((a, b) => b.score - a.score)
  // подвешенный стол это скучно каждый раз, но робкие (и новички) иногда воздержатся
  const abstainChance = s.difficulty === 'easy' ? 0.34 : s.difficulty === 'hard' ? 0.1 : 0.22
  if (ranked[0].score < 18 && rng.next() < abstainChance) return null
  return ranked[0].p.id
}

export function botVotes(s: GameState, humanIds: Set<string>): Action[] {
  return s.players
    .filter(p => p.isBot && !humanIds.has(p.id))
    .map(p => ({ type: 'vote', playerId: p.id, targetId: botVote(s, p.id) }) as Action)
}

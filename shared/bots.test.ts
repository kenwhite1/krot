import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createGame,
  applyAction,
  playerById,
  currentAskerId,
  interrogationOver,
  moleOf,
  type GameState,
} from './engine'
import { answerForBot } from './interrogation'
import { botAsk, botVote, botShouldCallVote, botVotes } from './bots'
import { makeRng } from './rng'

function makePlayers(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: '🙂', isBot: true }))
}

function simulate(seed: number, difficulty: 'easy' | 'normal' | 'hard', n = 6): GameState {
  let s = createGame({ players: makePlayers(n), seed, difficulty, pack: 'classic' })
  s = applyAction(s, { type: 'advance' }).state
  let guard = 0
  while (s.status === 'playing' && guard++ < 800) {
    if (s.phase === 'interrogation') {
      if (s.pending) {
        const answerer = playerById(s, s.pending.targetId)!
        const rng = makeRng((s.rngState ^ (s.seq * 0x9e3779b1)) >>> 0)
        const { text, tell } = answerForBot(s, answerer, rng)
        s = applyAction(s, { type: 'answer', text, tell }).state
      } else if (interrogationOver(s)) {
        s = applyAction(s, { type: 'advance' }).state
      } else {
        const asker = currentAskerId(s)
        if (botShouldCallVote(s, asker)) {
          s = applyAction(s, { type: 'callVote', byId: asker }).state
        } else {
          const { targetId, question } = botAsk(s, asker)
          s = applyAction(s, { type: 'ask', askerId: asker, targetId, question }).state
        }
      }
    } else if (s.phase === 'vote') {
      for (const a of botVotes(s, new Set())) s = applyAction(s, a).state
      s = applyAction(s, { type: 'advance' }).state
    } else break
  }
  return s
}

test('botAsk targets a real other player and asks something', () => {
  let s = createGame({ players: makePlayers(6), seed: 5, difficulty: 'normal', pack: 'classic' })
  s = applyAction(s, { type: 'advance' }).state
  for (let i = 0; i < 6; i++) {
    const asker = currentAskerId(s)
    const { targetId, question } = botAsk(s, asker)
    assert.notEqual(targetId, asker)
    assert.ok(playerById(s, targetId))
    assert.ok(question.length > 0)
    const r = applyAction(s, { type: 'ask', askerId: asker, targetId, question })
    assert.equal(r.error, undefined)
    s = r.state
    s = applyAction(s, { type: 'answer', text: 'A', tell: 0.3 }).state
  }
})

test('a bot never votes for itself, and the mole never votes the mole', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let s = createGame({ players: makePlayers(7), seed, difficulty: 'hard', pack: 'classic' })
    s = applyAction(s, { type: 'advance' }).state
    s = applyAction(s, { type: 'callVote', byId: currentAskerId(s) }).state
    const mole = moleOf(s).id
    for (const p of s.players) {
      const v = botVote(s, p.id)
      assert.notEqual(v, p.id, 'бот проголосовал сам за себя')
      if (p.id === mole) assert.notEqual(v, mole, 'крот проголосовал за крота')
    }
  }
})

test('every difficulty drives a full game to a clean finish', () => {
  for (const d of ['easy', 'normal', 'hard'] as const) {
    for (let seed = 1; seed <= 30; seed++) {
      const s = simulate(seed * 7, d, 4 + (seed % 5))
      assert.equal(s.status, 'finished')
      assert.ok(s.winner === 'town' || s.winner === 'mole')
    }
  }
})

test('sharper bots catch the mole more often than novices', () => {
  const rate = (d: 'easy' | 'normal' | 'hard') => {
    let caught = 0
    const N = 240
    for (let seed = 1; seed <= N; seed++) {
      const s = simulate(seed, d, 6)
      if (s.endReason === 'caught') caught++
    }
    return caught / N
  }
  const easy = rate('easy')
  const hard = rate('hard')
  // ось мастерства: мастер вычисляет крота заметно чаще новичка
  assert.ok(hard > easy, `ожидалось hard(${hard.toFixed(2)}) > easy(${easy.toFixed(2)})`)
  assert.ok(hard > 0.3, `мастер должен ловить крота ощутимо часто, получили ${hard.toFixed(2)}`)
})

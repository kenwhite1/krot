import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createGame,
  applyAction,
  playerById,
  moleOf,
  currentAskerId,
  interrogationOver,
  voteReady,
  revealReady,
  type GameState,
  type Action,
} from './engine'
import { answerForBot, humanAnswerOptions } from './interrogation'
import { botAsk, botVote, botShouldCallVote, botVotes } from './bots'
import { toView } from './view'
import { makeRng } from './rng'

function makePlayers(n: number, humans = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    avatar: '🙂',
    isBot: i >= humans,
  }))
}

function newG(n = 6, opts: Partial<Parameters<typeof createGame>[0]> = {}): GameState {
  return createGame({ players: makePlayers(n), seed: 12345, difficulty: 'normal', pack: 'classic', ...opts })
}

// Гоняем партию ботами от начала до конца, как это делает драйвер.
function simulate(seed: number, difficulty: 'easy' | 'normal' | 'hard', n = 6): GameState {
  let s = createGame({ players: makePlayers(n), seed, difficulty, pack: 'classic' })
  s = applyAction(s, { type: 'advance' }).state // reveal -> interrogation
  let guard = 0
  while (s.status === 'playing' && guard++ < 800) {
    if (s.phase === 'interrogation') {
      if (s.pending) {
        const answerer = playerById(s, s.pending.targetId)!
        const rng = makeRng((s.rngState ^ (s.seq * 0x9e3779b1)) >>> 0)
        const { text, tell } = answerForBot(s, answerer, rng)
        s = applyAction(s, { type: 'answer', text, tell }).state
      } else if (interrogationOver(s)) {
        s = applyAction(s, { type: 'advance' }).state // -> vote
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
      s = applyAction(s, { type: 'advance' }).state // tally -> finish
    } else {
      break
    }
  }
  return s
}

test('createGame deals exactly one mole and distinct town roles', () => {
  const s = newG(7)
  const moles = s.players.filter(p => p.isMole)
  assert.equal(moles.length, 1)
  assert.equal(moles[0].roleName, '') // у крота нет роли
  const townRoles = s.players.filter(p => !p.isMole).map(p => p.roleName)
  assert.equal(new Set(townRoles).size, townRoles.length) // все роли разные
  assert.ok(townRoles.every(r => r.length > 0))
})

test('createGame is deterministic for a given seed', () => {
  const a = newG(6)
  const b = newG(6)
  assert.equal(moleOf(a).id, moleOf(b).id)
  assert.equal(a.locationName, b.locationName)
})

test('bots start ready, reveal advances to interrogation', () => {
  const s = newG(5)
  assert.ok(revealReady(s)) // все боты готовы
  const r = applyAction(s, { type: 'advance' })
  assert.equal(r.state.phase, 'interrogation')
})

test('human stays unready until they tap ready', () => {
  const s = createGame({ players: makePlayers(5, 1), seed: 1, pack: 'classic' })
  assert.equal(revealReady(s), false)
  const r = applyAction(s, { type: 'ready', playerId: 'p0' })
  assert.ok(revealReady(r.state))
})

test('ask sets pending, answer records exchange and rotates the asker', () => {
  let s = newG(6)
  s = applyAction(s, { type: 'advance' }).state
  const asker = currentAskerId(s)
  const target = s.players.find(p => p.id !== asker)!.id
  s = applyAction(s, { type: 'ask', askerId: asker, targetId: target, question: 'Как дела?' }).state
  assert.ok(s.pending)
  assert.equal(s.pending!.targetId, target)
  // нельзя спросить, пока ждём ответ
  const blocked = applyAction(s, { type: 'ask', askerId: asker, targetId: target, question: 'Ещё?' })
  assert.equal(blocked.error, 'awaiting_answer')
  s = applyAction(s, { type: 'answer', text: 'Отлично', tell: 0.2 }).state
  assert.equal(s.pending, null)
  assert.equal(s.exchanges.length, 1)
  assert.equal(s.turnsTaken, 1)
  assert.notEqual(currentAskerId(s), asker) // следующий спрашивает
})

test('only the current asker may ask', () => {
  let s = newG(6)
  s = applyAction(s, { type: 'advance' }).state
  const asker = currentAskerId(s)
  const notAsker = s.players.find(p => p.id !== asker)!.id
  const other = s.players.find(p => p.id !== asker && p.id !== notAsker)!.id
  const r = applyAction(s, { type: 'ask', askerId: notAsker, targetId: other, question: 'А?' })
  assert.equal(r.error, 'not_your_turn')
})

test('evasive answer raises suspicion, solid answer lowers it', () => {
  let s = newG(6)
  s = applyAction(s, { type: 'advance' }).state
  const asker = currentAskerId(s)
  const target = s.players.find(p => p.id !== asker)!.id
  const before = avg(s, target)
  s = applyAction(s, { type: 'ask', askerId: asker, targetId: target, question: 'Q' }).state
  s = applyAction(s, { type: 'answer', text: 'Эээ', tell: 0.9 }).state
  const afterEvasive = avg(s, target)
  assert.ok(afterEvasive > before, 'уклончивый ответ должен поднять подозрение')

  const asker2 = currentAskerId(s)
  const target2 = s.players.find(p => p.id !== asker2)!.id
  const b2 = avg(s, target2)
  s = applyAction(s, { type: 'ask', askerId: asker2, targetId: target2, question: 'Q' }).state
  s = applyAction(s, { type: 'answer', text: 'Чётко', tell: 0.05 }).state
  assert.ok(avg(s, target2) < b2, 'чёткий ответ должен снизить подозрение')
})

function avg(s: GameState, id: string): number {
  let sum = 0, n = 0
  for (const o of s.players) { if (o.id === id) continue; sum += s.suspicion[o.id]?.[id] ?? 0; n++ }
  return sum / n
}

test('interrogation ends after maxTurns', () => {
  let s = newG(5)
  s = applyAction(s, { type: 'advance' }).state
  assert.equal(s.maxTurns, 10) // 5 * 2 круга
  let guard = 0
  while (!interrogationOver(s) && guard++ < 50) {
    const asker = currentAskerId(s)
    const target = s.players.find(p => p.id !== asker)!.id
    s = applyAction(s, { type: 'ask', askerId: asker, targetId: target, question: 'Q' }).state
    s = applyAction(s, { type: 'answer', text: 'A', tell: 0.3 }).state
  }
  assert.ok(interrogationOver(s))
  assert.equal(s.turnsTaken, 10)
})

test('voting out the mole is a town win (caught)', () => {
  let s = newG(5)
  s = applyAction(s, { type: 'advance' }).state
  s = applyAction(s, { type: 'callVote', byId: currentAskerId(s) }).state
  assert.equal(s.phase, 'vote')
  const mole = moleOf(s).id
  for (const p of s.players) {
    const target = p.id === mole ? s.players.find(q => q.id !== mole)!.id : mole
    s = applyAction(s, { type: 'vote', playerId: p.id, targetId: target }).state
  }
  assert.ok(voteReady(s))
  s = applyAction(s, { type: 'advance' }).state
  assert.equal(s.status, 'finished')
  assert.equal(s.winner, 'town')
  assert.equal(s.endReason, 'caught')
})

test('voting out an innocent is a mole win (mislynch)', () => {
  let s = newG(5)
  s = applyAction(s, { type: 'advance' }).state
  s = applyAction(s, { type: 'callVote', byId: currentAskerId(s) }).state
  const mole = moleOf(s).id
  const victim = s.players.find(p => p.id !== mole)!.id
  for (const p of s.players) {
    const target = p.id === victim ? mole : victim
    s = applyAction(s, { type: 'vote', playerId: p.id, targetId: target }).state
  }
  s = applyAction(s, { type: 'advance' }).state
  assert.equal(s.winner, 'mole')
  assert.equal(s.endReason, 'mislynch')
})

test('a hung vote lets the mole escape', () => {
  let s = newG(4)
  s = applyAction(s, { type: 'advance' }).state
  s = applyAction(s, { type: 'callVote', byId: currentAskerId(s) }).state
  for (const p of s.players) s = applyAction(s, { type: 'vote', playerId: p.id, targetId: null }).state
  s = applyAction(s, { type: 'advance' }).state
  assert.equal(s.winner, 'mole')
  assert.equal(s.endReason, 'escaped')
})

test('mole guessing the location right wins, wrong loses', () => {
  let s = newG(5)
  s = applyAction(s, { type: 'advance' }).state
  const mole = moleOf(s).id
  const right = applyAction(s, { type: 'guess', byId: mole, locationName: s.locationName })
  assert.equal(right.state.winner, 'mole')
  assert.equal(right.state.endReason, 'guessed')

  const wrong = applyAction(s, { type: 'guess', byId: mole, locationName: 'Несуществующее место' })
  assert.equal(wrong.state.winner, 'town')
  assert.equal(wrong.state.endReason, 'wrongGuess')
})

test('non-mole cannot guess', () => {
  let s = newG(5)
  s = applyAction(s, { type: 'advance' }).state
  const town = s.players.find(p => !p.isMole)!.id
  const r = applyAction(s, { type: 'guess', byId: town, locationName: s.locationName })
  assert.equal(r.error, 'not_mole')
})

test('view hides the location from the mole and tell from everyone', () => {
  let s = newG(6)
  s = applyAction(s, { type: 'advance' }).state
  const asker = currentAskerId(s)
  const target = s.players.find(p => p.id !== asker)!.id
  s = applyAction(s, { type: 'ask', askerId: asker, targetId: target, question: 'Q' }).state
  s = applyAction(s, { type: 'answer', text: 'A', tell: 0.8 }).state

  const mole = moleOf(s)
  const mView = toView(s, mole.id)
  assert.equal(mView.you.isMole, true)
  assert.equal(mView.you.locationName, '') // локация скрыта от крота
  assert.ok(mView.locations.length === 10) // но список-подсказка есть

  const townie = s.players.find(p => !p.isMole)!
  const tView = toView(s, townie.id)
  assert.equal(tView.you.locationName, s.locationName) // город знает локацию
  // tell не утекает в ленту
  assert.ok(tView.exchanges.every(e => !('tell' in e)))
  // чужие роли скрыты во время игры
  assert.ok(tView.players.filter(p => !p.isYou).every(p => p.roleName === null && p.isMole === null))
})

test('view reveals everything once finished', () => {
  let s = simulate(999, 'normal', 6)
  assert.equal(s.status, 'finished')
  const v = toView(s, s.players[0].id)
  assert.ok(v.players.every(p => p.isMole !== null))
  assert.equal(v.you.locationName, s.locationName) // в конце локацию видно и кроту
  assert.ok(v.youWon === true || v.youWon === false)
})

test('humanAnswerOptions returns three graded options', () => {
  const rng = makeRng(7)
  const town = humanAnswerOptions(false, rng)
  const mole = humanAnswerOptions(true, rng)
  assert.equal(town.length, 3)
  assert.equal(mole.length, 3)
  // «гладкий» вариант менее палевный, чем «рискованный»
  assert.ok(town[0].tell < town[2].tell)
  assert.ok(mole[0].tell < mole[2].tell)
})

test('a full bot game always finishes with a valid winner', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = simulate(seed, 'normal', 5 + (seed % 4))
    assert.equal(s.status, 'finished')
    assert.ok(s.winner === 'town' || s.winner === 'mole')
  }
})

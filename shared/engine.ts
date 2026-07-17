// ============================================================================
// «Крот» - авторитетный игровой движок (чистый, детерминированный, сериализуемый).
//
// Тот же движок работает в двух местах, как и у соседних игр семейства:
//   • solo   - на клиенте, для мгновенной игры с ботами офлайн
//   • online - на сервере, авторитетно для игры с друзьями по коду
//
// Партия это поток фаз:
//   reveal        → каждый тайком смотрит свою карту (локация и роль, или «ты крот»)
//   interrogation → по кругу задают друг другу вопросы и отвечают; растёт подозрение
//   vote          → стол голосует, кто из них крот
//   verdict       → вскрываем итог голосования
//   guess         → крот может вместо этого назвать локацию
//   gameover      → партия окончена
//
// Всё, что должно выглядеть одинаково для каждого наблюдателя онлайн-комнаты
// (раздача ролей, ответы ботов, подозрение, что движет голосами), считается
// здесь из seed-ГСЧ. Сами РЕШЕНИЯ ботов (кого спросить, как ответить, за кого
// голосовать) живут в bots.ts и interrogation.ts и подаются сюда как действия,
// ровно как у Ночи и Уно.
// ============================================================================

import { makeRng, shuffle, type Rng } from './rng'
import { locationsForPack, type PackId, type Location } from './locations'

export type { PackId }
export type Difficulty = 'easy' | 'normal' | 'hard'
export type Team = 'town' | 'mole'
export type Phase = 'reveal' | 'interrogation' | 'vote' | 'verdict' | 'guess' | 'gameover'

// Чем закончилась партия (для экрана итога).
export type EndReason =
  | 'caught'      // крота вычислили голосованием → победа города
  | 'mislynch'    // выгнали невиновного → победа крота
  | 'escaped'     // стол не договорился, крот ушёл → победа крота
  | 'guessed'     // крот верно назвал локацию → победа крота
  | 'wrongGuess'  // крот промахнулся с локацией → победа города

export interface EnginePlayer {
  id: string
  name: string
  avatar: string
  isBot: boolean
  isMole: boolean
  roleName: string // роль на локации; у крота пустая строка
  ready: boolean   // нажал «готов» на раздаче (боты готовы сразу)
}

// Одна реплика допроса: вопрос и ответ.
export interface Exchange {
  seq: number
  askerId: string
  askerName: string
  targetId: string
  targetName: string
  question: string
  answer: string
  // как ответ читается столом (для подсветки и для модели подозрения)
  tell: number // 0..1, насколько ответ «не в тему»
}

export interface Verdict {
  targetId: string | null
  targetWasMole: boolean
  tie: boolean
  tally: { id: string; votes: number }[]
}

export interface GameState {
  players: EnginePlayer[]
  phase: Phase
  rngState: number
  difficulty: Difficulty

  pack: PackId
  locationName: string
  locationEmoji: string

  status: 'playing' | 'finished'
  winner: Team | null
  endReason: EndReason | null

  // допрос
  turnOrder: string[]  // порядок, в котором спрашивают (по кругу)
  turnPtr: number      // указатель в turnOrder: чья очередь спрашивать
  round: number        // сколько полных кругов сделано
  turnsTaken: number   // сколько вопросов задано всего
  maxTurns: number     // допрос кончается после стольких вопросов
  exchanges: Exchange[] // лента вопросов и ответов
  seq: number
  pending: { askerId: string; targetId: string; question: string } | null

  // подозрение: ownerId -> targetId -> 0..100
  suspicion: Record<string, Record<string, number>>

  // голосование
  voteCalledBy: string | null
  votes: Record<string, string | null> // voterId -> targetId | null (воздержался)
  lastVerdict: Verdict | null

  // догадка крота
  guess: { byId: string; locationName: string; correct: boolean } | null
}

export type GameEvent =
  | { kind: 'reveal' }
  | { kind: 'ask'; askerId: string; targetId: string }
  | { kind: 'answer'; answererId: string; tell: number }
  | { kind: 'voteCalled'; byId: string }
  | { kind: 'voted'; voterId: string; targetId: string | null }
  | { kind: 'verdict'; targetId: string | null; wasMole: boolean; tie: boolean }
  | { kind: 'guess'; byId: string; correct: boolean }
  | { kind: 'gameover'; winner: Team; reason: EndReason }

export type Action =
  | { type: 'ready'; playerId: string }
  | { type: 'ask'; askerId: string; targetId: string; question: string }
  | { type: 'answer'; text: string; tell: number }
  | { type: 'callVote'; byId: string }
  | { type: 'vote'; playerId: string; targetId: string | null }
  | { type: 'guess'; byId: string; locationName: string }
  | { type: 'advance' } // driver-paced transition (reveal→interrogation, tally, etc.)

export interface ApplyResult {
  state: GameState
  events: GameEvent[]
  error?: string
}

// Сколько кругов вопросов длится допрос (каждый спрашивает дважды).
const ROUNDS = 2

// На сколько сильно «несвязный» ответ поднимает подозрение в глазах наблюдателя.
// Мастер цепляется к мелочам, новичок почти не замечает. Держим мягко, чтобы
// исход партии оставался на лезвии, а голос живого игрока решал.
const SKILL: Record<Difficulty, number> = { easy: 6, normal: 11, hard: 18 }
// Тонкая «утечка» крота: даже гладкий ответ оставляет лёгкий след, который острый
// стол со временем чует. У новичков почти ноль, у мастера ощутимо.
const MOLE_LEAK: Record<Difficulty, number> = { easy: 0.4, normal: 1.0, hard: 1.9 }

// ── setup ───────────────────────────────────────────────────────────────────

export interface NewGameOpts {
  players: { id: string; name: string; avatar: string; isBot: boolean }[]
  seed: number
  difficulty?: Difficulty
  pack?: PackId
}

export function createGame(opts: NewGameOpts): GameState {
  const n = opts.players.length
  // защита на всякий случай: вызывающие гарантируют минимум, но без хотя бы
  // троих за столом партии «Крота» нет (крот плюс двое мирных).
  if (n < 3) throw new Error('need_players')

  const rng = makeRng(opts.seed)
  const pack: PackId = opts.pack ?? 'classic'
  const locs = locationsForPack(pack)
  const location: Location = locs[Math.floor(rng.next() * locs.length)]
  const moleIdx = Math.floor(rng.next() * n)
  const roleDeal = shuffle(location.roles.slice(), rng)

  let r = 0
  const players: EnginePlayer[] = opts.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isBot: p.isBot,
    isMole: i === moleIdx,
    roleName: i === moleIdx ? '' : roleDeal[r++ % roleDeal.length],
    ready: p.isBot, // боты готовы сразу
  }))

  // лёгкое асимметричное стартовое подозрение, чтобы стол не был плоским
  const suspicion: Record<string, Record<string, number>> = {}
  for (const a of players) {
    suspicion[a.id] = {}
    for (const b of players) {
      if (a.id === b.id) continue
      suspicion[a.id][b.id] = 10 + Math.floor(rng.next() * 12) // 10..21
    }
  }

  const turnOrder = players.map(p => p.id)
  const firstPtr = Math.floor(rng.next() * n)

  return {
    players,
    phase: 'reveal',
    rngState: rng.state,
    difficulty: opts.difficulty ?? 'normal',
    pack,
    locationName: location.name,
    locationEmoji: location.emoji,
    status: 'playing',
    winner: null,
    endReason: null,
    turnOrder,
    turnPtr: firstPtr,
    round: 0,
    turnsTaken: 0,
    maxTurns: n * ROUNDS,
    exchanges: [],
    seq: 0,
    pending: null,
    suspicion,
    voteCalledBy: null,
    votes: {},
    lastVerdict: null,
    guess: null,
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

export const playerById = (s: GameState, id: string): EnginePlayer | undefined =>
  s.players.find(p => p.id === id)
export const moleOf = (s: GameState): EnginePlayer => s.players.find(p => p.isMole)!
export const currentAskerId = (s: GameState): string => s.turnOrder[s.turnPtr]

export function interrogationOver(s: GameState): boolean {
  return s.turnsTaken >= s.maxTurns
}

/** Каждый игрок отдал голос (за кого-то или осознанно воздержался). */
export function voteReady(s: GameState): boolean {
  if (s.phase !== 'vote') return false
  return s.players.every(p => p.id in s.votes)
}

/** Все нажали «готов» на раздаче (боты готовы по умолчанию). */
export function revealReady(s: GameState): boolean {
  return s.players.every(p => p.ready)
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

// ── the reducer ──────────────────────────────────────────────────────────────

export function applyAction(state: GameState, action: Action): ApplyResult {
  const s: GameState = structuredClone(state)
  const events: GameEvent[] = []

  switch (action.type) {
    case 'ready': {
      if (s.phase !== 'reveal') return err(state, 'not_reveal')
      const p = playerById(s, action.playerId)
      if (!p) return err(state, 'bad_player')
      p.ready = true
      return { state: s, events }
    }

    case 'ask': {
      if (s.phase !== 'interrogation') return err(state, 'not_interrogation')
      if (s.pending) return err(state, 'awaiting_answer')
      if (action.askerId !== currentAskerId(s)) return err(state, 'not_your_turn')
      const asker = playerById(s, action.askerId)
      const target = playerById(s, action.targetId)
      if (!asker) return err(state, 'bad_asker')
      if (!target || target.id === asker.id) return err(state, 'bad_target')
      const question = action.question.replace(/\s+/g, ' ').trim().slice(0, 160)
      if (!question) return err(state, 'empty_question')
      s.pending = { askerId: asker.id, targetId: target.id, question }
      events.push({ kind: 'ask', askerId: asker.id, targetId: target.id })
      return { state: s, events }
    }

    case 'answer': {
      if (s.phase !== 'interrogation' || !s.pending) return err(state, 'no_pending')
      const asker = playerById(s, s.pending.askerId)!
      const answerer = playerById(s, s.pending.targetId)!
      const tell = Math.max(0, Math.min(1, action.tell))
      const text = action.text.replace(/\s+/g, ' ').trim().slice(0, 160) || '…'
      s.seq += 1
      s.exchanges.push({
        seq: s.seq,
        askerId: asker.id,
        askerName: asker.name,
        targetId: answerer.id,
        targetName: answerer.name,
        question: s.pending.question,
        answer: text,
        tell,
      })
      bumpSuspicionAfterAnswer(s, answerer, tell)
      s.pending = null
      // следующий по кругу спрашивает
      s.turnPtr = (s.turnPtr + 1) % s.turnOrder.length
      if (s.turnPtr === 0) s.round += 1
      s.turnsTaken += 1
      events.push({ kind: 'answer', answererId: answerer.id, tell })
      return { state: s, events }
    }

    case 'callVote': {
      if (s.phase !== 'interrogation') return err(state, 'not_interrogation')
      const by = playerById(s, action.byId)
      if (!by) return err(state, 'bad_player')
      s.pending = null
      s.voteCalledBy = by.id
      s.votes = {}
      s.phase = 'vote'
      events.push({ kind: 'voteCalled', byId: by.id })
      return { state: s, events }
    }

    case 'vote': {
      if (s.phase !== 'vote') return err(state, 'not_vote')
      const voter = playerById(s, action.playerId)
      if (!voter) return err(state, 'bad_voter')
      if (action.targetId !== null) {
        const t = playerById(s, action.targetId)
        if (!t) return err(state, 'bad_target')
        if (t.id === voter.id) return err(state, 'no_self_vote')
      }
      s.votes[voter.id] = action.targetId
      events.push({ kind: 'voted', voterId: voter.id, targetId: action.targetId })
      return { state: s, events }
    }

    case 'guess': {
      if (s.phase !== 'interrogation' && s.phase !== 'guess') return err(state, 'cannot_guess')
      const by = playerById(s, action.byId)
      if (!by || !by.isMole) return err(state, 'not_mole')
      const correct = action.locationName === s.locationName
      s.guess = { byId: by.id, locationName: action.locationName, correct }
      events.push({ kind: 'guess', byId: by.id, correct })
      return finish(s, correct ? 'mole' : 'town', correct ? 'guessed' : 'wrongGuess', events)
    }

    case 'advance':
      return advance(s, events)
  }
}

function err(state: GameState, error: string): ApplyResult {
  return { state, events: [], error }
}

// Переходы между фазами driver-paced: драйвер зовёт advance, когда входные данные
// фазы собраны (так интерфейс может задержаться на раздаче и на вердикте).
function advance(s: GameState, events: GameEvent[]): ApplyResult {
  if (s.phase === 'reveal') {
    s.phase = 'interrogation'
    events.push({ kind: 'reveal' })
    return { state: s, events }
  }

  if (s.phase === 'interrogation') {
    // драйвер просит закрыть допрос (вышло время кругов) → к голосованию
    s.pending = null
    s.voteCalledBy = null
    s.votes = {}
    s.phase = 'vote'
    events.push({ kind: 'voteCalled', byId: '' })
    return { state: s, events }
  }

  if (s.phase === 'vote') {
    if (!voteReady(s)) return { state: s, events, error: 'vote_incomplete' }
    const verdict = tallyVotes(s)
    s.lastVerdict = verdict
    s.phase = 'verdict'
    events.push({ kind: 'verdict', targetId: verdict.targetId, wasMole: verdict.targetWasMole, tie: verdict.tie })
    if (verdict.targetId && verdict.targetWasMole) return finish(s, 'town', 'caught', events)
    if (verdict.targetId && !verdict.targetWasMole) return finish(s, 'mole', 'mislynch', events)
    return finish(s, 'mole', 'escaped', events) // ничья или все воздержались: крот ушёл
  }

  return { state: s, events } // verdict / guess / gameover: дальше ничего
}

function finish(s: GameState, winner: Team, reason: EndReason, events: GameEvent[]): ApplyResult {
  s.status = 'finished'
  s.winner = winner
  s.endReason = reason
  s.phase = 'gameover'
  events.push({ kind: 'gameover', winner, reason })
  return { state: s, events }
}

// ── vote tally ───────────────────────────────────────────────────────────────

function tallyVotes(s: GameState): Verdict {
  const tally = new Map<string, number>()
  for (const p of s.players) tally.set(p.id, 0)
  for (const voter of s.players) {
    const t = s.votes[voter.id]
    if (t && tally.has(t)) tally.set(t, tally.get(t)! + 1)
  }
  const ranked = [...tally.entries()]
    .map(([id, votes]) => ({ id, votes }))
    .sort((a, b) => b.votes - a.votes)
  const top = ranked[0]
  if (!top || top.votes === 0) return { targetId: null, targetWasMole: false, tie: false, tally: ranked }
  const tie = ranked.filter(r => r.votes === top.votes).length > 1
  if (tie) return { targetId: null, targetWasMole: false, tie: true, tally: ranked }
  return { targetId: top.id, targetWasMole: !!playerById(s, top.id)?.isMole, tie: false, tally: ranked }
}

// ── suspicion model ──────────────────────────────────────────────────────────
// Чужой ответ двигает то, как каждый наблюдатель читает отвечавшего. Несвязный
// ответ поднимает подозрение тем сильнее, чем острее наблюдатель (сложность).
// Гладкий ответ слегка снимает подозрение. У настоящего крота есть тонкая
// утечка, которую острый стол со временем чует, даже если он отвечает чисто.
function bumpSuspicionAfterAnswer(s: GameState, answerer: EnginePlayer, tell: number): void {
  const rng = makeRng((s.rngState ^ (s.seq * 0x9e3779b1)) >>> 0)
  const skill = SKILL[s.difficulty]
  for (const obs of s.players) {
    if (obs.id === answerer.id) continue
    const view = s.suspicion[obs.id]
    if (!view) continue
    let delta = (tell - 0.32) * skill + (rng.next() - 0.5) * 9
    if (answerer.isMole) delta += MOLE_LEAK[s.difficulty]
    view[answerer.id] = clamp((view[answerer.id] ?? 0) + delta)
  }
  s.rngState = rng.state
}

export const ROUNDS_PER_GAME = ROUNDS
export type { Location }

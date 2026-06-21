// Что разрешено видеть одному месту за столом. Сервер шлёт каждому онлайн-клиенту
// только это (никогда не полное состояние), чтобы не утекли ни локация крота, ни
// чужие роли, ни «tell» ответа (по нему вычислялся бы крот). Соло собирает такой
// же view локально. Роли и кто крот раскрываются всем только в конце партии.

import type { GameState, Phase, Difficulty, Team, EndReason, Verdict } from './engine'
import { locationsForPack } from './locations'
import { packName } from './locations'

export interface ViewPlayer {
  id: string
  name: string
  avatar: string
  isBot: boolean
  isYou: boolean
  isAsker: boolean
  isMole: boolean | null // null = скрыто во время игры; раскрывается в конце
  roleName: string | null // скрыто во время игры; в конце раскрывается у города
  votedFor: string | null | undefined // публичный голос (undefined = ещё не голосовал)
  votesOn: number
}

// Реплика допроса без служебного tell (иначе по нему вычислили бы крота).
export interface ViewExchange {
  seq: number
  askerId: string
  askerName: string
  targetId: string
  targetName: string
  question: string
  answer: string
}

export interface PendingView {
  askerId: string
  askerName: string
  targetId: string
  targetName: string
  question: string
  targetIsYou: boolean
}

export interface GameView {
  youId: string
  phase: Phase
  difficulty: Difficulty
  pack: string
  packTitle: string
  status: 'playing' | 'finished'
  winner: Team | null
  endReason: EndReason | null
  youWon: boolean | null

  you: {
    isMole: boolean
    roleName: string // '' если ты крот
    locationName: string // '' если ты крот и партия не окончена
    locationEmoji: string
  }

  // публичный список локаций активного набора (подсказка всем, по нему крот гадает)
  locations: { emoji: string; name: string }[]

  players: ViewPlayer[]

  youReady: boolean
  readyCount: number
  playerCount: number

  round: number
  turnsTaken: number
  maxTurns: number
  currentAskerId: string
  currentAskerName: string
  youAreAsker: boolean
  pending: PendingView | null

  exchanges: ViewExchange[]

  voteCalledBy: string | null
  voteCalledByName: string | null
  yourVote: string | null | undefined

  lastVerdict: Verdict | null
  guess: GameState['guess']
}

export function toView(s: GameState, youId: string): GameView {
  const me = s.players.find(p => p.id === youId)
  const iAmMole = !!me?.isMole
  const finished = s.status === 'finished'
  const showLoc = !iAmMole || finished
  const askerId = s.turnOrder[s.turnPtr]

  const players: ViewPlayer[] = s.players.map(p => {
    const votedFor = p.id in s.votes ? s.votes[p.id] : undefined
    const votesOn = s.players.filter(q => s.votes[q.id] === p.id).length
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      isYou: p.id === youId,
      isAsker: s.phase === 'interrogation' && !s.pending && p.id === askerId,
      isMole: finished ? p.isMole : p.id === youId ? p.isMole : null,
      roleName: finished ? p.roleName : p.id === youId ? p.roleName : null,
      votedFor,
      votesOn,
    }
  })

  const pending: PendingView | null = s.pending
    ? {
        askerId: s.pending.askerId,
        askerName: s.players.find(p => p.id === s.pending!.askerId)?.name ?? '',
        targetId: s.pending.targetId,
        targetName: s.players.find(p => p.id === s.pending!.targetId)?.name ?? '',
        question: s.pending.question,
        targetIsYou: s.pending.targetId === youId,
      }
    : null

  const winner = s.winner
  const youWon = finished && winner ? (iAmMole ? winner === 'mole' : winner === 'town') : null

  return {
    youId,
    phase: s.phase,
    difficulty: s.difficulty,
    pack: s.pack,
    packTitle: packName(s.pack),
    status: s.status,
    winner,
    endReason: s.endReason,
    youWon,
    you: {
      isMole: iAmMole,
      roleName: me?.roleName ?? '',
      locationName: showLoc ? s.locationName : '',
      locationEmoji: showLoc ? s.locationEmoji : '',
    },
    locations: locationsForPack(s.pack).map(l => ({ emoji: l.emoji, name: l.name })),
    players,
    youReady: !!me?.ready,
    readyCount: s.players.filter(p => p.ready).length,
    playerCount: s.players.length,
    round: s.round,
    turnsTaken: s.turnsTaken,
    maxTurns: s.maxTurns,
    currentAskerId: askerId,
    currentAskerName: s.players.find(p => p.id === askerId)?.name ?? '',
    youAreAsker: s.phase === 'interrogation' && !s.pending && askerId === youId,
    pending,
    exchanges: s.exchanges.map(e => ({
      seq: e.seq,
      askerId: e.askerId,
      askerName: e.askerName,
      targetId: e.targetId,
      targetName: e.targetName,
      question: e.question,
      answer: e.answer,
    })),
    voteCalledBy: s.voteCalledBy,
    voteCalledByName: s.voteCalledBy ? s.players.find(p => p.id === s.voteCalledBy)?.name ?? null : null,
    yourVote: youId in s.votes ? s.votes[youId] : undefined,
    lastVerdict: s.lastVerdict,
    guess: s.guess,
  }
}

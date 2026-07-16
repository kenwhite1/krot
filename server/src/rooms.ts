// --- Менеджер онлайн-комнат ------------------------------------------------
// Авторитетные игры в памяти процесса (одиночный инстанс на Railway), как у Уно
// и Ночи. И соло, и онлайн идут через один и тот же код: соло это приватная
// комната, что сразу стартует с ботами; онлайн это игра с друзьями по коду;
// быстрая игра это комната, мгновенно добитая ботами под видом живых игроков.
//
// У «Крота» есть фазы-передышки (раздача, голосование) и пошаговый допрос, где
// то спрашивает бот, то ждём живого. Поэтому комнату двигает `tick` по стенным
// часам: он зовётся на каждом опросе и после каждого действия человека. Боты
// спрашивают, отвечают и голосуют сами с живым темпом; любое место, что
// просрочило своё окно, добирается автоматически, чтобы стол не завис.

import {
  createGame,
  applyAction,
  playerById,
  currentAskerId,
  interrogationOver,
  voteReady,
  revealReady,
  type GameState,
  type Action,
  type Difficulty,
  type PackId,
} from '../../shared/engine'
import { toView } from '../../shared/view'
import { answerForBot } from '../../shared/interrogation'
import { botAsk, botShouldCallVote, botVotes, botVote } from '../../shared/bots'
import { makeRng, randomSeed } from '../../shared/rng'
import { ROSTER, HUMAN_AVATARS, QUICK_NAMES } from '../../shared/names'
import type { RoomStateDto, RoomDto, RoomPlayerDto } from '../../shared/types'
import { recordResult } from './profiles'
import { reportMatch } from './gg'
import type { MatchMode } from '../../shared/gg'

interface Seat {
  id: string // человекообразный 'u<число>' и у людей, и у ботов (см. mintSeatId)
  tgId: number | null
  name: string
  avatar: string
  isBot: boolean
  isHost: boolean
  lastSeen: number
}

interface Room {
  code: string
  hostTgId: number
  quick: boolean // быстрая игра: боты под видом живых игроков
  solo: boolean
  seats: Seat[]
  game: GameState | null
  version: number
  // настройки лобби (хост меняет до старта)
  targetSeats: number
  difficulty: Difficulty
  pack: PackId
  addBots: boolean
  createdAt: number
  lastActivity: number
  // темп
  phaseAt: number
  stepAt: number
  nextActAt: number
  lastPhase: string
  botVotesDone: boolean
  scored: boolean
}

const rooms = new Map<string, Room>()
const DEFAULT_SEATS = 6
const MAX_PLAYERS = 8 // у локаций 7 ролей + крот
const MIN_PLAYERS = 3 // меньше уже не партия
const MAX_HUMANS = 8
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // без легко путаемых символов

// темп (мс)
const REVEAL_MS = 14000
const ANSWER_HUMAN_MS = 32000
const ASK_HUMAN_MS = 50000
const VOTE_BOT_MS = 4500
const VOTE_MS = 42000

function newCode(): string {
  let code = ''
  do {
    code = ''
    for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  } while (rooms.has(code))
  return code
}

const seatFor = (room: Room, tgId: number) => room.seats.find(s => s.tgId === tgId)
const seatById = (room: Room, id: string) => room.seats.find(s => s.id === id)

function beat(d: Difficulty): number {
  const base = d === 'hard' ? 1600 : d === 'normal' ? 2000 : 2300
  return base + Math.floor(Math.random() * 1700)
}

// Боты быстрой игры маскируются под живых: человеческие имена и лица, и в DTO
// они отдаются как isBot:false, чтобы игрок не отличил их от настоящих соседей.
function disguised(room: Room): boolean {
  return room.quick
}

function playerDto(room: Room, s: Seat): RoomPlayerDto {
  return {
    id: s.id,
    name: s.name,
    avatar: s.avatar,
    isBot: disguised(room) ? false : s.isBot,
    isHost: s.isHost,
    connected: s.isBot || Date.now() - s.lastSeen < 15000,
  }
}

function roomDto(room: Room): RoomDto {
  return {
    code: room.code,
    hostId: `u${room.hostTgId}`,
    started: !!room.game,
    quick: room.quick,
    players: room.seats.map(s => playerDto(room, s)),
    maxPlayers: MAX_HUMANS,
    seats: room.targetSeats,
    pack: room.pack,
    difficulty: room.difficulty,
    addBots: room.addBots,
  }
}

function baseRoom(tgId: number, name: string, opts: Partial<Room> = {}): Room {
  const now = Date.now()
  return {
    code: newCode(),
    hostTgId: tgId,
    quick: false,
    solo: false,
    seats: [{ id: `u${tgId}`, tgId, name, avatar: HUMAN_AVATARS[0], isBot: false, isHost: true, lastSeen: now }],
    game: null,
    version: 1,
    targetSeats: DEFAULT_SEATS,
    difficulty: 'normal',
    pack: 'classic',
    addBots: true,
    createdAt: now,
    lastActivity: now,
    phaseAt: now,
    stepAt: now,
    nextActAt: now,
    lastPhase: '',
    botVotesDone: false,
    scored: false,
    ...opts,
  }
}

// Человекообразный, неотличимый id для бота. Места людей это `u<tgid>`; даём
// ботам тот же вид `u<число>`, чтобы по самому id (в players, pending, ленте,
// голосах) нельзя было отличить бота от живого. Уникальность проверяем по столу.
function mintSeatId(room: Room): string {
  let id: string
  do {
    id = `u${100000000 + Math.floor(Math.random() * 899999999)}`
  } while (room.seats.some(s => s.id === id))
  return id
}

// Добор мест ботами. В соло/друзья боты открытые (имена и лица из состава);
// в быстрой игре боты маскируются под живых (человеческие имена и лица). В любом
// случае id бота человекообразный, чтобы маскировка не текла через id.
function fillBots(room: Room, upTo: number): void {
  const used = new Set(room.seats.map(s => s.avatar))
  const usedNames = new Set(room.seats.map(s => s.name))
  let b = room.seats.filter(s => s.isBot).length
  while (room.seats.length < Math.min(upTo, MAX_PLAYERS)) {
    b++
    let name: string
    let avatar: string
    if (disguised(room)) {
      const human = HUMAN_AVATARS.filter(a => !used.has(a))
      avatar = human.length ? human[Math.floor(Math.random() * human.length)] : HUMAN_AVATARS[b % HUMAN_AVATARS.length]
      const pool = QUICK_NAMES.filter(n => !usedNames.has(n))
      name = pool.length ? pool[Math.floor(Math.random() * pool.length)] : QUICK_NAMES[b % QUICK_NAMES.length]
    } else {
      const t = ROSTER.find(r => !used.has(r.avatar)) ?? ROSTER[b % ROSTER.length]
      avatar = t.avatar
      name = t.name
    }
    used.add(avatar)
    usedNames.add(name)
    room.seats.push({ id: mintSeatId(room), tgId: null, name, avatar, isBot: true, isHost: false, lastSeen: Date.now() })
  }
}

function beginGame(room: Room): void {
  room.game = createGame({
    players: room.seats.map(s => ({ id: s.id, name: s.name, avatar: s.avatar, isBot: s.isBot })),
    seed: randomSeed(),
    difficulty: room.difficulty,
    pack: room.pack,
  })
  room.scored = false
  room.botVotesDone = false
  const now = Date.now()
  room.phaseAt = now
  room.stepAt = now
  room.nextActAt = now + beat(room.difficulty)
  room.lastPhase = room.game.phase
  room.version++
  room.lastActivity = now
  tickRoom(room)
}

// ── создание / вход ──────────────────────────────────────────────────────────

export function createSolo(tgId: number, name: string, difficulty: Difficulty, pack: PackId): RoomStateDto {
  const room = baseRoom(tgId, name, { solo: true, difficulty, pack, addBots: true, targetSeats: DEFAULT_SEATS })
  rooms.set(room.code, room)
  fillBots(room, DEFAULT_SEATS)
  beginGame(room)
  return stateFor(room, tgId)
}

export function quickMatch(tgId: number, name: string, difficulty: Difficulty = 'normal'): RoomStateDto {
  const room = baseRoom(tgId, name, { quick: true, difficulty, pack: 'classic', addBots: true, targetSeats: DEFAULT_SEATS })
  rooms.set(room.code, room)
  fillBots(room, DEFAULT_SEATS)
  beginGame(room)
  return stateFor(room, tgId)
}

export function createRoom(tgId: number, name: string, difficulty: Difficulty, pack: PackId): RoomStateDto {
  const room = baseRoom(tgId, name, { difficulty, pack })
  rooms.set(room.code, room)
  return stateFor(room, tgId)
}

export function joinRoom(code: string, tgId: number, name: string): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'no_room' }
  if (room.game) return { error: 'already_started' }
  const existing = seatFor(room, tgId)
  if (existing) {
    existing.lastSeen = Date.now()
    return stateFor(room, tgId)
  }
  const humans = room.seats.filter(s => !s.isBot).length
  if (humans >= MAX_HUMANS) return { error: 'full' }
  room.seats.push({
    id: `u${tgId}`,
    tgId,
    name,
    avatar: HUMAN_AVATARS[humans % HUMAN_AVATARS.length],
    isBot: false,
    isHost: false,
    lastSeen: Date.now(),
  })
  room.version++
  room.lastActivity = Date.now()
  return stateFor(room, tgId)
}

export function setRoomConfig(
  code: string,
  tgId: number,
  cfg: { difficulty?: Difficulty; pack?: PackId; addBots?: boolean },
): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'no_room' }
  if (room.hostTgId !== tgId) return { error: 'not_host' }
  if (room.game) return { error: 'already_started' }
  if (cfg.difficulty) room.difficulty = cfg.difficulty
  if (cfg.pack) room.pack = cfg.pack
  if (typeof cfg.addBots === 'boolean') room.addBots = cfg.addBots
  room.version++
  room.lastActivity = Date.now()
  return stateFor(room, tgId)
}

export function startRoom(code: string, tgId: number): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'no_room' }
  if (room.hostTgId !== tgId) return { error: 'not_host' }
  if (room.game) return { error: 'already_started' }
  const humans = room.seats.filter(s => !s.isBot).length
  if (room.addBots) {
    fillBots(room, Math.max(room.targetSeats, humans + 1))
  } else if (humans < MIN_PLAYERS) {
    return { error: 'need_players' }
  }
  if (room.seats.length < MIN_PLAYERS) return { error: 'need_players' }
  beginGame(room)
  return stateFor(room, tgId)
}

// ── драйвер темпа ──────────────────────────────────────────────────────────────

const humanIds = (room: Room) => new Set(room.seats.filter(s => !s.isBot).map(s => s.id))

function apply(room: Room, action: Action): string | undefined {
  if (!room.game) return 'no_game'
  const res = applyAction(room.game, action)
  if (res.error) return res.error
  room.game = res.state
  room.version++
  return undefined
}

function applyAndPace(room: Room, action: Action): string | undefined {
  const e = apply(room, action)
  if (!e) {
    const now = Date.now()
    room.stepAt = now
    room.nextActAt = now + beat(room.difficulty)
  }
  return e
}

function applyBotAnswer(room: Room): void {
  const g = room.game!
  if (!g.pending) return
  const answerer = playerById(g, g.pending.targetId)!
  const rng = makeRng((g.rngState ^ (g.seq * 0x9e3779b1)) >>> 0)
  const { text, tell } = answerForBot(g, answerer, rng)
  applyAndPace(room, { type: 'answer', text, tell })
}

// Двигаем комнату по стенным часам и по тому, чьи входные данные собраны.
function tickRoom(room: Room): void {
  if (!room.game) return
  const now = Date.now()

  if (room.game.phase !== room.lastPhase) {
    room.lastPhase = room.game.phase
    room.phaseAt = now
    room.botVotesDone = false
  }

  const g = room.game
  if (g.status === 'finished') {
    finalize(room)
    return
  }

  switch (g.phase) {
    case 'reveal': {
      if (revealReady(g) || now - room.phaseAt > REVEAL_MS) {
        applyAndPace(room, { type: 'advance' })
        tickRoom(room)
      }
      break
    }
    case 'interrogation': {
      if (g.pending) {
        const target = playerById(g, g.pending.targetId)!
        if (target.isBot) {
          if (now >= room.nextActAt) {
            applyBotAnswer(room)
            tickRoom(room)
          }
        } else if (now - room.stepAt > ANSWER_HUMAN_MS) {
          applyBotAnswer(room) // живой просрочил ответ: добираем за него
          tickRoom(room)
        }
      } else if (interrogationOver(g)) {
        applyAndPace(room, { type: 'advance' }) // -> голосование
        tickRoom(room)
      } else {
        const asker = currentAskerId(g)
        const seat = seatById(room, asker)
        if (seat?.isBot) {
          if (now >= room.nextActAt) {
            if (botShouldCallVote(g, asker)) applyAndPace(room, { type: 'callVote', byId: asker })
            else {
              const { targetId, question } = botAsk(g, asker)
              applyAndPace(room, { type: 'ask', askerId: asker, targetId, question })
            }
            tickRoom(room)
          }
        } else if (now - room.stepAt > ASK_HUMAN_MS) {
          const { targetId, question } = botAsk(g, asker) // живой завис: задаём за него
          applyAndPace(room, { type: 'ask', askerId: asker, targetId, question })
          tickRoom(room)
        }
      }
      break
    }
    case 'vote': {
      if (!room.botVotesDone && now - room.phaseAt > VOTE_BOT_MS) {
        for (const a of botVotes(g, humanIds(room))) apply(room, a)
        room.botVotesDone = true
      }
      if (voteReady(g)) {
        applyAndPace(room, { type: 'advance' })
        tickRoom(room)
      } else if (now - room.phaseAt > VOTE_MS) {
        if (!room.botVotesDone) {
          for (const a of botVotes(g, humanIds(room))) apply(room, a)
          room.botVotesDone = true
        }
        fillMissingVotes(room)
        applyAndPace(room, { type: 'advance' })
        tickRoom(room)
      }
      break
    }
  }
}

function fillMissingVotes(room: Room): void {
  const g = room.game!
  for (const p of g.players) {
    if (!(p.id in g.votes)) apply(room, { type: 'vote', playerId: p.id, targetId: botVote(g, p.id) })
  }
}

// ── действия игроков ───────────────────────────────────────────────────────────

function actingSeat(code: string, tgId: number): Room | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room || !room.game) return { error: 'no_game' }
  const seat = seatFor(room, tgId)
  if (!seat) return { error: 'not_in_room' }
  seat.lastSeen = Date.now()
  room.lastActivity = Date.now()
  return room
}

export function readyInRoom(code: string, tgId: number): RoomStateDto | { error: string } {
  const r = actingSeat(code, tgId)
  if ('error' in r) return r
  const seat = seatFor(r, tgId)!
  apply(r, { type: 'ready', playerId: seat.id })
  tickRoom(r)
  return stateFor(r, tgId)
}

export function askInRoom(
  code: string,
  tgId: number,
  targetId: string,
  question: string,
): RoomStateDto | { error: string } {
  const r = actingSeat(code, tgId)
  if ('error' in r) return r
  const seat = seatFor(r, tgId)!
  const e = applyAndPace(r, { type: 'ask', askerId: seat.id, targetId, question })
  if (e) return { error: e }
  tickRoom(r)
  return stateFor(r, tgId)
}

export function answerInRoom(
  code: string,
  tgId: number,
  vibe: 'solid' | 'easy' | 'risky',
  text: string,
): RoomStateDto | { error: string } {
  const r = actingSeat(code, tgId)
  if ('error' in r) return r
  const seat = seatFor(r, tgId)!
  if (r.game!.pending?.targetId !== seat.id) return { error: 'not_your_answer' }
  // tell считаем на сервере из выбранного «вайба», чтобы его нельзя было подделать
  const me = playerById(r.game!, seat.id)!
  const tell = tellForVibe(vibe, me.isMole, makeRng((r.game!.rngState ^ (r.game!.seq * 2654435761)) >>> 0))
  const e = applyAndPace(r, { type: 'answer', text, tell })
  if (e) return { error: e }
  tickRoom(r)
  return stateFor(r, tgId)
}

function tellForVibe(vibe: 'solid' | 'easy' | 'risky', isMole: boolean, rng: ReturnType<typeof makeRng>): number {
  const ranges = isMole
    ? { solid: [0.22, 0.34], easy: [0.4, 0.52], risky: [0.6, 0.78] }
    : { solid: [0.08, 0.2], easy: [0.2, 0.32], risky: [0.55, 0.75] }
  const [lo, hi] = ranges[vibe]
  return lo + rng.next() * (hi - lo)
}

export function callVoteInRoom(code: string, tgId: number): RoomStateDto | { error: string } {
  const r = actingSeat(code, tgId)
  if ('error' in r) return r
  const seat = seatFor(r, tgId)!
  const e = apply(r, { type: 'callVote', byId: seat.id })
  if (e) return { error: e }
  tickRoom(r)
  return stateFor(r, tgId)
}

export function voteInRoom(code: string, tgId: number, targetId: string | null): RoomStateDto | { error: string } {
  const r = actingSeat(code, tgId)
  if ('error' in r) return r
  const seat = seatFor(r, tgId)!
  const e = apply(r, { type: 'vote', playerId: seat.id, targetId })
  if (e) return { error: e }
  tickRoom(r)
  return stateFor(r, tgId)
}

export function guessInRoom(code: string, tgId: number, locationName: string): RoomStateDto | { error: string } {
  const r = actingSeat(code, tgId)
  if ('error' in r) return r
  const seat = seatFor(r, tgId)!
  const e = apply(r, { type: 'guess', byId: seat.id, locationName })
  if (e) return { error: e }
  tickRoom(r)
  return stateFor(r, tgId)
}

export function getRoomState(code: string, tgId: number): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'no_room' }
  // читать комнату может только её участник, иначе любой авторизованный мог бы
  // опрашивать произвольные коды и подсматривать составы лобби.
  const seat = seatFor(room, tgId)
  if (!seat) return { error: 'not_in_room' }
  seat.lastSeen = Date.now()
  tickRoom(room)
  return stateFor(room, tgId)
}

export function leaveRoom(code: string, tgId: number): void {
  const room = rooms.get(code.toUpperCase())
  if (!room) return
  if (!room.game) {
    room.seats = room.seats.filter(s => s.tgId !== tgId)
    if (room.seats.filter(s => !s.isBot).length === 0) rooms.delete(code.toUpperCase())
    else room.version++
  }
}

function finalize(room: Room): void {
  if (!room.game || room.game.status !== 'finished' || room.scored) return
  room.scored = true
  const g = room.game
  const winner = g.winner!
  const humans = room.seats.filter(s => !s.isBot && s.tgId != null)
  const mode: MatchMode = room.solo ? 'solo' : room.quick ? 'multi' : 'friends'
  const moleId = g.players.find(p => p.isMole)?.id
  for (const s of room.seats) {
    if (s.isBot || s.tgId == null) continue
    const me = g.players.find(p => p.id === s.id)
    if (!me) continue
    const won = me.isMole ? winner === 'mole' : winner === 'town'
    recordResult(s.tgId, room.solo ? 'solo' : 'online', won, me.isMole)
    // «Контрразведка»: сам показал на крота, и стол его за это взял. Голосование
    // в партии ровно одно (любой вердикт заканчивает игру), так что «с первого
    // голосования» выполняется по построению — проверяем лишь свой голос.
    const counterIntel = !me.isMole && g.endReason === 'caught' && g.votes[me.id] === moleId
    // Рапорт хабу: room.scored выше гарантирует один раз на партию, а ключ
    // идемпотентности (код+время создания комнаты) — что повтор не доплатит.
    reportMatch({
      userId: s.tgId,
      idempotencyKey: `krot-${room.code}-${room.createdAt}-${s.tgId}`,
      result: won ? 'win' : 'loss',
      placement: won ? 1 : 2,
      players: room.seats.length,
      humanPlayers: humans.length,
      mode,
      opponents: humans.filter(h => h.tgId !== s.tgId).map(h => h.tgId as number),
      stats: counterIntel ? { signature: true } : undefined,
    })
  }
}

function stateFor(room: Room, tgId: number): RoomStateDto {
  const seat = seatFor(room, tgId)
  let view = room.game && seat ? toView(room.game, seat.id) : null
  // маскировка ботов под живых в быстрой игре: гасим признак бота и в виде
  if (view && disguised(room)) view = { ...view, players: view.players.map(p => ({ ...p, isBot: false })) }
  let roundOver: RoomStateDto['roundOver'] = null
  if (room.game?.status === 'finished' && room.game.winner && seat) {
    const me = room.game.players.find(p => p.id === seat.id)
    const won = me ? (me.isMole ? room.game.winner === 'mole' : room.game.winner === 'town') : false
    roundOver = { winner: room.game.winner, youWon: won }
  }
  return { room: roomDto(room), version: room.version, view, roundOver }
}

// чистим простаивающие комнаты раз в 10 мин (30 мин без активности = удаляем)
setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > 30 * 60_000) rooms.delete(code)
  }
}, 10 * 60_000).unref?.()

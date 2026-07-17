import { create } from 'zustand'
import type { Profile, RoomStateDto, Difficulty, PackId } from '@shared/types'
import { api, type RoomConfig, type LeaderRow } from './api'
import { haptic } from './telegram'
import { playSfx } from './sound'
import { t } from './i18n'

type Screen = 'home' | 'rules' | 'leaderboard' | 'lobby' | 'game'

interface S {
  ready: boolean
  screen: Screen
  mode: 'solo' | 'online' | null
  profile: Profile | null
  botUsername: string

  room: RoomStateDto | null
  busy: boolean
  joinError: string | null

  toast: string | null
  result: RoomStateDto['roundOver']

  difficulty: Difficulty
  pack: PackId
  setupOpen: 'solo' | 'create' | null
  showRole: boolean

  leaderboard: LeaderRow[]

  init(): Promise<void>
  go(s: Screen): void
  openSetup(kind: 'solo' | 'create'): void
  closeSetup(): void
  setDifficulty(d: Difficulty): void
  setPack(p: PackId): void

  startSolo(): Promise<void>
  quickMatch(): Promise<void>
  createRoom(): Promise<void>
  joinRoom(code: string): Promise<void>
  setConfig(cfg: RoomConfig): Promise<void>
  startRoom(): Promise<void>

  readyUp(): Promise<void>
  ask(targetId: string, question: string): Promise<void>
  answer(vibe: 'solid' | 'easy' | 'risky', text: string): Promise<void>
  callVote(): Promise<void>
  vote(targetId: string | null): Promise<void>
  guess(locationName: string): Promise<void>

  openRole(): void
  closeRole(): void
  leaveGame(): void
  loadLeaderboard(): Promise<void>
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let polling = false
let lastSeq = 0
let prevPhase = ''
let prevAsker = false
let prevPendingYou = false

function stopPoll() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  polling = false
}

const JOIN_ERR: Record<string, string> = {
  no_room: 'Нет комнаты с таким кодом.',
  already_started: 'Игра уже началась.',
  full: 'В комнате нет мест.',
  bad_code: 'Код из четырёх символов.',
}

export const useStore = create<S>((set, get) => {
  function toast(text: string) {
    const msg = t(text)
    set({ toast: msg })
    setTimeout(() => { if (get().toast === msg) set({ toast: null }) }, 2200)
  }

  function resetSfxTrackers(view: RoomStateDto['view']) {
    lastSeq = view?.exchanges.length ? view.exchanges[view.exchanges.length - 1].seq : 0
    prevPhase = view?.phase ?? ''
    prevAsker = !!view?.youAreAsker
    prevPendingYou = !!view?.pending?.targetIsYou
  }

  function applyRoom(next: RoomStateDto): void {
    const prev = get().room
    set({ room: next })

    // старт партии: и хозяин, и присоединившийся узнают из опроса и переходят в игру
    if (next.view && get().screen !== 'game') set({ screen: 'game', mode: get().mode ?? 'online' })

    const view = next.view
    if (view) {
      // новая реплика на ленте: тёплый отклик
      const newest = view.exchanges.length ? view.exchanges[view.exchanges.length - 1].seq : 0
      if (newest > lastSeq) {
        if (lastSeq !== 0 || prevPhase) playSfx('answer')
        lastSeq = newest
      }
      // фаза перешла к голосованию
      if (view.phase === 'vote' && prevPhase !== 'vote') { playSfx('accuse'); haptic('warn') }
      // твой ход спрашивать
      if (view.youAreAsker && !prevAsker) haptic('select')
      // тебя спрашивают: пора отвечать
      if (view.pending?.targetIsYou && !prevPendingYou) { haptic('select'); playSfx('ask') }
      prevPhase = view.phase
      prevAsker = view.youAreAsker
      prevPendingYou = !!view.pending?.targetIsYou
    }

    // итог партии
    if (next.roundOver && !prev?.roundOver) {
      stopPoll()
      playSfx(next.roundOver.youWon ? 'win' : 'lose')
      haptic(next.roundOver.youWon ? 'success' : 'warn')
      set({ result: next.roundOver, showRole: false })
      api.profile().then(p => set({ profile: p.profile })).catch(() => {})
    }
  }

  function startPoll(code: string) {
    stopPoll()
    pollTimer = setInterval(async () => {
      if (polling) return
      polling = true
      try { applyRoom(await api.roomState(code)) } catch { /* временная сеть */ }
      finally { polling = false }
    }, 1100)
  }

  function enterRoom(st: RoomStateDto, mode: 'solo' | 'online') {
    resetSfxTrackers(st.view)
    set({
      mode,
      room: st,
      result: null,
      showRole: false,
      screen: st.view ? 'game' : 'lobby',
      busy: false,
    })
    startPoll(st.room.code)
  }

  function resetGame(extra: Partial<S> = {}) {
    stopPoll()
    lastSeq = 0; prevPhase = ''; prevAsker = false; prevPendingYou = false
    set({ room: null, mode: null, result: null, showRole: false, ...extra })
  }

  async function send(action: () => Promise<RoomStateDto>, onErr?: (code: string) => void) {
    const st = get()
    if (st.busy) return
    set({ busy: true })
    try {
      applyRoom(await action())
      set({ busy: false })
    } catch (e) {
      set({ busy: false })
      const code = (e as { data?: { error?: string } })?.data?.error ?? ''
      if (onErr) onErr(code)
      else { haptic('warn'); toast('Не получилось, попробуй ещё раз.') }
    }
  }

  return {
    ready: false,
    screen: 'home',
    mode: null,
    profile: null,
    botUsername: 'krot_play_bot',
    room: null,
    busy: false,
    joinError: null,
    toast: null,
    result: null,
    difficulty: (localStorage.getItem('krotDiff') as Difficulty) || 'normal',
    pack: (localStorage.getItem('krotPack') as PackId) || 'classic',
    setupOpen: null,
    showRole: false,
    leaderboard: [],

    async init() {
      try {
        const { profile, startParam, botUsername } = await api.auth()
        set({ profile, botUsername: botUsername || 'krot_play_bot', ready: true })
        if (startParam?.startsWith('room_')) {
          const code = startParam.slice(5).toUpperCase()
          if (/^[A-Z0-9]{4}$/.test(code)) await get().joinRoom(code)
        }
      } catch {
        set({ ready: true })
      }
    },

    go(screen) {
      haptic('tap')
      if (screen !== 'lobby' && screen !== 'game') stopPoll()
      set({ screen })
    },

    openSetup(kind) { haptic('tap'); set({ setupOpen: kind }) },
    closeSetup() { set({ setupOpen: null }) },
    setDifficulty(d) { localStorage.setItem('krotDiff', d); set({ difficulty: d }); haptic('select') },
    setPack(p) { localStorage.setItem('krotPack', p); set({ pack: p }); haptic('select') },

    async startSolo() {
      const { difficulty, pack } = get()
      resetGame({ busy: true, setupOpen: null })
      try { enterRoom(await api.solo(difficulty, pack), 'solo') }
      catch { set({ busy: false }); toast('Не удалось начать игру. Проверь связь.') }
    },

    async quickMatch() {
      const { difficulty } = get()
      resetGame({ busy: true, joinError: null })
      try { enterRoom(await api.roomQuick(difficulty), 'online') }
      catch { set({ busy: false }); toast('Не удалось подобрать игру. Проверь связь.') }
    },

    async createRoom() {
      const { difficulty, pack } = get()
      resetGame({ busy: true, joinError: null, setupOpen: null })
      try {
        const st = await api.roomCreate(difficulty, pack)
        set({ mode: 'online', room: st, screen: 'lobby', busy: false })
        startPoll(st.room.code)
      } catch { set({ busy: false }); toast('Не удалось создать комнату. Проверь связь.') }
    },

    async joinRoom(code) {
      resetGame({ busy: true, joinError: null })
      try { enterRoom(await api.roomJoin(code), 'online') }
      catch (e) {
        const err = (e as { data?: { error?: string } })?.data?.error ?? ''
        set({ busy: false, joinError: t(JOIN_ERR[err] ?? 'Не удалось войти.') })
      }
    },

    async setConfig(cfg) {
      const room = get().room
      if (!room) return
      try { applyRoom(await api.roomConfig(room.room.code, cfg)); haptic('select') } catch { /* не хост */ }
    },

    async startRoom() {
      const room = get().room
      if (!room) return
      await send(() => api.roomStart(room.room.code), code => {
        haptic('warn')
        toast(code === 'need_players' ? 'Нужно хотя бы трое игроков.' : 'Не удалось начать.')
      })
    },

    async readyUp() {
      const room = get().room
      if (!room) return
      playSfx('reveal')
      await send(() => api.roomReady(room.room.code))
    },

    async ask(targetId, question) {
      const room = get().room
      if (!room) return
      playSfx('ask')
      haptic('tap')
      await send(() => api.roomAsk(room.room.code, targetId, question), () => { haptic('warn'); toast('Сейчас не твой ход.') })
    },

    async answer(vibe, text) {
      const room = get().room
      if (!room) return
      playSfx('answer')
      haptic('tap')
      await send(() => api.roomAnswer(room.room.code, vibe, text))
    },

    async callVote() {
      const room = get().room
      if (!room) return
      playSfx('accuse')
      haptic('heavy')
      await send(() => api.roomCallVote(room.room.code))
    },

    async vote(targetId) {
      const room = get().room
      if (!room) return
      playSfx('vote')
      haptic('select')
      await send(() => api.roomVote(room.room.code, targetId))
    },

    async guess(locationName) {
      const room = get().room
      if (!room) return
      haptic('heavy')
      await send(() => api.roomGuess(room.room.code, locationName))
    },

    openRole() { haptic('tap'); set({ showRole: true }) },
    closeRole() { set({ showRole: false }) },

    leaveGame() {
      const room = get().room
      if (room) api.roomLeave(room.room.code).catch(() => {})
      resetGame({ screen: 'home' })
      haptic('tap')
    },

    async loadLeaderboard() {
      try { set({ leaderboard: (await api.leaderboard()).top }) } catch { /* офлайн */ }
    },
  }
})

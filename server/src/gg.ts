// Интеграция с хабом Game is Game: игра рапортует исход матча, хаб решает
// награду. Всё fire-and-forget — хаб недоступен, игра живёт дальше.
import { db } from './db'
import { ggReport, decodeLaunchParam, type MatchMode, type MatchOutcome } from '../../shared/gg'

const HUB_URL = (process.env.GG_HUB_URL ?? '').replace(/\/$/, '')

/** Токен запуска приезжает в startapp; храним его до конца матча. */
export function storeLaunchToken(userId: number, startParam: string | null | undefined): void {
  const token = decodeLaunchParam(startParam ?? undefined)
  if (!token) return
  db.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, 'Игрок')").run(userId)
  db.prepare('UPDATE users SET gg_launch=? WHERE id=?').run(token, userId)
}

function launchTokenOf(userId: number): string | null {
  const row = db.prepare('SELECT gg_launch FROM users WHERE id=?').get(userId) as
    | { gg_launch: string | null }
    | undefined
  return row?.gg_launch ?? null
}

export interface MatchFacts {
  userId: number
  /** Уникален для пары «матч + игрок»: хаб дедупит выплату по нему. */
  idempotencyKey: string
  result: MatchOutcome
  placement: number | null
  players: number
  humanPlayers: number
  /** У «Крота» очков за партию нет — поле необязательно. */
  score?: number
  mode: MatchMode
  opponents: number[]
  stats?: Record<string, number | boolean>
}

/** Один вызов на конец матча для каждого живого игрока. */
export function reportMatch(f: MatchFacts): void {
  if (!HUB_URL) return
  const token = launchTokenOf(f.userId)
  // Игрок пришёл в бота напрямую, а не из хаба — рапортовать не от чьего имени.
  if (!token) return
  void ggReport(HUB_URL, token, {
    idempotencyKey: f.idempotencyKey,
    result: f.result,
    placement: f.placement ?? undefined,
    players: f.players,
    humanPlayers: f.humanPlayers,
    score: f.score,
    mode: f.mode,
    opponents: f.opponents,
    stats: f.stats,
  }).catch(() => {})
}

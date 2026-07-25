import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { validateInitData, issueToken, verifyToken } from './auth'
import type { Env } from './env'
import type { RoomStateDto } from '../../shared/types'
import { BOT_USERNAME } from './env'
import { getOrCreateUser, getProfile, topPlayers } from './profiles'
import { storeLaunchToken, withHubCoins, hubFriends, inviteHubFriends } from './gg'
import {
  createSolo, createRoom, quickMatch, joinRoom, setRoomConfig, startRoom,
  readyInRoom, askInRoom, answerInRoom, callVoteInRoom, voteInRoom, guessInRoom,
  getRoomState, leaveRoom,
} from './rooms'

export const api = new Hono<Env>()

api.get('/health', c => c.json({ ok: true }))

api.post('/auth', async c => {
  const body = await c.req.json<{ initData: string }>().catch(() => null)
  if (!body) return c.json({ error: 'bad_request' }, 400)
  const v = validateInitData(body.initData ?? '')
  if (!v) return c.json({ error: 'invalid_init_data' }, 401)
  const name = [v.user.first_name, v.user.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Игрок'
  getOrCreateUser(v.user.id, name, v.user.username)
  storeLaunchToken(v.user.id, v.startParam)
  const token = await issueToken(v.user.id)
  const profile = await withHubCoins(v.user.id, getProfile(v.user.id))
  return c.json({ token, profile, startParam: v.startParam, botUsername: BOT_USERNAME })
})

// Лёгкий лимит на пишущие запросы (на пользователя, скользящее окно). Опрос
// состояния это GET и под лимит не попадает, как и обычный темп ходов; отсекаем
// лишь явный флуд. Память ограничена числом активных игроков и чистится по сроку.
const writeHits = new Map<number, number[]>()
const WRITE_LIMIT = 180
const WRITE_WINDOW = 60_000
function writeAllowed(uid: number): boolean {
  const now = Date.now()
  const arr = (writeHits.get(uid) ?? []).filter(t => now - t < WRITE_WINDOW)
  arr.push(now)
  writeHits.set(uid, arr)
  return arr.length <= WRITE_LIMIT
}
setInterval(() => {
  const now = Date.now()
  for (const [uid, arr] of writeHits) {
    if (arr.every(t => now - t >= WRITE_WINDOW)) writeHits.delete(uid)
  }
}, 5 * 60_000).unref?.()

api.use('/*', async (c, next) => {
  if (c.req.path === '/api/auth' || c.req.path === '/api/health') return next()
  const token = c.req.header('authorization')?.replace(/^Bearer /, '')
  const uid = token ? await verifyToken(token) : null
  if (!uid) return c.json({ error: 'unauthorized' }, 401)
  if (c.req.method !== 'GET' && !writeAllowed(uid)) return c.json({ error: 'rate_limited' }, 429)
  c.set('uid', uid)
  return next()
})

api.get('/profile', async c => c.json({ profile: await withHubCoins(c.get('uid'), getProfile(c.get('uid'))) }))
api.get('/leaderboard', c => c.json({ top: topPlayers(20) }))

const difficultySchema = z.enum(['easy', 'normal', 'hard'])
const packSchema = z.enum(['classic', 'travel', 'special', 'all'])
const nameOf = (uid: number) => getProfile(uid)?.name ?? 'Игрок'
const errStatus = (e: string): 404 | 400 => (e === 'no_room' || e === 'no_game' ? 404 : 400)
const send = (c: Context<Env>, r: RoomStateDto | { error: string }) =>
  'error' in r ? c.json(r, errStatus(r.error)) : c.json(r)

api.post('/solo', async c => {
  const uid = c.get('uid')
  const body = await c.req.json<{ difficulty?: string; pack?: string }>().catch(() => null)
  const diff = difficultySchema.safeParse(body?.difficulty)
  const pack = packSchema.safeParse(body?.pack)
  return c.json(createSolo(uid, nameOf(uid), diff.success ? diff.data : 'normal', pack.success ? pack.data : 'classic'))
})

api.post('/room/quick', async c => {
  const uid = c.get('uid')
  const body = await c.req.json<{ difficulty?: string }>().catch(() => null)
  const diff = difficultySchema.safeParse(body?.difficulty)
  return c.json(quickMatch(uid, nameOf(uid), diff.success ? diff.data : 'normal'))
})

api.post('/room/create', async c => {
  const uid = c.get('uid')
  const body = await c.req.json<{ difficulty?: string; pack?: string }>().catch(() => null)
  const diff = difficultySchema.safeParse(body?.difficulty)
  const pack = packSchema.safeParse(body?.pack)
  return c.json(createRoom(uid, nameOf(uid), diff.success ? diff.data : 'normal', pack.success ? pack.data : 'classic'))
})

api.post('/room/join', async c => {
  const uid = c.get('uid')
  const body = await c.req.json<{ code: string }>().catch(() => null)
  const code = (body?.code ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{4}$/.test(code)) return c.json({ error: 'bad_code' }, 400)
  return send(c, joinRoom(code, uid, nameOf(uid)))
})

const configSchema = z.object({
  difficulty: difficultySchema.optional(),
  pack: packSchema.optional(),
  addBots: z.boolean().optional(),
})
api.post('/room/:code/config', async c => {
  const body = await c.req.json().catch(() => null)
  const parsed = configSchema.safeParse(body ?? {})
  if (!parsed.success) return c.json({ error: 'bad_config' }, 400)
  return send(c, setRoomConfig(c.req.param('code'), c.get('uid'), parsed.data))
})

api.get('/room/:code', c => send(c, getRoomState(c.req.param('code'), c.get('uid'))))
api.post('/room/:code/start', c => send(c, startRoom(c.req.param('code'), c.get('uid'))))
api.post('/room/:code/ready', c => send(c, readyInRoom(c.req.param('code'), c.get('uid'))))

const askSchema = z.object({ targetId: z.string().min(1).max(40), question: z.string().min(1).max(160) })
api.post('/room/:code/ask', async c => {
  const parsed = askSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_ask' }, 400)
  return send(c, askInRoom(c.req.param('code'), c.get('uid'), parsed.data.targetId, parsed.data.question))
})

const answerSchema = z.object({ vibe: z.enum(['solid', 'easy', 'risky']), text: z.string().min(1).max(160) })
api.post('/room/:code/answer', async c => {
  const parsed = answerSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_answer' }, 400)
  return send(c, answerInRoom(c.req.param('code'), c.get('uid'), parsed.data.vibe, parsed.data.text))
})

api.post('/room/:code/callvote', c => send(c, callVoteInRoom(c.req.param('code'), c.get('uid'))))

const voteSchema = z.object({ targetId: z.string().min(1).max(40).nullable() })
api.post('/room/:code/vote', async c => {
  const parsed = voteSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_vote' }, 400)
  return send(c, voteInRoom(c.req.param('code'), c.get('uid'), parsed.data.targetId))
})

const guessSchema = z.object({ locationName: z.string().min(1).max(60) })
api.post('/room/:code/guess', async c => {
  const parsed = guessSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_guess' }, 400)
  return send(c, guessInRoom(c.req.param('code'), c.get('uid'), parsed.data.locationName))
})

api.post('/room/:code/leave', c => {
  leaveRoom(c.req.param('code'), c.get('uid'))
  return c.json({ ok: true })
})

// Друзья из хаба: список для панели «позвать» и сама рассылка приглашений.
api.get('/friends/hub', async c => {
  const friends = await hubFriends(c.get('uid')).catch(() => [])
  return c.json({ friends })
})
api.post('/friends/invite', async c => {
  type InviteBody = { friendIds?: number[]; note?: string }
  const body = await c.req.json<InviteBody>().catch((): InviteBody => ({}))
  const ids = Array.isArray(body.friendIds) ? body.friendIds.slice(0, 20) : []
  if (ids.length === 0) return c.json({ error: 'bad_request' }, 400)
  const sent = await inviteHubFriends(c.get('uid'), ids, body.note).catch(() => 0)
  return c.json({ sent })
})

import { getInitData } from './telegram'
import type { Profile, RoomStateDto, Difficulty, PackId } from '@shared/types'

let token: string | null = sessionStorage.getItem('krot_jwt')

async function req<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error ?? 'request_failed'), { status: res.status, data: json })
  return json as T
}

export interface LeaderRow { name: string; wins: number; best: number }

export interface RoomConfig { difficulty?: Difficulty; pack?: PackId; addBots?: boolean }

export const api = {
  async auth(): Promise<{ profile: Profile; startParam: string | null; botUsername: string }> {
    const r = await req<{ token: string; profile: Profile; startParam: string | null; botUsername: string }>('/auth', {
      initData: getInitData(),
    })
    token = r.token
    sessionStorage.setItem('krot_jwt', r.token)
    return { profile: r.profile, startParam: r.startParam, botUsername: r.botUsername }
  },
  profile: () => req<{ profile: Profile }>('/profile'),
  leaderboard: () => req<{ top: LeaderRow[] }>('/leaderboard'),

  solo: (difficulty: Difficulty, pack: PackId) => req<RoomStateDto>('/solo', { difficulty, pack }),
  roomQuick: (difficulty: Difficulty) => req<RoomStateDto>('/room/quick', { difficulty }),
  roomCreate: (difficulty: Difficulty, pack: PackId) => req<RoomStateDto>('/room/create', { difficulty, pack }),
  roomJoin: (code: string) => req<RoomStateDto>('/room/join', { code }),
  roomConfig: (code: string, cfg: RoomConfig) => req<RoomStateDto>(`/room/${code}/config`, cfg),
  roomState: (code: string) => req<RoomStateDto>(`/room/${code}`),
  roomStart: (code: string) => req<RoomStateDto>(`/room/${code}/start`, {}),
  roomReady: (code: string) => req<RoomStateDto>(`/room/${code}/ready`, {}),
  roomAsk: (code: string, targetId: string, question: string) => req<RoomStateDto>(`/room/${code}/ask`, { targetId, question }),
  roomAnswer: (code: string, vibe: 'solid' | 'easy' | 'risky', text: string) => req<RoomStateDto>(`/room/${code}/answer`, { vibe, text }),
  roomCallVote: (code: string) => req<RoomStateDto>(`/room/${code}/callvote`, {}),
  roomVote: (code: string, targetId: string | null) => req<RoomStateDto>(`/room/${code}/vote`, { targetId }),
  roomGuess: (code: string, locationName: string) => req<RoomStateDto>(`/room/${code}/guess`, { locationName }),
  roomLeave: (code: string) => req<{ ok: boolean }>(`/room/${code}/leave`, {}),
}

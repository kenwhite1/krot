import { test } from 'node:test'
import assert from 'node:assert/strict'
process.env.DATA_DIR = process.env.DATA_DIR ?? '/tmp/krot-test-data'

const {
  createSolo, createRoom, quickMatch, joinRoom, setRoomConfig, startRoom,
  readyInRoom, getRoomState, leaveRoom,
} = await import('./rooms')
import type { RoomStateDto } from '../../shared/types'

// Узкое приведение: убеждаемся, что это не ошибка, и работаем как с состоянием.
function ok(r: RoomStateDto | { error: string }): RoomStateDto {
  assert.ok(!('error' in r), `неожиданная ошибка: ${(r as { error?: string }).error}`)
  return r as RoomStateDto
}

test('host starting the game is visible to a joined player (host-start sync)', () => {
  const host = createRoom(101, 'Хозяин', 'normal', 'classic')
  const code = host.room.code
  const joined = joinRoom(code, 102, 'Гость')
  assert.ok(!('error' in joined))

  // до старта: оба в лобби, view ещё null
  assert.equal(ok(getRoomState(code, 101)).view, null)
  assert.equal(ok(getRoomState(code, 102)).view, null)

  const started = startRoom(code, 101)
  assert.ok(!('error' in started))

  // ключевая регрессия: и хозяин, и присоединившийся видят начавшуюся партию
  const a = ok(getRoomState(code, 101))
  const b = ok(getRoomState(code, 102))
  assert.notEqual(a.view, null)
  assert.notEqual(b.view, null)
  assert.equal(a.room.started, true)
  assert.equal(b.room.started, true)
})

test('only the host may start or configure', () => {
  const host = createRoom(201, 'Хозяин', 'normal', 'classic')
  const code = host.room.code
  joinRoom(code, 202, 'Гость')
  assert.deepEqual(startRoom(code, 202), { error: 'not_host' })
  assert.deepEqual(setRoomConfig(code, 202, { difficulty: 'hard' }), { error: 'not_host' })
  const cfg = ok(setRoomConfig(code, 201, { difficulty: 'hard', pack: 'travel' }))
  assert.equal(cfg.room.difficulty, 'hard')
  assert.equal(cfg.room.pack, 'travel')
})

test('a non-member cannot read a room', () => {
  const host = createRoom(301, 'Хозяин', 'normal', 'classic')
  const code = host.room.code
  assert.deepEqual(getRoomState(code, 999), { error: 'not_in_room' })
})

test('cannot join a started room', () => {
  const host = createRoom(401, 'Хозяин', 'normal', 'classic')
  const code = host.room.code
  startRoom(code, 401) // стартует с ботами (addBots по умолчанию)
  assert.deepEqual(joinRoom(code, 402, 'Поздний'), { error: 'already_started' })
})

test('friends-only start needs enough humans', () => {
  const host = createRoom(501, 'Хозяин', 'normal', 'classic')
  const code = host.room.code
  setRoomConfig(code, 501, { addBots: false })
  assert.deepEqual(startRoom(code, 501), { error: 'need_players' })
})

test('quick match fills with bots disguised as players', () => {
  const st = quickMatch(701, 'Игрок', 'normal')
  assert.equal(st.room.quick, true)
  assert.ok(st.room.players.length >= 4)
  // ни один бот не выдаёт себя: и в составе, и в виде все как живые
  assert.ok(st.room.players.every(p => p.isBot === false))
  assert.ok(st.view)
  assert.ok(st.view!.players.every(p => p.isBot === false))
})

test('solo starts straight into the reveal, then advances once ready', () => {
  const st = createSolo(801, 'Игрок', 'normal', 'classic')
  assert.ok(st.view)
  assert.equal(st.view!.phase, 'reveal')
  const after = ok(readyInRoom(st.room.code, 801))
  // живой готов, боты готовы по умолчанию: допрос начинается
  assert.equal(after.view!.phase, 'interrogation')
})

test('leaving an unstarted room as the only human removes it', () => {
  const host = createRoom(901, 'Хозяин', 'normal', 'classic')
  const code = host.room.code
  leaveRoom(code, 901)
  assert.deepEqual(getRoomState(code, 901), { error: 'no_room' })
})

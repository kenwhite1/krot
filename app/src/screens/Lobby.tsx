import { useState } from 'react'
import { useStore } from '../store'
import { shareLink, haptic } from '../telegram'
import { DIFFICULTIES } from '@shared/difficulty'
import { PACK_INFO } from '@shared/locations'

export function Lobby() {
  const room = useStore(s => s.room)
  const profile = useStore(s => s.profile)
  const botUsername = useStore(s => s.botUsername)
  const startRoom = useStore(s => s.startRoom)
  const leaveGame = useStore(s => s.leaveGame)
  const joinRoom = useStore(s => s.joinRoom)
  const joinError = useStore(s => s.joinError)
  const busy = useStore(s => s.busy)
  const setConfig = useStore(s => s.setConfig)
  const go = useStore(s => s.go)
  const [code, setCode] = useState('')

  // ── форма входа (комнаты ещё нет) ─────────────────────────────────────────
  if (!room) {
    return (
      <div className="lobby rise">
        <div className="page-head" style={{ alignSelf: 'flex-start' }}>
          <button className="round-btn" onClick={() => go('home')}>‹</button>
          <h1>Зайти по коду</h1>
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <input
            className="code-input"
            placeholder="КОД"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            inputMode="text"
            onChange={e => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4))}
          />
          {joinError && <p style={{ color: 'var(--red-deep)', textAlign: 'center', fontWeight: 800, marginTop: 12 }}>{joinError}</p>}
          <button className="btn block lg" style={{ marginTop: 18 }} disabled={code.length !== 4 || busy} onClick={() => joinRoom(code)}>
            {busy ? 'Заходим…' : 'Войти в игру'}
          </button>
        </div>
      </div>
    )
  }

  // ── лобби комнаты ─────────────────────────────────────────────────────────
  const r = room.room
  const isHost = r.hostId === `u${profile?.id}`
  const humans = r.players.filter(p => !p.isBot)

  const share = () => {
    haptic('tap')
    const link = `https://t.me/${botUsername}?startapp=room_${r.code}`
    shareLink(link, `Сыграй со мной в «Крота»! Код стола ${r.code} 🕵️`)
  }

  return (
    <div className="lobby rise">
      <div className="page-head" style={{ alignSelf: 'flex-start' }}>
        <button className="round-btn" onClick={leaveGame}>‹</button>
        <h1>Стол собирается</h1>
      </div>

      <div className="code-card">
        <div>Поделись этим кодом</div>
        <div className="code-big">{r.code}</div>
        <button className="btn accent block" style={{ marginTop: 8 }} onClick={share}>Позвать друзей ↗</button>
      </div>

      <div className="seatlist">
        {r.players.map(p => (
          <div className="seat" key={p.id}>
            <div className="av">{p.avatar}</div>
            <div className="nm">{p.name}</div>
            {p.isHost ? <div className="tag host">ХОЗЯИН</div> : p.isBot ? <div className="tag bot">БОТ</div> : <div className="tag wait">ГОТОВ</div>}
          </div>
        ))}
        {humans.length < r.maxPlayers && (
          <div className="seat" style={{ opacity: 0.6 }}>
            <div className="av">＋</div>
            <div className="nm">Ждём друзей<span className="dots" /></div>
          </div>
        )}
      </div>

      {isHost ? (
        <>
          <div className="cfg-block">
            <div className="cfg-label">Набор локаций</div>
            <div className="pack-pills">
              {PACK_INFO.map(p => (
                <button key={p.id} className={`pack-pill${r.pack === p.id ? ' on' : ''}`} onClick={() => setConfig({ pack: p.id })}>
                  <span className="pe">{p.emoji}</span>
                  <span><span className="pt">{p.name}</span><br /><span className="pb">{p.count} мест</span></span>
                </button>
              ))}
            </div>
          </div>

          <div className="cfg-block">
            <div className="cfg-label">Сложность ботов</div>
            <div className="seg">
              {DIFFICULTIES.map(d => (
                <button key={d.d} className={r.difficulty === d.d ? 'on' : ''} onClick={() => setConfig({ difficulty: d.d })}>
                  <span className="se">{d.emoji}</span>{d.t}
                </button>
              ))}
            </div>
          </div>

          <div className="cfg-block">
            <div className="toggle-row" onClick={() => setConfig({ addBots: !r.addBots })}>
              <div>
                <div className="toggle-title">Добавить ботов</div>
                <div className="toggle-sub">Заполнить пустые места до стола из {r.seats}</div>
              </div>
              <span className={`switch${r.addBots ? ' on' : ''}`}><span className="knob" /></span>
            </div>
          </div>

          <p className="hint" style={{ marginTop: 14, textAlign: 'center' }}>
            {r.addBots
              ? `Пустые места займут боты, когда начнёшь. Стол из ${Math.max(r.seats, humans.length)}.`
              : `Играете своей компанией. Сейчас за столом: ${humans.length}. Нужно хотя бы трое.`}
          </p>

          <button className="btn block lg" style={{ maxWidth: 420, marginTop: 8 }} disabled={busy} onClick={startRoom}>
            {busy ? 'Накрываем стол…' : 'Начать игру 🕵️'}
          </button>
        </>
      ) : (
        <>
          <div className="cfg-block">
            <div className="cfg-label">Набор и сложность</div>
            <div className="pack-readonly">
              {PACK_INFO.find(p => p.id === r.pack)?.emoji} {PACK_INFO.find(p => p.id === r.pack)?.name}
              {'  ·  '}
              {DIFFICULTIES.find(d => d.d === r.difficulty)?.emoji} {DIFFICULTIES.find(d => d.d === r.difficulty)?.t}
            </div>
          </div>
          <p className="hint" style={{ marginTop: 16, textAlign: 'center' }}>Ждём, пока хозяин начнёт<span className="dots" /></p>
        </>
      )}
    </div>
  )
}

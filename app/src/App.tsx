import { useEffect } from 'react'
import { useStore } from './store'
import { Home } from './screens/Home'
import { Lobby } from './screens/Lobby'
import { Rules } from './screens/Rules'
import { Leaderboard } from './screens/Leaderboard'
import { Game } from './screens/Game'
import { Logo } from './screens/Logo'
import { CONFETTI } from './brand'
import { DIFFICULTIES } from '@shared/difficulty'
import { PACK_INFO } from '@shared/locations'

export function App() {
  const ready = useStore(s => s.ready)
  const screen = useStore(s => s.screen)
  const init = useStore(s => s.init)

  useEffect(() => { init() }, [init])

  if (!ready) {
    return (
      <div className="app">
        <div className="home" style={{ justifyContent: 'center' }}>
          <div className="brand" style={{ animation: 'pop-in .5s ease both' }}>
            <Logo />
            <div className="brand-name">Крот</div>
            <div className="brand-tag">Заводим разговор<span className="dots" /></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {screen === 'home' && <Home />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'rules' && <Rules />}
      {screen === 'leaderboard' && <Leaderboard />}
      {screen === 'game' && <Game />}
      <Overlays />
    </div>
  )
}

function Overlays() {
  const result = useStore(s => s.result)
  const toast = useStore(s => s.toast)
  const setupOpen = useStore(s => s.setupOpen)

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      {setupOpen && <SetupSheet />}
      {result && <ResultModal />}
    </>
  )
}

function SetupSheet() {
  const kind = useStore(s => s.setupOpen)!
  const difficulty = useStore(s => s.difficulty)
  const pack = useStore(s => s.pack)
  const setDifficulty = useStore(s => s.setDifficulty)
  const setPack = useStore(s => s.setPack)
  const closeSetup = useStore(s => s.closeSetup)
  const startSolo = useStore(s => s.startSolo)
  const createRoom = useStore(s => s.createRoom)
  const busy = useStore(s => s.busy)

  return (
    <div className="scrim" onClick={closeSetup}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title">{kind === 'solo' ? 'Соло против ботов' : 'Игра с друзьями'}</div>
        <div className="sheet-sub">{kind === 'solo' ? 'Выбери набор и сложность.' : 'Выбери набор и сложность, потом позовёшь друзей.'}</div>

        <div className="cfg-label">Набор локаций</div>
        <div className="pack-pills">
          {PACK_INFO.map(p => (
            <button key={p.id} className={`pack-pill${pack === p.id ? ' on' : ''}`} onClick={() => setPack(p.id)}>
              <span className="pe">{p.emoji}</span>
              <span><span className="pt">{p.name}</span><br /><span className="pb">{p.count} мест</span></span>
            </button>
          ))}
        </div>

        <div className="cfg-label" style={{ marginTop: 16 }}>Сложность ботов</div>
        <div className="seg">
          {DIFFICULTIES.map(d => (
            <button key={d.d} className={difficulty === d.d ? 'on' : ''} onClick={() => setDifficulty(d.d)}>
              <span className="se">{d.emoji}</span>{d.t}<span className="ss">{d.s}</span>
            </button>
          ))}
        </div>

        <button
          className="btn block lg"
          style={{ marginTop: 20 }}
          disabled={busy}
          onClick={() => (kind === 'solo' ? startSolo() : createRoom())}
        >
          {busy ? 'Накрываем стол…' : kind === 'solo' ? 'Начать 🕵️' : 'Создать стол 🕵️'}
        </button>
      </div>
    </div>
  )
}

const REASON: Record<string, { emojiWin: string; emojiLose: string; town: string; mole: string }> = {
  caught: { emojiWin: '🎉', emojiLose: '🫥', town: 'Крота вычислили и вывели на чистую воду.', mole: 'Тебя раскусили. Стол оказался зорче.' },
  mislynch: { emojiWin: '🃏', emojiLose: '🫥', town: 'Стол выгнал своего, а крот тихо остался.', mole: 'Город выгнал невиновного. Крот ускользнул.' },
  escaped: { emojiWin: '🌫️', emojiLose: '🤐', town: 'Стол так и не договорился, крот ушёл в тень.', mole: 'Никто не сошёлся во мнении, и ты улизнул.' },
  guessed: { emojiWin: '🎯', emojiLose: '🎯', town: 'Крот вслушался и точно назвал локацию.', mole: 'Ты вычислил место и забрал победу!' },
  wrongGuess: { emojiWin: '🧭', emojiLose: '🧭', town: 'Крот промахнулся с локацией и выдал себя.', mole: 'Локация оказалась не та. Обидно.' },
}

function ResultModal() {
  const result = useStore(s => s.result)!
  const room = useStore(s => s.room)
  const mode = useStore(s => s.mode)
  const startSolo = useStore(s => s.startSolo)
  const quickMatch = useStore(s => s.quickMatch)
  const leaveGame = useStore(s => s.leaveGame)
  const view = room?.view

  const won = result.youWon
  const moleWon = result.winner === 'mole'
  const reason = view?.endReason ? REASON[view.endReason] : REASON.caught
  const moleSeat = view?.players.find(p => p.isMole)
  const iAmMole = view?.you.isMole ?? false
  const quick = !!room?.room.quick
  const online = mode === 'online' && !quick

  const reward = 6 + (won ? 30 + (iAmMole ? 15 : 0) : 0)
  const again = quick ? quickMatch : startSolo
  const againLabel = quick ? 'Ещё партию 🕵️' : 'Играть снова 🕵️'

  return (
    <div className="scrim">
      {won && (
        <div className="confetti">
          {Array.from({ length: 44 }).map((_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 137) % 100}%`,
                background: CONFETTI[i % CONFETTI.length],
                animationDelay: `${(i % 11) * 0.12}s`,
                transform: `rotate(${i * 35}deg)`,
              }}
            />
          ))}
        </div>
      )}
      <div className="sheet pop result">
        <div className="result-emoji">{won ? (reason.emojiWin) : reason.emojiLose}</div>
        <h1>{won ? 'Победа' : 'Поражение'}</h1>
        <div className="result-sub">
          {iAmMole ? reason.mole : reason.town}
          {' '}
          {won ? 'Ты на стороне победителей.' : moleWon ? 'В этот раз победил крот.' : 'В этот раз победил город.'}
        </div>

        {moleSeat && view && (
          <div className="result-reveal">
            <div className="rr-emoji">🕵️</div>
            <div style={{ flex: 1 }}>
              <div className="rr-label">Кротом был</div>
              <div className="rr-val rr-mole">{moleSeat.isYou ? 'Ты' : moleSeat.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="rr-label">Локация</div>
              <div className="rr-val">{view.you.locationEmoji} {view.you.locationName}</div>
            </div>
          </div>
        )}

        {won && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <span className="coin-chip">🪙 +{reward} монет</span>
          </div>
        )}

        {online ? (
          <button className="btn block lg" onClick={leaveGame}>На главную</button>
        ) : (
          <>
            <button className="btn block lg" onClick={again}>{againLabel}</button>
            <button className="btn ghost block" style={{ marginTop: 10 }} onClick={leaveGame}>На главную</button>
          </>
        )}
      </div>
    </div>
  )
}

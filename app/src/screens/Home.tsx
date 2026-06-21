import { useState } from 'react'
import { useStore } from '../store'
import { Logo } from './Logo'
import { isSoundOn, setSoundOn } from '../sound'

export function Home() {
  const profile = useStore(s => s.profile)
  const quickMatch = useStore(s => s.quickMatch)
  const openSetup = useStore(s => s.openSetup)
  const go = useStore(s => s.go)
  const loadLeaderboard = useStore(s => s.loadLeaderboard)
  const busy = useStore(s => s.busy)
  const [sound, setSnd] = useState(isSoundOn())

  return (
    <div className="home rise">
      <button
        className="round-btn"
        style={{ position: 'absolute', top: 'calc(var(--safe-top) + 14px)', right: 16, zIndex: 5, width: 40, height: 40, fontSize: 17 }}
        onClick={() => { const on = !sound; setSoundOn(on); setSnd(on) }}
        aria-label="Звук"
      >
        {sound ? '🔊' : '🔇'}
      </button>

      <div className="brand">
        <Logo />
        <div className="brand-name">Крот</div>
        <div className="brand-tag">Один из вас тут чужой. Задавайте вопросы и найдите крота.</div>
      </div>

      {profile && (
        <div className="stat-strip">
          <div className="stat-pill"><div className="v">{profile.wins}</div><div className="l">Победы</div></div>
          <div className="stat-pill"><div className="v">{profile.streak}</div><div className="l">Серия</div></div>
          <div className="stat-pill"><div className="v">{profile.coins}</div><div className="l">Монеты</div></div>
        </div>
      )}

      <div className="menu-spacer" />

      <div className="menu">
        <button className="tile-btn primary" disabled={busy} onClick={quickMatch}>
          <span className="tile-emoji">🕵️</span>
          <span className="tile-text">
            <span className="tile-title">Быстрая игра</span>
            <span className="tile-sub">Случайный стол прямо сейчас</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile-btn" disabled={busy} onClick={() => openSetup('solo')}>
          <span className="tile-emoji">🎭</span>
          <span className="tile-text">
            <span className="tile-title">Соло</span>
            <span className="tile-sub">Партия против ботов, три уровня</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile-btn" disabled={busy} onClick={() => openSetup('create')}>
          <span className="tile-emoji">👥</span>
          <span className="tile-text">
            <span className="tile-title">Игра с друзьями</span>
            <span className="tile-sub">Собери стол и поделись кодом</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile-btn" onClick={() => go('lobby')}>
          <span className="tile-emoji">🔑</span>
          <span className="tile-text">
            <span className="tile-title">Зайти по коду</span>
            <span className="tile-sub">Введи код из четырёх символов</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <div style={{ display: 'flex', gap: 13 }}>
          <button className="tile-btn" style={{ flex: 1 }} onClick={() => { go('leaderboard'); loadLeaderboard() }}>
            <span className="tile-emoji">🏆</span>
            <span className="tile-text"><span className="tile-title">Рейтинг</span></span>
          </button>
          <button className="tile-btn" style={{ flex: 1 }} onClick={() => go('rules')}>
            <span className="tile-emoji">📖</span>
            <span className="tile-text"><span className="tile-title">Правила</span></span>
          </button>
        </div>
      </div>
    </div>
  )
}

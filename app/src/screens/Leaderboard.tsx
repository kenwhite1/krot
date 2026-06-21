import { useStore } from '../store'

export function Leaderboard() {
  const go = useStore(s => s.go)
  const rows = useStore(s => s.leaderboard)
  const medals = ['🥇', '🥈', '🥉']
  return (
    <div className="page rise">
      <div className="page-head">
        <button className="round-btn" onClick={() => go('home')}>‹</button>
        <h1>Рейтинг</h1>
      </div>
      {rows.length === 0 ? (
        <div className="empty-note">Пока никто не сыграл ни партии.<br />Будь первым за столом 🕵️</div>
      ) : (
        <div className="board-list">
          {rows.map((r, i) => (
            <div className="board-row" key={i}>
              <div className="rank">{medals[i] ?? i + 1}</div>
              <div className="nm">{r.name}</div>
              <div className="wins">{r.wins} 🏆</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

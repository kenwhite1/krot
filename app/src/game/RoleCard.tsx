import type { GameView } from '@shared/types'

// Тайная карта: видна на раздаче и по нажатию на чип роли. Город видит локацию и
// свою роль; крот видит только то, что он крот, и подсказку, как уцелеть.
export function RoleCard({
  view,
  mode,
  busy,
  onAction,
}: {
  view: GameView
  mode: 'reveal' | 'peek'
  busy?: boolean
  onAction: () => void
}) {
  const mole = view.you.isMole
  const waiting = mode === 'reveal' && view.youReady && view.phase === 'reveal'

  return (
    <div className={`rolecard ${mole ? 'mole' : 'town'}`} onClick={e => e.stopPropagation()}>
      {mole ? (
        <>
          <div className="rc-eyebrow">Тайная личность</div>
          <div className="rc-mole-emoji">🕵️</div>
          <div className="rc-mole-name">ТЫ КРОТ</div>
          <div className="rc-mole-blurb">
            Локацию ты не знаешь. Слушай, о чём говорят, отвечай уклончиво и не выдай себя.
            Поймёшь, где все собрались, нажми «Назвать локацию» и забери победу.
          </div>
        </>
      ) : (
        <>
          <div className="rc-eyebrow">Локация</div>
          <div className="rc-loc-emoji">{view.you.locationEmoji}</div>
          <div className="rc-loc-name">{view.you.locationName}</div>
          <div className="rc-role-label">Твоя роль</div>
          <div className="rc-role">{view.you.roleName}</div>
          <div className="rc-hint">
            Отвечай так, чтобы было ясно: ты тут свой. Но вслух локацию не называй, иначе крот её услышит.
          </div>
        </>
      )}

      {mode === 'reveal' ? (
        waiting ? (
          <p className="rc-peek" style={{ marginTop: 18 }}>
            Ждём остальных<span className="dots" /> ({view.readyCount} из {view.playerCount})
          </p>
        ) : (
          <button className={`btn ${mole ? 'danger' : 'cream'} block lg`} style={{ marginTop: 20 }} disabled={busy} onClick={onAction}>
            {mole ? 'Затаиться 🕵️' : 'Я готов'}
          </button>
        )
      ) : (
        <button className="btn cream block lg" style={{ marginTop: 20 }} onClick={onAction}>Закрыть</button>
      )}
    </div>
  )
}

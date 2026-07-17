import type { GameView } from '@shared/types'
import { t } from '../i18n'

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
          <div className="rc-eyebrow">{t('Тайная личность')}</div>
          <div className="rc-mole-emoji">🕵️</div>
          <div className="rc-mole-name">{t('ТЫ КРОТ')}</div>
          <div className="rc-mole-blurb">
            {t('Локацию ты не знаешь. Слушай, о чём говорят, отвечай уклончиво и не выдай себя. Поймёшь, где все собрались, нажми «Назвать локацию» и забери победу.')}
          </div>
        </>
      ) : (
        <>
          <div className="rc-eyebrow">{t('Локация')}</div>
          <div className="rc-loc-emoji">{view.you.locationEmoji}</div>
          <div className="rc-loc-name">{t(view.you.locationName)}</div>
          <div className="rc-role-label">{t('Твоя роль')}</div>
          <div className="rc-role">{t(view.you.roleName)}</div>
          <div className="rc-hint">
            {t('Отвечай так, чтобы было ясно: ты тут свой. Но вслух локацию не называй, иначе крот её услышит.')}
          </div>
        </>
      )}

      {mode === 'reveal' ? (
        waiting ? (
          <p className="rc-peek" style={{ marginTop: 18 }}>
            {t('Ждём остальных')}<span className="dots" /> ({view.readyCount} {t('из')} {view.playerCount})
          </p>
        ) : (
          <button className={`btn ${mole ? 'danger' : 'cream'} block lg`} style={{ marginTop: 20 }} disabled={busy} onClick={onAction}>
            {mole ? t('Затаиться 🕵️') : t('Я готов')}
          </button>
        )
      ) : (
        <button className="btn cream block lg" style={{ marginTop: 20 }} onClick={onAction}>{t('Закрыть')}</button>
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { LoungeScene } from '../game/LoungeScene'
import { RoleCard } from '../game/RoleCard'
import { QUESTIONS, humanAnswerOptions, type AnswerOption } from '@shared/interrogation'
import { makeRng } from '@shared/rng'
import type { GameView } from '@shared/types'
import { t } from '../i18n'
import { GGAvatar } from '../gg/GGAvatar'

type Sheet = 'question' | 'guess' | 'locations' | null

export function Game() {
  const room = useStore(s => s.room)
  const view = room?.view ?? null
  const showRole = useStore(s => s.showRole)
  const openRole = useStore(s => s.openRole)
  const closeRole = useStore(s => s.closeRole)
  const readyUp = useStore(s => s.readyUp)
  const busy = useStore(s => s.busy)

  const [sheet, setSheet] = useState<Sheet>(null)
  const [askTarget, setAskTarget] = useState<string | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  // лента сама прокручивается к свежей реплике
  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [view?.exchanges.length, view?.phase])

  if (!view) return <div className="app"><LoungeScene /></div>

  // фаза раздачи: тайная карта на весь экран
  if (view.phase === 'reveal') {
    return (
      <>
        <LoungeScene />
        <div className="scrim center" style={{ background: 'rgba(10,18,22,.45)' }}>
          <RoleCard view={view} mode="reveal" busy={busy} onAction={readyUp} />
        </div>
      </>
    )
  }

  const openQuestion = (targetId: string) => { setAskTarget(targetId); setSheet('question') }

  return (
    <div className="table">
      <LoungeScene />
      <TopBar view={view} onRole={openRole} />
      <PlayersRow view={view} />
      <PhaseHint view={view} />

      <div className="feed" ref={feedRef}>
        {view.exchanges.length === 0 ? (
          <div className="feed-empty">
            <span className="big searching-bob">🕵️</span>
            {t('Допрос начинается. По очереди задавайте друг другу вопросы и слушайте ответы.')}
          </div>
        ) : (
          view.exchanges.map(e => <QA key={e.seq} e={e} view={view} />)
        )}
      </div>

      <ActionArea view={view} onPickTarget={openQuestion} onSheet={setSheet} />

      {sheet === 'question' && askTarget && (
        <QuestionSheet
          targetId={askTarget}
          view={view}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'locations' && <LocationsSheet view={view} onClose={() => setSheet(null)} />}
      {sheet === 'guess' && <GuessSheet view={view} onClose={() => setSheet(null)} />}
      {showRole && (
        <div className="scrim center" onClick={closeRole}>
          <RoleCard view={view} mode="peek" onAction={closeRole} />
        </div>
      )}
    </div>
  )
}

function TopBar({ view, onRole }: { view: GameView; onRole: () => void }) {
  const leaveGame = useStore(s => s.leaveGame)
  const roleLabel = view.you.isMole ? t('🕵️ Крот') : `${view.you.locationEmoji} ${t(view.you.roleName)}`
  return (
    <div className="topbar">
      <button className="round-btn dark" onClick={leaveGame} aria-label={t('Выйти')}>✕</button>
      <div className="badge mid" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {view.phase === 'vote' ? t('Голосование') : `${t('Круг')} ${Math.min(view.round + 1, 2)} ${t('из 2')}`}
      </div>
      <button className={`badge role${view.you.isMole ? ' mole' : ''}`} onClick={onRole}>{roleLabel}</button>
    </div>
  )
}

function PlayersRow({ view }: { view: GameView }) {
  return (
    <div className="players">
      {view.players.map(p => (
        <div key={p.id} className={`pl${p.isAsker ? ' asker' : ''}${p.isYou ? ' you-pl' : ''}`}>
          {p.isAsker && <span className="pl-asker-dot" />}
          {view.phase === 'vote' && p.votesOn > 0 && <span className="pl-votes">{p.votesOn}</span>}
          <div className="pl-av"><GGAvatar id={p.id} fallback={<>{p.avatar}</>} /></div>
          <div className="pl-name">{t(p.name)}</div>
          {p.isYou && <div className="pl-you-tag">{t('ты')}</div>}
        </div>
      ))}
    </div>
  )
}

function PhaseHint({ view }: { view: GameView }) {
  let text: React.ReactNode = ''
  if (view.phase === 'vote') {
    const voted = view.players.filter(p => p.votedFor !== undefined).length
    text = view.yourVote !== undefined
      ? <>{t('Голос принят. Ждём остальных')}<span className="dim"> ({voted} {t('из')} {view.playerCount})</span></>
      : <span className="hot">{t('Кто из них крот? Голосуй.')}</span>
  } else if (view.pending) {
    text = view.pending.targetIsYou
      ? <span className="hot">{t(view.pending.askerName)} {t('спрашивает тебя')}</span>
      : <span className="dim">{t(view.pending.targetName)} {t('отвечает')}<span className="dots" /></span>
  } else if (view.youAreAsker) {
    text = <span className="hot">{t('Твой ход. Спроси кого-нибудь.')}</span>
  } else {
    text = <span className="dim">{t('Спрашивает')} {t(view.currentAskerName)}<span className="dots" /></span>
  }
  return <div className="phase-hint">{text}</div>
}

function QA({ e, view }: { e: GameView['exchanges'][number]; view: GameView }) {
  const askAv = view.players.find(p => p.id === e.askerId)?.avatar ?? '🙂'
  const ansAv = view.players.find(p => p.id === e.targetId)?.avatar ?? '🙂'
  return (
    <div className="qa">
      <div className="qa-q">
        <div className="qa-av"><GGAvatar id={e.askerId} fallback={<>{askAv}</>} /></div>
        <div className="bubble q">
          <span className="who">{t(e.askerName)} → {t(e.targetName)}</span>
          {t(e.question)}
        </div>
      </div>
      <div className="qa-a">
        <div className="qa-av"><GGAvatar id={e.targetId} fallback={<>{ansAv}</>} /></div>
        <div className="bubble a">
          <span className="who">{t(e.targetName)}</span>
          {t(e.answer)}
        </div>
      </div>
    </div>
  )
}

function ActionArea({
  view,
  onPickTarget,
  onSheet,
}: {
  view: GameView
  onPickTarget: (id: string) => void
  onSheet: (s: Sheet) => void
}) {
  const callVote = useStore(s => s.callVote)
  const vote = useStore(s => s.vote)
  const answer = useStore(s => s.answer)
  const busy = useStore(s => s.busy)

  // фаза голосования
  if (view.phase === 'vote') {
    const candidates = view.players.filter(p => !p.isYou)
    const voted = view.yourVote !== undefined
    return (
      <div className="actionbar">
        <div className="action-card">
          <div className="action-title">{t('Кто')} <b>{t('крот')}</b>?</div>
          <div className="votegrid">
            {candidates.map(p => (
              <button key={p.id} className={`vote-row${view.yourVote === p.id ? ' on' : ''}`} disabled={busy} onClick={() => vote(p.id)}>
                <div className="va"><GGAvatar id={p.id} fallback={<>{p.avatar}</>} /></div>
                <div className="vn">{t(p.name)}</div>
                {p.votesOn > 0 && <div className="vc">{p.votesOn} 🗳</div>}
              </button>
            ))}
            <button className={`vote-row vote-skip${view.yourVote === null ? ' on' : ''}`} disabled={busy} onClick={() => vote(null)}>
              <div className="va">🤷</div>
              <div className="vn">{t('Воздержаться')}</div>
            </button>
          </div>
          {voted && <div className="action-title" style={{ marginTop: 10, marginBottom: 0 }}>{t('Можно передумать, пока считают голоса.')}</div>}
        </div>
      </div>
    )
  }

  // тебя спрашивают: выбери ответ
  if (view.pending?.targetIsYou) {
    return <AnswerCard view={view} onAnswer={answer} busy={busy} />
  }

  // твой ход спрашивать
  const yourTurn = view.youAreAsker && !view.pending
  return (
    <div className="actionbar">
      <div className="action-card">
        {yourTurn ? (
          <>
            <div className="action-title">{t('Кого')} <b>{t('допросить')}</b>?</div>
            <div className="pickrow">
              {view.players.filter(p => !p.isYou).map(p => (
                <button key={p.id} className="pick-chip" disabled={busy} onClick={() => onPickTarget(p.id)}>
                  <span className="pc-av"><GGAvatar id={p.id} fallback={<>{p.avatar}</>} /></span>
                  <span className="pc-nm">{t(p.name)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="waiting">
            {t('Спрашивает')} <span className="who">{t(view.currentAskerName)}</span><span className="dots" />
          </div>
        )}
        <div className="action-btns">
          <button className="btn ghost sm" onClick={() => onSheet('locations')}>{t('📋 Локации')}</button>
          {view.you.isMole && (
            <button className="btn danger sm" disabled={busy} onClick={() => onSheet('guess')}>{t('🎯 Локация')}</button>
          )}
          <button className="btn accent sm" disabled={busy} onClick={callVote}>{t('🗳 Голосование')}</button>
        </div>
      </div>
    </div>
  )
}

function AnswerCard({
  view,
  onAnswer,
  busy,
}: {
  view: GameView
  onAnswer: (vibe: 'solid' | 'easy' | 'risky', text: string) => void
  busy?: boolean
}) {
  // стабильные варианты на конкретный вопрос (не пересобираются при ре-рендере)
  const options = useMemo<AnswerOption[]>(() => {
    const seed = hashStr((view.pending?.question ?? '') + view.pending?.askerId) >>> 0
    return humanAnswerOptions(view.you.isMole, makeRng(seed))
  }, [view.pending?.question, view.pending?.askerId, view.you.isMole])

  return (
    <div className="actionbar">
      <div className="action-card">
        <div className="action-title">
          <b>{t(view.pending?.askerName ?? '')}</b>: «{t(view.pending?.question ?? '')}»
        </div>
        <div className="opt-list">
          {options.map((o, i) => (
            <button key={i} className="opt" disabled={busy} onClick={() => onAnswer(o.vibe, o.text)}>
              <span className="opt-tag">{o.vibe === 'solid' ? '😌' : o.vibe === 'easy' ? '🙂' : '😬'}</span>
              {t(o.text)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function QuestionSheet({ targetId, view, onClose }: { targetId: string; view: GameView; onClose: () => void }) {
  const ask = useStore(s => s.ask)
  const target = view.players.find(p => p.id === targetId)
  // подборка из общего банка вопросов
  const list = useMemo(() => QUESTIONS.slice(), [])
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title">{t('Спросить')} {t(target?.name ?? '')}</div>
        <div className="sheet-sub">{t('Выбери вопрос. Слушай, как ответят.')}</div>
        <div className="opt-list">
          {list.map((q, i) => (
            <button key={i} className="opt" onClick={() => { ask(targetId, q); onClose() }}>
              <span className="opt-tag">❓</span>{t(q)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function LocationsSheet({ view, onClose }: { view: GameView; onClose: () => void }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title">{t('Возможные локации')}</div>
        <div className="sheet-sub">
          {view.you.isMole
            ? t('Где все собрались? Вычисли по ответам.')
            : t('По этому списку удобно придумывать вопросы.')}
        </div>
        <div className="loc-grid">
          {view.locations.map(l => {
            const active = !view.you.isMole && l.name === view.you.locationName
            return (
              <div key={l.name} className={`loc-cell read${active ? ' active' : ''}`}>
                <span className="le">{l.emoji}</span>{t(l.name)}
              </div>
            )
          })}
        </div>
        <button className="btn cream block" style={{ marginTop: 14 }} onClick={onClose}>{t('Закрыть')}</button>
      </div>
    </div>
  )
}

function GuessSheet({ view, onClose }: { view: GameView; onClose: () => void }) {
  const guess = useStore(s => s.guess)
  const [sel, setSel] = useState<string | null>(null)
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title">{t('Назвать локацию')}</div>
        <div className="sheet-sub">{t('Угадаешь, забираешь победу. Промахнёшься, победит город.')}</div>
        <div className="loc-grid">
          {view.locations.map(l => (
            <button key={l.name} className={`loc-cell${sel === l.name ? ' on' : ''}`} onClick={() => setSel(l.name)}>
              <span className="le">{l.emoji}</span>{t(l.name)}
            </button>
          ))}
        </div>
        <div className="action-btns" style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>{t('Назад')}</button>
          <button className="btn danger" disabled={!sel} onClick={() => { if (sel) { guess(sel); onClose() } }}>{t('Это здесь!')}</button>
        </div>
      </div>
    </div>
  )
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

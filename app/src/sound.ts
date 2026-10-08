import { initGameVolume, getGameVolume, setGameVolume, subscribeGameVolume, gameAudioOutput, installGameVolume } from './gameVolume'
// Крошечные синтезированные звуки через WebAudio: без файлов, работает офлайн.
// Создаётся лениво при первом проигрывании (webview Telegram требует жеста).
// Мягкий салонный тон: лёгкий «дзинь» вопроса, тёплый отклик ответа, глухой стук
// обвинения и переливы победы.
let ctx: AudioContext | null = null
let muted = localStorage.getItem('krotMuted') === '1'
initGameVolume(muted ? 0 : 1)
muted = getGameVolume() === 0
subscribeGameVolume(v => { muted = v === 0 })
installGameVolume()

export function isSoundOn(): boolean { return !muted }
export function setSoundOn(on: boolean): void {
  setGameVolume(on ? getGameVolume() || 1 : 0)
  muted = !on
  localStorage.setItem('krotMuted', muted ? '1' : '0')
}

function audioCtx(): AudioContext | null {
  if (muted) return null
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = ctx ?? new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

function blip(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', peak = 0.12): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g); g.connect(gameAudioOutput(c))
  o.start(at); o.stop(at + dur + 0.02)
}

function knock(c: AudioContext, at: number, freq = 320, dur = 0.12, peak = 0.12): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(freq, at)
  o.frequency.exponentialRampToValueAtTime(freq * 0.5, at + dur)
  g.gain.setValueAtTime(peak, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g); g.connect(gameAudioOutput(c))
  o.start(at); o.stop(at + dur + 0.02)
}

export type Sfx = 'ask' | 'answer' | 'accuse' | 'reveal' | 'vote' | 'win' | 'lose'

export function playSfx(name: Sfx): void {
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  switch (name) {
    case 'ask':
      blip(c, 620, t, 0.1, 'triangle', 0.06)
      blip(c, 880, t + 0.05, 0.1, 'triangle', 0.05)
      break
    case 'answer':
      blip(c, 440, t, 0.13, 'sine', 0.06)
      break
    case 'accuse':
      knock(c, t, 300, 0.14, 0.12)
      knock(c, t + 0.12, 240, 0.14, 0.1)
      break
    case 'reveal':
      [523.25, 659.25, 783.99].forEach((f, i) => blip(c, f, t + i * 0.07, 0.22, 'triangle', 0.08))
      break
    case 'vote':
      blip(c, 392, t, 0.12, 'sine', 0.06)
      break
    case 'win':
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => blip(c, f, t + i * 0.09, 0.26, 'triangle', 0.1))
      break
    case 'lose':
      [392, 311, 262, 196].forEach((f, i) => blip(c, f, t + i * 0.13, 0.26, 'sine', 0.08))
      break
  }
}

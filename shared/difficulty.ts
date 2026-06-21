// Лёгкий модуль с уровнями сложности ботов: его безопасно тянуть и в браузер
// (в отличие от bots.ts, который тянет логику решений). Здесь только метаданные
// для интерфейса и темп «раздумий» ботов.

export type Difficulty = 'easy' | 'normal' | 'hard'

export interface DifficultyInfo {
  d: Difficulty
  t: string
  s: string
  emoji: string
}

// Сложность это уровень мастерства напарников по столу:
//  • Новичок легко ведётся, путается и часто промахивается голосом.
//  • Знаток держит нить разговора и обычно вычисляет крота.
//  • Мастер цепляется к мелочам, редко ошибается и сам убедительно врёт за крота.
export const DIFFICULTIES: DifficultyInfo[] = [
  { d: 'easy', t: 'Новичок', s: 'Легко ведётся', emoji: '🌱' },
  { d: 'normal', t: 'Знаток', s: 'Держит нить', emoji: '🎯' },
  { d: 'hard', t: 'Мастер', s: 'Видит насквозь', emoji: '🔥' },
]

// Пауза перед ходом бота, чтобы темп читался как живой.
// В быстрых играх (humanize) растягиваем «раздумье» и добавляем длинный хвост,
// чтобы скорость ботов перекрывалась с живыми игроками и их нельзя было
// вычислить по тому, что они всегда отвечают за пару секунд.
export function botThinkDelay(difficulty: Difficulty, humanize = false): number {
  const base = difficulty === 'hard' ? 1500 : difficulty === 'normal' ? 1900 : 2400
  const jitter = difficulty === 'hard' ? 1100 : difficulty === 'normal' ? 1500 : 2000
  let delay = base + Math.floor(Math.random() * jitter)
  if (humanize) {
    delay += 2000 + Math.floor(Math.random() * 6500)
    if (Math.random() < 0.18) delay += Math.floor(Math.random() * 8000)
  }
  return delay
}

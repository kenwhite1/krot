// Состав ботов: тёплые, характерные личности за столом. У каждого имя, лицо
// (эмодзи) и характер, который красит то, как он спрашивает и отвечает на
// допросе. Характер влияет только на флёр реплик, не на то, кто из них крот.

export type Personality = 'sharp' | 'nervous' | 'gruff' | 'sunny' | 'quiet' | 'dramatic'

export interface Townie {
  name: string
  avatar: string
  personality: Personality
}

// Щедрый состав, чтобы за одним столом ни у одного бота не повторилось лицо.
export const ROSTER: Townie[] = [
  { name: 'Маша', avatar: '👩‍🌾', personality: 'sunny' },
  { name: 'Гриша', avatar: '🧓', personality: 'gruff' },
  { name: 'Нина', avatar: '👩‍🦳', personality: 'sharp' },
  { name: 'Кирилл', avatar: '🧑‍🍳', personality: 'dramatic' },
  { name: 'Инна', avatar: '👩‍🏫', personality: 'sharp' },
  { name: 'Артём', avatar: '🧔', personality: 'gruff' },
  { name: 'Дуся', avatar: '👵', personality: 'nervous' },
  { name: 'Веня', avatar: '👨‍🔧', personality: 'quiet' },
  { name: 'Фая', avatar: '👩‍🎨', personality: 'dramatic' },
  { name: 'Сёма', avatar: '👨‍🌾', personality: 'quiet' },
  { name: 'Гера', avatar: '👩‍⚕️', personality: 'nervous' },
  { name: 'Гоша', avatar: '🧑‍🚒', personality: 'sunny' },
  { name: 'Вера', avatar: '💃', personality: 'sharp' },
  { name: 'Тимур', avatar: '👨‍🦱', personality: 'gruff' },
  { name: 'Лиза', avatar: '👧', personality: 'sunny' },
  { name: 'Рома', avatar: '👨‍🏭', personality: 'quiet' },
]

// Лица для живых игроков, чтобы и они получили дружелюбный токен за столом.
export const HUMAN_AVATARS = ['🕵️', '😎', '🤠', '🥸', '😺', '🦊', '🐻', '🐯']

// Правдоподобные имена для быстрых (случайных) партий, чтобы стол читался как
// комната незнакомцев, что только что собрались вместе.
export const QUICK_NAMES = [
  'Алексей', 'Дима', 'Настя', 'Оля', 'Саша', 'Макс',
  'Катя', 'Игорь', 'Лена', 'Паша', 'Юля', 'Костя',
  'Соня', 'Андрей', 'Вика', 'Никита',
]

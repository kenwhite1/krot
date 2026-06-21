import { createHmac, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

export const JWT_SECRET_SET = !!process.env.JWT_SECRET
const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-change-me')
export const BOT_TOKEN = process.env.BOT_TOKEN ?? ''
// DEV MODE подменяет авторизацию одним локальным игроком, но только вне продакшена.
// В продакшене без BOT_TOKEN авторизация падает закрыто (401), а не схлопывает
// всех игроков в одного пользователя.
export const DEV_MODE = !BOT_TOKEN && process.env.NODE_ENV !== 'production'

// Страховка от fail-open в продакшене (не DEV MODE):
//  * JWT_SECRET обязателен. Без него токены подписывались бы публичным дефолтным
//    секретом и их можно было бы подделать на любого игрока. Не стартуем вовсе.
//  * BOT_TOKEN желателен, но не обязателен для старта: без него авторизация
//    Telegram закрыта (всем 401, без подмены личности), сервер поднимется и отдаст
//    страницу. Это позволяет развернуть инфраструктуру до создания бота, не
//    открывая дыру: DEV MODE в продакшене невозможен (NODE_ENV=production).
export function assertSecretsOrExit(): void {
  if (DEV_MODE) return
  if (!JWT_SECRET_SET) {
    console.error('FATAL: в продакшене обязателен JWT_SECRET (иначе токены можно подделать). Сервер остановлен.')
    process.exit(1)
  }
  if (!BOT_TOKEN) {
    console.warn('BOT_TOKEN не задан: вход через Telegram закрыт (401). Задай BOT_TOKEN, чтобы открыть игру.')
  }
}

export interface TgUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

// HMAC-проверка по https://core.telegram.org/bots/webapps
export function validateInitData(raw: string): { user: TgUser; startParam: string | null } | null {
  if (DEV_MODE) {
    // Стабильная локальная личность для игры без бота.
    return { user: { id: 1, first_name: 'Dev' }, startParam: null }
  }
  const params = new URLSearchParams(raw)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
  const a = Buffer.from(computed, 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const authDate = Number(params.get('auth_date') ?? 0)
  if (Date.now() / 1000 - authDate > 3600) return null
  const userJson = params.get('user')
  if (!userJson) return null
  try {
    const user = JSON.parse(userJson) as TgUser
    // даже при валидном HMAC не доверяем форме полезной нагрузки: id обязан быть числом,
    // иначе вниз по течению уйдёт undefined в SQLite и в выпуск токена.
    if (typeof user.id !== 'number' || !Number.isFinite(user.id)) return null
    return { user, startParam: params.get('start_param') }
  } catch {
    return null
  }
}

export async function issueToken(userId: number): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret)
}

export async function verifyToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return typeof payload.uid === 'number' ? payload.uid : null
  } catch {
    return null
  }
}

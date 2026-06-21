import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import './db'
import { api } from './api'
import { bot, botWebhook } from './bot'
import { DEV_MODE, assertSecretsOrExit } from './auth'

// До запуска проверяем секреты: в продакшене без BOT_TOKEN/JWT_SECRET не стартуем.
assertSecretsOrExit()

const app = new Hono()
app.route('/api', api)

const WEBHOOK_PATH = `/bot/${process.env.WEBHOOK_SECRET ?? 'hook'}`
const hook = botWebhook
if (hook) app.post(WEBHOOK_PATH, c => hook(c))

// статичный SPA (app/dist); путь относительно cwd для serveStatic
const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', '..', 'app', 'dist')
if (existsSync(dist)) {
  const rel = relative(process.cwd(), dist)
  app.use('/*', serveStatic({ root: rel }))
  app.get('*', serveStatic({ path: join(rel, 'index.html') }))
}

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, async info => {
  console.log(`krot server listening on 0.0.0.0:${info.port}${DEV_MODE ? ' (DEV MODE, no bot token)' : ''}`)
  if (!process.env.APP_URL) {
    console.warn('APP_URL не задан: вебхук и кнопка Mini App не настроятся. Укажи публичный https URL.')
  }
  if (bot && process.env.APP_URL) {
    const hookUrl = `${process.env.APP_URL.replace(/\/$/, '')}${WEBHOOK_PATH}`
    try {
      await bot.api.setWebhook(hookUrl)
      console.log(`webhook set: ${hookUrl}`)
    } catch (e) {
      console.error('setWebhook failed', e)
    }
  }
})

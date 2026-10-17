// Smoke test of the app side through the PWA build: open Settings → Autoškola, join the demo
// course with its group code, sync, and check the student appears in the school's API.
//   EXPO_PUBLIC_SCHOOLS_ENABLED=true EXPO_PUBLIC_SCHOOLS_API_URL=http://localhost:8090 npx expo export -p web --output-dir dist
//   PORT=8788 node scripts/serve-web.mjs      (in the repo root; the API must allow http://localhost:8788)
//   CODE=<group code> node scripts/pwa-smoke.mjs   (in schools/web)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = process.env.PWA_URL ?? 'http://localhost:8788'
const api = process.env.API_URL ?? 'http://127.0.0.1:8090'
const code = process.env.CODE
if (!code) throw new Error('CODE=<join code> is required')
const out = process.env.OUT_DIR ?? path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../docs/schools/screenshots')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, locale: 'sk-SK' })
page.on('pageerror', (e) => console.error('page error:', e.message))
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()))

await page.goto(`${app}/school`)
await page.getByTestId('school.code').waitFor({ timeout: 60_000 })
await page.screenshot({ path: path.join(out, '10-app-join.png') })
await page.getByTestId('school.code').fill(code)
await page.getByTestId('school.joinButton').click()
// A group code asks for the name first.
await page.getByTestId('school.firstName').waitFor()
await page.getByTestId('school.firstName').fill('Playwright')
await page.getByTestId('school.lastName').fill('Tester')
await page.getByTestId('school.joinButton').click()
await page.getByTestId('school.syncNow').waitFor({ timeout: 30_000 })
await page.waitForTimeout(800)
await page.screenshot({ path: path.join(out, '11-app-linked.png') })
const text = await page.textContent('body')
console.log('linked screen says:', text?.replace(/\s+/g, ' ').slice(0, 300))

// The school now sees the student.
const jar = await fetch(`${api}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://localhost:5190' },
  body: JSON.stringify({ email: 'jana@demo.sk', password: 'driver' }),
})
const cookie = jar.headers.get('set-cookie')?.split(';')[0]
const students = await (await fetch(`${api}/api/v1/students?q=Tester`, { headers: { cookie } })).json()
const me = students.find((s) => s.last_name === 'Tester')
if (!me) throw new Error('the joined student is not in the school')
console.log('school sees:', me.first_name, me.last_name, 'in', me.group_name, 'linked:', me.progress.linked, 'score:', me.progress.score)
await browser.close()

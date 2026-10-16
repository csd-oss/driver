// Screenshots of the dashboard for docs/schools/screenshots (run with the dev stack up:
// schools/dev.sh, then `npm run screenshots` in schools/web). Playwright's chromium.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const base = process.env.WEB_URL ?? 'http://127.0.0.1:5190'
const out = process.env.OUT_DIR ?? path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../docs/schools/screenshots')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'sk-SK' })
page.on('pageerror', (e) => console.error('page error:', e.message))
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()))

const shot = async (name) => {
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false })
  console.log('saved', name)
}

await page.goto(`${base}/prehlad`)
await page.getByLabel('E-mail').waitFor()
await shot('00-login')
await page.getByLabel('E-mail').fill('jana@demo.sk')
await page.getByLabel('Heslo').fill('driver')
await page.getByRole('button', { name: 'Prihlásiť sa' }).click()
await page.getByRole('heading', { name: 'Autoškola Demo' }).waitFor()
await page.getByText('Prebiehajúce kurzy').waitFor()
await shot('01-prehlad')

await page.getByRole('link', { name: 'Kurzy' }).first().click()
await page.getByRole('heading', { name: 'Kurzy' }).waitFor()
await page.getByRole('link', { name: 'B-2026-09 Žilina', exact: true }).waitFor()
await shot('02-kurzy')

await page.getByRole('link', { name: 'B-2026-09 Žilina', exact: true }).click()
await page.getByText('Kód pre aplikáciu').waitFor()
await page.waitForTimeout(400)
await shot('03-kurz-ziaci')
await page.getByRole('tab', { name: 'Teória' }).click()
await page.getByText('vyučovacích hodín · kliknutím').waitFor()
await shot('04-kurz-teoria')
await page.getByRole('tab', { name: 'Dokumenty' }).click()
await page.getByText('Prihláška na skúšku z odbornej spôsobilosti').first().waitFor()
await shot('05-kurz-dokumenty')

// The most prepared linked student of the group.
await page.getByRole('tab', { name: /Žiaci/ }).click()
const firstStudent = page.locator('tbody tr td:nth-child(2) a').first()
const studentName = await firstStudent.textContent()
await firstStudent.click()
await page.getByText('Príprava na teoretickú skúšku').waitFor()
await page.getByText('Údaje a doklady').waitFor()
await page.waitForTimeout(500)
await shot('06-ziak')
await page.screenshot({ path: path.join(out, '06-ziak-full.png'), fullPage: true })
console.log('student', studentName?.trim())

await page.getByRole('link', { name: 'Žiaci' }).first().click()
await page.getByRole('heading', { name: 'Žiaci' }).waitFor()
await page.locator('tbody tr').first().waitFor()
await shot('07-ziaci')

await page.getByRole('link', { name: 'Autoškola' }).first().click()
await page.getByText('Údaje autoškoly').waitFor()
await shot('08-autoskola')

await browser.close()

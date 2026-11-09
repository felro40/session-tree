/**
 * Browser side of the e2e harness: playwright-core driving /usr/bin/google-chrome against the
 * isolated Webapp. All interaction is real input (locator clicks, page.mouse, page.keyboard).
 */
import { chromium } from 'playwright-core'
import type { Browser, BrowserContext, Page } from 'playwright-core'

import { signInLink, webappBase } from './harness.ts'
import type { TestHermes } from './harness.ts'

export const CHROME = process.env.SESSION_TREE_CHROME ?? '/usr/bin/google-chrome'

export interface Session {
  browser: Browser
  context: BrowserContext
  page: Page
  errors: string[]
}

export async function launch({ colorScheme = 'light' }: { colorScheme?: 'dark' | 'light' } = {}): Promise<Session> {
  const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADED !== '1' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme })
  const page = await context.newPage()
  const errors: string[] = []

  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  page.on('console', message => {
    if (message.type() === 'error' && /session-tree|plugin/i.test(message.text())) {
      errors.push(`console: ${message.text()}`)
    }
  })

  return { browser, context, page, errors }
}

/** Opens the one-use link and lands on the app; dismisses the first-run provider prompt. */
export async function signIn(t: TestHermes, page: Page): Promise<void> {
  await page.goto(signInLink(t))
  await page.waitForURL(url => url.toString().startsWith(`${webappBase(t)}/`) && !url.toString().includes('/launch'), {
    timeout: 30_000
  })
  await page.getByRole('button', { name: 'Sessions', exact: true }).first().waitFor({ timeout: 30_000 }).catch(() => undefined)

  const later = page.getByText("I'll choose a provider later")

  if (await later.isVisible({ timeout: 4000 }).catch(() => false)) {
    await later.click()
  }
}

export async function goto(t: TestHermes, page: Page, route: string): Promise<void> {
  await page.goto(`${webappBase(t)}/#${route}`)
}

/**
 * Capabilities → Plugins → the session-tree package → "Desktop: Session Tree" switch on.
 * A unified package's desktop half ships disabled; this is the user's own toggle.
 * Returns whether it had to flip the switch.
 */
export async function enableDesktopHalf(t: TestHermes, page: Page): Promise<boolean> {
  await goto(t, page, '/capabilities?tab=plugins')
  await page.getByPlaceholder('Search plugins').fill('session')
  // The catalog's own Filters button is the last one on screen (the sidebar has another).
  await page.getByRole('button', { name: /^Filters/ }).last().click()
  await page.getByRole('button', { name: 'Installed', exact: true }).click()

  const toggle = page.getByRole('switch', { name: 'Desktop: Session Tree' })

  await toggle.waitFor({ timeout: 20_000 })

  if ((await toggle.getAttribute('aria-checked')) === 'true') {
    return false
  }

  await toggle.click()
  await page.waitForFunction(
    () => document.querySelector('[role="switch"][aria-label="Desktop: Session Tree"]')?.getAttribute('aria-checked') === 'true',
    undefined,
    { timeout: 20_000 }
  )

  return true
}

export async function close(session: Session): Promise<void> {
  await session.context.close().catch(() => undefined)
  await session.browser.close().catch(() => undefined)
}

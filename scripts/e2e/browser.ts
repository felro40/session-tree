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

  // A fresh test home shows a full-screen first-run provider dialog that mounts a few seconds
  // after the app; it intercepts every click until dismissed.
  const later = page.getByText("I'll choose a provider later")

  if (await later.waitFor({ timeout: 12_000 }).then(() => true, () => false)) {
    await later.click()
    await later.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined)
    await page.locator('[data-glass-opaque]').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined)
  }
}

export async function goto(t: TestHermes, page: Page, route: string): Promise<void> {
  await page.goto(`${webappBase(t)}/#${route}`)
}

const DESKTOP_SWITCH = 'Desktop: Session Tree'

async function switchReadsOn(page: Page, name: string): Promise<boolean> {
  return page
    .waitForFunction(
      label => document.querySelector(`[role="switch"][aria-label="${label}"]`)?.getAttribute('aria-checked') === 'true',
      name,
      { timeout: 20_000 }
    )
    .then(
      () => true,
      () => false
    )
}

/**
 * Opens the package's detail view through the catalog's deep link (`?plugin=<id>`, resolved by
 * useDeepLinkHighlight to `installed:<key>`), which shows the per-half switches. On a fresh home
 * the desktop half is copied into desktop-plugins/ by the first root scan, so it can be missing
 * on the first visit: Rescan, then reload.
 */
async function openPackageDetail(t: TestHermes, page: Page): Promise<void> {
  const toggle = page.getByRole('switch', { name: DESKTOP_SWITCH, exact: true })

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt === 1) {
      await goto(t, page, '/capabilities?tab=plugins')
      await page.getByRole('button', { name: 'Rescan' }).click().catch(() => undefined)
      await page.waitForTimeout(3000)
    }

    await goto(t, page, '/capabilities?tab=plugins&plugin=session-tree')

    if (attempt === 2) {
      await page.reload()
    }

    if (await toggle.waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
      return
    }
  }

  await toggle.waitFor({ timeout: 10_000 })
}

/**
 * Turns the session-tree desktop half on the way a user does (it ships disabled).
 * Returns whether a switch had to be flipped.
 *
 * - `via: 'package'` (default): the Installed grid card's own package switch
 *   (`CatalogSwitch aria-label={pkg.name}`), which enables every half; then the detail view's
 *   "Desktop: Session Tree" switch is asserted on, reached through the deep link.
 * - `via: 'detail'`: only the per-half "Desktop: Session Tree" switch, for runs where the agent
 *   half must stay off (the backend-off check).
 */
export async function enableDesktopHalf(
  t: TestHermes,
  page: Page,
  { via = 'package' }: { via?: 'detail' | 'package' } = {}
): Promise<boolean> {
  let flipped = false

  if (via === 'package') {
    const card = page.getByRole('switch', { name: 'Session Tree', exact: true })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await goto(t, page, '/capabilities?tab=plugins')

      if (attempt === 1) {
        await page.getByRole('button', { name: 'Rescan' }).click().catch(() => undefined)
        await page.waitForTimeout(3000)
      } else if (attempt === 2) {
        await page.reload()
      }

      await page.getByPlaceholder('Search plugins').fill('session')
      // Narrow the catalog to installed packages; the catalog's own Filters button is the last
      // one on screen (the sidebar has another).
      await page.getByRole('button', { name: /^Filters/ }).last().click()
      await page.getByRole('button', { name: 'Installed', exact: true }).click()

      if (await card.waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
        break
      }
    }

    await card.waitFor({ timeout: 10_000 })

    if ((await card.getAttribute('aria-checked')) !== 'true') {
      await card.click()
      flipped = true

      if (!(await switchReadsOn(page, 'Session Tree'))) {
        throw new Error('the "Session Tree" package switch did not read on')
      }
    }
  }

  await openPackageDetail(t, page)
  const toggle = page.getByRole('switch', { name: DESKTOP_SWITCH, exact: true })

  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    if (via === 'package') {
      throw new Error(`the package switch is on but "${DESKTOP_SWITCH}" reads off`)
    }

    await toggle.click()
    flipped = true
  }

  if (!(await switchReadsOn(page, DESKTOP_SWITCH))) {
    throw new Error(`"${DESKTOP_SWITCH}" did not read on`)
  }

  return flipped
}

export async function close(session: Session): Promise<void> {
  await session.context.close().catch(() => undefined)
  await session.browser.close().catch(() => undefined)
}

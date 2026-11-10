/**
 * Card 6 fix r1 (review r1 B2): the maths of the e2e's composited contrast check
 * (scripts/e2e/contrast.ts) on known pairs.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BLACK, compositedContrast, contrast, over, parseColor, render, WHITE } from '../../scripts/e2e/contrast.ts'
import type { Layer } from '../../scripts/e2e/contrast.ts'

const near = (actual: number, expected: number, eps = 0.01) => assert.ok(Math.abs(actual - expected) <= eps, `${actual} ≉ ${expected}`)
const layer = (background: string, opacity = 1, covers = true): Layer => ({ background: parseColor(background), opacity, covers })

describe('contrast: WCAG ratios', () => {
  it('black on white is 21:1, a colour on itself 1:1, and the order does not matter', () => {
    near(contrast(BLACK, WHITE), 21)
    near(contrast(WHITE, BLACK), 21)
    near(contrast(WHITE, WHITE), 1)
  })

  it('known pairs: #777 on white 4.48, #959595 on white 2.99 (just under 3:1)', () => {
    near(contrast(parseColor('rgb(119, 119, 119)'), WHITE), 4.48)
    near(contrast(parseColor('rgb(149, 149, 149)'), WHITE), 2.99)
    assert.ok(contrast(parseColor('rgb(149, 149, 149)'), WHITE) < 3)
  })
})

describe('contrast: parsing computed colours', () => {
  it('rgb, rgba, color(srgb), transparent, oklab and oklch', () => {
    assert.deepEqual(parseColor('rgb(251, 251, 252)'), { r: 251, g: 251, b: 252, a: 1 })
    assert.deepEqual(parseColor('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0, a: 0.5 })
    const srgb = parseColor('color(srgb 0.5 0 1 / 0.54)')

    near(srgb.r, 127.5)
    near(srgb.b, 255)
    near(srgb.a, 0.54)
    assert.equal(parseColor('transparent').a, 0)
    const white = parseColor('oklch(1 0 0)')
    const black = parseColor('oklab(0% 0 0)')

    near(white.r, 255, 0.1)
    near(white.g, 255, 0.1)
    near(black.r, 0, 0.1)
    // oklch(0.628 0.2577 29.23) is sRGB red.
    const red = parseColor('oklch(0.628 0.2577 29.23)')

    near(red.r, 255, 1)
    near(red.g, 0, 1.5)
    near(red.b, 0, 1.5)
    assert.throws(() => parseColor('lab(50 0 0)'))
  })
})

describe('contrast: compositing', () => {
  it('alpha: black at 50% over white is mid grey (127.5), which is 3.98:1 against white', () => {
    const grey = over(parseColor('rgba(0, 0, 0, 0.5)'), WHITE)

    near(grey.r, 127.5)
    near(grey.a, 1)
    near(contrast(grey, WHITE), 3.98)
  })

  it('opacity multiplies down the chain: black text at alpha 0.54 in a 0.8-opacity group = alpha 0.432', () => {
    const text = parseColor('rgba(0, 0, 0, 0.54)')
    const viaChain = render([layer('rgb(255, 255, 255)'), layer('transparent', 0.8)], text)
    const flat = over({ ...BLACK, a: 0.54 * 0.8 }, WHITE)

    near(viaChain.r, flat.r)
    near(viaChain.r, 255 * (1 - 0.432))
  })

  it('a group fades its own background too: opacity 0.5 over a black page shows a white card as mid grey', () => {
    const shown = render([layer('rgb(0, 0, 0)'), layer('rgb(255, 255, 255)', 0.5)], null)

    near(shown.r, 127.5)
  })

  it('a layer that does not cover the point does not paint behind it (a ghost below its card)', () => {
    const page = layer('rgb(251, 251, 252)')
    const card = layer('rgb(0, 0, 0)', 1, false)
    const ghost = layer('transparent')
    const result = compositedContrast([page, card, ghost], BLACK, 'border')

    near(result.against[0].r, 251)
    near(result.ratio, contrast(BLACK, parseColor('rgb(251, 251, 252)')))
  })

  it('border: the lower of inside (own fill) and outside (parent)', () => {
    const page = layer('rgb(255, 255, 255)')
    const box = layer('rgb(0, 0, 0)')
    const result = compositedContrast([page, box], parseColor('rgb(119, 119, 119)'), 'border')

    // #777 on black is 4.69, on white 4.48: the border counts the lower.
    near(result.ratio, 4.48)
    assert.equal(result.against.length, 2)
  })
})

/**
 * In-memory block positions per layout key (style + profile + scope), as cards 2–3 used them.
 * Card 4 replaced it in the page with the synced store (`layout-sync.ts`, same `place` contract:
 * a merge keeps every stored position and stores what it placed); kept for its unit tests of the
 * merge-across-refreshes rules (`tests/js/layout.test.ts`).
 */
import type { LayoutResult, Point } from './layout.ts'

export class LayoutMemory {
  private readonly byKey = new Map<string, ReadonlyMap<string, Point>>()

  get(key: string): ReadonlyMap<string, Point> | undefined {
    return this.byKey.get(key)
  }

  /** Runs `compute` against the stored positions and keeps its result. Idempotent. */
  place(key: string, compute: (previous: ReadonlyMap<string, Point> | undefined) => LayoutResult): LayoutResult {
    const result = compute(this.byKey.get(key))

    this.byKey.set(key, result.positions)

    return result
  }

  /** A drop: these blocks now sit here (last write wins per block). */
  move(key: string, moves: ReadonlyMap<string, Point>): void {
    this.byKey.set(key, new Map([...(this.byKey.get(key) ?? []), ...moves]))
  }

  /** Re-arrange: forget this layout so the next `place` lays it out fresh. */
  reset(key: string): void {
    this.byKey.delete(key)
  }

  /** Forget one block in every layout (moved to another project: placed anew in its band). */
  forget(id: string): void {
    for (const [key, positions] of this.byKey) {
      if (positions.has(id)) {
        this.byKey.set(key, new Map([...positions].filter(([other]) => other !== id)))
      }
    }
  }
}

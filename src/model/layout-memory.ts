/**
 * In-memory block positions per layout key (style + profile + scope). Card 4 persists them;
 * here they live as long as the page. `place` stores what a merge placed, so a later refresh
 * merges against it and never re-places (moves) a block.
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
}

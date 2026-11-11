/**
 * A promise that settles within `ms`: the original outcome, or a rejection with `message`.
 * The timer comes from the caller (`ctx.setTimeout`), so a plugin reload retires it.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, setTimer: (fn: () => void, ms: number) => () => void, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = setTimer(() => reject(new Error(message)), ms)

    promise.then(
      value => {
        cancel()
        resolve(value)
      },
      error => {
        cancel()
        reject(error)
      }
    )
  })
}

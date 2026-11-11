/**
 * The settings page's notes about the synced store (pure, so node:test can run it). Card-4
 * review carry-forward 1: in read-only mode (a newer-schema state.json) a change made on the
 * settings page applies in this window only; the page says so, like it says "offline".
 */

/** The store was written by a newer Session Tree (B1 of the card-4 review): banner and note. */
export const READ_ONLY_MESSAGE = 'Layout saved by a newer Session Tree version — changes here are not saved'

export const SETTINGS_OFFLINE_NOTE = 'The Session Tree backend is unreachable: changes are kept here and saved when it is back.'

export interface SettingsNote {
  id: 'offline' | 'read-only'
  text: string
}

export function settingsNotes({ offline, readOnly }: { offline: boolean; readOnly: boolean }): SettingsNote[] {
  const notes: SettingsNote[] = []

  if (readOnly) {
    notes.push({ id: 'read-only', text: `${READ_ONLY_MESSAGE}: View style and Snap changes apply in this window only.` })
  }

  if (offline && !readOnly) {
    notes.push({ id: 'offline', text: SETTINGS_OFFLINE_NOTE })
  }

  return notes
}

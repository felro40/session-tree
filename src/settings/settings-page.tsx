/**
 * Settings → Plugins → Session Tree (R18), built from the SDK settings primitives:
 *
 * - **View style** (synced to every device through the backend): the registered styles;
 * - **On this device**: use the synced style, or one of the styles (`ctx.storage` only);
 * - **Snap grid default** (synced): the toolbar's Snap toggle changes the same setting.
 */
import { host, ListRow, SegmentedControl, ToggleRow, useValue } from '@hermes/plugin-sdk'
import { useEffect } from 'react'

import { usePrefsVersion, useSyncVersion } from '../page/services.ts'
import type { Services } from '../page/services.ts'
import { DEFAULT_STYLE_ID, isRegisteredStyle, registeredStyles } from '../styles/registry.ts'
import { settingsNotes } from './notes.ts'

export const USE_SYNCED = 'synced'

export function SettingsPage({ services: { sync, prefs } }: { services: Services }) {
  const profile = useValue(host.state.profile) || 'default'

  useSyncVersion(sync)
  usePrefsVersion(prefs)
  useEffect(() => sync.watch(profile), [sync, profile])

  const styles = registeredStyles().map(style => ({ id: style.id, label: style.label }))
  const settings = sync.settings(profile)
  const synced = isRegisteredStyle(settings.style) ? settings.style : DEFAULT_STYLE_ID
  const override = prefs.get().styleOverride
  const device = isRegisteredStyle(override) ? override : USE_SYNCED
  const offline = sync.offline(profile)

  return (
    <div className="session-tree__settings" data-testid="session-tree-settings" data-sync={sync.status(profile)}>
      <ListRow
        id="session-tree-view-style"
        title="View style"
        description="How the session graph is drawn, on every device that uses this Hermes."
        action={
          <div data-testid="session-tree-settings-style" data-value={synced}>
            <SegmentedControl options={styles} value={synced} onChange={id => sync.setSettings(profile, { style: id })} />
          </div>
        }
      />
      <ListRow
        id="session-tree-device-style"
        title="On this device"
        description="Use the synced style here, or pick one for this device only."
        action={
          <div data-testid="session-tree-settings-device" data-value={device}>
            <SegmentedControl
              options={[{ id: USE_SYNCED, label: 'Use synced style' }, ...styles]}
              value={device}
              onChange={id => prefs.set({ styleOverride: id === USE_SYNCED ? null : id })}
            />
          </div>
        }
      />
      <div data-testid="session-tree-settings-snap" data-value={settings.snap ? 'on' : 'off'}>
        <ToggleRow
          id="session-tree-snap-default"
          label="Snap grid default"
          description="Show the dot grid and snap dragged blocks to it (the toolbar's Snap toggle; synced)."
          checked={settings.snap}
          onChange={on => sync.setSettings(profile, { snap: on })}
        />
      </div>
      {settingsNotes({ offline, readOnly: sync.storeReadOnly }).map(note => (
        <p key={note.id} className="session-tree__settings-note" data-testid={`session-tree-settings-${note.id}`}>
          {note.text}
        </p>
      ))}
    </div>
  )
}

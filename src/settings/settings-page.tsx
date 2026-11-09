/**
 * Settings → Plugins → Session Tree. Skeleton: one "View style" row with the
 * only style built so far. Card 4 makes it the synced setting (R18).
 */
import { ListRow, SegmentedControl } from '@hermes/plugin-sdk'

const STYLE_OPTIONS = [{ id: 'dense', label: 'Dense + inspector' }] as const

export function SettingsPage() {
  return (
    <div className="session-tree__settings" data-testid="session-tree-settings">
      <ListRow
        id="session-tree-view-style"
        title="View style"
        description="How the session graph is drawn. More styles arrive in later versions."
        action={<SegmentedControl options={STYLE_OPTIONS} value="dense" onChange={() => undefined} />}
      />
    </div>
  )
}

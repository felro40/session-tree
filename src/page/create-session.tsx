/**
 * Card 11: "New session in ● <Project>…" from a right-click on the canvas, the page half: the
 * dialog (Name + Project → Create; the project areas are `canvas-areas.ts`),
 * and the create itself, wired to the host (`useCreateSession`). The rules are in
 * `model/create.ts`.
 *
 * The order of a create: `session.create` → `session.title` → release the runtime (`session.detach`,
 * else `session.close`) → `LayoutSync.drop` of the spot (the style on screen only; the others
 * place it with their auto-layout) → the kept-on-canvas marker (`LayoutSync.keep`, synced) →
 * refresh the rows → select the block once it is placed. No tab opens (D2). A title error on a
 * row the re-check keeps takes the same path, with a warning toast (`titleWarning`).
 */
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, host, Input, isSubmitEnter, randomUuid } from '@hermes/plugin-sdk'
import type { PluginContext } from '@hermes/plugin-sdk'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { fetchMutationSnapshot, fetchSessions, postDelete } from '../api.ts'
import { createFencedMutation, isAlreadyAbsent, moveTargets, projectRootCwd, restErrorText } from '../model/actions.ts'
import { CreateFailure, createAttempts, createSession, defaultSessionName, MAX_TITLE_LENGTH, nameProblem, sanitizeTitle } from '../model/create.ts'
import type { CreateOutcome } from '../model/create.ts'
import type { GraphModel } from '../model/graph.ts'
import type { Point } from '../model/layout.ts'
import { NO_PROJECT_ID } from '../model/projects.ts'
import type { SessionRow } from '../model/sessions.ts'
import { projectColor, ProjectGlyph } from '../styles/shared.tsx'
import { projectInfoOf, projectLabelOf } from './canvas-areas.ts'

/** A new session in the making: where the canvas was right-clicked and in which project. */
export interface CreateDraft {
  /** The click, in flow coordinates. */
  point: Point
  projectId: string
  /** `menu`: the canvas menu is open; `dialog`: the dialog is. */
  phase: 'dialog' | 'menu'
}

export interface CreateSessionOptions {
  ctx: PluginContext
  model: GraphModel
  /** Every loaded row (empty ones too): the default name and the clash check (R3a). */
  rows: readonly SessionRow[]
  /** The profile the session is made in (A1: the filter's, or the active one in All profiles). */
  profile: string
  /** The canvas is framed (Swimlanes): the no-project lane's own name. */
  framed: boolean
  draft: CreateDraft | null
  setDraft(draft: CreateDraft | null): void
  /** The create answered: place, mark, refresh and select (the page's part). */
  onCreated(outcome: CreateOutcome, draft: CreateDraft, title: string): void
}

/** The dialog and the create, for the page. */
export function useCreateSession(options: CreateSessionOptions): ReactNode {
  const latest = useRef(options)
  const [attempts] = useState(() => createAttempts<CreateOutcome>())
  const [mutate] = useState(() => createFencedMutation(randomUuid))

  useEffect(() => {
    latest.current = options
  })

  const submit = (title: string, projectId: string): Promise<CreateOutcome> => {
    const { ctx, profile, model } = latest.current
    const project = projectId === NO_PROJECT_ID ? undefined : model.projects.find(each => each.id === projectId)
    const cwd = project ? projectRootCwd(project) : undefined

    // A8: a second submit while this one is in flight joins it (one submit, one session).
    return attempts.run(() =>
      createSession(
        {
          request: (method, params) => host.request(method, params),
          mintId: randomUuid,
          // R3: only the untitled empty row this attempt left, re-checked just before; a titled
          // or used row is kept (and is then a created session).
          async removeIfUntouched(owner, id) {
            const rows = (await fetchSessions(ctx, { profile: owner, includeArchived: true })).sessions
            const row = rows.find(each => each.id === id)

            if (!row) {
              return null
            }

            if ((row.title ?? '').trim() || (row.message_count ?? 0) > 0) {
              return row
            }

            await mutate(
              JSON.stringify(['delete', owner, id]),
              () => fetchMutationSnapshot(ctx, owner, id),
              identity => postDelete(ctx, owner, id, identity)
            ).catch((error: unknown) => {
              if (!isAlreadyAbsent(error)) {
                throw error
              }
            })

            return null
          }
        },
        { profile, cwd: cwd || undefined, title }
      )
    ).flight
  }

  const { draft } = options

  return (
    <CreateSessionDialog
      // A fresh dialog (name, error) per right-click.
      key={draft?.phase === 'dialog' ? `${draft.point.x},${draft.point.y}` : 'closed'}
      open={draft?.phase === 'dialog'}
      model={options.model}
      rows={options.rows}
      profile={options.profile}
      framed={options.framed}
      projectId={draft?.projectId ?? NO_PROJECT_ID}
      busy={() => attempts.busy}
      onProject={projectId => {
        const current = latest.current.draft

        if (current) {
          latest.current.setDraft({ ...current, projectId })
        }
      }}
      onCancel={() => latest.current.setDraft(null)}
      onSubmit={async (title, projectId) => {
        const current = latest.current.draft
        const outcome = await submit(title, projectId)

        if (current) {
          latest.current.onCreated(outcome, { ...current, projectId }, title)
        }

        latest.current.setDraft(null)
      }}
    />
  )
}

interface DialogProps {
  open: boolean
  model: GraphModel
  rows: readonly SessionRow[]
  profile: string
  framed: boolean
  projectId: string
  busy(): boolean
  onProject(projectId: string): void
  onCancel(): void
  onSubmit(title: string, projectId: string): Promise<void>
}

function CreateSessionDialog({ open, model, rows, profile, framed, projectId, busy: inFlight, onProject, onCancel, onSubmit }: DialogProps) {
  const [name, setName] = useState(() => defaultSessionName(rows, profile))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<null | string>(null)
  // A failed submit that leaves the dialog open: its count, for the focus below.
  const [failed, setFailed] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  // After a failed submit, focus goes back to Name with its text selected (Enter retries), once
  // Name is enabled again: a disabled input cannot hold focus (it fell to the page).
  useEffect(() => {
    if (failed > 0 && !busy) {
      input.current?.focus()
      input.current?.select()
    }
  }, [failed, busy])
  // A6: the projects with a folder (Move to project's targets), then No project. The detected
  // project is offered even without a folder, but cannot be created in (the note says why).
  const options = useMemo(() => {
    const targets = moveTargets(model.projects, undefined)
    const list = targets.map(project => ({ id: project.id, label: project.label, folder: true }))

    if (projectId !== NO_PROJECT_ID && !list.some(each => each.id === projectId)) {
      list.unshift({ id: projectId, label: projectLabelOf(model, projectId, framed), folder: false })
    }

    return [...list, { id: NO_PROJECT_ID, label: projectLabelOf(model, NO_PROJECT_ID, framed), folder: true }]
  }, [model, projectId, framed])
  const chosen = options.find(each => each.id === projectId) ?? options[options.length - 1]
  const problem = nameProblem(name, rows, profile)
  const problemText =
    problem?.kind === 'long'
      ? `Title too long (${problem.length} chars, max ${MAX_TITLE_LENGTH})`
      : problem?.kind === 'taken'
        ? `“${sanitizeTitle(name)}” is already the name of another session`
        : null
  const blocked = Boolean(problem) || !chosen.folder
  const project = projectInfoOf(model, chosen.id)

  const submit = async () => {
    if (blocked || busy || inFlight()) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      await onSubmit(sanitizeTitle(name), chosen.id)
    } catch (err) {
      const text = err instanceof CreateFailure ? err.message : restErrorText(err)

      setError(text)
      setFailed(count => count + 1)

      if (err instanceof CreateFailure && err.cleanup === 'failed') {
        host.notify({ kind: 'error', title: 'Could not remove the untitled session', message: 'The refused name left an untitled empty session; “Delete empty sessions” in Settings removes it.' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => !next && !busy && onCancel()}>
      <DialogContent
        className="max-w-md"
        data-testid="session-tree-create-dialog"
        data-profile={profile}
        data-project-id={chosen.id}
        onOpenAutoFocus={event => {
          // A8: the focus in Name, its text selected (typing replaces the default name).
          event.preventDefault()
          input.current?.focus()
          input.current?.select()
        }}
      >
        <DialogHeader>
          <DialogTitle>New session</DialogTitle>
        </DialogHeader>
        <label className="st-create-field">
          <span>Name</span>
          <Input
            ref={input}
            aria-label="Name"
            data-testid="session-tree-create-name"
            disabled={busy}
            value={name}
            onChange={event => {
              setName(event.target.value)
              setError(null)
            }}
            onKeyDown={event => {
              if (isSubmitEnter(event)) {
                event.preventDefault()
                void submit()
              }
            }}
          />
        </label>
        <label className="st-create-field">
          <span>Project</span>
          <span className="st-create-project" style={{ '--st-pc': projectColor(project) } as CSSProperties}>
            <ProjectGlyph project={project} size={12} />
            <select
              aria-label="Project"
              data-testid="session-tree-create-project"
              disabled={busy}
              value={chosen.id}
              onChange={event => {
                onProject(event.target.value)
                setError(null)
              }}
            >
              {options.map(each => (
                <option key={each.id} value={each.id}>
                  {each.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <div className="st-create-note" data-testid="session-tree-create-profile">
          Profile: {profile}
        </div>
        {!chosen.folder && (
          <div className="st-dialog-error" role="alert" data-testid="session-tree-create-folder">
            This project has no folder; pick another project.
          </div>
        )}
        {(error ?? problemText) && (
          <div className="st-dialog-error" role="alert" data-testid="session-tree-create-error" data-kind={error ? 'server' : problem?.kind}>
            {error ?? problemText}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} data-testid="session-tree-create-cancel" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={blocked || busy} data-testid="session-tree-create-submit" onClick={() => void submit()}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

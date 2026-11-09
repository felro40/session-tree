/** The plugin context for components that need tracked timers and listeners (`ctx.*`). */
import type { PluginContext } from '@hermes/plugin-sdk'
import { createContext, useContext } from 'react'

export const PluginCtx = createContext<null | PluginContext>(null)

export function usePluginCtx(): PluginContext {
  const ctx = useContext(PluginCtx)

  if (!ctx) {
    throw new Error('Session Tree component rendered outside its plugin context')
  }

  return ctx
}

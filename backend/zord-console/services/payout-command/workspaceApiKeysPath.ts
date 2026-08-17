import type { EnvMode } from '@/services/auth/EnvironmentProvider'

/** Session-backed workspace credentials. Live never uses the sandbox namespace. */
export function workspaceApiKeysPath(mode: EnvMode): '/api/prod/workspace-api-keys' | '/api/sandbox/workspace-api-keys' {
  return mode === 'sandbox' ? '/api/sandbox/workspace-api-keys' : '/api/prod/workspace-api-keys'
}

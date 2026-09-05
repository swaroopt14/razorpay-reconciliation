'use client'

import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { hydrateSession } from '@/services/auth'
import { Layout } from '@/components/aws'
import type { UserRole } from '@/types/auth'

type TenantItem = {
  tenant_id: string
  tenant_name: string
  workspace_code: string
  status: 'ACTIVE' | 'DISABLED'
  created_at: string
}

type AuthUserItem = {
  id: string
  email: string
  role: UserRole
  name: string
  tenant_id: string
  tenant_name: string
  workspace_code: string
  status: 'ACTIVE' | 'DISABLED'
  mfa_enabled: boolean
  last_login_at?: string
}

const INITIAL_FORM = {
  workspaceCode: '',
  name: '',
  email: '',
  password: '',
  role: 'CUSTOMER_ADMIN' as UserRole,
}

function formatDate(value?: string) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function TenantsPage() {
  const router = useRouter()
  const [booting, setBooting] = useState(true)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [tenants, setTenants] = useState<TenantItem[]>([])
  const [users, setUsers] = useState<AuthUserItem[]>([])
  const [form, setForm] = useState(INITIAL_FORM)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [toggleUserId, setToggleUserId] = useState<string | null>(null)

  const activeTenants = useMemo(
    () => tenants.filter((tenant) => tenant.status === 'ACTIVE'),
    [tenants],
  )

  const selectedTenant = useMemo(
    () => activeTenants.find((tenant) => tenant.workspace_code === form.workspaceCode) ?? null,
    [activeTenants, form.workspaceCode],
  )

  const canSubmit = useMemo(() => {
    const trimmedEmail = form.email.trim()
    const trimmedPassword = form.password.trim()
    const trimmedName = form.name.trim()
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
    return (
      form.workspaceCode.trim() !== '' &&
      trimmedName.length >= 2 &&
      looksLikeEmail &&
      trimmedPassword.length >= 8
    )
  }, [form])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const user = await hydrateSession()
      if (cancelled) return

      if (!user || user.role !== 'ADMIN') {
        router.replace('/admin/login')
        return
      }

      await loadData(cancelled)
      if (!cancelled) {
        setBooting(false)
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [router])

  async function loadData(cancelled = false) {
    setLoading(true)
    setError(null)

    try {
      const [tenantRes, userRes] = await Promise.all([
        fetch('/api/prod/tenants', { cache: 'no-store' }),
        fetch('/api/auth/admin/users', { cache: 'no-store' }),
      ])

      const tenantPayload = await tenantRes.json().catch(() => ({ items: [] }))
      const userPayload = await userRes.json().catch(() => ({ items: [] }))

      if (!tenantRes.ok) {
        throw new Error(tenantPayload?.error || 'Unable to load tenants')
      }
      if (!userRes.ok) {
        throw new Error(userPayload?.message || 'Unable to load login users')
      }

      if (cancelled) return

      const tenantItems = Array.isArray(tenantPayload?.items) ? tenantPayload.items : []
      const userItems = Array.isArray(userPayload?.items) ? userPayload.items : []

      setTenants(tenantItems)
      setUsers(userItems)

      if (!form.workspaceCode && tenantItems.length > 0) {
        const firstActiveTenant = tenantItems.find((tenant: TenantItem) => tenant.status === 'ACTIVE')
        if (firstActiveTenant) {
          setForm((current) => ({ ...current, workspaceCode: firstActiveTenant.workspace_code }))
        }
      }
    } catch (fetchError) {
      if (!cancelled) {
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load admin access data.')
      }
    } finally {
      if (!cancelled) {
        setLoading(false)
      }
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/auth/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          workspace_code: form.workspaceCode,
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          name: form.name.trim(),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Unable to create login user.')
      }

      setUsers((current) => [payload as AuthUserItem, ...current])
      setSuccess(`Created login for ${payload.email}.`)
      setForm((current) => ({
        ...INITIAL_FORM,
        workspaceCode: current.workspaceCode,
      }))
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create login user.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleStatus(user: AuthUserItem) {
    setToggleUserId(user.id)
    setError(null)
    setSuccess(null)

    try {
      const nextStatus = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
      const response = await fetch(`/api/auth/admin/users/${user.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ status: nextStatus }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.message || 'Unable to update user status.')
      }

      setUsers((current) =>
        current.map((entry) => (entry.id === user.id ? (payload as AuthUserItem) : entry)),
      )
      setSuccess(`${payload.email} is now ${payload.status}.`)
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Unable to update user status.')
    } finally {
      setToggleUserId(null)
    }
  }

  return (
    <Layout serviceName="" breadcrumbs={['Admin', 'Tenant & Access']}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Tenant & Access</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Create login users for a workspace</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              After a tenant is registered and you receive a workspace code, create one or more email-based login users here.
              Multiple different email IDs can belong to the same tenant or workspace.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            Tenant creation remains available through the existing tenant registration flow.
            This screen is for adding human login access after that step.
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.05fr_1.45fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Create login user</h2>
              <p className="mt-1 text-sm text-slate-500">
                This creates a backend auth user in <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">auth_users</code>.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleCreateUser}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Workspace</label>
                <select
                  value={form.workspaceCode}
                  onChange={(event) => setForm((current) => ({ ...current, workspaceCode: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Select workspace</option>
                  {activeTenants.map((tenant) => (
                    <option key={tenant.tenant_id} value={tenant.workspace_code}>
                      {tenant.tenant_name} ({tenant.workspace_code})
                    </option>
                  ))}
                </select>
                {selectedTenant ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Tenant ID: <span className="font-mono">{selectedTenant.tenant_id}</span>
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Name</label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Acme Console User"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="user@company.com"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Role</label>
                <select
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="CUSTOMER_ADMIN">CUSTOMER_ADMIN</option>
                  <option value="CUSTOMER_USER">CUSTOMER_USER</option>
                  <option value="OPS">OPS</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Login entrypoints:
                <div className="mt-2 grid gap-1 text-xs text-slate-500">
                  <span><strong>CUSTOMER_ADMIN</strong> and <strong>CUSTOMER_USER</strong>: `/console/login`, `/customer/login`, `/app-final`</span>
                  <span><strong>OPS</strong>: `/ops/login`</span>
                  <span><strong>ADMIN</strong>: `/admin/login`</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit || submitting || booting}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Creating login…' : 'Create login user'}
              </button>
            </form>
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Registered workspaces</h2>
                  <p className="mt-1 text-sm text-slate-500">Use the workspace code from this table in the login form.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadData()}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Refresh
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      <th className="pb-3 pr-4">Tenant</th>
                      <th className="pb-3 pr-4">Workspace Code</th>
                      <th className="pb-3 pr-4">Tenant ID</th>
                      <th className="pb-3 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                    {tenants.map((tenant) => (
                      <tr key={tenant.tenant_id}>
                        <td className="py-3 pr-4 font-medium text-slate-900">{tenant.tenant_name}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{tenant.workspace_code}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-500">{tenant.tenant_id}</td>
                        <td className="py-3 pr-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tenant.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                            {tenant.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!loading && tenants.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-sm text-slate-500">No tenants found yet. Register a tenant first, then create login users.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Login users</h2>
                <p className="mt-1 text-sm text-slate-500">These email IDs can sign in against the selected workspace or tenant.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      <th className="pb-3 pr-4">User</th>
                      <th className="pb-3 pr-4">Workspace</th>
                      <th className="pb-3 pr-4">Role</th>
                      <th className="pb-3 pr-4">Last Login</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-slate-900">{user.name}</div>
                          <div className="text-xs text-slate-500">{user.email}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-slate-900">{user.tenant_name}</div>
                          <div className="font-mono text-xs text-slate-500">{user.workspace_code}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                            {user.role}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-500">{formatDate(user.last_login_at)}</td>
                        <td className="py-3 pr-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                            {user.status}
                          </span>
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(user)}
                            disabled={toggleUserId === user.id}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {toggleUserId === user.id ? 'Updating…' : user.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!loading && users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-sm text-slate-500">No login users created yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Layout>
  )
}

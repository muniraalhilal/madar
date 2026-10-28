'use client';
import { changePasswordSchema } from '@madar/shared';
import { useState } from 'react';
import { useSession } from '@/components/app/session';
import { btn, ErrorNote, fmt, PageHeader, Panel } from '@/components/app/ui';
import { Field } from '@/components/ui/Field';
import { api, type User } from '@/lib/api';
import { useApi } from '@/lib/useApi';

export default function Settings() {
  const { user } = useSession();
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<Record<string, string>>({});
  const sessions = useApi<{ id: string; userAgent: string | null; ip: string | null; createdAt: string; lastUsedAt: string }[]>('/users/me/sessions');
  const users = useApi<User[]>(user?.role === 'admin' ? '/users' : null);
  return (
    <>
      <PageHeader title="Account settings" />
      {msg && <p className="mb-4 text-sm text-mint" role="status">{msg}</p>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Profile">
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (!name) return; await api('/users/me', { method: 'PATCH', json: { displayName: name } }); setMsg('Profile updated.'); }}>
            <Field label="Display name" name="displayName" defaultValue={user?.displayName} onChange={(e) => setName(e.target.value)} />
            <p className="text-sm text-sand/60">{user?.email} · role <span className="capitalize text-sand">{user?.role}</span></p>
            <button className={btn.primary}>Save profile</button>
          </form>
        </Panel>
        <Panel title="Password">
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const raw = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
              const p = changePasswordSchema.safeParse(raw);
              if (!p.success) return setPwErr(Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])));
              setPwErr({});
              try {
                await api('/users/me/password', { method: 'POST', json: p.data });
                setMsg('Password changed. Other devices were signed out.');
                e.currentTarget.reset();
              } catch (err) {
                setPwErr({ currentPassword: (err as Error).message });
              }
            }}
          >
            <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" error={pwErr.currentPassword} />
            <Field label="New password" name="newPassword" type="password" autoComplete="new-password" error={pwErr.newPassword} hint="At least 10 characters, with a letter and a number." />
            <button className={btn.primary}>Change password</button>
          </form>
        </Panel>
        <Panel title="Active sessions">
          {sessions.error && <ErrorNote>{sessions.error}</ErrorNote>}
          <ul className="space-y-2 text-sm">
            {sessions.data?.map((s) => <li key={s.id} className="rounded-xl border border-line-dark px-3 py-2.5"><p className="truncate text-sand">{s.userAgent ?? 'Unknown device'}</p><p className="text-xs text-sand/55">{s.ip} · signed in {fmt.ago(s.createdAt)}</p></li>)}
          </ul>
        </Panel>
        {users.data && (
          <Panel title="Users (admin)" padded={false}>
            <table className="w-full text-sm">
              <tbody>
                {users.data.map((u) => (
                  <tr key={u.id} className="border-t border-line-dark first:border-0">
                    <td className="px-4 py-2.5">{u.displayName}<span className="block text-xs text-sand/55">{u.email}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <select aria-label={`Role for ${u.email}`} defaultValue={u.role} disabled={u.id === user?.id} onChange={async (e) => { await api(`/users/${u.id}/role`, { method: 'PATCH', json: { role: e.target.value } }); setMsg(`Role updated for ${u.email}.`); }} className="rounded-lg border border-line-dark bg-night-2 px-2 py-1">
                        {['admin', 'planner', 'viewer'].map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </>
  );
}

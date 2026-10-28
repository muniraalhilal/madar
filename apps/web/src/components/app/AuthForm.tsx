'use client';
import { loginSchema, registerSchema } from '@madar/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Field } from '@/components/ui/Field';
import { ApiError, api } from '@/lib/api';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next')?.startsWith('/app') ? params.get('next')! : '/app';
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A valid refresh cookie means the visitor is still signed in.
  useEffect(() => {
    if (mode !== 'login') return;
    fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'madar' } }).then((r) => r.ok && router.replace(next));
  }, [mode, next, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = (mode === 'login' ? loginSchema : registerSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await api(`/auth/${mode}`, { method: 'POST', json: parsed.data });
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.issues.length) setErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
        setFormError(err.status === 429 ? 'Too many attempts. Wait a minute and try again.' : err.message);
      } else setFormError('Could not reach MADAR. Check that the API is running.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="display-caps text-3xl text-white sm:text-4xl">{mode === 'login' ? 'Welcome back.' : 'Join MADAR.'}</h1>
      <p className="mt-3 text-sand/70">{mode === 'login' ? 'Sign in to explore the city and run scenarios.' : 'Create a planner account. Your first project and baseline are set up for you.'}</p>
      <form onSubmit={onSubmit} noValidate className="mt-9 space-y-5">
        {mode === 'register' && <Field label="Name" name="displayName" autoComplete="name" error={errors.displayName} />}
        <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" error={errors.email} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          error={errors.password}
          hint={mode === 'register' ? 'At least 10 characters, with a letter and a number.' : undefined}
        />
        {formError && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {formError}
          </p>
        )}
        <button type="submit" disabled={busy} className="pill pill-primary w-full justify-center disabled:opacity-60">
          {busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-sm text-sand/70">
        {mode === 'login' ? (
          <>
            New to MADAR?{' '}
            <Link href={`/register${next !== '/app' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-lavender-soft underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/login" className="text-lavender-soft underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
      {mode === 'login' && <p className="mt-8 rounded-xl border border-line-dark px-4 py-3 text-xs leading-relaxed text-sand/55">Demo: planner@madar.dev — password is the DEMO_PASSWORD you set when seeding (see README).</p>}
    </>
  );
}

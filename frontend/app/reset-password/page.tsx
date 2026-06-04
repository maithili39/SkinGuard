'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldCheck, Loader2, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Reset failed.');
      setDone(true);
      setTimeout(() => router.push('/'), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="p-4 bg-rose-50 rounded-full"><XCircle size={32} className="text-rose-500" /></div>
        </div>
        <p className="text-slate-600">Invalid or missing reset token.</p>
        <Link href="/" className="text-sm text-primary-600 hover:underline">Back to SkinGuard</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="p-4 bg-emerald-50 rounded-full"><CheckCircle size={32} className="text-emerald-500" /></div>
        </div>
        <h3 className="font-bold text-slate-800">Password reset!</h3>
        <p className="text-sm text-slate-500">Redirecting you to the app…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">New password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-300 p-3.5 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition"
          placeholder="Min. 8 characters"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm password</label>
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          className="w-full rounded-xl border border-slate-300 p-3.5 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition"
          placeholder="Repeat password"
        />
      </div>
      {error && <p className="text-sm text-rose-600 flex items-center gap-1.5"><XCircle size={14} />{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-full font-medium transition shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2 disabled:opacity-70"
      >
        {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
        {loading ? 'Updating…' : 'Set new password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50/30 to-emerald-50/20 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="bg-gradient-to-tr from-primary-600 to-primary-400 p-2 rounded-xl text-white shadow-lg shadow-primary-500/30">
            <ShieldCheck size={22} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Reset your password</h2>
        </div>
        <Suspense fallback={<div className="text-center text-slate-500 text-sm">Loading…</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}

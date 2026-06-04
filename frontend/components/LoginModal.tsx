'use client';

import React, { useState } from 'react';
import { ShieldCheck, LogIn, Loader2, X, XCircle, Info, UserPlus } from 'lucide-react';
import type { UserState } from '../types';

interface Props {
  onLogin: (user: UserState) => void;
  onClose: () => void;
}

type Mode = 'login' | 'register';

export function LoginModal({ onLogin, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    setError(null);

    const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Provide helpful error for the most common case
        if (res.status === 409) throw new Error('Email already registered. Try signing in instead.');
        if (res.status === 401) throw new Error('Invalid email or password.');
        if (res.status === 422) {
          // Pydantic validation error — extract the first message
          const detail = data?.detail;
          if (Array.isArray(detail)) throw new Error(detail[0]?.msg || 'Validation error.');
          throw new Error(typeof detail === 'string' ? detail : 'Validation error.');
        }
        throw new Error(data?.detail || 'Request failed. Is the backend running?');
      }
      onLogin({
        email: data.email,
        profile: data.profile,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fade-in-up">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-tr from-primary-600 to-primary-400 p-2 rounded-xl text-white shadow-lg shadow-primary-500/30">
                <ShieldCheck size={22} />
              </div>
              <h2 className="text-xl font-bold text-slate-800">
                {mode === 'login' ? 'Sign in to SkinGuard' : 'Create an account'}
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Mode tabs */}
          <div className="flex rounded-xl border border-slate-200 p-1 mb-6 bg-slate-50">
            <button
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                mode === 'login' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => { setMode('login'); setError(null); }}
            >
              Sign In
            </button>
            <button
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                mode === 'register' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => { setMode('register'); setError(null); }}
            >
              Create Account
            </button>
          </div>

          {/* Auth note */}
          <div className="mb-5 p-3.5 bg-primary-50 border border-primary-200 rounded-xl flex gap-2.5">
            <Info size={15} className="text-primary-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-primary-700 leading-relaxed">
              Your scan history and skin profile are saved securely to your account.
              <strong className="block mt-1">Passwords are hashed — we never store them in plain text.</strong>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="auth-email">
                Email address
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3.5 text-sm text-slate-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition"
                placeholder="you@example.com"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="auth-password">
                Password <span className="font-normal text-slate-400">(min. 8 characters)</span>
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3.5 text-sm text-slate-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="text-sm text-rose-600 flex items-center gap-1.5">
                <XCircle size={14} /> {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-full font-medium transition-all shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : mode === 'register' ? <UserPlus size={18} /> : <LogIn size={18} />}
              {loading ? 'Please wait…' : mode === 'register' ? 'Create Account' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

'use client';

import React, { useState } from 'react';
import { ShieldCheck, LogIn, Loader2, X, XCircle, Info, UserPlus, Mail, CheckCircle } from 'lucide-react';
import type { UserState } from '../types';

interface Props {
  initialMode?: 'login' | 'register';
  onLogin: (user: UserState) => void;
  onClose: () => void;
}

type Mode = 'login' | 'register' | 'forgot';

export function LoginModal({ initialMode = 'login', onLogin, onClose }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();

    if (mode === 'forgot') {
      if (!trimmedEmail || !trimmedEmail.includes('@')) {
        setError('Please enter a valid email address.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await fetch('/api/auth/forgot-password', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmedEmail }),
        });
        setForgotSent(true);
      } catch {
        setError('Failed to send reset email. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (mode === 'register') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (!/[A-Z]/.test(password)) {
        setError('Password must contain at least one uppercase letter.');
        return;
      }
      if (!/[a-z]/.test(password)) {
        setError('Password must contain at least one lowercase letter.');
        return;
      }
      if (!/[0-9]/.test(password)) {
        setError('Password must contain at least one digit.');
        return;
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        setError('Password must contain at least one special character.');
        return;
      }
    } else {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
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
        if (res.status === 409) throw new Error('User already exists.');
        if (res.status === 401) throw new Error('Invalid email or password.');
        if (res.status === 422) {
          const detail = data?.detail;
          if (Array.isArray(detail)) throw new Error(detail[0]?.msg || 'Validation error.');
          throw new Error(typeof detail === 'string' ? detail : 'Validation error.');
        }
        throw new Error(data?.detail || 'Request failed. Is the backend running?');
      }
      onLogin({ email: data.email, profile: data.profile });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setEmail('');
    setPassword('');
    setError(null);
    setForgotSent(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fade-in-up border border-white/20 dark:border-slate-700/50">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-tr from-primary-600 to-primary-400 p-2 rounded-xl text-white shadow-lg shadow-primary-500/30">
                <ShieldCheck size={22} />
              </div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {mode === 'login' ? 'Sign in to SkinGuard' : mode === 'register' ? 'Create an account' : 'Reset password'}
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Mode tabs — only for login/register */}
          {mode !== 'forgot' && (
            <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 mb-6 bg-slate-50 dark:bg-slate-800">
              <button
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  mode === 'login' ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
                onClick={() => switchMode('login')}
              >
                Sign In
              </button>
              <button
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  mode === 'register' ? 'bg-white dark:bg-slate-700 shadow text-slate-800 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
                onClick={() => switchMode('register')}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Forgot password success state */}
          {mode === 'forgot' && forgotSent ? (
            <div className="text-center py-6 space-y-4">
              <div className="flex justify-center">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-full">
                  <CheckCircle size={32} className="text-emerald-500" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Check your inbox</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  If <strong>{email}</strong> exists in our system, a password reset link has been sent.
                </p>
              </div>
              <button
                onClick={() => switchMode('login')}
                className="w-full text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              {mode === 'forgot' && (
                <div className="mb-5 p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl flex gap-2.5">
                  <Mail size={15} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    Enter the email address associated with your account. We&apos;ll send a reset link if it exists.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5" htmlFor="auth-email">
                    Email address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-600 p-3.5 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/50 outline-none transition"
                    placeholder="you@example.com"
                    autoFocus
                  />
                </div>

                {mode !== 'forgot' && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5" htmlFor="auth-password">
                      Password {mode === 'register' ? <span className="font-normal text-slate-450 text-[11px]">(8+ chars, 1 caps, 1 special, 1 digit)</span> : <span className="font-normal text-slate-400">(min. 8 characters)</span>}
                    </label>
                    <input
                      id="auth-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-600 p-3.5 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/50 outline-none transition"
                      placeholder="••••••••"
                    />
                  </div>
                )}

                {error && (
                  <p className="text-sm text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <XCircle size={14} /> {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-full font-medium transition-all shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : mode === 'register' ? (
                    <UserPlus size={18} />
                  ) : mode === 'forgot' ? (
                    <Mail size={18} />
                  ) : (
                    <LogIn size={18} />
                  )}
                  {loading
                    ? 'Please wait…'
                    : mode === 'register'
                    ? 'Create Account'
                    : mode === 'forgot'
                    ? 'Send Reset Link'
                    : 'Sign In'}
                </button>

                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="w-full text-center text-xs text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors mt-1"
                  >
                    Forgot your password?
                  </button>
                )}

                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="w-full text-center text-xs text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors mt-1"
                  >
                    Back to sign in
                  </button>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}

'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldCheck, Loader2, CheckCircle, XCircle, Eye, EyeOff, Check } from 'lucide-react';
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

  // Visibility states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Touched states for inline validations
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  // Sync dark/light mode on mount
  useEffect(() => {
    const saved = localStorage.getItem('sg_dark');
    if (saved !== null) {
      document.documentElement.classList.toggle('dark', saved === '1');
    } else {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', systemDark);
    }
  }, []);

  // Password requirements checks
  const isMinLen = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const passedCriteriaCount = [isMinLen, hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

  const getStrengthIndicator = () => {
    if (!password) return { label: '', color: 'bg-slate-250 dark:bg-slate-800', width: 'w-0' };
    if (passedCriteriaCount <= 2) return { label: 'Weak', color: 'bg-rose-500', width: 'w-1/3' };
    if (passedCriteriaCount <= 4) return { label: 'Fair', color: 'bg-amber-500', width: 'w-2/3' };
    return { label: 'Strong', color: 'bg-emerald-500', width: 'w-full' };
  };

  const strength = getStrengthIndicator();

  // Inline validations
  const isPasswordValid = isMinLen && hasUpper && hasLower && hasDigit && hasSpecial;
  const isConfirmValid = confirm === password && confirm.length > 0;

  // Form validity state
  const isFormValid = isPasswordValid && isConfirmValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || 'Password reset failed.');
      }
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center py-4 space-y-4">
        <div className="flex justify-center">
          <div className="p-4 bg-rose-50 dark:bg-rose-950/20 rounded-full">
            <XCircle size={32} className="text-rose-500" />
          </div>
        </div>
        <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg">Invalid Reset Token</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          The reset link you followed is invalid or has expired. Please request a new password reset link.
        </p>
        <div className="pt-2">
          <Link 
            href="/" 
            className="inline-block text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
          >
            Back to SkinGuard
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center py-4 space-y-5 animate-fade-in">
        <div className="flex justify-center">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/35 rounded-full shadow-inner-glow">
            <CheckCircle size={36} className="text-emerald-500" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h3 className="font-extrabold text-slate-850 dark:text-slate-100 text-lg">
            ✅ Password Updated Successfully
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
            Your password has been changed. You can now sign in with your new password.
          </p>
        </div>

        <div className="pt-4">
          <button
            onClick={() => router.push('/?login=true')}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3.5 rounded-full font-bold text-xs transition shadow-md shadow-primary-500/10 btn-lift flex items-center justify-center gap-2"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 mb-6">
        <div className="bg-gradient-to-tr from-primary-600 to-primary-400 p-2 rounded-xl text-white shadow-lg shadow-primary-500/30 animate-fade-in-up">
          <ShieldCheck size={22} />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Reset your password</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-2xl flex items-start gap-2.5 text-rose-700 dark:text-rose-300 animate-fade-in">
            <XCircle size={16} className="mt-0.5 flex-shrink-0" />
            <p className="text-xs font-semibold leading-relaxed">{error}</p>
          </div>
        )}

        {/* New Password */}
        <div>
          <label className="block text-xs font-bold text-slate-750 dark:text-slate-300 mb-1.5" htmlFor="new-password">
            New Password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setPasswordTouched(true)}
              className={`w-full rounded-xl border p-3.5 pr-11 text-xs text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40 focus:bg-white dark:focus:bg-slate-900/85 outline-none transition ${
                passwordTouched && !isPasswordValid ? 'border-rose-450 focus:ring-4 focus:ring-rose-500/10' : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
              }`}
              placeholder="••••••••"
              autoFocus
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Strength Indicator */}
          {password.length > 0 && (
            <div className="mt-2.5 space-y-1">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                <span>Password Strength</span>
                <span className={passedCriteriaCount <= 2 ? 'text-rose-500' : passedCriteriaCount <= 4 ? 'text-amber-500' : 'text-emerald-500'}>
                  {strength.label}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.width}`} />
              </div>
            </div>
          )}

          {/* Requirements Checklist */}
          <div className="mt-3.5 space-y-1 bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-xl border border-slate-200/40 dark:border-slate-800/40">
            {[
              { check: isMinLen, label: 'Minimum 8 characters' },
              { check: hasUpper, label: 'One uppercase letter' },
              { check: hasLower, label: 'One lowercase letter' },
              { check: hasDigit, label: 'One number' },
              { check: hasSpecial, label: 'One special character' },
            ].map(({ check, label }) => (
              <div key={label} className="flex items-center gap-2 text-[11px] font-medium leading-none">
                <Check
                  size={12}
                  className={`flex-shrink-0 transition-colors duration-250 ${
                    check ? 'text-emerald-500 stroke-[3]' : 'text-slate-300 dark:text-slate-650'
                  }`}
                />
                <span className={check ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-xs font-bold text-slate-750 dark:text-slate-300 mb-1.5" htmlFor="confirm-password">
            Confirm New Password
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              type={showConfirm ? 'text' : 'password'}
              disabled={loading}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setConfirmTouched(true)}
              className={`w-full rounded-xl border p-3.5 pr-11 text-xs text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40 focus:bg-white dark:focus:bg-slate-900/85 outline-none transition ${
                confirmTouched && !isConfirmValid ? 'border-rose-450 focus:ring-4 focus:ring-rose-500/10' : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
              }`}
              placeholder="••••••••"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650"
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {confirmTouched && !isConfirmValid && (
            <p className="text-[10px] text-rose-500 font-semibold mt-1">
              {confirm.length === 0 ? 'Please confirm your new password.' : 'Passwords do not match.'}
            </p>
          )}
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading || !isFormValid}
          className="w-full bg-gradient-to-r from-primary-600 to-emerald-600 hover:from-primary-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-white px-6 py-3.5 rounded-full font-bold text-sm transition-all shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2 btn-lift"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : null}
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50/20 to-emerald-50/20 dark:from-slate-950 dark:via-emerald-950/10 dark:to-slate-950 flex items-center justify-center p-6 transition-colors duration-300">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md p-8 border border-slate-200/50 dark:border-slate-800/50 relative overflow-hidden transition-all duration-300">
        <Suspense fallback={<div className="text-center text-slate-500 dark:text-slate-400 text-sm">Loading…</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}

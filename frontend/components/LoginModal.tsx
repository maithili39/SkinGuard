'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Loader2, X, XCircle, Mail, CheckCircle, Eye, EyeOff, Check } from 'lucide-react';
import type { UserState } from '../types';

interface Props {
  initialMode?: 'choice' | 'login' | 'register';
  onLogin: (user: UserState) => void;
  onClose: () => void;
}

type Mode = 'choice' | 'login' | 'register' | 'forgot' | 'forgot_success';

export function LoginModal({ initialMode = 'choice', onLogin, onClose }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  
  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  
  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Field touched states (for inline validation)
  const [fullNameTouched, setFullNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);

  // Resend countdown timer
  const [resendTimer, setResendTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resendTimer]);

  // Clean form fields and errors when switching modes
  const switchMode = (next: Mode) => {
    setMode(next);
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setFullNameTouched(false);
    setEmailTouched(false);
    setPasswordTouched(false);
    setConfirmPasswordTouched(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  // Password requirements checks
  const isMinLen = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const passedCriteriaCount = [isMinLen, hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

  const getStrengthIndicator = () => {
    if (!password) return { label: '', color: 'bg-slate-200', width: 'w-0' };
    if (passedCriteriaCount <= 2) return { label: 'Weak', color: 'bg-rose-500', width: 'w-1/3' };
    if (passedCriteriaCount <= 4) return { label: 'Fair', color: 'bg-amber-500', width: 'w-2/3' };
    return { label: 'Strong', color: 'bg-emerald-500', width: 'w-full' };
  };

  const strength = getStrengthIndicator();

  // Inline validations
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isFullNameValid = fullName.trim().length >= 2;
  const isPasswordValid = isMinLen && hasUpper && hasLower && hasDigit && hasSpecial;
  const isConfirmPasswordValid = confirmPassword === password && confirmPassword.length > 0;

  // Form validity states
  const isRegisterFormValid = isFullNameValid && isEmailValid && isPasswordValid && isConfirmPasswordValid;
  const isLoginFormValid = isEmailValid && password.length >= 8;

  // Submit handlers
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRegisterFormValid) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, full_name: fullName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) throw new Error('Account already exists.');
        throw new Error(data?.detail || 'Registration failed.');
      }
      onLogin({ email: data.email, full_name: data.full_name, profile: data.profile });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoginFormValid) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) throw new Error('Incorrect email or password.');
        throw new Error(data?.detail || 'Sign in failed.');
      }
      onLogin({ email: data.email, full_name: data.full_name, profile: data.profile });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailValid) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || 'Failed to send reset link.');
      }
      setMode('forgot_success');
      setResendTimer(30);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || 'Failed to resend reset link.');
      }
      setResendTimer(30);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-40" onClick={onClose} />
      
      {/* Modal Card container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md p-8 animate-fade-in-up border border-slate-200/50 dark:border-slate-800/50 relative overflow-hidden transition-all duration-300">
          
          {/* Header & Close Button */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-tr from-primary-600 to-primary-400 p-2 rounded-xl text-white shadow-lg shadow-primary-500/30">
                <ShieldCheck size={22} />
              </div>
              <span className="font-extrabold text-lg text-slate-800 dark:text-white">SkinGuard</span>
            </div>
            <button 
              onClick={onClose} 
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>

          {/* Main error message container */}
          {error && (
            <div className="mb-4 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-2xl flex items-start gap-2.5 text-rose-700 dark:text-rose-300 animate-fade-in">
              <XCircle size={16} className="mt-0.5 flex-shrink-0" />
              <p className="text-xs font-semibold leading-relaxed">{error}</p>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              SCREEN 1: CHOICE SCREEN
             ════════════════════════════════════════════════════════════════════ */}
          {mode === 'choice' && (
            <div className="flex flex-col space-y-4 py-4">
              <div className="text-center space-y-2 mb-4">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Welcome to SkinGuard</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Join us to save scan history and analyze product safety.</p>
              </div>

              <button
                onClick={() => switchMode('login')}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3.5 rounded-full font-bold text-sm transition-all shadow-md shadow-primary-500/10 btn-lift"
              >
                Sign In
              </button>
              
              <button
                onClick={() => switchMode('register')}
                className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 py-3.5 rounded-full font-bold text-sm transition-all border border-slate-250/20"
              >
                Create Account
              </button>

              <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center pt-6 leading-relaxed">
                By continuing, you agree to our Terms &amp; Privacy Policy.
              </p>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              SCREEN 2: CREATE ACCOUNT (SIGN UP)
             ════════════════════════════════════════════════════════════════════ */}
          {mode === 'register' && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mb-6">Create Account</h2>
              
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-750 dark:text-slate-300 mb-1.5" htmlFor="reg-name">
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    disabled={loading}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onBlur={() => setFullNameTouched(true)}
                    className={`w-full rounded-xl border p-3.5 text-xs text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40 focus:bg-white dark:focus:bg-slate-900/85 outline-none transition ${
                      fullNameTouched && !isFullNameValid ? 'border-rose-450 focus:ring-4 focus:ring-rose-500/10' : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                    }`}
                    placeholder="Enter your name"
                  />
                  {fullNameTouched && !isFullNameValid && (
                    <p className="text-[10px] text-rose-500 font-semibold mt-1">Please enter your name (min. 2 characters).</p>
                  )}
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-750 dark:text-slate-300 mb-1.5" htmlFor="reg-email">
                    Email Address
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    className={`w-full rounded-xl border p-3.5 text-xs text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40 focus:bg-white dark:focus:bg-slate-900/85 outline-none transition ${
                      emailTouched && !isEmailValid ? 'border-rose-450 focus:ring-4 focus:ring-rose-500/10' : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                    }`}
                    placeholder="you@example.com"
                  />
                  {emailTouched && !isEmailValid && (
                    <p className="text-[10px] text-rose-500 font-semibold mt-1">Please enter a valid email address.</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-slate-750 dark:text-slate-300 mb-1.5" htmlFor="reg-password">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => setPasswordTouched(true)}
                      className={`w-full rounded-xl border p-3.5 pr-11 text-xs text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40 focus:bg-white dark:focus:bg-slate-900/85 outline-none transition border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10`}
                      placeholder="••••••••"
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
                  <label className="block text-xs font-bold text-slate-750 dark:text-slate-300 mb-1.5" htmlFor="reg-confirm">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      id="reg-confirm"
                      type={showConfirmPassword ? 'text' : 'password'}
                      disabled={loading}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => setConfirmPasswordTouched(true)}
                      className={`w-full rounded-xl border p-3.5 pr-11 text-xs text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40 focus:bg-white dark:focus:bg-slate-900/85 outline-none transition ${
                        confirmPasswordTouched && !isConfirmPasswordValid ? 'border-rose-450 focus:ring-4 focus:ring-rose-500/10' : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                      }`}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650"
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirmPasswordTouched && !isConfirmPasswordValid && (
                    <p className="text-[10px] text-rose-500 font-semibold mt-1">Passwords do not match.</p>
                  )}
                </div>

                {/* Submit Register button */}
                <button
                  type="submit"
                  disabled={loading || !isRegisterFormValid}
                  className="w-full bg-gradient-to-r from-primary-600 to-emerald-600 hover:from-primary-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-white px-6 py-3.5 rounded-full font-bold text-sm transition-all shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2 btn-lift"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                  {loading ? 'Processing…' : 'Create Account'}
                </button>

                {/* Foot switch */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => switchMode('login')}
                  className="w-full text-center text-xs text-slate-450 hover:text-primary-600 dark:hover:text-primary-400 transition-colors mt-2"
                >
                  Already have an account? Sign In
                </button>
              </form>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              SCREEN 3: SIGN IN
             ════════════════════════════════════════════════════════════════════ */}
          {mode === 'login' && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mb-6">Sign In</h2>
              
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                {/* Email Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-750 dark:text-slate-300 mb-1.5" htmlFor="log-email">
                    Email Address
                  </label>
                  <input
                    id="log-email"
                    type="email"
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    className={`w-full rounded-xl border p-3.5 text-xs text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40 focus:bg-white dark:focus:bg-slate-900/85 outline-none transition ${
                      emailTouched && !isEmailValid ? 'border-rose-450 focus:ring-4 focus:ring-rose-500/10' : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                    }`}
                    placeholder="you@example.com"
                    autoFocus
                  />
                  {emailTouched && !isEmailValid && (
                    <p className="text-[10px] text-rose-500 font-semibold mt-1">Please enter a valid email address.</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-bold text-slate-750 dark:text-slate-300" htmlFor="log-password">
                      Password
                    </label>
                    <button
                      type="button"
                      tabIndex={-1}
                      disabled={loading}
                      onClick={() => switchMode('forgot')}
                      className="text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="log-password"
                      type={showPassword ? 'text' : 'password'}
                      disabled={loading}
                      value={password}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 p-3.5 pr-11 text-xs text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40 focus:bg-white dark:focus:bg-slate-900/85 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
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
                </div>

                {/* Remember Me */}
                <div className="flex items-center gap-2 py-1">
                  <input
                    id="log-remember"
                    type="checkbox"
                    disabled={loading}
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-primary-600 focus:ring-primary-500/40 focus:ring-2"
                  />
                  <label className="text-xs text-slate-500 dark:text-slate-400 select-none cursor-pointer" htmlFor="log-remember">
                    Remember Me
                  </label>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading || !isLoginFormValid}
                  className="w-full bg-gradient-to-r from-primary-600 to-emerald-600 hover:from-primary-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-white px-6 py-3.5 rounded-full font-bold text-sm transition-all shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2 btn-lift"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                  {loading ? 'Processing…' : 'Sign In'}
                </button>

                {/* Foot switch */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => switchMode('register')}
                  className="w-full text-center text-xs text-slate-455 hover:text-primary-600 dark:hover:text-primary-400 transition-colors mt-2"
                >
                  Don&apos;t have an account? Create Account
                </button>
              </form>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              SCREEN 4: FORGOT PASSWORD
             ════════════════════════════════════════════════════════════════════ */}
          {mode === 'forgot' && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mb-2">Reset Your Password</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                Enter the email associated with your account and we&apos;ll send you a password reset link.
              </p>

              <form onSubmit={handleForgotSubmit} className="space-y-4">
                {/* Email Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-750 dark:text-slate-300 mb-1.5" htmlFor="forgot-email">
                    Email Address
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    className={`w-full rounded-xl border p-3.5 text-xs text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/40 focus:bg-white dark:focus:bg-slate-900/85 outline-none transition ${
                      emailTouched && !isEmailValid ? 'border-rose-450 focus:ring-4 focus:ring-rose-500/10' : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                    }`}
                    placeholder="you@example.com"
                    autoFocus
                  />
                  {emailTouched && !isEmailValid && (
                    <p className="text-[10px] text-rose-500 font-semibold mt-1">Please enter a valid email address.</p>
                  )}
                </div>

                {/* Send Reset Link button */}
                <button
                  type="submit"
                  disabled={loading || !isEmailValid}
                  className="w-full bg-gradient-to-r from-primary-600 to-emerald-600 hover:from-primary-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-white px-6 py-3.5 rounded-full font-bold text-sm transition-all shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2 btn-lift"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                  {loading ? 'Processing…' : 'Send Reset Link'}
                </button>

                {/* Back to Sign In button */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => switchMode('login')}
                  className="w-full text-center text-xs text-slate-455 hover:text-primary-600 dark:hover:text-primary-400 transition-colors mt-2"
                >
                  Back to Sign In
                </button>
              </form>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              SCREEN 4 SUCCESS CARD (FORGOT PASSWORD SUCCESS)
             ════════════════════════════════════════════════════════════════════ */}
          {mode === 'forgot_success' && (
            <div className="text-center py-4 space-y-5 animate-fade-in">
              <div className="flex justify-center">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/35 rounded-full shadow-inner-glow">
                  <CheckCircle size={36} className="text-emerald-500" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg">Email Sent!</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                  We&apos;ve sent a password reset link to your email. Please check your inbox and spam folder.
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <button
                  onClick={() => switchMode('login')}
                  disabled={loading}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3.5 rounded-full font-bold text-xs transition shadow-md shadow-primary-500/10 btn-lift"
                >
                  Back to Sign In
                </button>

                <button
                  onClick={handleResendEmail}
                  disabled={loading || resendTimer > 0}
                  className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-3 rounded-full font-bold text-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resendTimer > 0 ? `Resend Email (${resendTimer}s)` : 'Resend Email'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import {
  ShieldCheck, Loader2, AlertTriangle, CheckCircle, Scale, History,
  LogIn, Moon, Sun, LogOut, X, Info,
} from 'lucide-react';
import type { SkinProfile, UserState, AnalysisResult } from '../types';
import { ProfilePanel } from '../components/ProfilePanel';
import { UploadCard } from '../components/UploadCard';
import { LoginModal } from '../components/LoginModal';
import { HistoryDrawer } from '../components/HistoryDrawer';
import { ResultsDashboard, FeatureCard } from '../components/ResultsDashboard';
import { ProductChat } from '../components/ProductChat';
import { ComparePanel } from '../components/ComparePanel';
import { RoutineAnalyzer } from '../components/RoutineAnalyzer';
import type { ScanSummary } from '../types';


const LS_USER_KEY = 'sg_user';

const DEFAULT_PROFILE: SkinProfile = {
  pregnant: false,
  sensitive_skin: false,
  acne_prone: false,
  fungal_acne: false,
  rosacea: false,
};

export default function Home() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState<UserState | null>(null);
  const [profile, setProfile] = useState<SkinProfile>(DEFAULT_PROFILE);
  const [avoidInput, setAvoidInput] = useState('');
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [activeTab, setActiveTab] = useState<'analyze' | 'routine' | 'compare'>('analyze');

  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [barcodeProduct, setBarcodeProduct] = useState<{name: string; brand: string; imageUrl?: string} | null>(null);
  const [appVersion, setAppVersion] = useState<string>('');
  const [llmModel, setLlmModel] = useState<string>('');
  const [isBarcodeLookingUp, setIsBarcodeLookingUp] = useState(false);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<'login' | 'register'>('login');
  const [showHistory, setShowHistory] = useState(false);

  const profileSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Dark mode (persist to localStorage + system preference on first visit) ─
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('sg_dark');
    if (saved !== null) {
      setIsDark(saved === '1');
    } else {
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.classList.toggle('dark', isDark);
      localStorage.setItem('sg_dark', isDark ? '1' : '0');
    }
  }, [isDark, mounted]);

  // ── Show onboarding tooltip on first visit ────────────────────────────────
  useEffect(() => {
    if (!localStorage.getItem('sg_onboarded')) {
      setShowOnboarding(true);
    }
  }, []);

  // ── URL.createObjectURL cleanup (prevents memory leak) ────────────────────
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ── Fetch app version + LLM model from /health ───────────────────────────
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setAppVersion(d.version || '');
          setLlmModel(d.llm_model || '');
        }
      })
      .catch(() => {});
  }, []);

  // ── Load user from localStorage on mount ──────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem(LS_USER_KEY);
    if (raw) {
      try {
        const saved: UserState = JSON.parse(raw);
        setUser(saved);
        setProfile({
          pregnant: saved.profile.pregnant,
          sensitive_skin: saved.profile.sensitive_skin,
          acne_prone: saved.profile.acne_prone,
          fungal_acne: saved.profile.fungal_acne,
          rosacea: saved.profile.rosacea ?? false,
        });
        setAvoidInput((saved.profile.avoid_list || []).join(', '));
      } catch {
        localStorage.removeItem(LS_USER_KEY);
      }
    }
  }, []);

  // ── Load scan history on user login ───────────────────────────────────────
  useEffect(() => {
    if (user) {
      (async () => {
        try {
          const res = await fetch('/api/auth/scans', {
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            setScans(data.scans || []);
          }
        } catch (e) {
          console.error(e);
        }
      })();
    } else {
      setScans([]);
    }
  }, [user]);

  // ── Profile auto-save (debounced 800ms) ───────────────────────────────────
  const saveProfile = useCallback(
    (email: string, updated: SkinProfile, avoid: string) => {
      if (!email) return;
      if (profileSaveTimer.current) clearTimeout(profileSaveTimer.current);
      profileSaveTimer.current = setTimeout(async () => {
        try {
          await fetch(`/api/users/${encodeURIComponent(email)}/profile`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...updated,
              avoid_list: avoid.split(',').map((s) => s.trim()).filter(Boolean),
            }),
          });
        } catch {
          // best-effort — not a blocking error
        }
      }, 800);
    },
    [],
  );

  const handleProfileToggle = (key: keyof SkinProfile) => {
    setProfile((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (user) saveProfile(user.email, next, avoidInput);
      return next;
    });
  };

  const handleAvoidChange = (val: string) => {
    setAvoidInput(val);
    if (user) saveProfile(user.email, profile, val);
  };

  // ── File selection (revokes previous blob URL before creating new one) ────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);   // ← memory leak fix
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setExtractedText('');
    setResults(null);
    setError(null);
  };

  // ── OCR extract ───────────────────────────────────────────────────────────
  const handleExtract = async () => {
    if (!file) return;
    setIsExtracting(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/extract-text', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || `OCR failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      setExtractedText(data.text || '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsExtracting(false);
    }
  };

  // ── Analysis ──────────────────────────────────────────────────────────────
  const handleAnalyze = async (overrideText?: string) => {
    const textToAnalyze = typeof overrideText === 'string' ? overrideText : extractedText;
    if (!textToAnalyze.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToAnalyze,
          profile: {
            ...profile,
            avoid_list: avoidInput.split(',').map((s) => s.trim()).filter(Boolean),
          },
          user_email: user?.email ?? null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Analysis failed');
      }
      setResults(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReanalyze = (newText: string) => {
    setExtractedText(newText);
    handleAnalyze(newText);
  };

  const handleBarcodeLookup = async (barcode: string) => {
    setIsBarcodeLookingUp(true);
    setError(null);
    setBarcodeProduct(null);
    try {
      const res = await fetch(`/api/barcode/${barcode}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Product not found in Open Beauty Facts database.');
        }
        throw new Error(`Barcode lookup failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      setBarcodeProduct({
        name: data.product_name,
        brand: data.brands,
        imageUrl: data.image_url || undefined,
      });
      setExtractedText(data.ingredients_text || '');
      setResults(null);
      setFile(null);
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Barcode lookup failed');
    } finally {
      setIsBarcodeLookingUp(false);
    }
  };

  // ── Auth callbacks ────────────────────────────────────────────────────────
  const handleLogin = (newUser: UserState) => {
    // Strip raw JWT token from localStorage to prevent XSS exposure
    const safeUser = { ...newUser, token: undefined };
    setUser(safeUser);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(safeUser));
    setProfile({
      pregnant: newUser.profile.pregnant,
      sensitive_skin: newUser.profile.sensitive_skin,
      acne_prone: newUser.profile.acne_prone,
      fungal_acne: newUser.profile.fungal_acne,
      rosacea: newUser.profile.rosacea ?? false,
    });
    setAvoidInput((newUser.profile.avoid_list || []).join(', '));
    setShowLoginModal(false);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.error('Logout failed:', e);
    }
    setUser(null);
    localStorage.removeItem(LS_USER_KEY);
    setProfile(DEFAULT_PROFILE);
    setAvoidInput('');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main id="main-content" className="min-h-screen flex flex-col items-center bg-gradient-to-br from-slate-50 via-green-50/10 to-emerald-50/20 dark:from-slate-950 dark:via-slate-950/20 dark:to-slate-950 relative overflow-hidden transition-colors duration-300">
      {/* Decorative blobs */}
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-primary-200/20 dark:bg-primary-900/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[-80px] right-[-80px] w-[400px] h-[400px] bg-emerald-200/20 dark:bg-emerald-900/10 rounded-full blur-[60px] pointer-events-none" />

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="w-full px-6 py-4 flex items-center justify-between relative z-10 border-b border-slate-200/40 dark:border-slate-800/40 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md transition-colors duration-300">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-tr from-primary-600 to-primary-400 p-2 rounded-xl text-white shadow-lg shadow-primary-500/30">
            <ShieldCheck size={22} />
          </div>
          <span className="font-extrabold text-xl text-slate-800 dark:text-white">SkinGuard</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Dark mode toggle */}
          <button
            onClick={() => setIsDark((d) => !d)}
            className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title={mounted && isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            id="dark-mode-toggle"
          >
            {mounted && isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {user ? (
            <>
              <button
                id="history-btn"
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors px-3.5 py-2 rounded-full hover:bg-primary-50 dark:hover:bg-primary-950/20 font-semibold"
              >
                <History size={16} /> History
              </button>
              <div className="flex items-center gap-2 bg-primary-50 dark:bg-primary-950/30 px-3.5 py-1.5 rounded-full border border-primary-100 dark:border-primary-900/60">
                <span className="w-2 h-2 rounded-full bg-primary-500" />
                <span className="text-sm font-semibold text-primary-700 dark:text-primary-300 max-w-[140px] truncate">{user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/20"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <button
                id="login-btn"
                onClick={() => { setLoginModalMode('login'); setShowLoginModal(true); }}
                className="text-slate-600 dark:text-slate-350 hover:text-primary-600 dark:hover:text-primary-400 transition-colors px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full font-sans"
              >
                Sign In
              </button>
              <button
                id="signup-btn"
                onClick={() => { setLoginModalMode('register'); setShowLoginModal(true); }}
                className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-all shadow-md shadow-primary-500/20 btn-lift font-sans"
              >
                Create Account
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Onboarding tooltip (first visit only) ────────────────────────── */}
      {showOnboarding && (
        <div className="fixed bottom-6 right-6 z-50 max-w-xs bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 animate-fade-in-up">
          <button
            onClick={() => { setShowOnboarding(false); localStorage.setItem('sg_onboarded', '1'); }}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={14} />
          </button>
          <div className="flex gap-3 items-start">
            <div className="p-2 bg-primary-50 dark:bg-primary-950/40 rounded-xl flex-shrink-0">
              <ShieldCheck size={18} className="text-primary-600" />
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">Welcome to SkinGuard!</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Paste or scan a product&apos;s ingredient list to get an instant safety analysis for your skin type.
              </p>
              <ol className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <li>1. Set your skin profile above</li>
                <li>2. Upload a label photo or paste ingredients</li>
                <li>3. Hit <strong className="text-primary-600 dark:text-primary-400">Analyse</strong></li>
              </ol>
              <button
                onClick={() => { setShowOnboarding(false); localStorage.setItem('sg_onboarded', '1'); }}
                className="mt-3 w-full bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold py-2 rounded-lg transition"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center pt-20 pb-10 px-6 w-full relative z-10">
        <div className="mb-4 flex items-center gap-2 bg-primary-50 border border-primary-200 dark:bg-primary-950/30 dark:border-primary-800/60 rounded-full px-4 py-1.5">
          <CheckCircle size={14} className="text-primary-500" />
          <span className="text-xs font-semibold text-primary-700 dark:text-primary-400 uppercase tracking-wider">EU CosIng · 24,000+ ingredients · Free</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-black text-center text-slate-900 dark:text-white mb-5 leading-tight">
          Know What&apos;s In Your <br />
          <span className="gradient-text">Skincare</span>
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 text-center max-w-2xl mb-10 leading-relaxed">
          Upload a product label or paste the ingredient list. We&apos;ll tell you what each ingredient does — and flag what matters for your skin.
        </p>

        {/* Unified Workspace Tab Bar */}
        <div className="flex gap-1.5 p-1 bg-slate-100/85 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200/50 dark:border-slate-800/40 w-fit mx-auto mb-10 relative z-10 shadow-sm">
          <button
            onClick={() => setActiveTab('analyze')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'analyze'
                ? 'bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 shadow-sm border border-slate-200/5 dark:border-slate-700/10'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Scan &amp; Analyze
          </button>
          <button
            onClick={() => setActiveTab('routine')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'routine'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200/5 dark:border-slate-700/10'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Routine Layering
          </button>
          <button
            onClick={() => setActiveTab('compare')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'compare'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/5 dark:border-slate-700/10'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Product Compare
          </button>
        </div>

        {/* Workspace Panels */}
        {activeTab === 'analyze' && (
          <div className="w-full max-w-4xl flex flex-col items-center animate-fade-in">
            <ProfilePanel profile={profile} onToggle={handleProfileToggle} />

            {/* Avoid list input */}
            {user && (
              <div className="w-full max-w-2xl mb-8">
                <input
                  value={avoidInput}
                  onChange={(e) => handleAvoidChange(e.target.value)}
                  placeholder="Ingredients to avoid (comma-separated, e.g. Fragrance, SLS)"
                  className="w-full border border-slate-250 dark:border-slate-750 rounded-full px-6 py-3.5 text-sm text-slate-800 dark:text-slate-100 bg-white/80 dark:bg-slate-900/80 focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-950/20 outline-none transition shadow-sm"
                  id="avoid-input"
                />
              </div>
            )}

            {/* Upload + Manual entry */}
            <UploadCard
              file={file}
              previewUrl={previewUrl}
              isExtracting={isExtracting}
              onFileChange={handleFileChange}
              onExtract={handleExtract}
              onBarcodeLookup={handleBarcodeLookup}
              isBarcodeLookingUp={isBarcodeLookingUp}
            />

            {/* Barcode product match banner */}
            {barcodeProduct && (
              <div className="w-full max-w-2xl mt-6 p-4 rounded-2xl bg-gradient-to-r from-primary-50 to-emerald-50 dark:from-primary-950/20 dark:to-emerald-950/20 border border-primary-200 dark:border-primary-800/60 flex items-center justify-between gap-4 animate-fade-in-up">
                <div className="flex items-center gap-3">
                  {barcodeProduct.imageUrl && (
                    <Image
                      src={barcodeProduct.imageUrl}
                      alt={barcodeProduct.name}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
                    />
                  )}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">Barcode Match</p>
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm leading-tight">
                      {barcodeProduct.name}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{barcodeProduct.brand}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setBarcodeProduct(null);
                    setExtractedText('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Clear product"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Editable text area (shown after OCR or for manual entry) */}
            {(extractedText !== '' || !file) && (
              <div className="w-full max-w-2xl mt-6 space-y-3">
                <label className="text-sm font-bold text-slate-650 dark:text-slate-350 ml-1.5">
                  {extractedText ? 'Extracted ingredients (edit if needed):' : 'Or paste ingredients manually:'}
                </label>
                <textarea
                  value={extractedText}
                  onChange={(e) => { setExtractedText(e.target.value); setResults(null); }}
                  rows={5}
                  id="ingredient-textarea"
                  placeholder="Aqua, Glycerin, Niacinamide, Panthenol…"
                  className="w-full border border-slate-250 dark:border-slate-750 rounded-2xl p-4 text-sm text-slate-800 dark:text-slate-100 bg-white/90 dark:bg-slate-900/90 focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-950/20 outline-none transition shadow-sm resize-none"
                />
                <button
                  onClick={() => handleAnalyze()}
                  disabled={isAnalyzing || !extractedText.trim()}
                  id="analyze-btn"
                  className="w-full bg-gradient-to-r from-primary-600 to-emerald-600 hover:from-primary-700 hover:to-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-8 py-4 rounded-full font-bold text-lg transition-all shadow-xl shadow-primary-500/25 hover:shadow-primary-500/35 flex items-center justify-center gap-3 btn-lift"
                >
                  {isAnalyzing ? <Loader2 className="animate-spin" size={22} /> : <ShieldCheck size={22} />}
                  {isAnalyzing ? 'Analysing…' : 'Analyse Ingredients'}
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="w-full max-w-2xl mt-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700">
                <AlertTriangle size={18} />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Results */}
            {results && <ResultsDashboard results={results} onReanalyze={handleReanalyze} />}

            {/* RAG Product Chat — shown after analysis */}
            {results && (
              <ProductChat results={results} />
            )}
          </div>
        )}

        {activeTab === 'routine' && (
          <div className="w-full max-w-4xl animate-fade-in">
            <RoutineAnalyzer scans={scans} />
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="w-full max-w-4xl animate-fade-in">
            <ComparePanel currentAnalysis={results} scans={scans} />
          </div>
        )}

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-20 w-full max-w-4xl">
          {[
            { value: '24,000+', label: 'Ingredients', color: 'text-primary-600 dark:text-primary-400' },
            { value: '275+', label: 'Risk flags', color: 'text-amber-600 dark:text-amber-400' },
            { value: '8', label: 'Routine conflicts', color: 'text-rose-600 dark:text-rose-400' },
            { value: 'Free', label: 'Forever', color: 'text-emerald-600 dark:text-emerald-400' },
          ].map(({ value, label, color }) => (
            <div key={label} className="glass-panel rounded-2xl p-4 text-center border border-white/50 dark:border-slate-700/50">
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 w-full max-w-5xl">
          <FeatureCard
            icon={<CheckCircle className="text-green-500" size={24} />}
            title="Acne & Fungal Acne Safe"
            description="Detects pore-clogging and fungal acne triggering ingredients — separated from general safety flags."
          />
          <FeatureCard
            icon={<AlertTriangle className="text-amber-500" size={24} />}
            title="Honest Scoring"
            description="We distinguish 'assessed safe' from 'unknown' — and withhold scores when we don't have enough data."
          />
          <FeatureCard
            icon={<Scale className="text-blue-500" size={24} />}
            title="EU Regulatory Facts"
            description="EU-banned and concentration-restricted ingredients are flagged separately from curated skin advice."
          />
        </div>
      </div>

      {/* ── Medical disclaimer + version footer ──────────────────────────── */}
      <footer className="w-full max-w-5xl mt-16 mb-8 px-4 space-y-3">
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl text-xs text-amber-800 dark:text-amber-300">
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <p>
            <span className="font-bold">Not medical advice.</span> SkinGuard provides educational ingredient information only.
            Always consult a dermatologist or healthcare professional, especially if you are pregnant, have a medical condition,
            or are considering significant changes to your skincare routine.
          </p>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2 px-1">
          <div className="flex gap-4">
            <a href="/privacy" className="text-[10px] text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Privacy Policy</a>
            <a href="https://github.com/maithili39/SkinGuard" target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">GitHub</a>
          </div>
          {(appVersion || llmModel) && (
            <p className="text-[10px] text-slate-400 dark:text-slate-600">
              SkinGuard {appVersion && `v${appVersion}`}{appVersion && llmModel && ' · '}{llmModel && llmModel !== 'unavailable' && `AI: ${llmModel}`}
            </p>
          )}
        </div>
      </footer>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showLoginModal && (
        <LoginModal initialMode={loginModalMode} onLogin={handleLogin} onClose={() => setShowLoginModal(false)} />
      )}
      {showHistory && user && (
        <HistoryDrawer
          email={user.email}
          onClose={() => setShowHistory(false)}
          onSelectScan={handleReanalyze}
        />
      )}
    </main>
  );
}

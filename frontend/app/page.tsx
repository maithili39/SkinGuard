'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import {
  ShieldCheck, Loader2, AlertTriangle, CheckCircle, Scale, History,
  LogIn, Moon, Sun, LogOut, X,
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
  const [activeTab, setActiveTab] = useState<'routine' | 'compare'>('routine');

  const [isDark, setIsDark] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [barcodeProduct, setBarcodeProduct] = useState<{name: string; brand: string; imageUrl?: string} | null>(null);
  const [isBarcodeLookingUp, setIsBarcodeLookingUp] = useState(false);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const profileSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Dark mode ──────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // ── URL.createObjectURL cleanup (prevents memory leak) ────────────────────
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
    } catch (err: any) {
      setError(err.message);
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
    } catch (err: any) {
      setError(err.message);
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
    <main id="main-content" className="min-h-screen flex flex-col items-center bg-gradient-to-br from-slate-50 via-green-50/30 to-emerald-50/20 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-primary-200/20 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[-80px] right-[-80px] w-[400px] h-[400px] bg-emerald-200/20 rounded-full blur-[60px] pointer-events-none" />

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="w-full px-6 py-4 flex items-center justify-between relative z-10 border-b border-white/50 bg-white/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-tr from-primary-600 to-primary-400 p-2 rounded-xl text-white shadow-lg shadow-primary-500/30">
            <ShieldCheck size={22} />
          </div>
          <span className="font-extrabold text-xl text-slate-800">SkinGuard</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Dark mode toggle */}
          <button
            onClick={() => setIsDark((d) => !d)}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            id="dark-mode-toggle"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {user ? (
            <>
              <button
                id="history-btn"
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-primary-600 transition-colors px-3 py-2 rounded-full hover:bg-primary-50"
              >
                <History size={16} /> History
              </button>
              <div className="flex items-center gap-2 bg-primary-50 px-3 py-1.5 rounded-full border border-primary-200">
                <span className="w-2 h-2 rounded-full bg-primary-500" />
                <span className="text-sm font-medium text-primary-700 max-w-[140px] truncate">{user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-full hover:bg-rose-50"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <button
              id="login-btn"
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-all shadow-md shadow-primary-500/20"
            >
              <LogIn size={15} /> Sign In
            </button>
          )}
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center pt-20 pb-10 px-6 w-full relative z-10">
        <div className="mb-4 flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-full px-4 py-1.5">
          <CheckCircle size={14} className="text-primary-500" />
          <span className="text-xs font-semibold text-primary-700 uppercase tracking-wider">EU CosIng + Curated Risk Database</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-black text-center text-slate-900 mb-5 leading-tight">
          Know What&apos;s In Your <br />
          <span className="gradient-text">Skincare</span>
        </h1>
        <p className="text-xl text-slate-600 text-center max-w-2xl mb-10 leading-relaxed">
          Upload a product label or paste the ingredient list. We&apos;ll tell you what each ingredient does — and flag what matters for your skin.
        </p>

        <ProfilePanel profile={profile} onToggle={handleProfileToggle} />

        {/* Avoid list input */}
        {user && (
          <div className="w-full max-w-2xl mb-8">
            <input
              value={avoidInput}
              onChange={(e) => handleAvoidChange(e.target.value)}
              placeholder="Ingredients to avoid (comma-separated, e.g. Fragrance, SLS)"
              className="w-full border border-slate-300 rounded-full px-5 py-3 text-sm text-slate-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition bg-white/80 backdrop-blur-sm"
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
            <label className="text-sm font-semibold text-slate-600 ml-1">
              {extractedText ? 'Extracted ingredients (edit if needed):' : 'Or paste ingredients manually:'}
            </label>
            <textarea
              value={extractedText}
              onChange={(e) => { setExtractedText(e.target.value); setResults(null); }}
              rows={5}
              id="ingredient-textarea"
              placeholder="Aqua, Glycerin, Niacinamide, Panthenol…"
              className="w-full border border-slate-300 rounded-2xl p-4 text-sm text-slate-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition bg-white/90 shadow-sm resize-none"
            />
            <button
              onClick={() => handleAnalyze()}
              disabled={isAnalyzing || !extractedText.trim()}
              id="analyze-btn"
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-8 py-4 rounded-full font-semibold text-lg transition-all shadow-xl shadow-primary-500/30 flex items-center justify-center gap-3"
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

        {/* Advanced Tools Section */}
        <div className="w-full max-w-4xl mt-12 space-y-6">
          <div className="flex border-b border-slate-200 dark:border-slate-850">
            <button
              onClick={() => setActiveTab('routine')}
              className={`px-6 py-3 font-bold text-sm border-b-2 transition-all duration-200 ${
                activeTab === 'routine'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-550 hover:text-slate-700'
              }`}
            >
              🔄 Routine Layering Check
            </button>
            <button
              onClick={() => setActiveTab('compare')}
              className={`px-6 py-3 font-bold text-sm border-b-2 transition-all duration-200 ${
                activeTab === 'compare'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-550 hover:text-slate-700'
              }`}
            >
              ⚖️ Product Comparison
            </button>
          </div>
          
          {activeTab === 'routine' ? (
            <RoutineAnalyzer scans={scans} />
          ) : (
            <ComparePanel currentAnalysis={results} scans={scans} />
          )}
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 w-full max-w-5xl">
          <FeatureCard
            icon={<CheckCircle className="text-green-500" />}
            title="Acne Safe"
            description="Detects pore-clogging and fungal acne triggering ingredients instantly."
          />
          <FeatureCard
            icon={<AlertTriangle className="text-amber-500" />}
            title="Honest Scoring"
            description="We distinguish 'assessed safe' from 'unknown' — and withhold scores when we don't have data."
          />
          <FeatureCard
            icon={<Scale className="text-blue-500" />}
            title="Regulatory Facts"
            description="EU-banned and restricted ingredients are flagged separately from curated advice."
          />
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showLoginModal && (
        <LoginModal onLogin={handleLogin} onClose={() => setShowLoginModal(false)} />
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

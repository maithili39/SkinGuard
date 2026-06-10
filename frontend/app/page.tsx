'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, Loader2, AlertTriangle, CheckCircle, XCircle,
  Heart, Trash2, Search, Plus, X, ArrowRight, Barcode,
  BookOpen, Layers, Star, ExternalLink, User, Check, LogOut,
  Upload, Camera, FileText, ChevronDown, ChevronRight, Info,
  RefreshCw, Minus, FlaskConical, Leaf
} from 'lucide-react';
import type { SkinProfile, UserState, AnalysisResult } from '../types';
import { RoutineAnalyzer } from '../components/RoutineAnalyzer';
import { ComparePanel } from '../components/ComparePanel';
import { ResultsDashboard } from '../components/ResultsDashboard';
import { ProfilePanel } from '../components/ProfilePanel';
import { BarcodeScanner } from '../components/BarcodeScanner';

const LS_USER_KEY = 'sg_user';
const DEMO_INGREDIENTS = "Water, Glycerin, Niacinamide, Salicylic Acid, Fragrance, Ceramide NP, Phenoxyethanol, Alcohol Denat.";

const GLOSSARY_TERMS = [
  { term: "INCI", definition: "International Nomenclature of Cosmetic Ingredients — standardized chemical naming system for ingredients on cosmetic labels." },
  { term: "Comedogenic", definition: "The tendency of an ingredient to clog pores. Graded 0–5; ratings of 3+ are considered pore-clogging for acne-prone skin." },
  { term: "Fungal Acne", definition: "Malassezia folliculitis — triggered when specific fatty acids and esters in products feed Malassezia yeast on skin." },
  { term: "Drying Alcohols", definition: "Volatile alcohols (Alcohol Denat., Ethanol) that disrupt the skin lipid barrier and trigger rosacea flushing." },
  { term: "pH Active", definition: "Ingredients like AHAs, BHAs, and Vitamin C that require specific acidic pH ranges to work effectively." },
  { term: "Retinoids", definition: "Vitamin A derivatives that accelerate cell turnover. Contraindicated during pregnancy at any concentration." },
  { term: "Ceramides", definition: "Waxy lipids forming over 50% of the skin barrier. Critical for locking in hydration and repairing damage." },
  { term: "Niacinamide", definition: "Vitamin B3. Controls sebum, strengthens the barrier, calms redness, fades hyperpigmentation. Suitable for all skin types." },
  { term: "Emollient", definition: "An ingredient that softens and smooths skin by filling in spaces between skin cells, reducing water loss." },
  { term: "Humectant", definition: "An ingredient that draws moisture from the environment or deeper skin layers into the outer skin. Examples: glycerin, hyaluronic acid." },
];

export default function Home() {
  const [user, setUser] = useState<UserState | null>(null);
  const [profile, setProfile] = useState<SkinProfile>({
    pregnant: false, sensitive_skin: true, acne_prone: true,
    fungal_acne: false, rosacea: false, dry_skin: false,
    oily_skin: true, combination_skin: false, normal_skin: false,
  });
  const [allergies, setAllergies] = useState<string[]>(['Fragrance', 'Alcohol']);
  const [newAllergyInput, setNewAllergyInput] = useState('');

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'home' | 'analyze' | 'routine' | 'compare' | 'learn' | 'vanity'>('home');
  const [inputMode, setInputMode] = useState<'paste' | 'upload' | 'barcode'>('paste');

  const [pastedIngredients, setPastedIngredients] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isBarcodeLookingUp, setIsBarcodeLookingUp] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<{ name: string; brand: string } | null>(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedIngredients, setExtractedIngredients] = useState<string[]>([]);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addIngredientInput, setAddIngredientInput] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<any[]>([]);
  const [savedProducts, setSavedProducts] = useState<any[]>([]);

  const [encyclopediaSearch, setEncyclopediaSearch] = useState('');
  const [encyclopediaResult, setEncyclopediaResult] = useState<any | null>(null);
  const [encyclopediaLoading, setEncyclopediaLoading] = useState(false);
  const [glossarySearch, setGlossarySearch] = useState('');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(LS_USER_KEY);
    if (saved) {
      try {
        const u: UserState = JSON.parse(saved);
        setUser(u);
        if (u.profile) {
          setProfile({ pregnant: u.profile.pregnant, sensitive_skin: u.profile.sensitive_skin, acne_prone: u.profile.acne_prone, fungal_acne: u.profile.fungal_acne, rosacea: u.profile.rosacea ?? false, dry_skin: u.profile.dry_skin ?? false, oily_skin: u.profile.oily_skin ?? false, combination_skin: u.profile.combination_skin ?? false, normal_skin: u.profile.normal_skin ?? false });
          setAllergies(u.profile.avoid_list || []);
        }
      } catch { localStorage.removeItem(LS_USER_KEY); }
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetch('/api/auth/scans').then(r => r.ok ? r.json() : null).then(d => { if (d?.scans) setScans(d.scans); }).catch(() => {});
      const savedKey = `sg_saved_${user.email}`;
      try { const d = localStorage.getItem(savedKey); if (d) setSavedProducts(JSON.parse(d)); } catch {}
    } else { setScans([]); setSavedProducts([]); }
  }, [user]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleProfileToggle = (key: keyof SkinProfile) => {
    setProfile(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveProfileToBackend(next, allergies);
      return next;
    });
  };

  const saveProfileToBackend = async (p: SkinProfile, a: string[]) => {
    if (!user) return;
    try {
      await fetch(`/api/users/${encodeURIComponent(user.email)}/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p, avoid_list: a }) });
      const u = { ...user, profile: { ...p, avoid_list: a } };
      setUser(u); localStorage.setItem(LS_USER_KEY, JSON.stringify(u));
    } catch {}
  };

  const handleLoginMock = (email: string, fullName: string) => {
    const u: UserState = { email, full_name: fullName, profile: { pregnant: false, sensitive_skin: true, acne_prone: true, fungal_acne: false, rosacea: false, dry_skin: false, oily_skin: true, combination_skin: false, normal_skin: false, avoid_list: ['Fragrance', 'Alcohol'] } };
    setUser(u); localStorage.setItem(LS_USER_KEY, JSON.stringify(u)); setShowLoginModal(false); setActiveTab('vanity');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthError(null);
    if (!emailInput) { setAuthError('Email is required.'); return; }
    if (authMode === 'forgot') { alert(`Reset link sent to ${emailInput}`); setAuthMode('login'); return; }
    try {
      const path = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = authMode === 'login' ? { email: emailInput, password: passwordInput } : { email: emailInput, password: passwordInput, full_name: nameInput || 'User' };
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Authentication failed'); }
      const d = await res.json();
      handleLoginMock(d.email, d.full_name || nameInput || 'User');
    } catch (err: any) { setAuthError(err.message || 'An error occurred'); }
  };

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    setUser(null); localStorage.removeItem(LS_USER_KEY); setActiveTab('home');
  };

  const handleExtractText = async () => {
    if (!file) return;
    setIsExtracting(true); setError(null);
    const formData = new FormData(); formData.append('file', file);
    try {
      const res = await fetch('/api/extract-text', { method: 'POST', body: formData });
      if (!res.ok) { const d = await res.json().catch(() => ({ detail: 'OCR extraction failed' })); throw new Error(d.detail); }
      const data = await res.json();
      const text = data.text || '';
      if (!text.trim()) throw new Error('No text detected in image. Ensure the ingredient list is clearly visible and try again.');
      const parsed = text.split(/,|\n/).map((s: string) => s.trim().replace(/[.*]/g, '')).filter(Boolean);
      setExtractedIngredients(parsed); setResults(null); setActiveTab('analyze');
    } catch (err: any) { setError(err.message); }
    finally { setIsExtracting(false); }
  };

  const handleBarcodeLookup = async (code: string) => {
    const c = code || barcodeInput;
    if (!c.trim()) { setError('Enter a barcode number.'); return; }
    setIsBarcodeLookingUp(true); setError(null); setBarcodeProduct(null);
    try {
      const res = await fetch(`/api/barcode/${c.trim()}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || 'Product not found in any barcode database.'); }
      const data = await res.json();
      setBarcodeProduct({ name: data.product_name || 'Unknown Product', brand: data.brands || '' });
      const ingText = data.ingredients_text || '';
      if (!ingText) throw new Error('Product found but has no ingredient list. Try uploading a photo of the label instead.');
      const parsed = ingText.split(',').map((s: string) => s.trim()).filter(Boolean);
      setExtractedIngredients(parsed); setResults(null); setActiveTab('analyze');
    } catch (err: any) { setError(err.message); }
    finally { setIsBarcodeLookingUp(false); }
  };

  const handleManualInputSubmit = () => {
    if (!pastedIngredients.trim()) return;
    if (pastedIngredients.length > 5000) { setError('Input too long — limit is 5,000 characters.'); return; }
    const sanitized = pastedIngredients.replace(/<[^>]*>/g, '');
    const parsed = sanitized.split(',').map(s => s.trim().replace(/[.*]/g, '')).filter(Boolean);
    if (parsed.length <= 1) { setError('Please paste the full ingredient list separated by commas.'); return; }
    setExtractedIngredients(parsed); setResults(null); setError(null); setActiveTab('analyze');
  };

  const handleRunAnalysis = async () => {
    if (extractedIngredients.length === 0) return;
    setIsAnalyzing(true); setError(null);
    const textToAnalyze = extractedIngredients.join(', ');
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: textToAnalyze, profile: { ...profile, avoid_list: allergies }, user_email: user?.email || null }) });
      if (!res.ok) throw new Error('Analysis failed');
      const data: AnalysisResult = await res.json();
      setResults(data);
      const mock = { id: Date.now(), created_at: new Date().toISOString(), safety_score: data.safety_score, coverage_percent: data.coverage_percent, summary: data.summary, result: data, input_text: textToAnalyze };
      if (!user) setScans(prev => [mock, ...prev]);
      else fetch('/api/auth/scans').then(r => r.ok ? r.json() : null).then(d => { if (d?.scans) setScans(d.scans); });
    } catch (err: any) { setError(err.message); }
    finally { setIsAnalyzing(false); }
  };

  const handleTryDemo = () => {
    const parsed = DEMO_INGREDIENTS.split(',').map(s => s.trim()).filter(Boolean);
    setExtractedIngredients(parsed); setResults(null); setActiveTab('analyze');
  };

  const toggleSave = (name: string) => {
    if (!user) { setAuthMode('login'); setShowLoginModal(true); return; }
    const key = `sg_saved_${user.email}`;
    let current = [...savedProducts];
    const exists = current.find(p => p.name === name);
    if (exists) current = current.filter(p => p.name !== name);
    else current.push({ id: Date.now().toString(), name, date: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), score: results?.safety_score || 80, result: results });
    setSavedProducts(current); localStorage.setItem(key, JSON.stringify(current));
  };

  const handleSearchEncyclopedia = async (e: React.FormEvent) => {
    e.preventDefault(); if (!encyclopediaSearch.trim()) return;
    setEncyclopediaLoading(true); setEncyclopediaResult(null);
    try {
      const res = await fetch(`/api/explain/${encodeURIComponent(encyclopediaSearch.trim())}?llm=true`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      setEncyclopediaResult({ name: encyclopediaSearch.trim(), description: data.explanation || 'A cosmetic ingredient used in formulations.', benefits: data.ingredient?.function || 'Conditioning, hydrating, or UV-filtering.', sideEffects: data.ingredient?.irritant === 'yes' ? 'May cause localized redness or irritation in sensitive skin.' : 'Generally well-tolerated under standard use concentrations.', sources: 'EU CosIng Inventory / Dermatology consensus', types: data.ingredient?.comedogenic ? 'Use with caution on acne-prone skin.' : 'Generally suitable for all skin types.' });
    } catch {
      setEncyclopediaResult({ name: encyclopediaSearch.trim(), description: 'Cosmetic ingredient used for its skin surface or stability benefits in formulations.', benefits: 'Hydration, viscosity adjustment, or emulsification.', sideEffects: 'Generally well-tolerated.', sources: 'EU CosIng Registry', types: 'Suitable for most skin types.' });
    } finally { setEncyclopediaLoading(false); }
  };

  const filteredGlossary = GLOSSARY_TERMS.filter(g =>
    g.term.toLowerCase().includes(glossarySearch.toLowerCase()) ||
    g.definition.toLowerCase().includes(glossarySearch.toLowerCase())
  );

  const navItems = [
    { id: 'home', label: 'Purity Check' },
    { id: 'routine', label: 'Routine' },
    { id: 'compare', label: 'Compare' },
    { id: 'learn', label: 'Encyclopedia' },
    ...(user ? [{ id: 'vanity', label: 'My Vanity' }] : []),
  ];

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: "'Nunito Sans', sans-serif" }}>

      {/* Camera Scanner */}
      {showCameraScanner && (
        <BarcodeScanner
          onDetected={code => { setShowCameraScanner(false); setBarcodeInput(code); handleBarcodeLookup(code); }}
          onClose={() => setShowCameraScanner(false)}
        />
      )}

      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <header style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--header-border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>

          {/* Logo */}
          <button
            onClick={() => { setResults(null); setExtractedIngredients([]); setActiveTab('home'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--green-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={17} color="white" />
            </div>
            <span style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--text-dark)', letterSpacing: '-0.02em' }}>SkinGuard</span>
          </button>

          {/* Desktop Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="hidden md:flex">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => { if (item.id === 'home') { setResults(null); setExtractedIngredients([]); } setActiveTab(item.id as any); }}
                className={`nav-tab ${(activeTab === item.id || (item.id === 'home' && activeTab === 'analyze')) ? 'active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Auth */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {user ? (
              <>
                <button onClick={() => setActiveTab('vanity')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: '1.5px solid var(--border-dark)', borderRadius: 50, padding: '6px 14px', cursor: 'pointer' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--green-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                    {(user.full_name || user.email)[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dark)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name || 'User'}</span>
                </button>
                <button onClick={handleLogout} title="Sign out" style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 8, display: 'flex' }}>
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setAuthMode('login'); setShowLoginModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', padding: '8px 12px', borderRadius: 8 }}>Login</button>
                <button onClick={() => { setAuthMode('signup'); setShowLoginModal(true); }} className="btn-green" style={{ padding: '9px 20px', fontSize: 13 }}>Sign up</button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="flex md:hidden" style={{ background: 'white', borderBottom: '1px solid var(--border)', padding: '8px 16px', gap: 6, overflowX: 'auto' }}>
        {navItems.map(item => (
          <button key={item.id} onClick={() => { if (item.id === 'home') { setResults(null); setExtractedIngredients([]); } setActiveTab(item.id as any); }} className={`nav-tab ${activeTab === item.id ? 'active' : ''}`} style={{ flexShrink: 0 }}>{item.label}</button>
        ))}
      </div>

      {/* ─── Content ──────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px' }}>

        {/* ═══════════════════════════════════════════════
            HOME PAGE
            ═══════════════════════════════════════════════ */}
        {activeTab === 'home' && (
          <div className="animate-fade-up">

            {/* ── EWG-style teal hero banner ── */}
            <section style={{ background: 'var(--teal-header)', margin: '0 -20px', padding: '52px 20px 80px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 50, padding: '5px 16px', marginBottom: 20 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Nunito Sans', sans-serif" }}>Cosmetic Safety Database</span>
                </div>
                <h1 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 900, fontSize: 'clamp(32px, 5vw, 52px)', color: 'white', marginBottom: 20, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                  Know what&apos;s in<br />your skincare.
                </h1>
                <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', maxWidth: 480, margin: '0 auto 36px', lineHeight: 1.65, fontFamily: "'Nunito Sans', sans-serif" }}>
                  Decode ingredient labels. Flag EU-banned substances, allergens, comedogenics, and pregnancy risks — adjusted for your skin profile.
                </p>

                {/* EWG-style search box */}
                <div style={{ background: 'white', borderRadius: 12, padding: 6, display: 'flex', gap: 6, maxWidth: 560, margin: '0 auto 24px', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
                  <textarea
                    value={pastedIngredients}
                    onChange={e => setPastedIngredients(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleManualInputSubmit(); }}
                    rows={2}
                    placeholder="Paste ingredient list here (comma-separated)..."
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: "'Nunito Sans', sans-serif", color: 'var(--text-dark)', resize: 'none', padding: '8px 12px', lineHeight: 1.5, background: 'transparent' }}
                  />
                  <button onClick={handleManualInputSubmit} className="ewg-search-btn" style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Analyze
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button onClick={handleTryDemo} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '9px 20px', borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FlaskConical size={13} /> Try Demo Scan
                  </button>
                  <button onClick={() => { setInputMode('barcode'); document.getElementById('scan-widget')?.scrollIntoView({ behavior: 'smooth' }); }} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '9px 20px', borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Nunito Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Barcode size={13} /> Barcode Lookup
                  </button>
                </div>
              </div>

              {/* Decorative circles (EWG-inspired) */}
              <div style={{ position: 'absolute', top: -60, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: -80, left: -80, width: 360, height: 360, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
            </section>

            {/* Yuka-style wave separator */}
            <div style={{ background: 'var(--teal-header)', margin: '0 -20px' }}>
              <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%' }}>
                <path d="M0 0L1440 0L1440 20C1200 60 960 60 720 40C480 20 240 60 0 40L0 0Z" fill="var(--bg)" />
              </svg>
            </div>

            {/* ── Skin Profile step ── */}
            <section style={{ padding: '60px 0', textAlign: 'center' }}>
              <div style={{ maxWidth: 640, margin: '0 auto' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Nunito Sans', sans-serif" }}>Step 1</span>
                <h2 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 28, color: 'var(--text-dark)', margin: '10px 0 12px' }}>Set your skin profile</h2>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 32, fontFamily: "'Nunito Sans', sans-serif" }}>
                  Select your skin conditions. Risk scoring adapts to your specific sensitivities.
                </p>
                <ProfilePanel profile={profile} onToggle={handleProfileToggle} />
              </div>
            </section>

            {/* Wave into section 2 */}
            <div style={{ margin: '0 -20px' }}>
              <svg viewBox="0 0 1440 50" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%' }}>
                <path d="M0 50L1440 50L1440 20C1200 0 960 40 720 20C480 0 240 40 0 20L0 50Z" fill="white" />
              </svg>
            </div>

            {/* ── Scan Widget ── */}
            <section id="scan-widget" style={{ background: 'white', margin: '0 -20px', padding: '60px 20px' }}>
              <div style={{ maxWidth: 640, margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: 36 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Nunito Sans', sans-serif" }}>Step 2</span>
                  <h2 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 28, color: 'var(--text-dark)', margin: '10px 0 10px' }}>Upload or paste ingredients</h2>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: "'Nunito Sans', sans-serif" }}>Photo of the label, barcode lookup, or paste the list directly.</p>
                </div>

                {/* Mode selector */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 24, padding: 4, background: 'var(--bg-section)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  {[
                    { id: 'paste', label: 'Paste List', icon: <FileText size={13} /> },
                    { id: 'upload', label: 'Photo / OCR', icon: <Upload size={13} /> },
                    { id: 'barcode', label: 'Barcode', icon: <Barcode size={13} /> },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setInputMode(m.id as any); setError(null); }}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '10px 8px', borderRadius: 9, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 700, transition: 'all 0.18s',
                        background: inputMode === m.id ? 'white' : 'transparent',
                        color: inputMode === m.id ? 'var(--green-primary)' : 'var(--text-muted)',
                        boxShadow: inputMode === m.id ? 'var(--shadow-sm)' : 'none',
                        fontFamily: "'Nunito Sans', sans-serif",
                      }}
                    >
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>

                {/* Error */}
                {error && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: '#fdeaea', border: '1px solid rgba(232,75,60,0.25)', borderRadius: 10, marginBottom: 16 }}>
                    <AlertTriangle size={15} style={{ color: '#e84b3c', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 13, color: '#9a1e18', fontFamily: "'Nunito Sans', sans-serif", lineHeight: 1.5 }}>{error}</span>
                  </div>
                )}

                {/* Paste mode */}
                {inputMode === 'paste' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <textarea
                      value={pastedIngredients}
                      onChange={e => setPastedIngredients(e.target.value)}
                      rows={6}
                      placeholder="Aqua, Glycerin, Niacinamide, Salicylic Acid, Fragrance, Ceramide NP..."
                      className="input-field"
                      style={{ fontSize: 13, fontFamily: "'Nunito Sans', monospace" }}
                    />
                    <button onClick={handleManualInputSubmit} className="btn-green" style={{ padding: '13px 24px', fontSize: 14, width: '100%' }}>
                      <Layers size={15} /> Extract and Analyze Ingredients
                    </button>
                  </div>
                )}

                {/* Upload mode */}
                {inputMode === 'upload' && (
                  <div>
                    {!previewUrl ? (
                      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, border: '2px dashed var(--border-dark)', borderRadius: 16, padding: '48px 24px', cursor: 'pointer', background: 'var(--bg-section)', textAlign: 'center', transition: 'all 0.18s' }}>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Upload size={22} style={{ color: 'var(--green-primary)' }} />
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-dark)', fontFamily: "'Nunito Sans', sans-serif" }}>Drop photo here or click to browse</p>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontFamily: "'Nunito Sans', sans-serif" }}>AI-powered OCR reads the ingredient block — JPG, PNG, WEBP up to 8MB</p>
                        </div>
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) { setFile(f); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(URL.createObjectURL(f)); setError(null); }
                        }} />
                      </label>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                          <img src={previewUrl} alt="Label preview" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', background: '#f8f8f8', display: 'block' }} />
                          <button onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setFile(null); setError(null); }}
                            style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={13} />
                          </button>
                        </div>
                        <button onClick={handleExtractText} disabled={isExtracting} className="btn-green" style={{ padding: '13px 24px', fontSize: 14, width: '100%' }}>
                          {isExtracting ? <><Loader2 size={15} className="animate-spin" /> Extracting text via OCR...</> : <><FileText size={15} /> Extract Ingredient Text</>}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Barcode mode */}
                {inputMode === 'barcode' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={barcodeInput}
                        onChange={e => setBarcodeInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleBarcodeLookup(barcodeInput); }}
                        placeholder="Enter product barcode (e.g. 0748948000214)..."
                        className="input-field"
                        style={{ fontFamily: 'monospace', flex: 1 }}
                      />
                      <button onClick={() => handleBarcodeLookup(barcodeInput)} disabled={isBarcodeLookingUp} className="btn-green" style={{ padding: '0 20px', flexShrink: 0, fontSize: 13 }}>
                        {isBarcodeLookingUp ? <Loader2 size={13} className="animate-spin" /> : 'Look up'}
                      </button>
                    </div>
                    {barcodeProduct && (
                      <div style={{ padding: '12px 16px', background: 'var(--green-light)', border: '1px solid rgba(30,122,78,0.2)', borderRadius: 10 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Product found</span>
                        <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-dark)', marginTop: 2, fontFamily: "'Nunito Sans', sans-serif" }}>{barcodeProduct.name}</p>
                        {barcodeProduct.brand && <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Nunito Sans', sans-serif" }}>{barcodeProduct.brand}</p>}
                      </div>
                    )}
                    <div style={{ position: 'relative', textAlign: 'center' }}>
                      <div style={{ position: 'absolute', inset: '50% 0 auto', height: 1, background: 'var(--border)' }} />
                      <span style={{ position: 'relative', background: 'white', padding: '0 12px', fontSize: 11, color: 'var(--text-light)', fontFamily: "'Nunito Sans', sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em' }}>or</span>
                    </div>
                    <button onClick={() => setShowCameraScanner(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px', border: '1.5px solid var(--border-dark)', borderRadius: 12, background: 'white', cursor: 'pointer', fontFamily: "'Nunito Sans', sans-serif", transition: 'all 0.18s' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Camera size={16} style={{ color: 'var(--green-primary)' }} />
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dark)' }}>Open Camera Scanner</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Real-time ZXing barcode decoder</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Wave back to bg */}
            <div style={{ margin: '0 -20px' }}>
              <svg viewBox="0 0 1440 50" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%' }}>
                <path d="M0 0L1440 0L1440 30C1200 50 960 10 720 30C480 50 240 10 0 30L0 0Z" fill="white" />
              </svg>
            </div>

            {/* ── How it works (Yuka-style 3-col) ── */}
            <section style={{ padding: '60px 0 80px' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <h2 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 28, color: 'var(--text-dark)' }}>How SkinGuard works</h2>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, fontFamily: "'Nunito Sans', sans-serif" }}>Evidence-based ingredient analysis in three steps.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }} className="stagger">
                {[
                  { num: '01', title: 'Match the INCI', body: 'Each ingredient is matched against 24,000+ EU CosIng database entries using fuzzy search and semantic embeddings.' },
                  { num: '02', title: 'Score by profile', body: 'Risk scoring adapts to your skin type. What is safe for normal skin may be flagged for acne-prone or pregnant skin.' },
                  { num: '03', title: 'Get the verdict', body: 'Receive a safety score, ingredient-by-ingredient findings, safer alternatives, and sourced citations.' },
                ].map((step, i) => (
                  <div key={i} className="card card-hover" style={{ padding: '32px 28px' }}>
                    <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 900, fontSize: 48, color: 'var(--green-light)', lineHeight: 1, marginBottom: 16 }}>{step.num}</div>
                    <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--text-dark)', marginBottom: 10 }}>{step.title}</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, fontFamily: "'Nunito Sans', sans-serif" }}>{step.body}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Sample analysis preview (Yuka-style card) ── */}
            <section style={{ padding: '0 0 80px' }}>
              <div style={{ background: 'white', borderRadius: 20, border: '1px solid var(--border)', padding: '36px', boxShadow: 'var(--shadow-md)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'start' }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Nunito Sans', sans-serif" }}>Sample Analysis — Hydrating Toner</span>
                    <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--text-dark)', margin: '8px 0 20px' }}>What a report looks like</h3>

                    {/* Ingredient rows (Yuka style) */}
                    <div>
                      {[
                        { name: 'Niacinamide', desc: 'Brightening active — barrier repair', risk: 'good' },
                        { name: 'Ceramide NP', desc: 'Skin-identical lipid — barrier support', risk: 'good' },
                        { name: 'Salicylic Acid', desc: 'BHA exfoliant — pregnancy caution', risk: 'moderate' },
                        { name: 'Alcohol Denat.', desc: 'Drying solvent — sensitises barrier', risk: 'moderate' },
                        { name: 'Fragrance', desc: 'Contact allergen — EU SCCS concern', risk: 'bad' },
                      ].map((ing, i) => (
                        <div key={i} className="ingredient-row">
                          <div className={`risk-dot risk-dot-${ing.risk}`} />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-dark)', fontFamily: "'Nunito Sans', sans-serif" }}>{ing.name}</p>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: "'Nunito Sans', sans-serif" }}>{ing.desc}</p>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 50, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Nunito Sans', sans-serif" }}
                            className={`risk-badge-${ing.risk}`}>
                            {ing.risk === 'good' ? 'Low risk' : ing.risk === 'moderate' ? 'Moderate' : 'High risk'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Score dial */}
                  <div style={{ textAlign: 'center', minWidth: 140 }}>
                    <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 12px' }}>
                      <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                        <circle cx="60" cy="60" r="52" className="score-ring-track" strokeWidth="8" />
                        <circle cx="60" cy="60" r="52" className="score-ring-fill" strokeWidth="8" stroke="#f0a832"
                          strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 * (1 - 0.68)}
                          style={{ filter: 'drop-shadow(0 0 6px rgba(240,168,50,0.4))' }} />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 30, fontWeight: 900, color: 'var(--text-dark)', lineHeight: 1, fontFamily: "'Nunito', sans-serif" }}>68</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Nunito Sans', sans-serif" }}>/ 100</span>
                      </div>
                    </div>
                    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 50, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Nunito Sans', sans-serif" }} className="risk-badge-moderate">Not Great</span>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5, fontFamily: "'Nunito Sans', sans-serif" }}>2 moderate concerns detected</p>
                    <button onClick={handleTryDemo} className="btn-green" style={{ padding: '9px 18px', fontSize: 12, marginTop: 16, width: '100%' }}>
                      Run real analysis
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            ANALYZE — VERIFY INGREDIENTS
            ═══════════════════════════════════════════════ */}
        {activeTab === 'analyze' && !results && (
          <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 0 60px' }} className="animate-fade-up">
            <div style={{ marginBottom: 28 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Nunito Sans', sans-serif" }}>Step 3</span>
              <h2 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 26, color: 'var(--text-dark)', margin: '8px 0 6px' }}>Verify Ingredients</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: "'Nunito Sans', sans-serif", lineHeight: 1.6 }}>Review extracted ingredients. Correct any OCR errors or add missing items before running the safety audit.</p>
            </div>

            {error && (
              <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: '#fdeaea', border: '1px solid rgba(232,75,60,0.25)', borderRadius: 10, marginBottom: 16 }}>
                <AlertTriangle size={15} style={{ color: '#e84b3c', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 13, color: '#9a1e18', fontFamily: "'Nunito Sans', sans-serif" }}>{error}</span>
              </div>
            )}

            <div className="card" style={{ padding: '24px', marginBottom: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {extractedIngredients.map((ing, idx) => (
                  <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1.5px solid var(--border-dark)', borderRadius: 50, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-body)', fontFamily: "'Nunito Sans', sans-serif", cursor: 'default' }}>
                    {editIndex === idx ? (
                      <input value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => { const u = [...extractedIngredients]; u[idx] = editValue.trim(); setExtractedIngredients(u); setEditIndex(null); }} onKeyDown={e => { if (e.key === 'Enter') { const u = [...extractedIngredients]; u[idx] = editValue.trim(); setExtractedIngredients(u); setEditIndex(null); } }} autoFocus style={{ border: 'none', outline: 'none', width: 90, fontFamily: "'Nunito Sans', sans-serif", fontSize: 12, background: 'transparent', color: 'var(--text-dark)' }} />
                    ) : (
                      <span style={{ cursor: 'pointer' }} onClick={() => { setEditIndex(idx); setEditValue(ing); }}>{ing}</span>
                    )}
                    <button onClick={() => setExtractedIngredients(extractedIngredients.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0, lineHeight: 1 }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input value={addIngredientInput} onChange={e => setAddIngredientInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && addIngredientInput.trim()) { setExtractedIngredients([...extractedIngredients, addIngredientInput.trim()]); setAddIngredientInput(''); } }} placeholder="Add missing ingredient..." className="input-field" style={{ fontSize: 13 }} />
                <button onClick={() => { if (addIngredientInput.trim()) { setExtractedIngredients([...extractedIngredients, addIngredientInput.trim()]); setAddIngredientInput(''); } }} className="btn-outline" style={{ padding: '0 18px', flexShrink: 0, fontSize: 13, fontWeight: 700 }}>
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>

            <button onClick={handleRunAnalysis} disabled={isAnalyzing || extractedIngredients.length === 0} className="btn-green" style={{ padding: '14px 24px', fontSize: 15, width: '100%' }}>
              {isAnalyzing ? <><Loader2 size={16} className="animate-spin" /> Running safety audit...</> : <><ShieldCheck size={16} /> Run Safety Audit ({extractedIngredients.length} ingredients)</>}
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            RESULTS
            ═══════════════════════════════════════════════ */}
        {activeTab === 'analyze' && results && (
          <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 0 60px' }} className="animate-fade-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Nunito Sans', sans-serif" }}>Safety Report</span>
                <h2 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 26, color: 'var(--text-dark)', margin: '6px 0 0' }}>Ingredient Safety Audit</h2>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => toggleSave(results.summary?.split(' ')[0] || 'Product')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: '1.5px solid var(--border-dark)', borderRadius: 50, background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: savedProducts.some(p => p.name === results.summary?.split(' ')[0]) ? '#e84b3c' : 'var(--text-muted)', fontFamily: "'Nunito Sans', sans-serif" }}>
                  <Heart size={13} fill={savedProducts.some(p => p.name === results.summary?.split(' ')[0]) ? '#e84b3c' : 'none'} /> Save
                </button>
                <button onClick={() => { setResults(null); setActiveTab('home'); }} style={{ padding: '9px 16px', border: '1.5px solid var(--border-dark)', borderRadius: 50, background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-body)', fontFamily: "'Nunito Sans', sans-serif" }}>
                  New Scan
                </button>
              </div>
            </div>
            <ResultsDashboard results={results} onReanalyze={text => { setPastedIngredients(text); const p = text.split(',').map(s => s.trim()).filter(Boolean); setExtractedIngredients(p); setResults(null); setActiveTab('analyze'); }} />
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            ROUTINE LAYERING
            ═══════════════════════════════════════════════ */}
        {activeTab === 'routine' && (
          <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 0 60px' }} className="animate-fade-up">
            <h2 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 26, color: 'var(--text-dark)', marginBottom: 6 }}>Routine Layering Checker</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, fontFamily: "'Nunito Sans', sans-serif" }}>Detect dangerous active ingredient conflicts across your full skincare routine.</p>
            <div className="card" style={{ padding: 24 }}>
              <RoutineAnalyzer scans={scans} />
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            PRODUCT COMPARE
            ═══════════════════════════════════════════════ */}
        {activeTab === 'compare' && (
          <div style={{ maxWidth: 960, margin: '40px auto', padding: '0 0 60px' }} className="animate-fade-up">
            <h2 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 26, color: 'var(--text-dark)', marginBottom: 6 }}>Product Compare</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, fontFamily: "'Nunito Sans', sans-serif" }}>Compare safety scores and ingredient profiles of two products side by side.</p>
            <ComparePanel currentAnalysis={results} scans={scans} />
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            ENCYCLOPEDIA
            ═══════════════════════════════════════════════ */}
        {activeTab === 'learn' && (
          <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 0 60px' }} className="animate-fade-up">
            <h2 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 26, color: 'var(--text-dark)', marginBottom: 6 }}>Ingredient Encyclopedia</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 32, fontFamily: "'Nunito Sans', sans-serif" }}>Search INCI definitions, clinical data, and skincare terminology.</p>

            {/* INCI search */}
            <div className="card" style={{ padding: 28, marginBottom: 24 }}>
              <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--text-dark)', marginBottom: 16 }}>INCI Registry Lookup</h3>
              <form onSubmit={handleSearchEncyclopedia} style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
                <input value={encyclopediaSearch} onChange={e => setEncyclopediaSearch(e.target.value)} placeholder="Enter ingredient name (e.g. Niacinamide, Retinol...)" className="input-field" style={{ fontSize: 13 }} />
                <button type="submit" disabled={encyclopediaLoading} className="btn-green" style={{ padding: '0 20px', flexShrink: 0, fontSize: 13, height: 46 }}>
                  {encyclopediaLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                </button>
              </form>
              {encyclopediaResult && (
                <div style={{ marginTop: 20, padding: '20px', background: 'var(--bg-section)', borderRadius: 12, border: '1px solid var(--border)' }} className="animate-fade-up">
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Nunito Sans', sans-serif" }}>Registry Profile</span>
                  <h4 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--text-dark)', margin: '6px 0 16px' }}>{encyclopediaResult.name}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {[
                      { label: 'What it is', val: encyclopediaResult.description },
                      { label: 'Primary function', val: encyclopediaResult.benefits },
                      { label: 'Risks and side effects', val: encyclopediaResult.sideEffects },
                      { label: 'Suitable skin types', val: encyclopediaResult.types },
                    ].map((f, i) => (
                      <div key={i}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontFamily: "'Nunito Sans', sans-serif" }}>{f.label}</p>
                        <p style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.65, fontFamily: "'Nunito Sans', sans-serif" }}>{f.val}</p>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 16, fontFamily: "'Nunito Sans', sans-serif" }}>Source: {encyclopediaResult.sources}</p>
                </div>
              )}
            </div>

            {/* Glossary */}
            <div className="card" style={{ padding: 28 }}>
              <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--text-dark)', marginBottom: 16 }}>Skincare Glossary</h3>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <input value={glossarySearch} onChange={e => setGlossarySearch(e.target.value)} placeholder="Search terms..." className="input-field" style={{ paddingRight: 44 }} />
                <Search size={14} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, maxHeight: 380, overflowY: 'auto' }} className="custom-scroll">
                {filteredGlossary.map((item, i) => (
                  <div key={i} style={{ padding: '14px 16px', background: 'var(--bg-section)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-dark)', marginBottom: 5, fontFamily: "'Nunito', sans-serif" }}>{item.term}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65, fontFamily: "'Nunito Sans', sans-serif" }}>{item.definition}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            MY VANITY
            ═══════════════════════════════════════════════ */}
        {activeTab === 'vanity' && (
          <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 0 60px' }} className="animate-fade-up">
            <h2 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 26, color: 'var(--text-dark)', marginBottom: 6 }}>My Skincare Vanity</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 32, fontFamily: "'Nunito Sans', sans-serif" }}>Your saved products and safety audit history.</p>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
              {[
                { label: 'Scans performed', value: scans.length, desc: 'Total safety checks' },
                { label: 'Saved products', value: savedProducts.length, desc: 'In your cabinet' },
                { label: 'Flagged scans', value: scans.filter(s => s.safety_score !== null && s.safety_score < 80).length, desc: 'Moderate or worse', alert: true },
              ].map((stat, i) => (
                <div key={i} className="card" style={{ padding: '20px 24px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Nunito Sans', sans-serif" }}>{stat.label}</p>
                  <p style={{ fontSize: 32, fontWeight: 900, color: stat.alert && stat.value > 0 ? 'var(--risk-bad)' : 'var(--text-dark)', lineHeight: 1.1, margin: '4px 0 2px', fontFamily: "'Nunito', sans-serif" }}>{stat.value}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: "'Nunito Sans', sans-serif" }}>{stat.desc}</p>
                </div>
              ))}
            </div>

            {/* Skin profile */}
            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
              <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--text-dark)', marginBottom: 16 }}>My Skin Profile</h3>
              <ProfilePanel profile={profile} onToggle={handleProfileToggle} />
            </div>

            {/* Avoid list */}
            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
              <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--text-dark)', marginBottom: 8 }}>Personal Avoid List</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontFamily: "'Nunito Sans', sans-serif" }}>Ingredients flagged in your personal analyses.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {allergies.map((a, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 50, fontSize: 12, fontWeight: 700, fontFamily: "'Nunito Sans', sans-serif" }} className="risk-badge-bad">
                    {a}
                    <button onClick={() => { const next = allergies.filter((_, idx) => idx !== i); setAllergies(next); saveProfileToBackend(profile, next); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}><X size={10} /></button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newAllergyInput} onChange={e => setNewAllergyInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newAllergyInput.trim()) { const next = [...allergies, newAllergyInput.trim()]; setAllergies(next); saveProfileToBackend(profile, next); setNewAllergyInput(''); } }} placeholder="Add ingredient to avoid..." className="input-field" style={{ fontSize: 13 }} />
                <button onClick={() => { if (newAllergyInput.trim()) { const next = [...allergies, newAllergyInput.trim()]; setAllergies(next); saveProfileToBackend(profile, next); setNewAllergyInput(''); } }} className="btn-outline" style={{ padding: '0 18px', flexShrink: 0, fontSize: 13 }}>Add</button>
              </div>
            </div>

            {/* Saved products */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--text-dark)', marginBottom: 14 }}>Saved Products</h3>
              {savedProducts.length === 0 ? (
                <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: "'Nunito Sans', sans-serif" }}>No saved products yet. Run an analysis and save results here.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                  {savedProducts.map(p => (
                    <div key={p.id} className="card card-hover" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <span style={{ fontSize: 10, color: 'var(--text-light)', fontFamily: "'Nunito Sans', sans-serif" }}>Saved {p.date}</span>
                        <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-dark)', marginTop: 2, fontFamily: "'Nunito', sans-serif" }}>{p.name}</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: p.score >= 80 ? 'var(--risk-good)' : p.score >= 50 ? 'var(--risk-moderate)' : 'var(--risk-bad)', fontFamily: "'Nunito', sans-serif" }}>Score: {p.score}/100</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setResults(p.result); setActiveTab('analyze'); }} className="btn-green" style={{ flex: 1, padding: '8px', fontSize: 12 }}>Open</button>
                        <button onClick={() => { const n = savedProducts.filter(x => x.id !== p.id); setSavedProducts(n); if (user) localStorage.setItem(`sg_saved_${user.email}`, JSON.stringify(n)); }} style={{ padding: '8px 12px', border: '1.5px solid var(--border-dark)', borderRadius: 50, background: 'white', cursor: 'pointer', color: 'var(--risk-bad)', display: 'flex' }}>
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scan history */}
            <div>
              <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--text-dark)', marginBottom: 14 }}>Analysis History</h3>
              {scans.length === 0 ? (
                <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: "'Nunito Sans', sans-serif" }}>No analyses performed yet.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {scans.map((scan, idx) => (
                    <div key={idx} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                      <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: scan.safety_score >= 80 ? 'var(--risk-good-bg)' : scan.safety_score >= 50 ? 'var(--risk-moderate-bg)' : 'var(--risk-bad-bg)' }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: scan.safety_score >= 80 ? 'var(--risk-good)' : scan.safety_score >= 50 ? 'var(--risk-moderate)' : 'var(--risk-bad)', fontFamily: "'Nunito', sans-serif", lineHeight: 1 }}>{scan.safety_score ?? '—'}</span>
                        <span style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: "'Nunito Sans', sans-serif" }}>/100</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: "'Nunito', sans-serif" }}>{scan.summary || 'Ingredient Scan'}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'Nunito Sans', sans-serif" }}>{new Date(scan.created_at || Date.now()).toLocaleDateString()}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        {scan.result && <button onClick={() => { setResults(scan.result); setActiveTab('analyze'); }} className="btn-green" style={{ padding: '7px 14px', fontSize: 11 }}>Open</button>}
                        <button onClick={() => setScans(prev => prev.filter(s => s.id !== scan.id))} style={{ padding: '7px 10px', border: '1.5px solid var(--border-dark)', borderRadius: 50, background: 'white', cursor: 'pointer', color: 'var(--risk-bad)', display: 'flex' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#1a2e1e', color: 'rgba(255,255,255,0.6)', padding: '40px 20px 32px', marginTop: 40 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 32, alignItems: 'start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <ShieldCheck size={18} color="white" />
                <span style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 16, color: 'white' }}>SkinGuard</span>
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.65, maxWidth: 240, fontFamily: "'Nunito Sans', sans-serif" }}>Evidence-based cosmetic ingredient safety checker using EU CosIng database.</p>
            </div>
            <div />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'right' }}>
              <p style={{ fontSize: 11, fontFamily: "'Nunito Sans', sans-serif" }}>EU CosIng Inventory</p>
              <p style={{ fontSize: 11, fontFamily: "'Nunito Sans', sans-serif" }}>Dermatology Consensus Data</p>
              <p style={{ fontSize: 11, fontFamily: "'Nunito Sans', sans-serif" }}>SCCS Scientific Opinions</p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 28, paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <p style={{ fontSize: 11, fontFamily: "'Nunito Sans', sans-serif" }}>
              <strong style={{ color: 'rgba(255,255,255,0.8)' }}>Educational use only.</strong> SkinGuard does not constitute medical advice. Consult a dermatologist for personal concerns.
            </p>
            <div style={{ display: 'flex', gap: 16 }}>
              <a href="#" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: "'Nunito Sans', sans-serif" }}>Privacy</a>
              <a href="#" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: "'Nunito Sans', sans-serif" }}>Methodology</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ─── Auth Modal ────────────────────────────────────────────────────── */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowLoginModal(false); setAuthError(null); } }}>
          <div className="modal-box">
            <div style={{ background: 'var(--teal-header)', padding: '28px 28px 24px', textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <ShieldCheck size={22} color="white" />
              </div>
              <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 20, color: 'white', marginBottom: 4 }}>
                {authMode === 'login' ? 'Sign in to SkinGuard' : authMode === 'signup' ? 'Create account' : 'Reset password'}
              </h3>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: "'Nunito Sans', sans-serif" }}>
                {authMode === 'login' ? 'Access your scan history and profile.' : authMode === 'signup' ? 'Personalize your skin profile and track products.' : 'Enter your email to receive a reset link.'}
              </p>
              <button onClick={() => { setShowLoginModal(false); setAuthError(null); }} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} style={{ padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {authError && <div style={{ padding: '10px 14px', background: '#fdeaea', border: '1px solid rgba(232,75,60,0.25)', borderRadius: 8, fontSize: 12, color: '#9a1e18', fontFamily: "'Nunito Sans', sans-serif" }}>{authError}</div>}

              {authMode === 'signup' && <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Full name" className="input-field" />}
              <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="Email address" className="input-field" />
              {authMode !== 'forgot' && <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Password" className="input-field" />}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: "'Nunito Sans', sans-serif" }}>
                {authMode === 'login' && <button type="button" onClick={() => setAuthMode('forgot')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green-primary)', fontWeight: 600 }}>Forgot password?</button>}
                <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green-primary)', fontWeight: 600, marginLeft: 'auto' }}>
                  {authMode === 'login' ? 'Create account' : 'Sign in instead'}
                </button>
              </div>

              <button type="submit" className="btn-green" style={{ padding: '13px 24px', fontSize: 14, width: '100%' }}>
                {authMode === 'login' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Send Reset Link'}
              </button>

              {authMode === 'login' && (
                <button type="button" onClick={() => handleLoginMock('demo@skinguard.app', 'Demo User')} style={{ padding: '12px 24px', border: '1.5px solid var(--border-dark)', borderRadius: 50, background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-body)', fontFamily: "'Nunito Sans', sans-serif" }}>
                  Continue as Demo User
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

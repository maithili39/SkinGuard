'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, Loader2, AlertTriangle, Heart, Trash2, Search,
  Plus, X, Barcode, Layers, LogOut, Upload, Camera,
  FileText, Menu, FlaskConical, Zap, Sparkles,
  Droplets, Baby, Bug, CheckCircle, Activity,
  Twitter, Instagram, Github, ArrowRight
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

/* ─── Hero illustration ─────────────────────────────────────────────────────── */
function HeroIllustration() {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Soft blob behind image */}
      <div style={{ position: 'absolute', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, #e8f5e9 0%, #f0ede6 60%, transparent 100%)', zIndex: 0 }} />
      <img
        src="/hero-bottle.png"
        alt="Natural skincare products"
        className="animate-float"
        style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 440, objectFit: 'contain', filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.10))' }}
      />
    </div>
  );
}

/* ─── Stats counter ──────────────────────────────────────────────────────────── */
function StatCounter({ target, suffix = '', running }: { target: number; suffix?: string; running: boolean }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) * (1 - t);
      setCount(Math.round(eased * target));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [running, target]);
  return <>{count}{suffix}</>;
}

/* ─── Star row ───────────────────────────────────────────────────────────────── */
function Stars({ n = 5 }: { n?: number }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: n }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 14 14" fill="#f9a825">
          <path d="M7 1l1.54 3.12 3.46.5-2.5 2.44.59 3.44L7 8.77 3.91 10.5l.59-3.44L2 4.62l3.46-.5z"/>
        </svg>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Stats counter trigger
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsRunning, setStatsRunning] = useState(false);

  // Section reveal refs
  const revealRefs = useRef<HTMLElement[]>([]);

  /* ── Lifecycle ─────────────────────────────────────────────────────────────── */
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

  useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);

  // Stats counter IntersectionObserver
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setStatsRunning(true); obs.disconnect(); } }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Section reveal IntersectionObserver
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.section-reveal');
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); } });
    }, { threshold: 0.12 });
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  });

  /* ── Handlers ──────────────────────────────────────────────────────────────── */
  const handleProfileToggle = (key: keyof SkinProfile | 'clear_concerns') => {
    const baseTypes: (keyof SkinProfile)[] = ['normal_skin', 'dry_skin', 'oily_skin', 'combination_skin'];
    const concernTypes: (keyof SkinProfile)[] = ['acne_prone', 'sensitive_skin', 'pregnant', 'fungal_acne', 'rosacea'];
    setProfile(prev => {
      let next = { ...prev };
      if (key === 'clear_concerns') {
        concernTypes.forEach(c => {
          next[c] = false;
        });
      } else {
        next[key] = !prev[key];
        if (baseTypes.includes(key) && next[key]) {
          baseTypes.forEach(t => {
            if (t !== key) {
              next[t] = false;
            }
          });
        }
        if (key === 'rosacea' && next[key]) {
          next.sensitive_skin = true;
        }
      }
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

  const handleHeroAnalyze = async () => {
    if (!pastedIngredients.trim()) return;
    const sanitized = pastedIngredients.replace(/<[^>]*>/g, '');
    const parsed = sanitized.split(',').map(s => s.trim().replace(/[.*]/g, '')).filter(Boolean);
    if (parsed.length <= 1) {
      setError('Please paste the full ingredient list separated by commas.');
      scrollTo('analyzer');
      return;
    }
    setError(null);
    setIsAnalyzing(true);
    setActiveTab('analyze');
    setExtractedIngredients(parsed);
    const textToAnalyze = parsed.join(', ');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToAnalyze, profile: { ...profile, avoid_list: allergies }, user_email: user?.email || null })
      });
      if (!res.ok) throw new Error('Analysis failed');
      const data: AnalysisResult = await res.json();
      setResults(data);
      const mock = { id: Date.now(), created_at: new Date().toISOString(), safety_score: data.safety_score, coverage_percent: data.coverage_percent, summary: data.summary, result: data, input_text: textToAnalyze };
      if (!user) setScans(prev => [mock, ...prev]);
      else fetch('/api/auth/scans').then(r => r.ok ? r.json() : null).then(d => { if (d?.scans) setScans(d.scans); });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleHeroDemo = async () => {
    const parsed = DEMO_INGREDIENTS.split(',').map(s => s.trim()).filter(Boolean);
    setExtractedIngredients(parsed);
    setError(null);
    setIsAnalyzing(true);
    setActiveTab('analyze');
    const textToAnalyze = parsed.join(', ');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToAnalyze, profile: { ...profile, avoid_list: allergies }, user_email: user?.email || null })
      });
      if (!res.ok) throw new Error('Analysis failed');
      const data: AnalysisResult = await res.json();
      setResults(data);
      const mock = { id: Date.now(), created_at: new Date().toISOString(), safety_score: data.safety_score, coverage_percent: data.coverage_percent, summary: data.summary, result: data, input_text: textToAnalyze };
      if (!user) setScans(prev => [mock, ...prev]);
      else fetch('/api/auth/scans').then(r => r.ok ? r.json() : null).then(d => { if (d?.scans) setScans(d.scans); });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleHeroBarcodeClick = () => {
    setInputMode('barcode');
    scrollTo('analyzer');
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
    { id: 'home', label: 'Home' },
    { id: 'routine', label: 'Routine' },
    { id: 'compare', label: 'Compare' },
    { id: 'learn', label: 'Encyclopedia' },
    ...(user ? [{ id: 'vanity', label: 'My Vanity' }] : []),
  ];

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <main style={{ background: '#faf9f6', minHeight: '100vh', fontFamily: "'Inter', sans-serif", overflowX: 'hidden' }}>

      {showCameraScanner && (
        <BarcodeScanner
          onDetected={code => { setShowCameraScanner(false); setBarcodeInput(code); handleBarcodeLookup(code); }}
          onClose={() => setShowCameraScanner(false)}
        />
      )}

      {/* ─── Navbar ──────────────────────────────────────────────────────────── */}
      <header style={{ background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', borderBottom: '1px solid rgba(0,0,0,0.06)', position: 'sticky', top: 0, zIndex: 50, height: 76 }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 28px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>

          {/* Logo */}
          <button onClick={() => { setResults(null); setExtractedIngredients([]); setActiveTab('home'); }} style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
            <img src="/logo.png" alt="SkinGuard logo" style={{ height: 32, width: 'auto' }} />
            <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 23, color: '#1c1917', letterSpacing: '-0.015em' }}>
              Skin<span style={{ color: '#3d6b45' }}>Guard</span>
            </span>
          </button>

          {/* Desktop nav */}
          <div className="nav-desktop" style={{ alignItems: 'center', gap: 36 }}>
            {navItems.map(item => {
              const isActive = activeTab === item.id || (item.id === 'home' && activeTab === 'analyze');
              return (
                <button
                  key={item.id}
                  onClick={() => { if (item.id === 'home') { setResults(null); setExtractedIngredients([]); } setActiveTab(item.id as any); }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#1b4332'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#1a1a1a'; }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    fontSize: 14, fontFamily: "'Inter', sans-serif", fontWeight: 600, transition: 'color 0.15s',
                    color: isActive ? '#2d4a35' : '#5c5045', letterSpacing: '0.02em', textTransform: 'uppercase'
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <a href="https://github.com/maithili39/SkinGuard" target="_blank" rel="noopener noreferrer"
              className="nav-desktop"
              style={{ alignItems: 'center', padding: 9, borderRadius: 10, color: '#5c5045', background: 'none', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(160,120,80,0.1)'; e.currentTarget.style.color = '#2d4a35'; }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = '#2d4a35'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#5c5045'; }}
              title="GitHub">
              <Github size={18} />
            </a>
            {user ? (
              <>
                <button onClick={() => setActiveTab('vanity')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #e8e4dc', borderRadius: 50, padding: '5px 14px 5px 5px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(145deg, #3d6b45, #2d4a35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                    {(user.full_name || user.email)[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name || 'User'}</span>
                </button>
                <button onClick={handleLogout} title="Sign out" style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#9e9189', borderRadius: 8, display: 'flex' }}>
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setAuthMode('login'); setShowLoginModal(true); }} className="nav-desktop"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#5c5045', padding: '8px 14px', borderRadius: 10, transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#2d4a35')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#5c5045')}>
                  Sign In
                </button>
                <button onClick={() => { setAuthMode('signup'); setShowLoginModal(true); }}
                  style={{ background: 'linear-gradient(145deg, #3d6b45, #2d4a35)', color: 'white', border: 'none', borderRadius: 50, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, padding: '9px 22px', boxShadow: '0 4px 14px rgba(45,74,53,0.28)', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(45,74,53,0.36)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(45,74,53,0.28)'; }}>
                  Get Started
                </button>
              </>
            )}
            <button onClick={() => setMobileMenuOpen(v => !v)} className="nav-mobile" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5c5045', padding: 6 }}>
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile slide-down menu */}
        {mobileMenuOpen && (
          <div style={{ background: '#fdf6ee', borderTop: '1px solid rgba(160,120,80,0.12)', padding: '12px 24px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => { if (item.id === 'home') { setResults(null); setExtractedIngredients([]); } setActiveTab(item.id as any); setMobileMenuOpen(false); }}
                style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 10, border: 'none', background: activeTab === item.id ? '#2d4a35' : 'transparent', color: activeTab === item.id ? 'white' : '#5c5045', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {item.label}
              </button>
            ))}
            {!user && (
              <button onClick={() => { setAuthMode('login'); setShowLoginModal(true); setMobileMenuOpen(false); }} style={{ marginTop: 8, padding: '10px 14px', background: 'none', border: '1.5px solid rgba(92,80,69,0.3)', borderRadius: 50, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#5c5045' }}>Sign In</button>
            )}
          </div>
        )}
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          HOME TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'home' && (
        <div>

          {/* ── HERO ────────────────────────────────────────────────────────── */}
          <section style={{ background: 'linear-gradient(135deg, #ede8df 0%, #e2dbd0 100%)', width: '100%', overflow: 'hidden', position: 'relative', minHeight: 620 }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 48px 0', display: 'grid', gridTemplateColumns: '50fr 50fr', gap: 48, alignItems: 'center', minHeight: 620 }}>

              {/* ── Left ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingBottom: 96 }}>

                <span style={{ fontSize: 11, fontWeight: 700, color: '#a07850', letterSpacing: '2.5px', textTransform: 'uppercase' }}>
                  Ingredient Safety · EU CosIng Database
                </span>

                <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(40px, 4.8vw, 64px)', fontWeight: 700, color: '#1c1917', lineHeight: 1.08, letterSpacing: '-0.02em', margin: 0 }}>
                  Read what's actually<br />
                  <em style={{ fontStyle: 'italic', color: '#3d6b45' }}>in your skincare.</em>
                </h1>

                <p style={{ fontSize: 17, color: '#5c5045', lineHeight: 1.75, maxWidth: 460, margin: 0 }}>
                  Most ingredient lists are written to be ignored. SkinGuard translates every ingredient — flags irritants, allergens, pore-cloggers, and pregnancy risks — matched to your skin type.
                </p>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                  <button onClick={() => setActiveTab('analyze')} className="btn-green" style={{ padding: '15px 36px', fontSize: 16, fontWeight: 700, borderRadius: 10, boxShadow: '0 6px 20px rgba(61,107,69,0.28)' }}>
                    Check an ingredient list
                  </button>
                  <button onClick={() => scrollTo('how-it-works')} style={{ padding: '15px 24px', fontSize: 15, fontWeight: 500, background: 'rgba(255,255,255,0.5)', border: '1.5px solid rgba(92,80,69,0.2)', color: '#5c5045', borderRadius: 10, cursor: 'pointer' }}>
                    How it works
                  </button>
                </div>
              </div>

              {/* ── Right — Bottle image ── */}
              <div style={{ position: 'relative', height: 520, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                {/* Soft background glow */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'radial-gradient(circle at 80% 50%, rgba(165,214,167,0.28) 0%, transparent 65%)',
                  zIndex: 0, pointerEvents: 'none',
                }} />

                {/* Yuka Report Image — bigger and right aligned */}
                <div style={{
                  position: 'absolute', zIndex: 1,
                  right: '-12vw',
                  width: '135%',
                  maxWidth: 800,
                  filter: 'drop-shadow(0 24px 50px rgba(0,0,0,0.18))',
                  transform: 'translateY(15px)',
                }}>
                  <img
                    src="/yuka-mockup.png"
                    alt="Ingredient analysis report"
                    style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 18 }}
                  />
                </div>
              </div>
            </div>

            <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, overflow: 'hidden', lineHeight: 0, zIndex: 10 }}>
              <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ display: 'block', width: 'calc(100% + 1.3px)', height: 44 }}>
                <path d="M0,30 C300,60 600,0 900,40 C1050,55 1150,20 1200,30 L1200,60 L0,60 Z" fill="#faf9f6" />
              </svg>
            </div>
          </section>

          {/* ── ANALYZER SECTION ────────────────────────────────────────────── */}
          <section id="analyzer" style={{ background: '#faf9f6', padding: '80px 24px 72px', position: 'relative' }}>
            <div style={{ maxWidth: 780, margin: '0 auto' }}>
              <div className="section-reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#2d4a35', letterSpacing: '2.5px', textTransform: 'uppercase', display: 'block', marginBottom: 16 }}>Free Analysis</span>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 'clamp(30px,3.5vw,46px)', color: '#1a1a1a', marginBottom: 16, letterSpacing: '-0.01em' }}>Analyze your skincare</h2>
                <p style={{ fontSize: 17, color: '#6b6b6b', maxWidth: 460, margin: '0 auto', lineHeight: 1.7 }}>Set your skin profile, then paste or upload your ingredient list for an instant safety report.</p>
              </div>

              {/* Profile chips */}
              <div className="section-reveal" style={{ background: 'white', borderRadius: 16, border: '1px solid #ede8df', padding: '20px 24px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <ProfilePanel profile={profile} onToggle={handleProfileToggle} />
              </div>

              {/* Analyzer card */}
              <div className="section-reveal" style={{ background: 'white', borderRadius: 20, border: '1px solid #e8e4dc', boxShadow: '0 8px 32px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                {/* Tab row */}
                <div style={{ display: 'flex', gap: 4, padding: '16px 20px 0', background: 'white', borderBottom: '1px solid #f0ede8' }}>
                  {[
                    { id: 'paste', label: 'Paste List', icon: <FileText size={13}/> },
                    { id: 'upload', label: 'Photo / OCR', icon: <Upload size={13}/> },
                    { id: 'barcode', label: 'Barcode', icon: <Barcode size={13}/> },
                  ].map(m => (
                    <button key={m.id} onClick={() => { setInputMode(m.id as any); setError(null); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: '10px 10px 0 0', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: "'Nunito', sans-serif", fontWeight: 700, transition: 'all 0.15s',
                        background: inputMode === m.id ? '#2d4a35' : 'transparent',
                        color: inputMode === m.id ? 'white' : '#9e9e9e',
                        marginBottom: inputMode === m.id ? -1 : 0,
                        borderBottom: inputMode === m.id ? '1px solid white' : 'none',
                      }}>
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>

                <div style={{ padding: '24px 28px 28px' }}>
                  {/* Error */}
                  {error && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: '#fdeaea', border: '1px solid rgba(229,57,53,0.25)', borderRadius: 10, marginBottom: 16 }}>
                      <AlertTriangle size={15} style={{ color: '#e53935', flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 13, color: '#c62828', fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>{error}</span>
                    </div>
                  )}

                  {/* Paste mode */}
                  {inputMode === 'paste' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <textarea value={pastedIngredients} onChange={e => setPastedIngredients(e.target.value)} rows={6}
                        placeholder="Aqua, Glycerin, Niacinamide, Salicylic Acid, Fragrance, Ceramide NP..."
                        className="input-field" style={{ fontSize: 15 }} />
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                        <button onClick={handleManualInputSubmit} className="btn-green" style={{ padding: '14px 40px', fontSize: 16, borderRadius: 28 }}>
                          Analyze Ingredients
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Upload mode */}
                  {inputMode === 'upload' && (
                    <div>
                      {!previewUrl ? (
                        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, border: '2px dashed #e8e4dc', borderRadius: 16, padding: '48px 24px', cursor: 'pointer', background: '#faf9f6', textAlign: 'center' }}>
                          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Upload size={22} style={{ color: '#2d4a35' }} />
                          </div>
                          <div>
                            <p style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>Drop photo here or click to browse</p>
                            <p style={{ fontSize: 12, color: '#6b6b6b', marginTop: 4 }}>AI-powered OCR reads the ingredient block — JPG, PNG, WEBP up to 8MB</p>
                          </div>
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(URL.createObjectURL(f)); setError(null); } }} />
                        </label>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid #e8e4dc' }}>
                            <img src={previewUrl} alt="Label preview" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', background: '#f8f8f8', display: 'block' }} />
                            <button onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setFile(null); setError(null); }} style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <X size={13}/>
                            </button>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                            <button onClick={handleExtractText} disabled={isExtracting} className="btn-green" style={{ padding: '14px 40px', fontSize: 16, borderRadius: 28 }}>
                              {isExtracting ? <><Loader2 size={15} className="animate-spin"/> Extracting text via OCR...</> : <><FileText size={15}/> Extract Ingredient Text</>}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Barcode mode */}
                  {inputMode === 'barcode' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleBarcodeLookup(barcodeInput); }}
                          placeholder="Enter product barcode (e.g. 0748948000214)..." className="input-field" style={{ fontFamily: 'monospace', flex: 1 }} />
                        <button onClick={() => handleBarcodeLookup(barcodeInput)} disabled={isBarcodeLookingUp} className="btn-green" style={{ padding: '0 20px', flexShrink: 0, fontSize: 13 }}>
                          {isBarcodeLookingUp ? <Loader2 size={13} className="animate-spin"/> : 'Look up'}
                        </button>
                      </div>
                      {barcodeProduct && (
                        <div style={{ padding: '12px 16px', background: '#e8f5e9', border: '1px solid rgba(76,175,80,0.2)', borderRadius: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#1b4332', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Product found</span>
                          <p style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a', marginTop: 2 }}>{barcodeProduct.name}</p>
                          {barcodeProduct.brand && <p style={{ fontSize: 12, color: '#6b6b6b' }}>{barcodeProduct.brand}</p>}
                        </div>
                      )}
                      <button onClick={() => setShowCameraScanner(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px', border: '1.5px solid #e8e4dc', borderRadius: 12, background: 'white', cursor: 'pointer', transition: 'all 0.15s' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Camera size={16} style={{ color: '#2d4a35' }} />
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>Open Camera Scanner</p>
                          <p style={{ fontSize: 11, color: '#6b6b6b' }}>Real-time ZXing barcode decoder</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, overflow: 'hidden', lineHeight: 0, zIndex: 10 }}>
              <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ display: 'block', width: 'calc(100% + 1.3px)', height: 44 }}>
                <path d="M0,30 C300,60 600,0 900,40 C1050,55 1150,20 1200,30 L1200,60 L0,60 Z" fill="#fdf6ee" />
              </svg>
            </div>
          </section>

          {/* ── SIX CHECKS ──────────────────────────────────────────────────── */}
          <section className="section-reveal" style={{ background: '#fdf6ee', padding: '80px 24px 80px', position: 'relative' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 56 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#a07850', letterSpacing: '2px', textTransform: 'uppercase', display: 'block', marginBottom: 14 }}>Every Scan</span>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 'clamp(28px,3vw,42px)', color: '#1a1a1a', marginBottom: 16, letterSpacing: '-0.01em' }}>
                  Six checks on every ingredient list
                </h2>
                <p style={{ fontSize: 17, color: '#7a6f65', maxWidth: 500, margin: '0 auto', lineHeight: 1.65 }}>
                  Paste your list once — SkinGuard runs all of these automatically for your skin profile.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
                {[
                  { icon: <ShieldCheck size={22} color="#2e7d32" />, bg: '#e8f5e9', title: 'Safety Score', body: 'An overall score calculated from flagged ingredients, weighted by severity and adapted to your skin conditions.' },
                  { icon: <AlertTriangle size={22} color="#c62828" />, bg: '#fdeaea', title: 'Irritants & Allergens', body: 'Detects EU SCCS-listed contact allergens, known sensitisers, and irritants — especially relevant for sensitive skin.' },
                  { icon: <Droplets size={22} color="#e65100" />, bg: '#fff3e0', title: 'Comedogenic Rating', body: 'Identifies pore-clogging ingredients rated 3+ on the 0–5 scale. Auto-flagged when your profile includes acne-prone skin.' },
                  { icon: <Baby size={22} color="#6a1b9a" />, bg: '#f3e5f5', title: 'Pregnancy Safety', body: 'Warns on retinoids, high-dose salicylates, and EU-restricted substances when your pregnancy toggle is on.' },
                  { icon: <Bug size={22} color="#00695c" />, bg: '#e0f2f1', title: 'Fungal Acne Triggers', body: 'Scans for fatty acids, esters, and oils that feed Malassezia yeast — the root cause of fungal acne.' },
                  { icon: <FlaskConical size={22} color="#1565c0" />, bg: '#e3f2fd', title: 'Routine Conflict Checker', body: 'Detect active-ingredient clashes across products — retinol with AHAs, or high-dose vitamin C with niacinamide.' },
                ].map((f, i) => (
                  <div key={i}
                    style={{ background: 'white', border: '1px solid #ede6da', borderRadius: 20, padding: '28px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 2px 16px rgba(0,0,0,0.04)', transition: 'transform 0.18s, box-shadow 0.18s', cursor: 'default' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 32px rgba(0,0,0,0.09)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.04)'; }}
                  >
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {f.icon}
                    </div>
                    <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 18, color: '#1a1a1a', margin: 0 }}>{f.title}</h3>
                    <p style={{ fontSize: 14, color: '#7a6f65', lineHeight: 1.65, margin: 0 }}>{f.body}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Wave out — to stats #f0ede6 */}
            <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, overflow: 'hidden', lineHeight: 0, zIndex: 10 }}>
              <svg viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ display: 'block', width: 'calc(100% + 1.3px)', height: 56 }}>
                <path d="M0,0 C150,60 350,80 600,50 C850,20 1050,70 1200,40 L1200,80 L0,80 Z" fill="#f0ede6"/>
              </svg>
            </div>
          </section>

          {/* ── STATS ───────────────────────────────────────────────────────── */}
          <section ref={statsRef} style={{ background: '#f0ede6', padding: '0 24px', position: 'relative' }}>
            <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 0 56px' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 600, fontSize: 'clamp(32px,4vw,46px)', color: '#1a1a1a', letterSpacing: '-0.02em', marginBottom: 12 }}>Built on real data</h2>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, color: '#5c5045', margin: 0, fontWeight: 400, letterSpacing: '0.01em' }}>Not estimates. Not guesses.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 32, textAlign: 'center', marginBottom: 32 }}>
                {[
                  { target: 4000, suffix: '+', label: 'EU CosIng ingredients indexed' },
                  { target: 275, suffix: '+', label: 'Curated risk flags' },
                  { target: 8, suffix: '', label: 'Routine conflict types detected' },
                ].map((s, i) => (
                  <div key={i}>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 900, fontSize: 56, color: '#1b4332', lineHeight: 1, letterSpacing: '-0.03em' }}>
                      <StatCounter target={s.target} suffix={s.suffix} running={statsRunning}/>
                    </div>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 500, color: '#5c5045', marginTop: 12, lineHeight: 1.5 }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 24px', background: 'rgba(160,120,80,0.06)', borderRadius: 50 }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, color: '#8a6845', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Free forever · No paywall · No ads</span>
                </div>
              </div>
            </div>

            {/* Wave out — to testimonials #eff5f2 */}
            <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, overflow: 'hidden', lineHeight: 0, zIndex: 10 }}>
              <svg viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ display: 'block', width: 'calc(100% + 1.3px)', height: 56 }}>
                <path d="M0,80 L0,50 C200,80 400,20 600,55 C800,90 1000,30 1200,60 L1200,80 Z" fill="#eff5f2"/>
              </svg>
            </div>
          </section>

          {/* ── TESTIMONIALS ────────────────────────────────────────────────── */}
          <section className="section-reveal" style={{ background: '#eff5f2', padding: '64px 24px 80px', position: 'relative', overflow: 'hidden' }}>
            {/* Decorative blobs */}
            <svg style={{ position: 'absolute', top: 0, left: 0, zIndex: 0, pointerEvents: 'none' }} width="200" height="160" viewBox="0 0 200 160">
              <path d="M80,20 C120,5 180,40 170,90 C160,140 100,155 50,135 C0,115 -10,70 20,40 C50,10 40,35 80,20Z" fill="#e8f5e9" opacity="0.5"/>
            </svg>
            <svg style={{ position: 'absolute', top: -20, right: -20, zIndex: 0, pointerEvents: 'none' }} width="180" height="150" viewBox="0 0 180 150">
              <path d="M90,15 C130,5 175,35 165,80 C155,130 90,148 45,128 C0,108 -5,65 20,35 C45,5 50,25 90,15Z" fill="#e8f5e9" opacity="0.5"/>
            </svg>

            <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 40, color: '#1a1a1a', textAlign: 'center', marginBottom: 48 }}>What users are saying</h2>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center w-full">
                {/* Left Column (Illustration) */}
                <div className="col-span-1 md:col-span-5 hidden md:flex justify-center">
                  <img 
                    src="/onskin2.png" 
                    alt="Happy users sharing reviews" 
                    style={{ 
                      width: '100%', 
                      maxWidth: 360, 
                      height: 'auto', 
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 15px 30px rgba(0,0,0,0.08))'
                    }} 
                  />
                </div>

                {/* Right Column (Testimonial Cards) */}
                <div className="col-span-1 md:col-span-7 flex flex-col gap-6 w-full">
                  {[
                    { initial: 'P', bg: '#2d4a35', quote: "I used to spend 20 minutes googling every ingredient. SkinGuard does it instantly and actually explains what the flag means.", name: 'Priya R.' },
                    { initial: 'M', bg: '#ef5350', quote: "Found out my 'gentle' cleanser had 3 pore-cloggers. Switched products and my skin finally cleared up.", name: 'Marcus T.' },
                    { initial: 'L', bg: '#42a5f5', quote: "The fungal acne filter is something I've never seen in any other app. This is the tool dermatology Reddit has been asking for.", name: 'Lena K.' },
                  ].map((t, i) => (
                    <div key={i} style={{ background: 'white', borderRadius: 20, border: '1px solid #e8e4dc', padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                      {/* Quote mark & quote */}
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <svg width="24" height="18" viewBox="0 0 28 22" fill="#2d4a35" style={{ flexShrink: 0, marginTop: 4 }}>
                          <path d="M0 22V12.5C0 5.5 4.5 1.5 13.5 0l1.5 2.5C10 3.5 7.5 6 7 10H12V22H0zm16 0V12.5C16 5.5 20.5 1.5 29.5 0L31 2.5C26 3.5 23.5 6 23 10H28V22H16z"/>
                        </svg>
                        <p style={{ fontFamily: "'Nunito', sans-serif", fontStyle: 'italic', fontSize: 15, color: '#1a1a1a', lineHeight: 1.5, margin: 0 }}>{t.quote}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 36 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 13, color: 'white', flexShrink: 0 }}>{t.initial}</div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <p style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, color: '#1b4332', margin: 0 }}>{t.name}</p>
                          <Stars n={5}/>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, width: '100%', overflow: 'hidden', lineHeight: 0, zIndex: 10 }}>
              <svg viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ position: 'relative', display: 'block', width: 'calc(100% + 1.3px)', height: 48 }}>
                <path d="M0,0 C150,90 350,120 600,100 C850,80 1050,110 1200,90 L1200,120 L0,120 Z" fill="#faf9f6"></path>
              </svg>
            </div>
          </section>

          {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
          <section id="how-it-works" className="section-reveal" style={{ background: '#faf9f6', padding: '80px 24px', position: 'relative' }}>
            <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 40, color: '#1a1a1a', marginBottom: 12 }}>Three steps to cleaner skincare</h2>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, color: '#6b6b6b', marginBottom: 60 }}>No account needed to analyze. Sign up only to save your history.</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 0, position: 'relative' }}>
                {[
                  {
                    num: '1',
                    icon: (
                      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#1b4332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="8" y="4" width="24" height="32" rx="3"/>
                        <line x1="14" y1="13" x2="26" y2="13"/>
                        <line x1="14" y1="19" x2="26" y2="19"/>
                        <line x1="14" y1="25" x2="20" y2="25"/>
                        <circle cx="28" cy="30" r="6" fill="#e8f5e9" stroke="#1b4332"/>
                        <line x1="25" y1="30" x2="31" y2="30"/>
                        <line x1="28" y1="27" x2="28" y2="33"/>
                      </svg>
                    ),
                    title: 'Paste or photograph',
                    body: 'Type, paste, or photograph your product\'s ingredient list.',
                  },
                  {
                    num: '2',
                    icon: (
                      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#1b4332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="6" y="6" width="12" height="12" rx="2"/>
                        <rect x="22" y="6" width="12" height="12" rx="2"/>
                        <rect x="6" y="22" width="12" height="12" rx="2"/>
                        <rect x="22" y="22" width="12" height="12" rx="2"/>
                      </svg>
                    ),
                    title: 'Matched against EU data',
                    body: 'Every ingredient is checked against 24,000+ EU CosIng entries and 275 curated risk flags.',
                  },
                  {
                    num: '3',
                    icon: (
                      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#1b4332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 4L8 9v10c0 9 5.5 17.5 12 20 6.5-2.5 12-11 12-20V9L20 4z"/>
                        <polyline points="14,20 18,24 26,16"/>
                      </svg>
                    ),
                    title: 'Your personalised verdict',
                    body: 'Get a safety score, per-ingredient findings, and plain-language explanations tailored to your skin profile.',
                  },
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 24px' }}>
                    <div style={{ marginBottom: 14 }}>{step.icon}</div>
                    <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 18, color: '#1a1a1a', marginBottom: 10 }}>{step.title}</h3>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, color: '#6b6b6b', lineHeight: 1.6, maxWidth: 200 }}>{step.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>



        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ANALYZE TAB — VERIFY INGREDIENTS
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'analyze' && !results && (
        <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 24px 60px' }} className="animate-fade-up">
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 26, color: '#1a1a1a', margin: '8px 0 6px' }}>Verify Ingredients</h2>
            <p style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.6 }}>Review extracted ingredients. Correct any OCR errors or add missing items before running the safety audit.</p>
          </div>

          {error && (
            <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: '#fdeaea', border: '1px solid rgba(229,57,53,0.25)', borderRadius: 10, marginBottom: 16 }}>
              <AlertTriangle size={15} style={{ color: '#e53935', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: '#c62828' }}>{error}</span>
            </div>
          )}

          <div className="card" style={{ padding: '24px', marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {extractedIngredients.map((ing, idx) => (
                <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1.5px solid #e8e4dc', borderRadius: 50, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#1a1a1a', cursor: 'default' }}>
                  {editIndex === idx ? (
                    <input value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => { const u = [...extractedIngredients]; u[idx] = editValue.trim(); setExtractedIngredients(u); setEditIndex(null); }} onKeyDown={e => { if (e.key === 'Enter') { const u = [...extractedIngredients]; u[idx] = editValue.trim(); setExtractedIngredients(u); setEditIndex(null); } }} autoFocus style={{ border: 'none', outline: 'none', width: 90, fontSize: 12, background: 'transparent', color: '#1a1a1a' }} />
                  ) : (
                    <span style={{ cursor: 'pointer' }} onClick={() => { setEditIndex(idx); setEditValue(ing); }}>{ing}</span>
                  )}
                  <button onClick={() => setExtractedIngredients(extractedIngredients.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b6b', display: 'flex', padding: 0 }}>
                    <X size={11}/>
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={addIngredientInput} onChange={e => setAddIngredientInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && addIngredientInput.trim()) { setExtractedIngredients([...extractedIngredients, addIngredientInput.trim()]); setAddIngredientInput(''); } }} placeholder="Add missing ingredient..." className="input-field" style={{ fontSize: 13 }} />
              <button onClick={() => { if (addIngredientInput.trim()) { setExtractedIngredients([...extractedIngredients, addIngredientInput.trim()]); setAddIngredientInput(''); } }} className="btn-outline" style={{ padding: '0 18px', flexShrink: 0, fontSize: 13, fontWeight: 700 }}>
                <Plus size={13}/> Add
              </button>
            </div>
          </div>

          <button onClick={handleRunAnalysis} disabled={isAnalyzing || extractedIngredients.length === 0} className="btn-green" style={{ padding: '14px 24px', fontSize: 15, width: '100%' }}>
            {isAnalyzing ? <><Loader2 size={16} className="animate-spin"/> Running safety audit...</> : <><ShieldCheck size={16}/> Run Safety Audit ({extractedIngredients.length} ingredients)</>}
          </button>
        </div>
      )}

      {/* ── RESULTS ──────────────────────────────────────────────────────────── */}
      {activeTab === 'analyze' && results && (
        <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 24px 60px' }} className="animate-fade-up">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1b4332', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Safety Report</span>
              <h2 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 26, color: '#1a1a1a', margin: '6px 0 0' }}>Ingredient Safety Audit</h2>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => toggleSave(results.summary?.split(' ')[0] || 'Product')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: '1.5px solid #e8e4dc', borderRadius: 50, background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: savedProducts.some(p => p.name === results.summary?.split(' ')[0]) ? '#e53935' : '#6b6b6b' }}>
                <Heart size={13} fill={savedProducts.some(p => p.name === results.summary?.split(' ')[0]) ? '#e53935' : 'none'}/> Save
              </button>
              <button onClick={() => { setResults(null); setActiveTab('home'); }} style={{ padding: '9px 16px', border: '1.5px solid #e8e4dc', borderRadius: 50, background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>
                New Scan
              </button>
            </div>
          </div>
          <ResultsDashboard results={results} onReanalyze={text => { setPastedIngredients(text); const p = text.split(',').map(s => s.trim()).filter(Boolean); setExtractedIngredients(p); setResults(null); setActiveTab('analyze'); }} />
        </div>
      )}

      {/* ── ROUTINE ──────────────────────────────────────────────────────────── */}
      {activeTab === 'routine' && (
        <div style={{ maxWidth: 960, margin: '60px auto', padding: '0 24px 60px' }} className="animate-fade-up text-center">
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 36, color: '#1a1a1a', marginBottom: 12 }}>Routine Analyzer</h2>
          <p style={{ fontSize: 16, color: '#6b6b6b', marginBottom: 32, fontFamily: "'Inter', sans-serif" }}>Detect dangerous active ingredient conflicts across your full skincare routine.</p>
          <div className="text-left">
            <RoutineAnalyzer scans={scans}/>
          </div>
        </div>
      )}

      {/* ── COMPARE ──────────────────────────────────────────────────────────── */}
      {activeTab === 'compare' && (
        <div style={{ maxWidth: 960, margin: '60px auto', padding: '0 24px 60px' }} className="animate-fade-up text-center">
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 36, color: '#1a1a1a', marginBottom: 12 }}>Product Compare</h2>
          <p style={{ fontSize: 16, color: '#6b6b6b', marginBottom: 32, fontFamily: "'Inter', sans-serif" }}>Compare safety scores and ingredient profiles of two products side by side.</p>
          <div className="text-left">
            <ComparePanel currentAnalysis={results} scans={scans}/>
          </div>
        </div>
      )}

      {/* ── ENCYCLOPEDIA ─────────────────────────────────────────────────────── */}
      {activeTab === 'learn' && (
        <div style={{ maxWidth: 800, margin: '60px auto', padding: '0 24px 60px' }} className="animate-fade-up">
          <div className="text-center mb-10">
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 36, color: '#1a1a1a', marginBottom: 12 }}>Ingredient Encyclopedia</h2>
            <p style={{ fontSize: 16, color: '#6b6b6b', fontFamily: "'Inter', sans-serif" }}>Search INCI definitions, clinical data, and skincare terminology.</p>
          </div>
          
          <div style={{ background: 'white', borderRadius: 24, padding: 32, border: '1px solid #e8e4dc', boxShadow: '0 12px 40px rgba(0,0,0,0.06)', marginBottom: 32 }}>
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-[#e8e4dc]">
              <div className="p-3 bg-[#e8f5e9] rounded-2xl text-[#4caf50]">
                <Search size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#1a1a1a]" style={{ fontFamily: "'Playfair Display', serif" }}>INCI Registry Lookup</h3>
                <p className="text-xs text-[#6b6b6b] mt-1" style={{ fontFamily: "'Inter', sans-serif" }}>Official cosmetics ingredient definitions</p>
              </div>
            </div>
            <form onSubmit={handleSearchEncyclopedia} style={{ display: 'flex', gap: 12, marginBottom: 0 }}>
              <input value={encyclopediaSearch} onChange={e => setEncyclopediaSearch(e.target.value)} placeholder="Enter ingredient name (e.g. Niacinamide)..." style={{ flex: 1, padding: '14px 16px', borderRadius: 12, border: '1px solid #e8e4dc', background: '#faf9f6', outline: 'none', fontFamily: "'Inter', sans-serif", fontSize: 14 }} className="focus:border-[#4caf50] focus:ring-1 focus:ring-[#4caf50] transition" />
              <button type="submit" disabled={encyclopediaLoading} style={{ background: '#2d4a35', color: 'white', border: 'none', borderRadius: 12, padding: '0 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} className="hover:bg-[#43a047] disabled:opacity-60">
                {encyclopediaLoading ? <Loader2 size={18} className="animate-spin"/> : <Search size={18}/>}
              </button>
            </form>
            {encyclopediaResult && (
              <div style={{ marginTop: 24, padding: '24px', background: '#faf9f6', borderRadius: 16, border: '1px solid #e8e4dc' }} className="animate-fade-up">
                <span style={{ fontSize: 10, fontWeight: 700, color: '#1b4332', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Inter', sans-serif" }}>Registry Profile</span>
                <h4 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 24, color: '#1a1a1a', margin: '8px 0 20px' }}>{encyclopediaResult.name}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[
                    { label: 'What it is', val: encyclopediaResult.description },
                    { label: 'Primary function', val: encyclopediaResult.benefits },
                    { label: 'Risks and side effects', val: encyclopediaResult.sideEffects },
                    { label: 'Suitable skin types', val: encyclopediaResult.types },
                  ].map((f, i) => (
                    <div key={i}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontFamily: "'Inter', sans-serif" }}>{f.label}</p>
                      <p style={{ fontSize: 14, color: '#1a1a1a', lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>{f.val}</p>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed #d4c9b8' }}>
                  <p style={{ fontSize: 11, color: '#9e9e9e', fontFamily: "'Inter', sans-serif" }}>Source: {encyclopediaResult.sources}</p>
                </div>
              </div>
            )}
          </div>
          
          <div style={{ background: 'white', borderRadius: 24, padding: 32, border: '1px solid #e8e4dc', boxShadow: '0 12px 40px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-[#e8e4dc]">
              <div className="p-3 bg-[#e8f5e9] rounded-2xl text-[#4caf50]">
                <FileText size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#1a1a1a]" style={{ fontFamily: "'Playfair Display', serif" }}>Skincare Glossary</h3>
                <p className="text-xs text-[#6b6b6b] mt-1" style={{ fontFamily: "'Inter', sans-serif" }}>Common terms and definitions</p>
              </div>
            </div>
            <div style={{ position: 'relative', marginBottom: 24 }}>
              <input value={glossarySearch} onChange={e => setGlossarySearch(e.target.value)} placeholder="Search terminology..." style={{ width: '100%', padding: '14px 16px', paddingRight: 48, borderRadius: 12, border: '1px solid #e8e4dc', background: '#faf9f6', outline: 'none', fontFamily: "'Inter', sans-serif", fontSize: 14 }} className="focus:border-[#4caf50] focus:ring-1 focus:ring-[#4caf50] transition" />
              <Search size={18} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#9e9e9e', pointerEvents: 'none' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 12, maxHeight: 400, overflowY: 'auto', paddingRight: 8 }} className="custom-scroll">
              {filteredGlossary.map((item, i) => (
                <div key={i} style={{ padding: '16px', background: '#faf9f6', borderRadius: 12, border: '1px solid #e8e4dc', transition: 'all 0.2s' }} className="hover:border-[#4caf50] hover:shadow-sm">
                  <p style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a', marginBottom: 6, fontFamily: "'Nunito', sans-serif" }}>{item.term}</p>
                  <p style={{ fontSize: 13, color: '#6b6b6b', lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>{item.definition}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MY VANITY ────────────────────────────────────────────────────────── */}
      {activeTab === 'vanity' && (
        <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 24px 60px' }} className="animate-fade-up">
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 36, color: '#1a1a1a', marginBottom: 12 }}>My Skincare Vanity</h2>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, color: '#6b6b6b', marginBottom: 40 }}>Your saved products and safety audit history.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginBottom: 40 }}>
            {[
              { label: 'Scans performed', value: scans.length, desc: 'Total safety checks' },
              { label: 'Saved products', value: savedProducts.length, desc: 'In your cabinet' },
              { label: 'Flagged scans', value: scans.filter(s => s.safety_score !== null && s.safety_score < 80).length, desc: 'Moderate or worse', alert: true },
            ].map((stat, i) => (
              <div key={i} className="card" style={{ padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #e8e4dc' }}>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</p>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 40, fontWeight: 900, color: stat.alert && stat.value > 0 ? '#e53935' : '#1a1a1a', lineHeight: 1.1, margin: '8px 0 4px' }}>{stat.value}</p>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#9e9e9e' }}>{stat.desc}</p>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 32, marginBottom: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #e8e4dc' }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 24, color: '#1a1a1a', marginBottom: 20 }}>My Skin Profile</h3>
            <ProfilePanel profile={profile} onToggle={handleProfileToggle}/>
          </div>

          <div className="card" style={{ padding: 32, marginBottom: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #e8e4dc' }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 24, color: '#1a1a1a', marginBottom: 8 }}>Personal Avoid List</h3>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: '#6b6b6b', marginBottom: 20 }}>Ingredients flagged in your personal analyses.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
              {allergies.map((a, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 50, fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif" }} className="risk-badge-bad">
                  {a}
                  <button onClick={() => { const next = allergies.filter((_, idx) => idx !== i); setAllergies(next); saveProfileToBackend(profile, next); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 0 }}><X size={12}/></button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <input value={newAllergyInput} onChange={e => setNewAllergyInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newAllergyInput.trim()) { const next = [...allergies, newAllergyInput.trim()]; setAllergies(next); saveProfileToBackend(profile, next); setNewAllergyInput(''); } }} placeholder="Add ingredient to avoid..." className="input-field" style={{ fontSize: 14, flex: 1 }} />
              <button onClick={() => { if (newAllergyInput.trim()) { const next = [...allergies, newAllergyInput.trim()]; setAllergies(next); saveProfileToBackend(profile, next); setNewAllergyInput(''); } }} className="btn-outline" style={{ padding: '0 24px', flexShrink: 0, fontSize: 14 }}>Add</button>
            </div>
          </div>

          <div style={{ marginBottom: 40 }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 24, color: '#1a1a1a', marginBottom: 20 }}>Saved Products</h3>
            {savedProducts.length === 0 ? (
              <div className="card" style={{ padding: '48px 24px', textAlign: 'center', border: '1px solid #e8e4dc', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <p style={{ fontFamily: "'Inter', sans-serif", color: '#6b6b6b', fontSize: 15 }}>No saved products yet. Run an analysis and save results here.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 20 }}>
                {savedProducts.map(p => (
                  <div key={p.id} className="card card-hover" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, border: '1px solid #e8e4dc', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                    <div>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#9e9e9e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saved {p.date}</span>
                      <p style={{ fontWeight: 800, fontSize: 18, color: '#1a1a1a', marginTop: 4, fontFamily: "'Playfair Display', serif" }}>{p.name}</p>
                      <p style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: p.score >= 80 ? '#43a047' : p.score >= 50 ? '#f57c00' : '#e53935', fontFamily: "'Inter', sans-serif" }}>Score: {p.score}/100</p>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
                      <button onClick={() => { setResults(p.result); setActiveTab('analyze'); }} className="btn-green" style={{ flex: 1, padding: '10px', fontSize: 14 }}>Open</button>
                      <button onClick={() => { const n = savedProducts.filter(x => x.id !== p.id); setSavedProducts(n); if (user) localStorage.setItem(`sg_saved_${user.email}`, JSON.stringify(n)); }} style={{ padding: '10px 14px', border: '1.5px solid #e8e4dc', borderRadius: 50, background: 'white', cursor: 'pointer', color: '#e53935', display: 'flex', alignItems: 'center' }}>
                        <X size={16}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 24, color: '#1a1a1a', marginBottom: 20 }}>Analysis History</h3>
            {scans.length === 0 ? (
              <div className="card" style={{ padding: '48px 24px', textAlign: 'center', border: '1px solid #e8e4dc', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <p style={{ fontFamily: "'Inter', sans-serif", color: '#6b6b6b', fontSize: 15 }}>No analyses performed yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {scans.map((scan, idx) => (
                  <div key={idx} className="card card-hover" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', border: '1px solid #e8e4dc', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: scan.safety_score >= 80 ? '#e8f5e9' : scan.safety_score >= 50 ? '#fff3e0' : '#fdeaea' }}>
                      <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 900, color: scan.safety_score >= 80 ? '#43a047' : scan.safety_score >= 50 ? '#f57c00' : '#e53935', lineHeight: 1 }}>{scan.safety_score ?? '—'}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: 15, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: "'Inter', sans-serif" }}>{scan.summary || 'Ingredient Scan'}</p>
                      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#6b6b6b', marginTop: 4 }}>{new Date(scan.created_at || Date.now()).toLocaleDateString()}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                      {scan.result && <button onClick={() => { setResults(scan.result); setActiveTab('analyze'); }} className="btn-green" style={{ padding: '10px 20px', fontSize: 14 }}>Open</button>}
                      <button onClick={() => setScans(prev => prev.filter(s => s.id !== scan.id))} style={{ padding: '10px 14px', border: '1.5px solid #e8e4dc', borderRadius: 50, background: 'white', cursor: 'pointer', color: '#e53935', display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={16}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#1b4332', position: 'relative', overflow: 'hidden' }}>
        {/* Wave transition from #faf9f6 sections above */}
        <div style={{ position: 'absolute', top: -1, left: 0, right: 0, width: '100%', overflow: 'hidden', lineHeight: 0, transform: 'rotate(180deg)' }}>
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ position: 'relative', display: 'block', width: 'calc(100% + 1.3px)', height: 48 }}>
            <path d="M0,0 C150,90 350,120 600,100 C850,80 1050,110 1200,90 L1200,120 L0,120 Z" fill="#faf9f6"></path>
          </svg>
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '100px 24px 32px', position: 'relative', zIndex: 1 }}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12" style={{ paddingBottom: 48, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            
            {/* Brand Col */}
            <div className="col-span-1 md:col-span-4 flex flex-col gap-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src="/logo.png" alt="SkinGuard" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} />
                <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 26, color: '#ffffff' }}>SkinGuard</span>
              </div>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', fontFamily: "'Inter', sans-serif", lineHeight: 1.6, maxWidth: 320 }}>
                Free ingredient safety analysis backed by EU CosIng data. No ads. No brand influence. Just transparent science.
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                {[Twitter, Instagram, Github].map((Icon, i) => (
                  <a key={i} href="#" style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#2d4a35'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
                    <Icon size={18} />
                  </a>
                ))}
              </div>
            </div>

            {/* Links Col */}
            <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-8">
              {[
                { heading: 'Platform', links: ['Home', 'Routine Checker', 'Encyclopedia', 'Compare'] },
                { heading: 'Legal', links: ['Privacy Policy', 'Terms of Use', 'Data Sources', 'Contact Us'] },
              ].map(col => (
                <div key={col.heading}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20, fontFamily: "'Inter', sans-serif" }}>{col.heading}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {col.links.map(link => (
                      <a key={link} href="#" style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif", transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#ffffff'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}>
                        {link}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Newsletter Col */}
            <div className="col-span-1 md:col-span-4 flex flex-col gap-4">
              <p style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Inter', sans-serif" }}>Stay Updated</p>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', fontFamily: "'Inter', sans-serif", lineHeight: 1.6 }}>
                Join 10,000+ users getting our weekly skincare science digest.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input type="email" placeholder="Enter your email" style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '14px 18px', color: 'white', fontSize: 15, fontFamily: "'Inter', sans-serif", outline: 'none', transition: 'border 0.2s' }} onFocus={e => e.currentTarget.style.borderColor = '#2d4a35'} onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'} />
                <button style={{ background: '#2d4a35', border: 'none', borderRadius: 12, padding: '0 20px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#43a047'} onMouseLeave={e => e.currentTarget.style.background = '#2d4a35'}>
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>

          </div>

          {/* Bottom bar */}
          <div style={{ paddingTop: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}>
              © 2026 SkinGuard · Not medical advice · Educational use only
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.06)', padding: '8px 16px', borderRadius: 50 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#43a047', boxShadow: '0 0 10px rgba(67,160,71,0.6)' }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', fontFamily: "'Inter', sans-serif" }}>Powered by EU CosIng Database</p>
            </div>
          </div>
        </div>
      </footer>

      {/* ─── Auth Modal ───────────────────────────────────────────────────────── */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowLoginModal(false); setAuthError(null); } }}>
          <div className="modal-box">
            <div style={{ background: '#1b4332', padding: '28px 28px 24px', textAlign: 'center', position: 'relative' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <ShieldCheck size={22} color="white"/>
              </div>
              <h3 style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 20, color: 'white', marginBottom: 4 }}>
                {authMode === 'login' ? 'Sign in to SkinGuard' : authMode === 'signup' ? 'Create account' : 'Reset password'}
              </h3>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: "'Inter', sans-serif" }}>
                {authMode === 'login' ? 'Access your scan history and profile.' : authMode === 'signup' ? 'Personalize your skin profile and track products.' : 'Enter your email to receive a reset link.'}
              </p>
              <button onClick={() => { setShowLoginModal(false); setAuthError(null); }} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                <X size={14}/>
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} style={{ padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {authError && <div style={{ padding: '10px 14px', background: '#fdeaea', border: '1px solid rgba(229,57,53,0.25)', borderRadius: 8, fontSize: 12, color: '#c62828' }}>{authError}</div>}
              {authMode === 'signup' && <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Full name" className="input-field"/>}
              <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="Email address" className="input-field"/>
              {authMode !== 'forgot' && <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Password" className="input-field"/>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                {authMode === 'login' && <button type="button" onClick={() => setAuthMode('forgot')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2d4a35', fontWeight: 600 }}>Forgot password?</button>}
                <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2d4a35', fontWeight: 600, marginLeft: 'auto' }}>
                  {authMode === 'login' ? 'Create account' : 'Sign in instead'}
                </button>
              </div>
              <button type="submit" className="btn-green" style={{ padding: '13px 24px', fontSize: 14, width: '100%' }}>
                {authMode === 'login' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Send Reset Link'}
              </button>
              {authMode === 'login' && (
                <button type="button" onClick={() => handleLoginMock('demo@skinguard.app', 'Demo User')} style={{ padding: '12px 24px', border: '1.5px solid #e8e4dc', borderRadius: 50, background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>
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

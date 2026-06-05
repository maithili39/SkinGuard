'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { Upload, Loader2, X, Camera, Barcode as BarcodeIcon, ScanLine, Image as ImageIcon } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';

interface Props {
  file: File | null;
  previewUrl: string | null;
  isExtracting: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExtract: () => void;
  onBarcodeLookup?: (barcode: string) => Promise<void>;
  isBarcodeLookingUp?: boolean;
  hasUser: boolean;
}

export function UploadCard({
  file,
  previewUrl,
  isExtracting,
  onFileChange,
  onExtract,
  onBarcodeLookup,
  isBarcodeLookingUp = false,
  hasUser,
}: Props) {
  const inputRef        = useRef<HTMLInputElement>(null);
  const cameraInputRef  = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab]       = useState<'image' | 'barcode'>('image');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [liveScanner, setLiveScanner]   = useState(false);

  // ── Barcode manual submit ──────────────────────────────────────────────────
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasUser) {
      onExtract(); // triggers login modal
      return;
    }
    if (!barcodeInput.trim() || !onBarcodeLookup) return;
    setBarcodeError(null);
    try {
      await onBarcodeLookup(barcodeInput.trim());
      setBarcodeInput('');
    } catch (err: unknown) {
      setBarcodeError(err instanceof Error ? err.message : 'Product not found');
    }
  };

  // ── Live scanner result ────────────────────────────────────────────────────
  const handleLiveScan = async (code: string) => {
    setLiveScanner(false);
    if (!hasUser) {
      onExtract(); // triggers login modal
      return;
    }
    if (!onBarcodeLookup) return;
    setBarcodeError(null);
    try {
      await onBarcodeLookup(code);
    } catch (err: unknown) {
      setBarcodeError(err instanceof Error ? err.message : 'Product not found for scanned code');
    }
  };

  return (
    <div className="w-full max-w-2xl glass-panel rounded-3xl p-3 shadow-glass border border-white/50 dark:border-white/10 transition-all duration-300 hover:shadow-card-hover group relative">

      {/* ── Tabs ── */}
      <div className="flex gap-2 mb-3 p-1 bg-slate-100/80 dark:bg-slate-900/50 rounded-2xl border border-slate-200/50 dark:border-slate-800/40 w-fit">
        <button
          onClick={() => { setActiveTab('image'); setLiveScanner(false); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'image'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ImageIcon size={14} />
          Label Image
        </button>
        <button
          onClick={() => { setActiveTab('barcode'); setLiveScanner(false); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'barcode'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BarcodeIcon size={14} />
          Barcode Lookup
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          IMAGE TAB
         ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'image' && (
        <div>
          {!file ? (
            /* ── Empty state: drag-and-drop + camera options ── */
            <div className="flex flex-col">
              <label
                htmlFor={hasUser ? "file-upload" : undefined}
                onClick={(e) => {
                  if (!hasUser) {
                    e.preventDefault();
                    onExtract(); // triggers login
                  }
                }}
                className="flex flex-col items-center justify-center py-10 px-8 cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 transition-all duration-300 hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 group/drop relative overflow-hidden"
              >
                {/* Background glow on hover */}
                <div className="absolute inset-0 opacity-0 group-hover/drop:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary-100/30 to-emerald-100/20 dark:from-primary-900/20 dark:to-emerald-900/10 rounded-2xl pointer-events-none" />

                {/* Animated upload icon */}
                <div className="relative mb-4">
                  <div className="absolute inset-0 bg-primary-400/20 rounded-full animate-pulse-ring" />
                  <div className="bg-gradient-to-br from-primary-500 to-emerald-500 text-white p-5 rounded-2xl shadow-lg shadow-primary-500/30 group-hover/drop:scale-110 transition-transform duration-300 relative z-10 animate-float">
                    <Camera size={32} />
                  </div>
                </div>

                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1.5 relative z-10">
                  {hasUser ? 'Upload Ingredient Label' : 'Sign In to Upload Label'}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mb-5 relative z-10 text-center text-xs">
                  {hasUser ? 'Drag & drop an image, or choose an option below' : 'Please log in to upload labels or lookup products'}
                </p>

                {/* Two CTA buttons */}
                <div className="flex flex-col sm:flex-row gap-2 relative z-10">
                  {/* Browse files */}
                  <div 
                    onClick={(e) => {
                      if (!hasUser) {
                        e.stopPropagation();
                        e.preventDefault();
                        onExtract(); // triggers login
                      }
                    }}
                    className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg shadow-primary-500/25 transition-all duration-200 btn-lift"
                  >
                    <Upload size={15} />
                    {hasUser ? 'Select Image' : 'Sign In to Select'}
                  </div>

                  {/* Camera capture (opens native camera on mobile) */}
                  <button
                    type="button"
                    onClick={(e) => { 
                      e.preventDefault(); 
                      if (!hasUser) {
                        e.stopPropagation();
                        onExtract(); // triggers login
                      } else {
                        cameraInputRef.current?.click(); 
                      }
                    }}
                    className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 btn-lift shadow-sm"
                  >
                    <Camera size={15} />
                    {hasUser ? 'Take Photo' : 'Sign In to Capture'}
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-4 relative z-10">
                  JPG, PNG, WEBP — max 8 MB
                </p>

                {/* Hidden inputs */}
                <input ref={inputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" id="file-upload" />
              </label>

              {/* Camera capture input — separate so it doesn't interfere with label click */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onFileChange}
                className="hidden"
                id="camera-capture"
              />
            </div>
          ) : (
            /* ── File selected: preview + extract ── */
            <div className="p-5 flex flex-col sm:flex-row items-center gap-6">
              {/* Image preview */}
              <div className="relative flex-shrink-0">
                <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-primary-200 dark:border-primary-800 shadow-lg">
                  <Image src={previewUrl!} alt="Label preview" fill className="object-cover" />
                </div>
                {/* Re-upload button overlay */}
                <label
                  htmlFor={hasUser ? "file-upload" : undefined}
                  onClick={(e) => {
                    if (!hasUser) {
                      e.preventDefault();
                      onExtract();
                    }
                  }}
                  className="absolute -top-2 -right-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-full p-1.5 shadow-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  title="Change image"
                >
                  <X size={12} className="text-slate-500" />
                  <input ref={inputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" id="file-upload" />
                </label>
              </div>

              {/* File info + extract button */}
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate text-sm mb-0.5">
                  {file.name}
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  {(file.size / 1024).toFixed(0)} KB · Ready for OCR
                </p>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExtract(); }}
                  disabled={isExtracting}
                  id="extract-btn"
                  className="btn-lift inline-flex items-center gap-2 bg-gradient-to-r from-primary-600 to-emerald-600 hover:from-primary-700 hover:to-emerald-700 text-white px-7 py-3 rounded-full font-semibold text-sm shadow-lg shadow-primary-500/25 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Reading label…
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      {hasUser ? 'Extract Text' : 'Sign In to Extract'}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          BARCODE TAB
         ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'barcode' && (
        <div className="p-4">
          {liveScanner ? (
            /* ── Live camera scanner ── */
            <BarcodeScanner
              onScan={handleLiveScan}
              onClose={() => setLiveScanner(false)}
            />
          ) : (
            /* ── Manual entry + scan button ── */
            <div className="flex flex-col items-center">
              <div className="relative mb-5">
                <div className="absolute inset-0 bg-primary-400/20 rounded-full animate-pulse-ring" />
                <div className="bg-gradient-to-br from-primary-500 to-emerald-500 text-white p-5 rounded-2xl shadow-lg shadow-primary-500/30 relative z-10">
                  <BarcodeIcon size={32} />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1 text-center">
                {hasUser ? 'Scan or Enter Barcode' : 'Sign In to Scan Barcode'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-5 text-center max-w-sm">
                {hasUser ? 'Search Open Beauty Facts to fetch product ingredients automatically.' : 'Please log in to lookup products or scan barcodes.'}
              </p>

              {/* Manual entry form */}
              <form onSubmit={handleBarcodeSubmit} className="flex gap-2 w-full max-w-md mb-4">
                <input
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => { setBarcodeInput(e.target.value); setBarcodeError(null); }}
                  placeholder="Enter 13-digit EAN / UPC barcode…"
                  className="flex-1 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm"
                />
                <button
                  type="submit"
                  disabled={isBarcodeLookingUp || (hasUser ? !barcodeInput.trim() : false)}
                  className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-primary-500/25 transition-all flex items-center gap-1.5"
                >
                  {isBarcodeLookingUp ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Searching…
                    </>
                  ) : hasUser ? 'Search' : 'Sign In'}
                </button>
              </form>

              {/* Live scan button */}
              <button
                type="button"
                onClick={() => {
                  if (!hasUser) {
                    onExtract();
                  } else {
                    setLiveScanner(true);
                  }
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full border-2 border-primary-400 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 text-sm font-semibold transition-all duration-200 btn-lift"
              >
                <ScanLine size={16} />
                {hasUser ? 'Scan with Camera' : 'Sign In to Scan'}
              </button>

              {barcodeError && (
                <p className="text-xs text-rose-500 font-semibold mt-3 text-center">{barcodeError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

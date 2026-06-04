'use client';

import React, { useRef, useState } from 'react';
import { Upload, Loader2, X, Camera, Barcode as BarcodeIcon } from 'lucide-react';

interface Props {
  file: File | null;
  previewUrl: string | null;
  isExtracting: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExtract: () => void;
  onBarcodeLookup?: (barcode: string) => Promise<void>;
  isBarcodeLookingUp?: boolean;
}

export function UploadCard({
  file,
  previewUrl,
  isExtracting,
  onFileChange,
  onExtract,
  onBarcodeLookup,
  isBarcodeLookingUp = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'image' | 'barcode'>('image');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim() || !onBarcodeLookup) return;
    setBarcodeError(null);
    try {
      await onBarcodeLookup(barcodeInput.trim());
      setBarcodeInput('');
    } catch (err: any) {
      setBarcodeError(err.message || 'Product not found');
    }
  };

  return (
    <div className="w-full max-w-2xl glass-panel rounded-3xl p-3 shadow-glass border border-white/50 dark:border-white/10 transition-all duration-300 hover:shadow-card-hover group relative">
      {/* Tabs */}
      <div className="flex gap-2 mb-3 p-1 bg-slate-100/80 dark:bg-slate-900/50 rounded-2xl border border-slate-200/50 dark:border-slate-800/40 w-fit">
        <button
          onClick={() => setActiveTab('image')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'image'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Camera size={14} />
          Label Image
        </button>
        <button
          onClick={() => setActiveTab('barcode')}
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

      {activeTab === 'image' ? (
        <div>
          {!file ? (
            /* ── Empty state: drag-and-drop zone ── */
            <label
              htmlFor="file-upload"
              className="flex flex-col items-center justify-center py-12 px-8 cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 transition-all duration-300 hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 group/drop relative overflow-hidden"
            >
              {/* Background glow on hover */}
              <div className="absolute inset-0 opacity-0 group-hover/drop:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary-100/30 to-emerald-100/20 dark:from-primary-900/20 dark:to-emerald-900/10 rounded-2xl pointer-events-none" />

              {/* Animated upload icon */}
              <div className="relative mb-5">
                <div className="absolute inset-0 bg-primary-400/20 rounded-full animate-pulse-ring" />
                <div className="bg-gradient-to-br from-primary-500 to-emerald-500 text-white p-5 rounded-2xl shadow-lg shadow-primary-500/30 group-hover/drop:scale-110 transition-transform duration-300 relative z-10 animate-float">
                  <Camera size={32} />
                </div>
              </div>

              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1.5 relative z-10">
                Upload Ingredient Label
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-5 relative z-10 text-center">
                Drag & drop an image, or click to browse
              </p>
              <div className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-full text-sm font-semibold shadow-lg shadow-primary-500/25 transition-all duration-200 relative z-10 btn-lift">
                <Upload size={16} />
                Select Image
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-4 relative z-10">
                JPG, PNG, WEBP — max 8 MB
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="hidden"
                id="file-upload"
              />
            </label>
          ) : (
            /* ── File selected: preview + extract ── */
            <div className="p-5 flex flex-col sm:flex-row items-center gap-6">
              {/* Image preview */}
              <div className="relative flex-shrink-0">
                <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-primary-200 dark:border-primary-800 shadow-lg">
                  <img src={previewUrl!} alt="Label preview" className="w-full h-full object-cover" />
                </div>
                {/* Re-upload button overlay */}
                <label
                  htmlFor="file-upload"
                  className="absolute -top-2 -right-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-full p-1.5 shadow-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  title="Change image"
                >
                  <X size={12} className="text-slate-500" />
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    onChange={onFileChange}
                    className="hidden"
                    id="file-upload"
                  />
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
                      Extract Text
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Barcode lookup view ── */
        <div className="p-6">
          <div className="flex flex-col items-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 bg-primary-400/20 rounded-full animate-pulse-ring" />
              <div className="bg-gradient-to-br from-primary-500 to-emerald-500 text-white p-5 rounded-2xl shadow-lg shadow-primary-500/30 relative z-10">
                <BarcodeIcon size={32} />
              </div>
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1.5 text-center">
              Scan or Enter Barcode
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-5 text-center max-w-sm">
              Search Open Beauty Facts database to fetch product ingredients automatically.
            </p>
            <form onSubmit={handleBarcodeSubmit} className="flex gap-2 w-full max-w-md">
              <input
                type="text"
                value={barcodeInput}
                onChange={(e) => {
                  setBarcodeInput(e.target.value);
                  setBarcodeError(null);
                }}
                placeholder="Enter 13-digit EAN/UPC barcode..."
                className="flex-1 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm"
              />
              <button
                type="submit"
                disabled={isBarcodeLookingUp || !barcodeInput.trim()}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-primary-500/25 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isBarcodeLookingUp ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Searching...
                  </>
                ) : (
                  'Search'
                )}
              </button>
            </form>
            {barcodeError && (
              <p className="text-xs text-rose-500 font-semibold mt-3 text-center">{barcodeError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

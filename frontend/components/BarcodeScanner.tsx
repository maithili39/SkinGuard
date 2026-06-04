'use client';

/**
 * BarcodeScanner — live camera barcode / QR scanner.
 *
 * Uses html5-qrcode under the hood (dynamically imported so Next.js SSR
 * doesn't break). On a phone the rear camera is preferred; on a desktop the
 * user is prompted to choose a camera.
 *
 * Props
 * ─────
 *   onScan   – called once when a barcode is successfully decoded.
 *   onClose  – called when the user dismisses the scanner panel.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, X, AlertCircle, ScanLine } from 'lucide-react';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

// Unique DOM id for the html5-qrcode mount target.
const SCANNER_ELEMENT_ID = 'sg-live-barcode-scanner';

export function BarcodeScanner({ onScan, onClose }: Props) {
  const scannerRef = useRef<any>(null);
  const calledRef  = useRef(false);          // prevent double-fire on same code
  const [status, setStatus]   = useState<'loading' | 'scanning' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;

    async function startScanner() {
      try {
        // Dynamic import keeps html5-qrcode out of the SSR bundle.
        const { Html5Qrcode } = await import('html5-qrcode');

        if (!mounted) return;

        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },           // prefer rear camera on mobile
          {
            fps: 12,
            qrbox: { width: 260, height: 110 },    // wide box suits 1D barcodes
            aspectRatio: 1.777,                     // 16:9
          },
          (decodedText: string) => {
            if (calledRef.current) return;
            calledRef.current = true;
            onScan(decodedText.trim());
          },
          () => { /* per-frame decode errors are expected — silently ignore */ },
        );

        if (mounted) setStatus('scanning');
      } catch (err: any) {
        if (!mounted) return;
        const msg: string = err?.message ?? String(err);
        // Friendly messages for the most common failure modes.
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
          setErrorMsg('Camera permission denied. Please allow camera access in your browser settings and try again.');
        } else if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('no camera')) {
          setErrorMsg('No camera detected on this device.');
        } else {
          setErrorMsg(msg || 'Unable to start the camera scanner.');
        }
        setStatus('error');
      }
    }

    startScanner();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {/* ignore cleanup errors */});
        scannerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <ScanLine size={18} className="text-primary-500" />
          <span className="text-sm font-semibold">Point camera at barcode</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          title="Close scanner"
        >
          <X size={18} />
        </button>
      </div>

      {/* Camera viewport */}
      <div className="relative w-full rounded-2xl overflow-hidden border-2 border-dashed border-primary-300 dark:border-primary-700 bg-black min-h-[220px] flex items-center justify-center">
        {/* html5-qrcode renders its own <video> inside this div */}
        <div id={SCANNER_ELEMENT_ID} className="w-full" />

        {/* Loading overlay */}
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3 z-10">
            <Loader2 className="animate-spin text-primary-400" size={36} />
            <p className="text-sm text-slate-300 font-medium">Starting camera…</p>
          </div>
        )}

        {/* Scanning guide overlay */}
        {status === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none z-10">
            {/* Corner markers */}
            <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary-400 rounded-tl-sm" />
            <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-primary-400 rounded-tr-sm" />
            <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary-400 rounded-bl-sm" />
            <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-primary-400 rounded-br-sm" />
            {/* Animated scan line */}
            <div className="absolute left-6 right-6 top-1/2 h-px bg-primary-400/70 shadow-[0_0_8px_2px_rgba(99,102,241,0.6)] animate-scan-line" />
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/80 z-10 gap-3">
            <AlertCircle className="text-rose-400" size={36} />
            <p className="text-sm text-rose-300 font-medium text-center">{errorMsg}</p>
            <button
              onClick={onClose}
              className="mt-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {status === 'scanning' && (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
          Hold steady — barcode will be detected automatically.
        </p>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  onDetected: (code: string) => void;
  onClose: () => void;
}

type ScannerState = 'requesting' | 'active' | 'error';

export function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<any>(null);
  const [state, setState] = useState<ScannerState>('requesting');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastResult, setLastResult] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch (e) {}
      readerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    stopStream();
    setState('requesting');
    setErrorMsg('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Dynamic import to avoid SSR issues
      const { BrowserMultiFormatReader } = await import('@zxing/library');
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      setState('active');

      // Decode from video stream continuously
      const decode = async () => {
        if (!videoRef.current || !readerRef.current) return;
        try {
          const result = await readerRef.current.decodeFromVideoElement(videoRef.current);
          if (result) {
            const code = result.getText();
            setLastResult(code);
            stopStream();
            onDetected(code);
          }
        } catch (e: any) {
          // NotFoundException is normal (no barcode yet), keep scanning
          if (e?.name !== 'NotFoundException') {
            console.warn('Scan error:', e);
          }
          // Schedule next frame
          if (streamRef.current) {
            setTimeout(decode, 200);
          }
        }
      };

      decode();

    } catch (err: any) {
      stopStream();
      if (err.name === 'NotAllowedError') {
        setErrorMsg('Camera access denied. Please allow camera permission in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setErrorMsg('No camera found. Please connect a camera or enter the barcode manually.');
      } else {
        setErrorMsg(`Camera error: ${err.message || 'Unknown error'}`);
      }
      setState('error');
    }
  }, [facingMode, stopStream, onDetected]);

  useEffect(() => {
    startScanner();
    return () => stopStream();
  }, [startScanner]);

  const handleFlipCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-[#0c140d] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h3 className="text-white font-semibold text-sm tracking-tight">Scan Barcode</h3>
            <p className="text-[#BACBBA]/50 text-[11px] mt-0.5">Point your camera at the product barcode</p>
          </div>
          <button
            onClick={() => { stopStream(); onClose(); }}
            className="p-2 rounded-full text-[#BACBBA]/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Camera Viewfinder */}
        <div className="relative bg-black aspect-video overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Scanner overlay */}
          {state === 'active' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* Dimming corners */}
              <div className="absolute inset-0 bg-black/40" style={{
                clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, 15% 25%, 15% 75%, 85% 75%, 85% 25%, 15% 25%)'
              }} />
              {/* Scan box */}
              <div className="relative w-64 h-40 border-2 border-[#BACBBA]/80 rounded-xl">
                {/* Corner marks */}
                <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-[#BACBBA] rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-[#BACBBA] rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-[#BACBBA] rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-[#BACBBA] rounded-br-lg" />
                {/* Scanning line animation */}
                <div className="absolute left-0 right-0 h-0.5 bg-[#BACBBA]/80 shadow-[0_0_8px_rgba(186,203,186,0.8)] animate-scan-line" />
              </div>
              <p className="absolute bottom-4 text-[11px] text-white/60 font-medium tracking-wide">
                Align barcode within the frame
              </p>
            </div>
          )}

          {/* Loading state */}
          {state === 'requesting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
              <div className="w-8 h-8 border-2 border-[#BACBBA]/30 border-t-[#BACBBA] rounded-full animate-spin" />
              <p className="text-[#BACBBA]/70 text-xs">Requesting camera access...</p>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 px-6 text-center">
              <div className="p-3 bg-rose-500/10 rounded-full">
                <AlertTriangle size={24} className="text-rose-400" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold mb-1">Camera Unavailable</p>
                <p className="text-[#BACBBA]/60 text-xs leading-relaxed">{errorMsg}</p>
              </div>
              <button
                onClick={startScanner}
                className="flex items-center gap-2 px-4 py-2 bg-[#BACBBA]/10 border border-[#BACBBA]/20 text-[#BACBBA] text-xs font-semibold rounded-full hover:bg-[#BACBBA]/20 transition-colors"
              >
                <RefreshCw size={12} />
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-5 py-4">
          <button
            onClick={handleFlipCamera}
            className="flex items-center gap-2 text-[#BACBBA]/60 hover:text-white text-xs font-medium transition-colors"
          >
            <RefreshCw size={14} />
            Flip Camera
          </button>
          {state === 'active' && (
            <span className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Scanning
            </span>
          )}
        </div>

      </div>

      <style jsx>{`
        @keyframes scan-line {
          0% { top: 10%; }
          50% { top: 85%; }
          100% { top: 10%; }
        }
        .animate-scan-line {
          animation: scan-line 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

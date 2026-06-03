'use client';

import React from 'react';
import { Upload, Loader2 } from 'lucide-react';

interface Props {
  file: File | null;
  previewUrl: string | null;
  isExtracting: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExtract: () => void;
}

export function UploadCard({ file, previewUrl, isExtracting, onFileChange, onExtract }: Props) {
  return (
    <div className="w-full max-w-2xl glass-panel rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-white/60 transition-all hover:shadow-2xl hover:shadow-primary-100/50 group relative">
      <input
        type="file"
        accept="image/*"
        onChange={onFileChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
        id="file-upload"
      />
      <div className={`border-2 border-dashed ${file ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white/50 hover:border-primary-400'} rounded-2xl p-12 flex flex-col items-center justify-center transition-colors relative overflow-hidden`}>
        {!file ? (
          <>
            <div className="absolute inset-0 bg-primary-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <div className="bg-primary-100 text-primary-600 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300 shadow-sm relative z-10">
              <Upload size={32} />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2 relative z-10">Upload Ingredient Label</h3>
            <p className="text-slate-500 text-sm mb-6 relative z-10">Drag and drop an image, or click to browse</p>
            <button className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-full font-medium transition-all shadow-lg shadow-primary-500/25 relative z-10 pointer-events-none">
              Select Image
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center z-10">
            <div className="relative w-32 h-32 mb-4 rounded-xl overflow-hidden border-2 border-primary-200 shadow-inner">
              <img src={previewUrl!} alt="Preview" className="w-full h-full object-cover" />
            </div>
            <p className="text-slate-700 font-medium mb-4 truncate max-w-xs">{file.name}</p>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExtract(); }}
              disabled={isExtracting}
              id="extract-btn"
              className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-full font-medium transition-all shadow-lg shadow-primary-500/25 flex items-center gap-2 relative z-30 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isExtracting ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
              {isExtracting ? 'Reading label…' : 'Extract Text'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

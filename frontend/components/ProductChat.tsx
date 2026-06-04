'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  MessageCircle, Send, Loader2, ChevronDown, ChevronUp,
  Bot, User, Sparkles, AlertCircle, X,
} from 'lucide-react';
import type { AnalysisResult } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  groundedOn?: string[];
  source?: string;
  error?: boolean;
}

interface Props {
  results: AnalysisResult;
}

const STARTER_QUESTIONS = [
  "Is this product safe for sensitive skin?",
  "What are the most concerning ingredients here?",
  "Can I use this while pregnant?",
  "Which ingredients might cause fungal acne?",
];

export function ProductChat({ results }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const sendMessage = async (question: string) => {
    if (!question.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          analysis_context: results,
          ingredient_names: results.found_ingredients?.map((i) => i.matched_name) ?? [],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Request failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          groundedOn: data.grounded_on,
          source: data.source,
        },
      ]);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="w-full max-w-4xl mt-6 animate-fade-in-up">
      {/* ── Toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        id="chat-toggle-btn"
        className="w-full flex items-center justify-between glass-panel rounded-2xl px-6 py-4 border border-white/50 dark:border-white/10 hover:shadow-card-hover transition-all duration-200 btn-lift group"
      >
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-2.5 rounded-xl shadow-lg shadow-violet-500/30 group-hover:scale-110 transition-transform duration-200">
            <MessageCircle size={18} className="text-white" />
          </div>
          <div className="text-left">
            <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              Ask about this product
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Powered by Gemini 2.5 Pro · Grounded on your ingredient data
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50">
            <Sparkles size={9} /> RAG
          </span>
          {isOpen
            ? <ChevronUp size={18} className="text-slate-400" />
            : <ChevronDown size={18} className="text-slate-400" />}
        </div>
      </button>

      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="mt-2 glass-panel rounded-3xl border border-white/50 dark:border-white/10 shadow-glass overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-1.5 rounded-lg">
                <Bot size={16} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  SkinGuard AI
                </p>
                <p className="text-[10px] text-slate-400">
                  Gemini 2.5 Pro · {results.found_ingredients?.length ?? 0} ingredients in context
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Grounding disclaimer */}
          <div className="px-5 py-2.5 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-100 dark:border-violet-800/40">
            <p className="text-[10px] text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
              <AlertCircle size={10} className="flex-shrink-0" />
              Answers are grounded only on the structured ingredient data in our database — the AI cannot invent safety claims we haven&apos;t curated. Educational use only, not medical advice.
            </p>
          </div>

          {/* Messages */}
          <div className="h-80 overflow-y-auto p-5 space-y-4 custom-scroll">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Suggested questions
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {STARTER_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left text-xs text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 hover:border-violet-300 dark:hover:border-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all duration-150"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2.5 animate-fade-in-up ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {/* Avatar */}
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                  msg.role === 'user'
                    ? 'bg-primary-500'
                    : msg.error
                      ? 'bg-rose-500'
                      : 'bg-gradient-to-br from-violet-500 to-purple-600'
                }`}>
                  {msg.role === 'user'
                    ? <User size={13} className="text-white" />
                    : <Bot size={13} className="text-white" />}
                </div>

                {/* Bubble */}
                <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary-500 text-white rounded-tr-sm'
                      : msg.error
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50 rounded-tl-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-700 rounded-tl-sm shadow-sm'
                  }`}>
                    {msg.content}
                  </div>

                  {/* Grounding citation */}
                  {msg.groundedOn && msg.groundedOn.length > 0 && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 px-1">
                      Grounded on: {msg.groundedOn.slice(0, 5).join(', ')}
                      {msg.groundedOn.length > 5 && ` +${msg.groundedOn.length - 5} more`}
                      {msg.source && msg.source !== 'template' && (
                        <span className="ml-1 text-violet-400">· {msg.source}</span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex gap-2.5 animate-fade-in-up">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Bot size={13} className="text-white" />
                </div>
                <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about ingredients, safety, alternatives…"
                disabled={loading}
                id="chat-input"
                className="flex-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:border-violet-400 dark:focus:border-violet-500 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/30 outline-none transition-all duration-150 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                id="chat-send-btn"
                className="flex-shrink-0 bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white p-2.5 rounded-full shadow-lg shadow-violet-500/25 transition-all duration-150 btn-lift disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading
                  ? <Loader2 size={18} className="animate-spin" />
                  : <Send size={18} />}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy — SkinGuard',
  description: 'How SkinGuard handles your data.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/" className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-primary-600 transition-colors">
            <div className="bg-gradient-to-tr from-primary-600 to-primary-400 p-1.5 rounded-lg text-white">
              <ShieldCheck size={16} />
            </div>
            <span className="font-bold text-sm">SkinGuard</span>
          </Link>
        </div>

        <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Last updated: June 2026</p>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          <section>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-2">What we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account data:</strong> Email address and bcrypt-hashed password (if you register).</li>
              <li><strong>Scan history:</strong> Ingredient text you submit and the analysis results — stored per-account.</li>
              <li><strong>Skin profile:</strong> Flags you set (pregnant, sensitive, acne-prone, etc.) — stored server-side only when logged in.</li>
              <li><strong>Anonymous scans:</strong> Not stored. Anonymous results are cached for 5 minutes then discarded.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-2">What we don&apos;t collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Payment information (SkinGuard is free).</li>
              <li>Device fingerprints, advertising IDs, or third-party tracking pixels.</li>
              <li>Product images — they are processed for text extraction and immediately discarded.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-2">Cookies</h2>
            <p>We use a single <strong>HttpOnly session cookie</strong> to keep you logged in. This cookie is not accessible to JavaScript and cannot be read by third-party scripts. It expires after 7 days.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-2">Third-party services</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Google Gemini API:</strong> Ingredient questions are sent to Google&apos;s API for AI-generated responses. See <a href="https://policies.google.com/privacy" className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>.</li>
              <li><strong>Open Beauty Facts / Open Food Facts:</strong> Barcode lookups are made to these open databases.</li>
              <li><strong>Sentry (optional):</strong> If configured, error reports (stack traces) are sent to Sentry for debugging.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-2">Your rights</h2>
            <p>You can delete your account and all associated data at any time by contacting us. Anonymous scan data is never stored.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-2">Not medical advice</h2>
            <p>SkinGuard provides educational ingredient information only. Nothing on this site constitutes medical or dermatological advice. Always consult a qualified healthcare professional.</p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800">
          <Link href="/" className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline">
            ← Back to SkinGuard
          </Link>
        </div>
      </div>
    </main>
  );
}

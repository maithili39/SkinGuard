import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });

export const metadata: Metadata = {
  title: "SkinGuard - AI Skincare Analyzer",
  description: "Analyze skincare ingredients with AI to protect your skin from acne, irritants, and unsafe ingredients.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-slate-50 text-slate-900 min-h-screen selection:bg-primary-500 selection:text-white`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:bg-primary-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-xl focus:z-50 focus:shadow-lg focus:font-bold outline-none"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}

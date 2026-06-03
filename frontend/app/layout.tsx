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
        {children}
      </body>
    </html>
  );
}

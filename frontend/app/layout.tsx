import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });

export const viewport: Viewport = {
  themeColor: "#16a34a",
};

export const metadata: Metadata = {
  title: "SkinGuard - AI Skincare Ingredient Analyzer",
  description: "Know what's in your skincare. Analyze ingredients against 24,000+ EU CosIng entries — flags irritants, pore-cloggers, and pregnancy risks instantly.",
  keywords: ["skincare", "ingredient analyzer", "acne", "comedogenic", "EU CosIng", "skin safety"],
  authors: [{ name: "SkinGuard" }],
  manifest: "/manifest.json",
  openGraph: {
    title: "SkinGuard - AI Skincare Analyzer",
    description: "Know what's in your skincare. Free ingredient safety analysis.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "SkinGuard - AI Skincare Analyzer",
    description: "Know what's in your skincare. Free ingredient safety analysis.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className={`${inter.variable} font-sans min-h-screen selection:bg-primary-500 selection:text-white`}>
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

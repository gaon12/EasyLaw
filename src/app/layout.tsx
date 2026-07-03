// biome-ignore-all lint/security/noDangerouslySetInnerHtml: Next.js requires trusted inline scripts for pre-hydration theme setup and JSON-LD.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ReadingProgress } from "@/components/reading-progress";
import { TermExplainer } from "@/components/term-explainer";
import { getSiteUrl, siteDescription, siteName } from "@/lib/metadata";
import "katex/dist/katex.min.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

const siteUrl = getSiteUrl();
const themeInitScript = `try {
  const theme = localStorage.getItem("easylaw-theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  }
  const textSize = localStorage.getItem("easylaw_text_size");
  if (textSize === "normal" || textSize === "large" || textSize === "larger") {
    document.documentElement.dataset.textSize = textSize;
  }
} catch {}`;
const structuredDataJson = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteName,
  applicationCategory: "LegalTechApplication",
  operatingSystem: "Web",
  url: siteUrl.toString(),
  description: siteDescription,
  inLanguage: "ko-KR",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "KRW",
  },
}).replace(/</g, "\\u003c");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: `${siteName} | 판결문을 이해하기 쉽게`,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  authors: [{ name: siteName }],
  category: "legal technology",
  keywords: [
    "판결문",
    "법률 검색",
    "쉬운 법률",
    "판례",
    "AI 법률 질문",
    "Legal AI",
    "EasyLaw",
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: `${siteName} | 판결문을 이해하기 쉽게`,
    description: siteDescription,
    locale: "ko_KR",
    siteName,
    type: "website",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} | 판결문을 이해하기 쉽게`,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          dangerouslySetInnerHTML={{ __html: structuredDataJson }}
          id="easylaw-structured-data"
          type="application/ld+json"
        />
      </head>
      <body>
        <ReadingProgress />
        {children}
        <TermExplainer />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { TermExplainer } from "@/components/term-explainer";
import { getSiteUrl, siteDescription, siteName } from "@/lib/metadata";
import "./globals.css";

const siteUrl = getSiteUrl();

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
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        <Script
          id="easylaw-structured-data"
          strategy="beforeInteractive"
          type="application/ld+json"
        >
          {JSON.stringify({
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
          })}
        </Script>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/npm/wanted-sans@1.0.3/fonts/webfonts/variable/split/WantedSansVariable.css"
          rel="stylesheet"
        />
        <link
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <TermExplainer />
      </body>
    </html>
  );
}

import type { Metadata } from "next";

export const siteName = "EasyLaw";
export const siteDescription =
  "판결의 결론과 이유, 어려운 법률 용어를 쉬운 설명으로 나눠 읽는 판결문 이해 보조 서비스";

export function getSiteUrl() {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
}

export function pageMetadata(input: {
  title: string;
  description: string;
  path?: string;
  robots?: Metadata["robots"];
}): Metadata {
  const canonical = input.path ? new URL(input.path, getSiteUrl()) : undefined;

  return {
    title: input.title,
    description: input.description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      title: `${input.title} | ${siteName}`,
      description: input.description,
      siteName,
      type: "website",
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title: `${input.title} | ${siteName}`,
      description: input.description,
    },
    robots: input.robots,
  };
}

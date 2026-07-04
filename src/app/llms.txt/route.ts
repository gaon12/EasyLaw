import { guideDocuments, notices } from "@/lib/content";
import { getSiteUrl, siteDescription, siteName } from "@/lib/metadata";

export function GET() {
  const siteUrl = getSiteUrl();
  const guideLinks = guideDocuments
    .map(
      (document) =>
        `- [${document.title}](${new URL(`/guide/${encodeURIComponent(document.slug)}`, siteUrl)}) - ${document.summary}`,
    )
    .join("\n");
  const noticeLinks = notices
    .map(
      (notice) =>
        `- [${notice.title}](${new URL(`/notice/${notice.id}`, siteUrl)}) - ${notice.publishedOn}`,
    )
    .join("\n");

  return new Response(
    `# ${siteName}

> ${siteDescription}

EasyLaw helps Korean readers understand court decisions, legal terms, public case metadata, private pasted judgments, and natural-language legal research drafts. The service is not a substitute for legal advice.

## Key pages

- [Home](${siteUrl})
- [판결문·법령 검색](${new URL("/catalog", siteUrl)})
- [AI 법률 질문](${new URL("/research", siteUrl)})
- [공지사항](${new URL("/notice", siteUrl)})
- [개인정보처리방침](${new URL("/privacy", siteUrl)})
- [이용약관](${new URL("/terms", siteUrl)})

## Guides

${guideLinks}

## Notices

${noticeLinks}

## Crawling notes

Private custom judgment URLs under /cp, account pages, admin pages, setup pages, and API routes should not be used as public knowledge sources.`,
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "text/plain; charset=utf-8",
      },
    },
  );
}

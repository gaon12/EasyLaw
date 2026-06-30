import type { MetadataRoute } from "next";
import { guideDocuments, notices } from "@/lib/content";
import { getSiteUrl } from "@/lib/metadata";

const staticRoutes = [
  "",
  "/catalog",
  "/research",
  "/guide",
  "/notice",
  "/privacy",
  "/terms",
  "/support",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();

  return [
    ...staticRoutes.map((path) => ({
      url: new URL(path, siteUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.7,
    })),
    ...guideDocuments.map((document) => ({
      url: new URL(
        `/guide/${encodeURIComponent(document.slug)}`,
        siteUrl,
      ).toString(),
      lastModified: new Date(document.updatedOn),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...notices.map((notice) => ({
      url: new URL(`/notice/${notice.id}`, siteUrl).toString(),
      lastModified: new Date(notice.publishedOn),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}

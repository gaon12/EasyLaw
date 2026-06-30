import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/catalog",
          "/guide",
          "/notice",
          "/privacy",
          "/terms",
          "/research",
        ],
        disallow: ["/admin", "/api", "/cp", "/me", "/org", "/setup"],
      },
    ],
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}

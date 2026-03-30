import { MetadataRoute } from "next";

const sitemapLastModified = new Date("2026-03-29T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://pokronline.com";

  return [
    {
      url: baseUrl,
      lastModified: sitemapLastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    // Auth routes
    {
      url: `${baseUrl}/signin`,
      lastModified: sitemapLastModified,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/signup`,
      lastModified: sitemapLastModified,
      changeFrequency: "weekly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/learn`,
      lastModified: sitemapLastModified,
      changeFrequency: "daily",
      priority: 0.7,
    },
    // Tools routes
    {
      url: `${baseUrl}/tools/equity-calculator`,
      lastModified: sitemapLastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tools/range-analysis`,
      lastModified: sitemapLastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];
}

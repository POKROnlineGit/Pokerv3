import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pokronline.com";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/play/game/", "/play/local/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

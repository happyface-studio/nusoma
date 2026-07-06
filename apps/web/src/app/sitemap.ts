import fs from "fs/promises";
import path from "path";
import { allDocs, allPosts } from "content-collections";

type SitemapEntry = {
  url: string;
  lastModified: Date | string;
  changeFreq?: string;
  priority?: number;
};

async function getPages(baseUrl: string): Promise<SitemapEntry[]> {
  const marketingPath = path.join(process.cwd(), "src/app");
  const entries = await fs.readdir(marketingPath, { withFileTypes: true });
  const routes: SitemapEntry[] = [];

  for (const entry of entries.filter((e) => e.isDirectory())) {
    // Check for page.tsx in the directory
    try {
      const fullPath = path.join(marketingPath, entry.name);
      await fs.stat(path.join(fullPath, "page.tsx"));
      const route = entry.name === "home" ? "" : entry.name;

      routes.push({
        url: `${baseUrl}/${route}`,
        lastModified: new Date(), // using current date as mtime might be unreliable on some systems or CI
        priority: route === "" ? 1.0 : 0.8,
        changeFreq: "weekly",
      });
    } catch {
      // No page.tsx found, skip this directory
      continue;
    }
  }

  return routes;
}

export default async function Sitemap(): Promise<SitemapEntry[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const pages = await getPages(baseUrl);

  const sitemap: SitemapEntry[] = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      priority: 1,
      changeFreq: "weekly",
    },
    ...pages,
    ...allDocs.map((doc) => ({
      url: `${baseUrl}${doc.slug}`,
      lastModified: new Date(),
      priority: 0.8,
      changeFreq: "weekly",
    })),
    ...allPosts.map((post) => ({
      url: `${baseUrl}${post.slug}`,
      lastModified: post.published,
      priority: 0.6,
      changeFreq: "monthly",
    })),
  ];

  // Sort alphabetically by URL
  return sitemap.sort((a, b) => a.url.localeCompare(b.url));
}

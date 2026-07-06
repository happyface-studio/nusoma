import { type MetadataRoute } from "next";

import { appConfig } from "@/lib/config";

export default function Manifest(): MetadataRoute.Manifest {
  return {
    name: appConfig.info.name,
    short_name: appConfig.info.name,
    description: appConfig.info.description,
    start_url: appConfig.info.startUrl,
    display: appConfig.info.display,
    background_color: appConfig.info.backgroundColor,
    theme_color: appConfig.info.themeColor,
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

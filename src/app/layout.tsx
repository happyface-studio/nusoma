import type { Metadata, Viewport } from "next";
import "./styles/globals.css";
import { CoreProviders } from "./core-providers";
import {
  geistSans,
  geistMono,
  doto,
  focal,
  hal,
  halMono,
  commitMono,
} from "@/lib/fonts";
import { BotIdClient } from "botid/client";
import { Analytics } from "@vercel/analytics/next";
import { CookieBanner } from "@/components/landing/fragments/cookie-banner";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Creative Canvas for GenAI | nusoma",
    template: "%s | nusoma",
  },
  description: "Create and share on your own creative canvas with GenAI.",
  keywords: [
    "AI style transfer",
    "image transformation",
    "flux model",
    "LoRA",
    "AI art",
    "nusoma",
    "creative canvas",
    "fal.ai",
    "photo styling",
    "artificial intelligence",
    "machine learning",
    "image generation",
  ],
  authors: [
    {
      name: "Simon Weniger - simon@nusoma.app",
      url: "https://simonweniger.com",
    },
  ],
  creator: "Simon Weniger - simon@nusoma.app",
  publisher: "nusoma",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  manifest: `${process.env.NEXT_PUBLIC_APP_URL}/manifest`,
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "Creative GenAI Canvas for Designers | nusoma",
    description: "Build your vision! With an GenAI canvas made for Designers.",
    siteName: "nusoma",
    images: {
      url: `${process.env.NEXT_PUBLIC_APP_URL}/og-image`,
      width: 1200,
      height: 630,
      alt: "nusoma",
    },
  },
  twitter: {
    card: "summary_large_image",
    title: "Creative GenAI Canvas for Designers | nusoma",
    description: "Build your vision! With an GenAI canvas made for Designers.",
    creator: "@nusoma",
    site: "@nusoma",
    images: [
      {
        url: "/og-img.png",
        width: 1200,
        height: 630,
        alt: "Creative GenAI Canvas for Designers | nusoma",
        type: "image/png",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={[
        geistSans.variable,
        geistMono.variable,
        doto.variable,
        hal.variable,
        halMono.variable,
        focal.variable,
        commitMono.variable,
      ].join(" ")}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="dark" />
        <script
          type="text/javascript"
          src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
          async
        />
        <BotIdClient
          protect={[
            {
              path: "/api/trpc/*",
              method: "POST",
            },
            {
              path: "/api/fal",
              method: "POST",
            },
          ]}
        />
      </head>
      <body className={`font-sans size-full`} suppressHydrationWarning>
        <CoreProviders>
          <div className="root">{children}</div>
          <CookieBanner />
        </CoreProviders>
      </body>
      <Analytics />
    </html>
  );
}

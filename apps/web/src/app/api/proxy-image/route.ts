import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy route to fetch images server-side, bypassing CORS restrictions.
 * This is needed because InstantDB's S3 storage doesn't have CORS configured
 * for our origin, which causes canvas operations to fail.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 },
    );
  }

  // Validate the URL is from allowed domains
  const allowedHosts = [
    "instant-storage.s3.amazonaws.com",
    "fal.media",
    "v3.fal.media",
    "storage.googleapis.com",
  ];

  try {
    const parsedUrl = new URL(url);
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: "URL domain not allowed" },
        { status: 403 },
      );
    }

    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.status}` },
        { status: response.status },
      );
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Proxy image error:", error);
    return NextResponse.json(
      { error: "Failed to proxy image" },
      { status: 500 },
    );
  }
}

"use client";

import * as React from "react";
import NextError from "next/error";

export type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({
  error: { digest, ...error },
}: GlobalErrorProps): React.JSX.Element {
  // We don't monitor the marketing app, but you can enable it if users report errors.
  // useCaptureError(error);
  return (
    <html>
      <body>
        {/* This is the default Next.js error component but it doesn't allow omitting the statusCode property yet. */}
        <NextError statusCode={undefined as never} />
      </body>
    </html>
  );
}

"use client";

import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getUrl, TRPCProvider } from "@/trpc/client";
import {
  httpBatchLink,
  splitLink,
  httpSubscriptionLink,
  createTRPCClient,
} from "@trpc/client";
import { EventSource as HeaderEventSource } from "extended-eventsource";
import { authHeader } from "@/lib/auth/authToken";
import superjson from "superjson";
import { makeQueryClient } from "@/lib/query-client";
import { AppRouter } from "@/server/trpc/routers/_app";
import { ThemeProvider } from "next-themes";
import { PostHogProvider } from "@/providers/posthog-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { DatabaseProvider } from "@/providers/database-provider";
import { ToastProvider } from "@/components/ui/toast";

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function CoreProviders({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === "subscription",
          true: httpSubscriptionLink({
            transformer: superjson,
            url: getUrl(),
            // Native EventSource can't send headers; this ponyfill can. The
            // callback is read per (re)connection, so the current token is used.
            EventSource: HeaderEventSource,
            eventSourceOptions: () => ({ headers: authHeader() }),
          }),
          false: httpBatchLink({
            transformer: superjson,
            url: getUrl(),
            headers() {
              return {
                "x-trpc-source": "client",
                ...authHeader(),
              };
            },
          }),
        }),
      ],
    }),
  );

  return (
    <PostHogProvider>
      <AuthProvider>
        <DatabaseProvider>
          <QueryClientProvider client={queryClient}>
            <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <ToastProvider>{children}</ToastProvider>
              </ThemeProvider>
            </TRPCProvider>
          </QueryClientProvider>
        </DatabaseProvider>
      </AuthProvider>
    </PostHogProvider>
  );
}

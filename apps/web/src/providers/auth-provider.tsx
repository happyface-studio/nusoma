"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { id } from "@instantdb/react";
import { useRouter, usePathname } from "next/navigation";
import Cookies from "js-cookie";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { db } from "@/lib/db";

// Define a strict User type based on InstantDB's auth user
export interface User {
  id: string;
  email: string;
  refresh_token?: string;
  [key: string]: any; // Allow extensibility
}

interface AuthContextType {
  user: User | null;
  profile: any | null;
  isLoading: boolean;
  error: Error | null;
  db: any;
  sessionId: string; // Strictly typed as string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoading: authIsLoading, user, error } = db.useAuth();
  const [profile, setProfile] = useState<any | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Initialize session ID
    let currentSessionId = Cookies.get("sessionId");
    if (!currentSessionId) {
      currentSessionId = id();
      Cookies.set("sessionId", currentSessionId, { expires: 7 });
    }
    setSessionId(currentSessionId);
  }, []);

  useEffect(() => {
    const ensureProfile = async () => {
      if (user) {
        const profile = await db
          .queryOnce({
            userProfiles: {
              $: {
                where: {
                  "user.id": user.id,
                },
              },
            },
          })
          .then((data) => {
            return data.data.userProfiles[0];
          });

        if (!profile) {
          // Create a new user profile (credits are managed by Polar, not stored locally)
          const profileId = id();
          await db.transact(
            db.tx.userProfiles[profileId].update({}).link({ user: user.id }),
          );
        }
      }
    };
    ensureProfile();
  }, [user]);

  const {
    data: profileData,
    isLoading: profileIsLoading,
    error: profileError,
  } = db.useQuery(
    user
      ? {
          userProfiles: {
            $: {
              where: { "user.id": user.id },
            },
          },
        }
      : {},
  );

  useEffect(() => {
    if (
      profileData &&
      profileData.userProfiles &&
      profileData.userProfiles.length > 0
    ) {
      setProfile(profileData.userProfiles[0]);
    }
  }, [profileData]);

  // Combined loading state: wait for auth to check user AND for sessionId to be initialized
  if (authIsLoading || !sessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <CircleNotchIcon size={24} weight="bold" className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div>Authentication Error: {error.message}</div>;
  }

  // Define protected and auth routes
  const isAuthRoute = pathname?.startsWith("/auth/");
  const isProtectedRoute =
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/projects") ||
    pathname?.startsWith("/settings");

  return (
    <AuthContext.Provider
      value={{
        user: user as User | null,
        isLoading: authIsLoading,
        error: error || null,
        profile: profile,
        db: db,
        sessionId: sessionId,
      }}
    >
      <db.SignedIn>
        <AuthenticatedContent
          isAuthRoute={isAuthRoute}
          pathname={pathname}
          router={router}
        >
          {children}
        </AuthenticatedContent>
      </db.SignedIn>
      <db.SignedOut>
        <UnauthenticatedContent
          isProtectedRoute={isProtectedRoute}
          pathname={pathname}
          router={router}
        >
          {children}
        </UnauthenticatedContent>
      </db.SignedOut>
    </AuthContext.Provider>
  );
}

// Component for authenticated users
function AuthenticatedContent({
  children,
  isAuthRoute,
  pathname,
  router,
}: {
  children: React.ReactNode;
  isAuthRoute: boolean | undefined;
  pathname: string | null;
  router: any;
}) {
  useEffect(() => {
    // Redirect authenticated users away from auth pages
    if (isAuthRoute) {
      router.push("/dashboard");
    }
  }, [isAuthRoute, pathname, router]);

  // Don't render auth pages for authenticated users
  if (isAuthRoute) {
    return null;
  }

  return <>{children}</>;
}

// Component for unauthenticated users
function UnauthenticatedContent({
  children,
  isProtectedRoute,
  pathname,
  router,
}: {
  children: React.ReactNode;
  isProtectedRoute: boolean | undefined;
  pathname: string | null;
  router: any;
}) {
  useEffect(() => {
    // Redirect unauthenticated users away from protected pages
    if (isProtectedRoute) {
      router.push("/auth/sign-in");
    }
  }, [isProtectedRoute, pathname, router]);

  // Don't render protected pages for unauthenticated users
  if (isProtectedRoute) {
    return null;
  }

  return <>{children}</>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  // Return the whole context for flexibility, including user, isLoading, error
  return context;
}

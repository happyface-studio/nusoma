"use client";

import React, { useState } from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_NAME = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_NAME || "";

declare global {
  interface Window {
    AppleID: any;
  }
}

export default function SignIn() {
  const [sentEmail, setSentEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Magic Code Authentication
  const handleMagicCodeSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    try {
      await db.auth.sendMagicCode({ email });
      setSentEmail(email);
    } catch (err: any) {
      alert("Error sending magic code: " + err.body?.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const code = formData.get("code") as string;

    try {
      await db.auth.signInWithMagicCode({ email: sentEmail, code });
    } catch (err: any) {
      alert("Error signing in: " + err.body?.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Google OAuth
  const handleGoogleSuccess = async (response: any) => {
    const nonce = crypto.randomUUID();
    try {
      await db.auth.signInWithIdToken({
        clientName: GOOGLE_CLIENT_NAME,
        idToken: response.credential,
        nonce,
      });
    } catch (err: any) {
      alert("Error signing in with Google: " + err.body?.message);
    }
  };

  // Apple Sign In
  const handleAppleSignIn = async () => {
    try {
      const nonce = crypto.randomUUID();

      // Initialize Apple ID if not already done
      if (typeof window !== "undefined" && window.AppleID) {
        await window.AppleID.auth.init({
          clientId: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID,
          scope: "name email",
          redirectURI: window.location.href,
        });

        const response = await window.AppleID.auth.signIn({
          nonce: nonce,
          usePopup: true,
        });

        await db.auth.signInWithIdToken({
          clientName: process.env.NEXT_PUBLIC_APPLE_CLIENT_NAME || "",
          idToken: response.authorization.id_token,
          nonce: nonce,
        });
      }
    } catch (err: any) {
      console.error("Apple Sign In error:", err);
      alert("Error signing in with Apple: " + err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Sign in
          </CardTitle>
          <CardDescription className="text-center">
            Welcome back! Please sign in to your account
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* OAuth Buttons */}
          <div className="space-y-3">
            {GOOGLE_CLIENT_ID && (
              <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => alert("Google Sign In failed")}
                  useOneTap={false}
                  theme="outline"
                  size="large"
                  width="100%"
                />
              </GoogleOAuthProvider>
            )}

            {process.env.NEXT_PUBLIC_APPLE_CLIENT_ID && (
              <Button
                type="button"
                className="w-full"
                onClick={handleAppleSignIn}
              >
                <svg
                  className="w-5 h-5 mr-2"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Continue with Apple
              </Button>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with email
              </span>
            </div>
          </div>

          {/* Magic Code Form */}
          {!sentEmail ? (
            <form onSubmit={handleMagicCodeSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Sending..." : "Send Magic Code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter the code from your email"
                  required
                  autoFocus
                />
                <p className="text-sm text-muted-foreground">
                  We sent a verification code to <strong>{sentEmail}</strong>
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Verifying..." : "Verify Code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setSentEmail("")}
              >
                Back to email
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter>
          <p className="text-center text-sm text-muted-foreground w-full">
            Don't have an account?{" "}
            <Link
              href="/auth/sign-up"
              className="font-medium text-primary hover:underline"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

"use client";

/**
 * Auth Provider
 * 
 * Wraps the app with NextAuth session provider.
 * 
 * @module src/components/providers/AuthProvider
 */

import { SessionProvider } from "next-auth/react";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}

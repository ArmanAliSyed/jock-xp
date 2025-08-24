import React from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

export default function ProtectedRoute({
  session,
  children,
}: {
  session: Session | null | undefined; // undefined = still loading
  children: React.ReactNode;
}) {
  if (session === undefined) {
    // still checking auth
    return <div style={{ textAlign: "center" }}>Loading…</div>;
  }
  if (!session) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

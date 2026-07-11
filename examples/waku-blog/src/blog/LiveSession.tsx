"use client";
import { useEffect } from "react";
import { adoptSessionId } from "rxfy-client";
import { live } from "./live-client";

/**
 * Binds this page render's server-minted session to the tab's live socket. Each RSC render mints
 * a fresh session and registers what it served under it; adopting it here (1) re-hellos the
 * transport so pushes route to this tab, and (2) makes `sessionHeaders()` carry it on client
 * refetches, which re-register under the same session.
 */
export function LiveSession({ session }: { session: string }) {
  useEffect(() => {
    if (!live) return;
    adoptSessionId(session);
    live.transport.hello(session);
  }, [session]);
  return null;
}

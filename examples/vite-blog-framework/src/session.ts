import { readSsrSession } from "rxfy-react";

/** This page load's live session: adopted from the SSR payload, or minted fresh for client-only loads. */
export const sessionId = readSsrSession() ?? crypto.randomUUID();

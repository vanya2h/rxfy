"use client";
import { BlogProvider } from "examples-shared";
import { parseResponse } from "hono/client";
import { useMemo } from "react";
import { StoreProvider } from "rxfy-react";
import { useRouter } from "waku";
import { api } from "./blog/api-client";
import { sync } from "./blog/sync-client";

export function RxfyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const blog = useMemo(
    () => ({
      navigate: (path: string) => router.push(path as Parameters<typeof router.push>[0]),
      onAddComment: (postId: string, input: { name: string; body: string }) =>
        parseResponse(api.posts[":id"].comments.$post({ param: { id: postId }, json: input })),
    }),
    [router],
  );
  return (
    // In the browser the registry + sync client come from the live singleton, so patch/stale
    // messages land in the same stores the views read; during SSR `live` is undefined and
    // StoreProvider creates its own per-render registry.
    <StoreProvider ssr registry={sync?.registry} syncClient={sync?.syncClient}>
      <BlogProvider value={blog}>{children}</BlogProvider>
    </StoreProvider>
  );
}

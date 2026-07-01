"use client";
import { BlogProvider } from "examples-shared";
import { useMemo } from "react";
import { StoreProvider } from "rxfy-react";
import { useRouter } from "waku";
import { addCommentRpc } from "./blog/fetchers";

export function RxfyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const blog = useMemo(
    () => ({
      navigate: (path: string) => router.push(path as Parameters<typeof router.push>[0]),
      onAddComment: (postId: string, input: { name: string; body: string }) => addCommentRpc(postId, input),
    }),
    [router],
  );
  return (
    <StoreProvider ssr>
      <BlogProvider value={blog}>{children}</BlogProvider>
    </StoreProvider>
  );
}

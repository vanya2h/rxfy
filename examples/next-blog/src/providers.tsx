"use client";
import { BlogProvider } from "examples-shared";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { StoreProvider } from "rxfy-react";
import { HydrationStream } from "rxfy-react/next";
import { addCommentRpc } from "./blog/fetchers";

export function RxfyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const blog = useMemo(
    () => ({
      navigate: (path: string) => router.push(path),
      onAddComment: (postId: string, input: { name: string; body: string }) => addCommentRpc(postId, input),
    }),
    [router],
  );
  return (
    <StoreProvider ssr>
      <HydrationStream />
      <BlogProvider value={blog}>{children}</BlogProvider>
    </StoreProvider>
  );
}

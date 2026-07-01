"use client";
import { createContext, type ReactNode, useContext } from "react";
import { type Comment } from "../data/models.js";

export type BlogContextValue = {
  navigate: (path: string) => void;
  onAddComment: (postId: string, input: { name: string; body: string }) => void | Comment | Promise<void | Comment>;
};

const BlogContext = createContext<BlogContextValue | null>(null);

export function BlogProvider({ value, children }: { value: BlogContextValue; children: ReactNode }) {
  return <BlogContext.Provider value={value}>{children}</BlogContext.Provider>;
}

export function useBlog(): BlogContextValue {
  const ctx = useContext(BlogContext);
  if (!ctx) throw new Error("BlogProvider not found");
  return ctx;
}

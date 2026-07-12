import { BlogProvider } from "examples-shared";
import { parseResponse } from "hono/client";
import { useMemo } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useNavigate } from "react-router";
import { useApi } from "./blog/api-client";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>rxfy + React Router 7</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div className="container mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">{children}</div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const navigate = useNavigate();
  const api = useApi();
  const blog = useMemo(
    () => ({
      navigate: (path: string) => navigate(path),
      onAddComment: (postId: string, input: { name: string; body: string }) =>
        parseResponse(api.posts[":id"].comments.$post({ param: { id: postId }, json: input })),
    }),
    [navigate, api],
  );
  return (
    <BlogProvider value={blog}>
      <Outlet />
    </BlogProvider>
  );
}

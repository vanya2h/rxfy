export type Capability = "sync-blog" | "sync-todos";

export type Target = {
  /** Playwright project name + baseURL host label. */
  name: string;
  /** pnpm --filter package name. */
  filter: string;
  capability: Capability;
  /** Fixed, unique HTTP port. */
  port: number;
  /** webServer command (reuses the app's own prod script). */
  command: string;
  /** Extra env for the server process. */
  env: Record<string, string>;
};

// Any non-empty secret works; it only has to match between the HTTP side and the WS server, which
// both read RXFY_SECRET from the same process env.
const RXFY_SECRET = process.env.RXFY_SECRET ?? "e2e-secret";

export const targets: Target[] = [
  {
    name: "next-blog",
    filter: "rxfy-example-next-blog",
    capability: "sync-blog",
    port: 4301,
    command: "pnpm --filter rxfy-example-next-blog start",
    env: { PORT: "4301", RXFY_SECRET },
  },
  {
    name: "rr7-blog",
    filter: "rxfy-example-rr7-blog",
    capability: "sync-blog",
    port: 4302,
    command: "pnpm --filter rxfy-example-rr7-blog start",
    env: { PORT: "4302", RXFY_SECRET },
  },
  {
    name: "vite-blog",
    filter: "vite-blog",
    capability: "sync-blog",
    port: 4303,
    command: "pnpm --filter vite-blog preview",
    env: { PORT: "4303", RXFY_SECRET },
  },
  {
    name: "waku-blog",
    filter: "rxfy-example-waku-blog",
    capability: "sync-blog",
    port: 4304,
    // waku takes a --port flag, not PORT; its browser WS is pinned to 8090 (leave it default).
    command: "pnpm --filter rxfy-example-waku-blog exec waku start --port 4304",
    env: { NODE_ENV: "production", RXFY_SECRET },
  },
  {
    name: "template-vite",
    filter: "rxfy-template-vite",
    capability: "sync-todos",
    port: 4305,
    command: "pnpm --filter rxfy-template-vite preview",
    env: { PORT: "4305", RXFY_SECRET },
  },
  {
    name: "template-next",
    filter: "rxfy-template-next",
    capability: "sync-todos",
    port: 4306,
    command: "pnpm --filter rxfy-template-next start",
    env: { PORT: "4306", RXFY_SECRET },
  },
];

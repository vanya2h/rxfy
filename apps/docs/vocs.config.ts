import { Changelog, defineConfig } from "vocs/config";

// Stamped once per build; versions every OG URL so external caches (scrapers,
// CDNs) refetch after each deploy while responses stay immutable.
const buildId = Date.now().toString(36);

export default defineConfig({
  title: "rxfy",
  description:
    "A reactive data-flow layer for your UI: typed models, states, and normalized stores as RxJS Observables.",
  baseUrl: "https://rxfy.vanya2h.me",
  ogImageUrl: `https://rxfy.vanya2h.me/og?title=%title&description=%description&v=${buildId}`,
  iconUrl: "/rxfy-icon-tile.svg",
  // The changelog list is fetched from GitHub Releases at `vocs build` time and
  // baked into the static page, so it only refreshes when this build actually
  // re-runs. Unauthenticated the fetch is capped at 60 req/hr per IP and a 403
  // makes `fetchChangelog` throw, emptying the whole changelog — tolerable only
  // because builds are rare. Note Railway service variables are NOT passed to
  // Dockerfile builds, so setting GITHUB_TOKEN there does nothing; it would have
  // to arrive as a docker build arg for this to pick it up.
  changelog: Changelog.github({ repo: "vanya2h/rxfy", token: process.env.GITHUB_TOKEN }),
  sidebar: [
    { text: "Introduction", link: "/" },
    { text: "Comparison", link: "/comparison" },
    { text: "Inspired by", link: "/inspired-by" },
    { text: "Agent Skills", link: "/agent-skills" },
    { text: "Examples", link: "/examples" },
    { text: "Changelog", link: "/changelog" },

    {
      text: "Getting Started",
      link: "/getting-started",
      items: [
        { text: "Create Store", link: "/getting-started/create-store" },
        { text: "Add SSR", link: "/getting-started/add-ssr" },
        { text: "Add Sync Client", link: "/getting-started/add-sync-client" },
      ],
    },

    {
      text: "Core Concepts",
      link: "/core-concepts",
      items: [
        { text: "Observables", link: "/core-concepts/observables" },
        { text: "Normalization", link: "/core-concepts/normalization" },
        { text: "Late Unwrapping", link: "/core-concepts/late-unwrapping" },
        { text: "Server-Side Rendering", link: "/core-concepts/ssr" },
      ],
    },

    {
      text: "rxfy",
      link: "/rxfy",
      items: [
        { text: "createModel", link: "/rxfy/create-model" },
        { text: "defineState", link: "/rxfy/define-state" },
        { text: "createAtom", link: "/rxfy/create-atom" },
        { text: "createLens", link: "/rxfy/create-lens" },
      ],
    },

    {
      text: "rxfy-react",
      link: "/react",
      items: [
        { text: "useStateData", link: "/react/use-state-data" },
        { text: "useStatePagedData", link: "/react/use-state-paged-data" },
        { text: "useModelStore", link: "/react/use-model-store" },
        { text: "useAtom", link: "/react/use-atom" },
        { text: "Pending", link: "/react/pending" },
        { text: "usePending", link: "/react/use-pending" },
        { text: "useObservable", link: "/react/use-observable" },
        { text: "Sync Client (React)", link: "/react/sync-client" },
      ],
    },

    {
      text: "rxfy-client",
      link: "/framework/client",
      items: [
        { text: "createSyncClient", link: "/framework/client/create-sync-client" },
        { text: "readSsrGrants", link: "/framework/client/read-ssr-grants" },
      ],
    },

    {
      text: "rxfy-server",
      link: "/framework/server",
      items: [
        { text: "defineResource", link: "/framework/server/define-resource" },
        { text: "createSync", link: "/framework/server/create-server" },
        { text: "createInMemoryHub", link: "/framework/server/hub" },
        { text: "Writes", link: "/framework/server/writes" },
        { text: "Storage adapters", link: "/framework/server/storage-adapters" },
        { text: "Sync messages", link: "/framework/server/messages" },
        { text: "Grants", link: "/framework/server/grants" },
      ],
    },

    {
      text: "rxfy-ws",
      link: "/framework/ws",
      items: [
        { text: "createWsServer", link: "/framework/ws/server" },
        { text: "createWsClient", link: "/framework/ws/client" },
        { text: "Custom transports", link: "/framework/ws/custom-transport" },
      ],
    },

    {
      text: "Guides",
      link: "/guides",
      items: [{ text: "Pagination and infinite scroll", link: "/guides/pagination" }],
    },
  ],
});

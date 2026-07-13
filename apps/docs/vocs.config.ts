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
  changelog: Changelog.github({ repo: "vanya2h/rxfy" }),
  sidebar: [
    { text: "Introduction", link: "/" },
    { text: "Comparison", link: "/comparison" },
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
      text: "React Bindings",
      link: "/react",
      items: [
        { text: "useStateData", link: "/react/use-state-data" },
        { text: "useStatePagedData", link: "/react/use-state-paged-data" },
        { text: "useModelStore", link: "/react/use-model-store" },
        { text: "useAtom", link: "/react/use-atom" },
        { text: "Pending", link: "/react/pending" },
        { text: "usePending", link: "/react/use-pending" },
        { text: "useObservable", link: "/react/use-observable" },
        { text: "createLiveClient", link: "/react/live-client" },
      ],
    },

    {
      text: "rxfy-server",
      link: "/framework/server",
      items: [
        { text: "defineResource", link: "/framework/server/define-resource" },
        { text: "createLive", link: "/framework/server/create-server" },
        { text: "Writes", link: "/framework/server/writes" },
        { text: "Sync messages", link: "/framework/server/messages" },
        { text: "Grants", link: "/framework/server/grants" },
        { text: "createInMemoryHub", link: "/framework/server/hub" },
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
      items: [
        { text: "Build a Todo app", link: "/guides/todo-app" },
        { text: "Pagination and infinite scroll", link: "/guides/pagination" },
        { text: "Sync blog", link: "/guides/sync-blog" },
      ],
    },
  ],
});

import { Changelog, defineConfig } from "vocs/config";

export default defineConfig({
  title: "rxfy",
  description: "A reactive data-flow layer for your UI: typed models, states, and normalized stores as RxJS Observables.",
  logoUrl: { light: "/rxfy-mark.svg", dark: "/rxfy-mark-white.svg" },
  iconUrl: "/rxfy-icon-tile.svg",
  changelog: Changelog.github({ repo: "vanya2h/rxfy" }),
  sidebar: [
    { text: "Introduction", link: "/" },
    { text: "Why rxfy?", link: "/why" },
    { text: "Comparison", link: "/comparison" },
    {
      text: "Getting Started",
      link: "/getting-started",
      items: [
        { text: "Store quickstart", link: "/getting-started/store" },
        { text: "Framework quickstart", link: "/getting-started/framework" },
      ],
    },
    { text: "Agent Skills", link: "/agent-skills" },
    { text: "Examples", link: "/examples" },
    { text: "Changelog", link: "/changelog" },

    {
      text: "Core Concepts",
      link: "/core-concepts",
      items: [
        { text: "Normalization", link: "/core-concepts/normalization" },
        { text: "Model", link: "/core-concepts/model" },
        { text: "State", link: "/core-concepts/state" },
        { text: "Atom", link: "/core-concepts/atom" },
        { text: "Lens", link: "/core-concepts/lens" },
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
        { text: "Live client", link: "/react/live-client" },
      ],
    },

    { text: "Server-Side Rendering", link: "/ssr" },

    {
      text: "Framework (Real-time)",
      link: "/framework",
      items: [
        { text: "rxfy-server", link: "/framework/server" },
        { text: "rxfy-protocol", link: "/framework/protocol" },
        { text: "rxfy-ws", link: "/framework/ws" },
        { text: "Grants & live hydration", link: "/framework/grants" },
      ],
    },

    {
      text: "Guides",
      link: "/guides",
      items: [
        { text: "Build a Todo app", link: "/guides/todo-app" },
        { text: "Pagination and infinite scroll", link: "/guides/pagination" },
        { text: "Live blog", link: "/guides/live-blog" },
      ],
    },
  ],
});

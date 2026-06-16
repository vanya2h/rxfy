import { defineConfig } from "vocs/config";

export default defineConfig({
  title: "rxfy",
  description: "A small library for typed, normalized and reactive state. Built on RxJS.",
  logoUrl: { light: "/rxfy-lockup.svg", dark: "/rxfy-lockup-white.svg" },
  iconUrl: "/rxfy-icon-tile.svg",
  sidebar: [
    { text: "Introduction", link: "/" },
    { text: "Why rxfy?", link: "/why" },
    { text: "Getting Started", link: "/getting-started" },
    { text: "Agent Skills", link: "/agent-skills" },
    { text: "Comparison", link: "/comparison" },
    { text: "Examples", link: "/examples" },

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
      ],
    },

    {
      text: "Guides",
      link: "/guides",
      items: [
        { text: "Server-Side Rendering", link: "/ssr" },
        { text: "Build a Todo app", link: "/guides/todo-app" },
        { text: "Pagination and infinite scroll", link: "/guides/pagination" },
        { text: "Live updates over WebSockets", link: "/guides/live-updates-websockets" },
      ],
    },
  ],
});

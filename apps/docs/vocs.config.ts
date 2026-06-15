import { defineConfig } from "vocs/config";

export default defineConfig({
  title: "rxfy",
  description: "A small library for typed, normalized and reactive state. Built on RxJS.",
  sidebar: [
    { text: "Introduction", link: "/" },
    { text: "Getting Started", link: "/getting-started" },

    { text: "Comparison", link: "/comparison" },
    {
      text: "Core Concepts",
      items: [
        { text: "Model", link: "/core-concepts/model" },
        { text: "State", link: "/core-concepts/state" },
        { text: "Atom", link: "/core-concepts/atom" },
        { text: "Lens", link: "/core-concepts/lens" },
      ],
    },
    { text: "Normalization", link: "/normalization" },
    { text: "React Bindings", link: "/react" },
    { text: "Server-Side Rendering", link: "/ssr" },
    {
      text: "Guides",
      items: [
        { text: "Build a Todo app", link: "/guides/todo-app" },
        { text: "Pagination and infinite scroll", link: "/guides/pagination" },
        { text: "Live updates over WebSockets", link: "/guides/live-updates-websockets" },
      ],
    },
  ],
});

import { defineConfig } from "vocs/config";

export default defineConfig({
  title: "rxfy",
  description: "Stream-based state management built on RxJS",
  sidebar: [
    { text: "Introduction", link: "/" },
    { text: "Getting Started", link: "/getting-started" },
    { text: "Tutorial: Build a Todo app", link: "/tutorial" },
    { text: "Comparison", link: "/comparison" },
    {
      text: "Core Concepts",
      items: [
        { text: "Atom", link: "/core-concepts/atom" },
        { text: "Lens", link: "/core-concepts/lens" },
        { text: "Wrapped", link: "/core-concepts/wrapped" },
      ],
    },
    { text: "Normalization", link: "/normalization" },
    { text: "Models & State", link: "/models-state" },
    { text: "React Bindings", link: "/react" },
    { text: "Server-Side Rendering", link: "/ssr" },
    {
      text: "Guides",
      items: [
        { text: "Two-way form binding", link: "/guides/form-binding" },
        { text: "Optimistic mutations", link: "/guides/optimistic-mutations" },
        { text: "Pagination and infinite scroll", link: "/guides/pagination" },
        { text: "Live updates over WebSockets", link: "/guides/live-updates-websockets" },
      ],
    },
  ],
});

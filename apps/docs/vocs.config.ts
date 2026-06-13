import { defineConfig } from "vocs/config";

export default defineConfig({
  title: "rxfy",
  description: "Stream-based state management built on RxJS",
  sidebar: [
    { text: "Introduction", link: "/" },
    { text: "Getting Started", link: "/getting-started" },
    {
      text: "Core Concepts",
      items: [
        { text: "Atom", link: "/core-concepts/atom" },
        { text: "Lens", link: "/core-concepts/lens" },
        { text: "Wrapped", link: "/core-concepts/wrapped" },
      ],
    },
    { text: "Models & State", link: "/models-state" },
    { text: "React Bindings", link: "/react" },
    { text: "Server-Side Rendering", link: "/ssr" },
  ],
});

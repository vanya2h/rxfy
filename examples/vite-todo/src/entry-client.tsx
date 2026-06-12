import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { StoreProvider } from "rxfy-react";
import App from "./App";
import { parseFilter } from "./todos.ts";
import "./index.css";

// hydration state arrives via the server-injected window.__RXFY_SSR__ script —
// StoreProvider ingests it automatically, no wiring needed here
const filter = parseFilter(new URLSearchParams(window.location.search).get("filter"));

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider ssr>
      <App initialFilter={filter} />
    </StoreProvider>
  </StrictMode>,
);

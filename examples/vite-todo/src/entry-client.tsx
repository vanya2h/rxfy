import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import type { DehydratedState } from "rxfy";
import { StoreProvider } from "rxfy-react";
import App from "./App";
import { parseFilter } from "./todos.ts";
import "./index.css";

declare global {
  interface Window {
    __RXFY_STATE__?: DehydratedState;
  }
}

// must match the server's parsing exactly — hydration compares the rendered HTML byte for byte
const filter = parseFilter(new URLSearchParams(window.location.search).get("filter"));

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider ssr dehydratedState={window.__RXFY_STATE__}>
      <App initialFilter={filter} />
    </StoreProvider>
  </StrictMode>,
);

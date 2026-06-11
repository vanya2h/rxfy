import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import type { DehydratedState } from "rxfy";
import { StoreProvider } from "rxfy-react";
import App from "./App";
import "./index.css";

declare global {
  interface Window {
    __RXFY_STATE__?: DehydratedState;
  }
}

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider ssr dehydratedState={window.__RXFY_STATE__}>
      <App />
    </StoreProvider>
  </StrictMode>,
);

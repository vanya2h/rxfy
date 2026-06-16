import "./index.css";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { StoreProvider } from "rxfy-react";
import App from "./App.tsx";

// Hydration state arrives via the server-injected window.__RXFY_SSR__ script —
// StoreProvider ingests it automatically.
hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider ssr>
      <App />
    </StoreProvider>
  </StrictMode>,
);

import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { StoreProvider } from "rxfy-react";
import App from "./App";
import "./index.css";

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StoreProvider } from "rxfy-react";
import App from "./App";

export function render(_url: string) {
  const html = renderToString(
    <StrictMode>
      <StoreProvider>
        <App />
      </StoreProvider>
    </StrictMode>,
  );
  return { html };
}

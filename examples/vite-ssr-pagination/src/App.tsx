import { Suspense } from "react";
import { Users } from "./Users.tsx";

export default function App() {
  return (
    <main className="app">
      <header>
        <h1>Users directory</h1>
        <p className="subtitle">SSR + normalized pagination with rxfy</p>
      </header>
      {/* The SSR fetches suspend inside this boundary. The server pipes on onAllReady, so the
          sent HTML is fully resolved (renders without JS); flip it to onShellReady and this
          fallback streams first instead. */}
      <Suspense fallback={<p className="status">Loading users…</p>}>
        <Users />
      </Suspense>
    </main>
  );
}

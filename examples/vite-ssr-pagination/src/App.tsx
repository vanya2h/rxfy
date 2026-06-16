import { Users } from "./Users.tsx";

export default function App() {
  return (
    <main className="app">
      <header>
        <h1>Users directory</h1>
        <p className="subtitle">Streaming SSR + normalized pagination with rxfy</p>
      </header>
      <Users />
    </main>
  );
}

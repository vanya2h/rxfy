import { Link, Route, Routes } from "react-router";
import { TodosPage } from "./pages/TodosPage.js";

export function App() {
  return (
    <main>
      <header>
        <Link to="/">rxfy live todos</Link>
      </header>
      <Routes>
        <Route path="/" element={<TodosPage />} />
        <Route path="*" element={<p>Not found.</p>} />
      </Routes>
    </main>
  );
}

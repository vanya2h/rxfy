import { Link, Route, Routes } from "react-router";
import { AboutPage } from "./pages/AboutPage.js";
import { TodosPage } from "./pages/TodosPage.js";

export function App() {
  return (
    <main>
      <header>
        <Link to="/">rxfy live todos</Link>
        <Link to="/about">About</Link>
      </header>
      <Routes>
        <Route path="/" element={<TodosPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<p>Not found.</p>} />
      </Routes>
    </main>
  );
}

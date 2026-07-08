import { HydrateSnapshot } from "../components/HydrateSnapshot";
import { TodosView } from "../components/TodosView";
import { prefetch } from "../lib/ssr";
import { fetchTodos, todosState } from "../lib/todos";

// Server Component: fetch on the server, dehydrate, and pass the snapshot to the client so the
// store is seeded before TodosView reads it. This is the RSC alternative to <HydrationStream />.
export default async function HomePage() {
  const snapshot = await prefetch(todosState, fetchTodos, {});
  return (
    <>
      <HydrateSnapshot snapshot={snapshot} />
      <TodosView />
    </>
  );
}

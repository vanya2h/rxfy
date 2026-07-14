import { TodosView } from "../components/TodosView";
import { serveTodos } from "../server/todos-service";

// Each read is served with a freshly signed, time-limited channel grant, so the payload varies per
// request — the page can't be statically prerendered.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // RSC reads the service directly (no self-fetch). The payload carries a `$grant`; it rides down as
  // defaultData, and the browser's sync client lifts the grant and subscribes.
  const todos = await serveTodos();
  return <TodosView defaultData={todos} />;
}

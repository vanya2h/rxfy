import { listTodos } from "../../../lib/store";

// Backs the client branch of fetchTodos (the server branch reads the store directly).
export function GET() {
  return Response.json({ todos: listTodos() });
}

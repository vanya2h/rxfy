import { createTodo, serveTodos } from "../../../server/todos-service";
import { CreateTodoInputSchema } from "../../../todos";

// GET /api/todos — read + signed grant (backs useStateData's client refetch; the RSC page calls
// serveTodos() directly). POST /api/todos — create a todo.
export async function GET() {
  return Response.json(await serveTodos());
}

export async function POST(req: Request) {
  const parsed = CreateTodoInputSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  return Response.json(await createTodo(parsed.data.title));
}

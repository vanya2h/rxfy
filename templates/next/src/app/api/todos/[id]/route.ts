import { toggleTodo } from "../../../../server/todos-service";
import { UpdateTodoInputSchema } from "../../../../todos";

// PATCH /api/todos/:id — toggle done; sync.update broadcasts an entity patch to subscribed tabs.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = UpdateTodoInputSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const row = await toggleTodo(id, parsed.data.done);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}

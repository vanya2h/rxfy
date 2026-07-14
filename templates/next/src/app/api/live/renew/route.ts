import { renewGrants } from "../../../../server/todos-service";

// POST /api/live/renew — the sync client posts grants nearing expiry; reissue each so long-lived
// tabs keep receiving updates.
export async function POST(req: Request) {
  const { grants } = (await req.json()) as { grants: string[] };
  return Response.json({ grants: renewGrants(grants) });
}

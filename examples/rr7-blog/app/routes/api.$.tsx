import { app } from "../server/app";
import type { Route } from "./+types/api.$";

export const loader = ({ request }: Route.LoaderArgs) => app.fetch(request);
export const action = ({ request }: Route.ActionArgs) => app.fetch(request);

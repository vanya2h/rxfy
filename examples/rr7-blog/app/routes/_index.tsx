import { redirect } from "react-router";

export function loader() {
  // Routing concern only — no domain data is fetched here. rxfy owns data.
  return redirect("/posts");
}

export default function Index() {
  return null;
}

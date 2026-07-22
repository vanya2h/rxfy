import { asKey } from "rxfy";
import { useAtom, useModelStore } from "rxfy-react";
import { userModel } from "./users.ts";

/** Subscribes to a single user entity by id — re-renders only when that user changes. */
export function UserRow({ id }: { id: string }) {
  const store = useModelStore(userModel);
  const [user] = useAtom(store.get(asKey(userModel, id)));

  return (
    <li className="user-row">
      <span className="avatar" aria-hidden="true">
        {user.initials}
      </span>
      <span className="user-text">
        <span className="user-name">{user.name}</span>
        <span className="user-email">{user.email}</span>
      </span>
    </li>
  );
}

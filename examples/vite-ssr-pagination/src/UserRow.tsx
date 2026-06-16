import { useMemo } from "react";
import { Pending } from "rxfy-react";
import { useUserStore } from "./users.ts";

/** Subscribes to a single user entity by id — re-renders only when that user changes. */
export function UserRow({ id }: { id: string }) {
  const store = useUserStore();
  const user$ = useMemo(() => store.get(id), [store, id]);

  return (
    <Pending value$={user$}>
      {(user) => (
        <li className="user-row">
          <span className="avatar" aria-hidden="true">
            {user.initials}
          </span>
          <span className="user-text">
            <span className="user-name">{user.name}</span>
            <span className="user-email">{user.email}</span>
          </span>
        </li>
      )}
    </Pending>
  );
}

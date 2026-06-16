import { useMemo, useState } from "react";
import { Pending, useStatePagedData } from "rxfy-react";
import { fetchUsers } from "./api.ts";
import { LoadMoreSentinel } from "./LoadMoreSentinel.tsx";
import { UserRow } from "./UserRow.tsx";
import { usersState } from "./users.ts";

type Mode = "scroll" | "click";

export function Users() {
  // Stable params → one query identity → loadMore accumulates a single growing list.
  const params = useMemo(() => ({}), []);

  // How the next page loads — pure view state, defaults to "scroll" on both server and client.
  const [mode, setMode] = useState<Mode>("scroll");

  // Page 0 is SSR'd + cached + hydrated through useStateData; loadMore pages are client-only.
  // Offset cursor = number of rows already loaded (`ids.users.length`) — hydration-safe and
  // does not depend on page 0 re-running on the client. The list is infinite (no `hasMore`).
  const { data$, loadMore, isLoading } = useStatePagedData({
    state: usersState,
    params,
    initial: { users: [] },
    fetchPage: ({ cursor }) => fetchUsers(cursor === 0 ? null : String(cursor)),
    getCursor: ({ ids }) => ids.users.length,
    merge: ({ prev, page }) => ({ users: [...prev.users, ...page.items] }),
  });

  return (
    <>
      <div className="mode-toggle" role="group" aria-label="How to load more users">
        <button className={mode === "scroll" ? "active" : ""} onClick={() => setMode("scroll")}>
          Infinite scroll
        </button>
        <button className={mode === "click" ? "active" : ""} onClick={() => setMode("click")}>
          Load on click
        </button>
      </div>

      <Pending value$={data$} pending={<p className="status">Loading users…</p>}>
        {({ users }) => (
          <>
            <ul className="user-list">
              {users.map((id) => (
                <UserRow key={id} id={id} />
              ))}
            </ul>
            {mode === "click" ? (
              <button className="load-more" onClick={() => loadMore()} disabled={isLoading}>
                {isLoading ? "Loading…" : "Load more"}
              </button>
            ) : (
              <>
                {isLoading && <p className="status">Loading…</p>}
                {/* Fresh closure each render keeps re-arming the observer after every load. */}
                <LoadMoreSentinel onVisible={() => loadMore()} />
              </>
            )}
          </>
        )}
      </Pending>
    </>
  );
}

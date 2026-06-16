import { useCallback, useMemo, useRef, useState } from "react";
import { Pending, useStateData } from "rxfy-react";
import { fetchUsers } from "./api.ts";
import { LoadMoreSentinel } from "./LoadMoreSentinel.tsx";
import { UserRow } from "./UserRow.tsx";
import { usersState } from "./users.ts";

type Mode = "scroll" | "click";

export function Users() {
  // Stable params → one query identity → manual `set` accumulates a single list.
  const params = useMemo(() => ({}), []);

  // How the next page loads — pure view state, defaults to "scroll" on both server and client.
  const [mode, setMode] = useState<Mode>("scroll");

  // First page goes through useStateData (SSR'd + cached + hydrated).
  const fetchFirst = useCallback(async () => {
    const page = await fetchUsers(null);
    return { users: page.items };
  }, []);

  const { data$, set } = useStateData(usersState, fetchFirst, params);

  const loading = useRef(false);
  const [isLoading, setIsLoading] = useState(false);

  // offset === number of rows already loaded (offset-based cursor, hydration-safe:
  // it does not depend on fetchFirst running on the client). The list is infinite, so there
  // is no "end" — every load fetches the next page.
  const loadMore = useCallback(
    async (offset: number) => {
      if (loading.current) return;
      loading.current = true;
      setIsLoading(true);
      try {
        const page = await fetchUsers(String(offset));
        set((prev) => ({ users: [...prev.users, ...page.items] }));
      } finally {
        loading.current = false;
        setIsLoading(false);
      }
    },
    [set],
  );

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
              <button className="load-more" onClick={() => loadMore(users.length)} disabled={isLoading}>
                {isLoading ? "Loading…" : "Load more"}
              </button>
            ) : (
              <>
                {isLoading && <p className="status">Loading…</p>}
                {/*
                  `onVisible` is intentionally a fresh closure each render so it always sees the
                  current `users.length`. That re-arms the sentinel's observer after every load,
                  so it keeps paging while it stays in view — `loading.current` is the guard that
                  keeps those repeats from overlapping.
                */}
                <LoadMoreSentinel onVisible={() => loadMore(users.length)} />
              </>
            )}
          </>
        )}
      </Pending>
    </>
  );
}

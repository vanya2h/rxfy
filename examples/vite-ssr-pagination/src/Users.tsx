import { useMemo, useState } from "react";
import { Pending, useStateData, useStatePagedData } from "rxfy-react";
import { fetchUsers, fetchUsersHeader } from "./api.ts";
import { LoadMoreSentinel } from "./LoadMoreSentinel.tsx";
import { UserRow } from "./UserRow.tsx";
import { userModel, usersHeaderState, useUserStore } from "./users.ts";

type Mode = "scroll" | "click";

/** Renders the header line — entity (topUser name via store) + plain value (meta). */
function UsersHeaderLine() {
  const headerParams = useMemo(() => ({}), []);
  const { data$ } = useStateData({
    state: usersHeaderState,
    fetchFn: fetchUsersHeader,
    params: headerParams,
  });
  const store = useUserStore();

  return (
    <Pending value$={data$} pending={<p className="status">Loading header…</p>}>
      {({ topUser: topUserId, meta }) => {
        // topUser is a normalized id — look up the real entity from the store synchronously.
        const user = store.getValue(topUserId);
        const name = user?.name ?? topUserId;
        const time = new Date(meta.generatedAt).toLocaleTimeString();
        return (
          <p className="header-caption">
            Top: <strong>{name}</strong> · {meta.total} users · loaded {time}
          </p>
        );
      }}
    </Pending>
  );
}

export function Users() {
  // Stable params → one query identity → loadMore accumulates a single growing list.
  const params = useMemo(() => ({}), []);

  // How the next page loads — pure view state, defaults to "scroll" on both server and client.
  const [mode, setMode] = useState<Mode>("scroll");

  // Page 0 is SSR'd + cached + hydrated through useStateData; loadMore pages are client-only.
  // Offset cursor = number of rows already loaded (`ids.length`) — hydration-safe and does not
  // depend on page 0 re-running on the client. The list is infinite (no `hasMore`).
  const { data$, loadMore, isLoading } = useStatePagedData({
    model: userModel,
    key: "users",
    params,
    fetchPage: ({ cursor }) => fetchUsers(cursor === 0 ? null : String(cursor)),
    getCursor: ({ ids }) => ids.length,
    select: ({ page }) => page.items,
  });

  return (
    <>
      <UsersHeaderLine />

      <div className="mode-toggle" role="group" aria-label="How to load more users">
        <button className={mode === "scroll" ? "active" : ""} onClick={() => setMode("scroll")}>
          Infinite scroll
        </button>
        <button className={mode === "click" ? "active" : ""} onClick={() => setMode("click")}>
          Load on click
        </button>
      </div>

      <Pending value$={data$} pending={<p className="status">Loading users…</p>}>
        {(ids) => (
          <>
            <ul className="user-list">
              {ids.map((id) => (
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

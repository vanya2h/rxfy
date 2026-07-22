import { parseResponse } from "hono/client";
import { useMemo, useState } from "react";
import { asKey } from "rxfy";
import { Pending, useAtom, useModelStore, useStateData, useStatePagedData } from "rxfy-react";
import { useApi } from "./api-client.tsx";
import { LoadMoreSentinel } from "./LoadMoreSentinel.tsx";
import { UserRow } from "./UserRow.tsx";
import { userModel, usersHeaderState } from "./users.ts";

type Mode = "scroll" | "click";

/** Subscribes to the top user entity — the id comes normalized out of the header state. */
function TopUserName({ id }: { id: string }) {
  const store = useModelStore(userModel);
  const [user] = useAtom(store.get(asKey(userModel, id)));
  return <strong>{user.name}</strong>;
}

/** Renders the header line — entity (topUser name via store) + plain value (meta). */
function UsersHeaderLine() {
  const api = useApi();
  const headerParams = useMemo(() => ({}), []);
  const { data$ } = useStateData({
    state: usersHeaderState,
    fetchFn: () => parseResponse(api["users-header"].$get()),
    params: headerParams,
  });

  return (
    <Pending value$={data$} pending={<p className="status">Loading header…</p>}>
      {({ topUser: topUserId, meta }) => (
        <p className="header-caption">
          Top: <TopUserName id={topUserId} /> · {meta.total} users · loaded{" "}
          {new Date(meta.generatedAt).toLocaleTimeString()}
        </p>
      )}
    </Pending>
  );
}

export function Users() {
  const api = useApi();
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
    fetchPage: ({ cursor }) => parseResponse(api.users.$get({ query: cursor === 0 ? {} : { cursor: String(cursor) } })),
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

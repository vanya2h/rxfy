---
"rxfy-react": patch
---

Fix `useStateData` latching a spurious `REJECTED` (and surfacing an `AbortError`) when a
component unmounts before its initial fetch settles — most visibly under React StrictMode,
where the synchronous mount→unmount→mount aborted the in-flight fetch and the remount never
refetched. The client fetch is now multicast with a deferred ref-count reset, so an immediate
re-subscription keeps the request alive, and abort-driven rejections no longer write into the
shared query atom.

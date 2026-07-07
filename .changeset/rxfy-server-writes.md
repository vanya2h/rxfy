---
"rxfy-server": minor
---

Add the server core: `createInMemoryHub` (pub/sub), `createServer` write functions (`update`/`create`/`delete`/`touch`) that persist via Drizzle and broadcast over the hub, and `grant` (mint hashed topic ids for a response's entities and state channels).

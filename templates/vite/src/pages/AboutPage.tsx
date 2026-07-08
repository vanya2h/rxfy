export function AboutPage() {
  return (
    <section>
      <h1>About this template</h1>
      <p>
        This page exists to prove direct-URL server rendering: load <code>/about</code> with JavaScript disabled and
        the content is already in the HTML.
      </p>
      <p>
        The stack: Vite SSR, React Router, Hono, Drizzle on PGlite, and rxfy for normalized client state with live
        server-pushed updates.
      </p>
    </section>
  );
}

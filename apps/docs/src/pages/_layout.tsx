import type { ReactNode } from "react";

const GA_MEASUREMENT_ID = "G-5EQZBBESEG";

// Root layout wrapping every docs page. Used to inject the Google Analytics
// (gtag.js) tag. React 19 hoists the async loader script into <head>; the inline
// init script runs on page load to bootstrap the dataLayer queue.
//
// Loaded in production builds only (`vocs build`), never during `vocs dev`, so
// local development doesn't pollute analytics data.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      {import.meta.env.PROD && (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: standard gtag.js bootstrap snippet
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`,
            }}
          />
        </>
      )}
      {children}
    </>
  );
}

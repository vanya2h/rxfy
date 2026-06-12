import type { Metadata } from "next";
import { RxfyProvider } from "../providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "rxfy Blog",
  description: "Next.js App Router blog example using rxfy for state management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RxfyProvider>{children}</RxfyProvider>
      </body>
    </html>
  );
}

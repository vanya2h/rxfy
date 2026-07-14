import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RxfyProvider } from "../providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "rxfy + Next.js",
  description: "Next.js App Router starter using rxfy for normalized reactive state",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RxfyProvider>{children}</RxfyProvider>
      </body>
    </html>
  );
}

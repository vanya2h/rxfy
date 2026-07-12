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
        <RxfyProvider>
          <div className="container mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">{children}</div>
        </RxfyProvider>
      </body>
    </html>
  );
}

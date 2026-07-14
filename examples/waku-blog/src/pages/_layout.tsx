import { Link } from "waku";
import { RxfyProvider } from "../providers";
import "../styles.css";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RxfyProvider>
          <div className="container mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
            <header>
              <Link to="/" className="text-lg font-semibold">
                rxfy + Waku
              </Link>
            </header>
            <main>{children}</main>
          </div>
        </RxfyProvider>
      </body>
    </html>
  );
}

export const getConfig = async () => {
  return { render: "static" } as const;
};

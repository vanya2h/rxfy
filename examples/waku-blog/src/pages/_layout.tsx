import { Link } from "waku";
import { RxfyProvider } from "../providers";
import "../styles.css";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RxfyProvider>
          <div className="container">
            <header>
              <Link to="/">rxfy + Waku</Link>
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

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Practice Sheets",
  description: "Grade 1-6 practice sheet grading and review",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="/">Practice Sheets</a>
          <nav>
            <a href="/review">Review queue</a>
          </nav>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}

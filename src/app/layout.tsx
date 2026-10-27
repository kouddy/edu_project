import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import SiteNavbar from "./SiteNavbar";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

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
    <html lang="en" suppressHydrationWarning>
      <body className={`${nunito.variable} font-sans`}>
        <Providers>
          <div className="flex min-h-screen flex-col bg-background text-foreground">
            <SiteNavbar />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8 sm:px-6">
              {children}
            </main>
            <footer className="border-t border-divider bg-background">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-5 text-sm text-default-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="font-semibold text-foreground">Practice Sheets</p>
                <p>Photos stay private. Unsure answers are never guessed.</p>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}

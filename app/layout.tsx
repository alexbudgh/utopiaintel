import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chaos Intel",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isStaging = process.env.STAGING === "true";
  const commitHash = process.env.NEXT_PUBLIC_COMMIT_SHA?.slice(0, 7);
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        {isStaging && (
          <div className="bg-amber-500 text-black text-center text-sm font-semibold py-1">
            Test environment
          </div>
        )}
        {children}
        {commitHash && (
          <footer className="text-center text-xs text-gray-600 py-2">
            {commitHash}
          </footer>
        )}
      </body>
    </html>
  );
}

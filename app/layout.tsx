import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const siteTitle = process.env.NEXT_PUBLIC_SITE_TITLE || "ONO";

export const metadata: Metadata = {
  title: siteTitle,
  description: siteTitle,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased bg-white text-foreground"
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

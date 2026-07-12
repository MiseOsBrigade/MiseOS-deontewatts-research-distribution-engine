import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research Upload Console",
  description: "Securely queue research files and metadata for automated repository and Zenodo distribution.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

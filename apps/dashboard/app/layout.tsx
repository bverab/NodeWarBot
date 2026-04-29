import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spectre",
  description: "Discord-native guild operations for war, siege, and PvE events",
  icons: {
    icon: [
      {
        url: "/assets/icons/spectre-favicon.png",
        type: "image/png"
      }
    ],
    shortcut: "/assets/icons/spectre-favicon.png",
    apple: "/assets/icons/spectre-favicon.png"
  }
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

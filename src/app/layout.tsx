import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthSync } from "@/components/AuthSync";
import { Toaster } from "@/components/InstantAction";
import { OfflineBadge } from "@/components/OfflineBadge";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Property Log",
  description:
    "Your properties, rents, and expenses — one at a time or all together, with honest yearly numbers.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Property Log",
  },
};

export const viewport: Viewport = {
  themeColor: "#123F3C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthSync />
        <ServiceWorkerRegister />
        <OfflineBadge />
        {children}
        <Toaster />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthSync } from "@/components/AuthSync";
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
  title: "Till Payday",
  description:
    "Plan your paychecks, split them into buckets, and see your 12-month savings future.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Till Payday",
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
        {children}
      </body>
    </html>
  );
}

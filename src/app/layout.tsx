import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Geist_Mono, Young_Serif } from "next/font/google";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  weight: "400",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Circle Up",
  description: "Meet a few people at this event, in small groups, over a few rounds.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${atkinson.variable} ${geistMono.variable} ${youngSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

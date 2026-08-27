import type { Metadata } from "next";
import { Outfit, Lexend, IBM_Plex_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider, themeScript } from "@/components/theme-provider";
import { sidebarScript } from "@/lib/sidebar-state";
import "./globals.css";

// Outfit (display/headings) + Lexend (body) are both variable fonts, so no
// weight list — next/font ships the full axis and self-hosts the files, which
// is why there is no Google Fonts <link> or preconnect in <head> below.
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend",
});

const iBMPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "Handshake — CRM",
  description:
    "Close more deals, faster. Lead management, campaigns, and workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        outfit.variable,
        lexend.variable,
        iBMPlexMono.variable,
      )}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: sidebarScript }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

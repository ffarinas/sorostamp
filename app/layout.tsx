import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  metadataBase: new URL("https://sorostamp.com"),
  title: "Sorostamp — Turn any email into an on-chain proof",
  description:
    "Sorostamp turns any DKIM-signed email into a zero-knowledge proof, verified on Stellar — proving a real-world fact without revealing the email.",
  icons: {
    icon: { url: "/favicon.svg", type: "image/svg+xml" },
  },
  openGraph: {
    title: "Sorostamp — On-chain email proofs on Stellar",
    description:
      "Prove a fact from an email — a payment, a domain, anything DKIM-signed — verified on Stellar, without revealing the email.",
    url: "https://sorostamp.com",
    siteName: "Sorostamp",
    type: "website",
    images: [{ url: "/favicon.svg" }], // TODO: dynamic og:image
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <head>
        {/* The CSS references these font families by name: Newsreader (serif),
            Hanken Grotesk (sans), JetBrains Mono (mono). Loaded via Google Fonts. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,460;6..72,500;6..72,600&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}

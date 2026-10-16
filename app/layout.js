import "./globals.css";

export const metadata = {
  title: "x-sift · reply username extractor",
  description:
    "Paste X post links, get the usernames of everyone who replied — filtered by verification and follower count.",
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

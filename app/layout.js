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

// Runs before paint so the chosen theme never flashes the wrong palette.
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("x-sift-theme");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

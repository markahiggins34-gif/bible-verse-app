import "./globals.css";

export const metadata = {
  title: "Scripture & Truth",
  description: "NLT Bible Verse Finder",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

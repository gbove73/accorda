import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const assetPrefix = process.env.ACCORDA_STATIC_EXPORT === 'true' ? '/accorda' : '';

export const metadata: Metadata = {
  title: 'Accorda — Accordatore cromatico e polifonico',
  description:
    'Accordatore online cromatico e polifonico per chitarra, basso, ukulele, violino e mandolino. Analisi audio privata, direttamente nel browser.',
  icons: {
    icon: `${assetPrefix}/favicon.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

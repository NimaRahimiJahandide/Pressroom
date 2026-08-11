import './globals.css';
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

// Three type roles, three variables:
//   display — Fraunces, the editorial half (variable: optical size + WONK)
//   sans    — IBM Plex Sans, all UI chrome and body copy
//   mono    — IBM Plex Mono, anything the machine reports back
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  // opsz is requested explicitly so `font-optical-sizing: auto` has an axis
  // to act on; SOFT/WONK let headings pick up Fraunces' angled italic-ish
  // forms without switching family.
  axes: ['opsz', 'SOFT', 'WONK'],
  variable: '--font-fraunces',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
  variable: '--font-plex-mono',
});

export const metadata = {
  title: 'Pressroom — watch your draft get written',
  description:
    'Pick a topic, tone, and length. Watch the draft arrive a word at a time, and stop it whenever you have enough.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}

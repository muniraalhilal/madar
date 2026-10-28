import '@fontsource/montserrat/300.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { asset } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'MADAR — The City in Motion.', template: '%s · MADAR' },
  description: 'MADAR (مَدار) is a smart-city digital twin: explore a simulated city, change how it runs, and compare what happens next.',
  applicationName: 'MADAR',
  icons: { icon: [{ url: asset('/icon.svg'), type: 'image/svg+xml' }, { url: asset('/brand/favicon-32.png'), sizes: '32x32' }], apple: asset('/apple-icon.png') },
  openGraph: { title: 'MADAR — The City in Motion.', description: 'A smart-city digital twin with a deterministic traffic simulation engine.', images: [asset('/media/hero-desktop-1920.webp')] },
};

export const viewport: Viewport = { themeColor: '#0B0E1A', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

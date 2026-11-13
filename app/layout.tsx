import type { Metadata } from 'next';
import { DM_Sans, IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const ibmMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ISMAYA PROPERTY — Land Payment Ledger',
  description:
    'Real-time installment monitoring, Google Sheets sync, PDF reporting, and administrator audit ledger for Utan Kayu land payments.',
  openGraph: {
    title: 'ISMAYA PROPERTY — Land Payment Ledger',
    description:
      'Real-time installment monitoring, Google Sheets sync, PDF reporting, and administrator audit ledger for Utan Kayu land payments.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ISMAYA PROPERTY — Land Payment Ledger',
    description:
      'Real-time installment monitoring, Google Sheets sync, PDF reporting, and administrator audit ledger for Utan Kayu land payments.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${jakarta.variable} ${dmSans.variable} ${ibmMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-150"
      >
        {children}
      </body>
    </html>
  );
}

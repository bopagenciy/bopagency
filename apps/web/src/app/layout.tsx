import type { Metadata } from 'next';
import { Providers } from '@/providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'BopIAgency',
    template: '%s | BopIAgency',
  },
  description: 'Sistema operativo digital de Bop Agency',
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

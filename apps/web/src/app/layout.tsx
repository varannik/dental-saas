import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SessionProvider } from '../lib/session';
import messages from '../messages/en.json';
import './globals.css';

export const metadata: Metadata = {
  title: messages.app.name,
  description: messages.app.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

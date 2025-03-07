import { SessionProvider } from 'next-auth/react';
import type { AppProps } from 'next/app';
import { Session } from 'next-auth';
import '@/styles/globals.css';

type AppPropsWithAuth = AppProps & {
  pageProps: {
    session?: Session;
  };
};

export default function App({ Component, pageProps }: AppPropsWithAuth) {
  return (
    <SessionProvider session={pageProps.session}>
      <Component {...pageProps} />
    </SessionProvider>
  );
} 
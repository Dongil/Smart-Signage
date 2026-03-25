import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Signage App',
  description: '디지털 사이니지 편집기',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

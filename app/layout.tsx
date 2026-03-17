import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Research Assistant',
  description: 'AI-powered research writing tool',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-[#0f1117] text-[#e1e4ed]">
        {children}
      </body>
    </html>
  );
}

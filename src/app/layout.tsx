import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/Providers";
import Script from "next/script";
import NextTopLoader from 'nextjs-toploader';

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "SCRB Sahayak",
  description: "Intelligent Conversational AI for KSP Crime Database",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", montserrat.variable)}>
      <body className="antialiased bg-[#f4f4f5]">
        <NextTopLoader color="#0D9488" showSpinner={false} shadow="0 0 10px #0D9488,0 0 5px #0D9488" />
        <Providers>{children}</Providers>
        <Script
          src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
          strategy="afterInteractive"
        />
        <Script id="google-translate-init" strategy="afterInteractive">
          {`
            function googleTranslateElementInit() {
              new window.google.translate.TranslateElement(
                { pageLanguage: 'en', autoDisplay: false },
                'google_translate_element'
              );
            }
          `}
        </Script>
        <div id="google_translate_element" className="hidden"></div>
      </body>
    </html>
  );
}

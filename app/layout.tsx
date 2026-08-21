import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Escuela de Golf CCB",
  description: "Sistema de gestión de la Escuela de Golf del Country Club de Bogotá",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Golf CCB",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  // Color de la barra de estado en la PWA. Es una meta del navegador,
  // no CSS: aquí no valen las variables del tema. Sigue al fondo de --ui-bg.
  themeColor: "#0a1710",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full`}>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
      </head>
      <body className="min-h-full flex flex-col bg-gray-50 antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}

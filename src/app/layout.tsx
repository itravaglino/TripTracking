import type { Metadata } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Viajes — Ignacio Travaglino",
  description: "Reservas de vuelos, hospedaje, transporte y planes leídas desde Gmail, con lo que cada persona elige seguir.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

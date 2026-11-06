import type { ReactNode } from "react";

export const metadata = {
  title: "Viajes — Travaglino",
  description: "Reservas de vuelos, hospedaje, transporte y planes leídas desde Gmail.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

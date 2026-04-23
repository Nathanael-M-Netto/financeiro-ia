import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "FinDash — Controle Financeiro Inteligente",
  description: "Dashboard financeiro pessoal com projeção mensal e assistente IA Gemini. Gerencie receitas, despesas e cartões com segurança.",
  keywords: ["financeiro", "dashboard", "controle", "IA", "Gemini"],
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#07090f" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}

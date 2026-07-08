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
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FinDash",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07090f",
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Registra o service worker (PWA). Cache leve, rede primeiro — ver public/sw.js */}
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

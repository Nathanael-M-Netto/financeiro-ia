import "./globals.css";

const pwaScript = process.env.NODE_ENV === "production"
  ? `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`
  : `if('serviceWorker' in navigator){window.addEventListener('load',async function(){var regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.filter(function(r){return r.scope.indexOf(location.origin)===0}).map(function(r){return r.unregister()}));if('caches' in window){var keys=await caches.keys();await Promise.all(keys.filter(function(k){return k.indexOf('findash-')===0}).map(function(k){return caches.delete(k)}))}})}`;

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
    <html lang="pt-BR">
      <head>
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Em produção registra o PWA; em desenvolvimento remove caches antigos para o CSS não ficar obsoleto. */}
        <script dangerouslySetInnerHTML={{ __html: pwaScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// Conjunto de ícones SVG (estilo linha, herdam a cor via currentColor).
// Substitui emojis por ícones consistentes em todo o app.

function Svg({ children, size = 18, ...rest }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconBrand = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5c-.6-.7-1.5-1-2.5-1-1.7 0-2.5.8-2.5 1.8 0 2.7 5 1.2 5 3.9 0 1-.9 1.8-2.5 1.8-1 0-1.9-.3-2.5-1M12 7v10" /></Svg>
)
export const IconDashboard = (p) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>
)
export const IconReceipt = (p) => (
  <Svg {...p}><path d="M5 3v18l2-1.2L9 21l2-1.2L13 21l2-1.2L17 21l2-1.2V3l-2 1.2L15 3l-2 1.2L11 3 9 4.2 7 3 5 4.2Z" /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" /></Svg>
)
export const IconCard = (p) => (
  <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19M6 15h4" /></Svg>
)
export const IconSparkles = (p) => (
  <Svg {...p}><path d="M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5Z" /><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" /></Svg>
)
export const IconPlus = (p) => (<Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>)
export const IconTrash = (p) => (
  <Svg {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" /></Svg>
)
export const IconPencil = (p) => (
  <Svg {...p}><path d="M4 20h4L19 9a2 2 0 0 0-2.8-2.8L5 17.2V20Z" /><path d="M14.5 7.5l2.8 2.8" /></Svg>
)
export const IconStar = ({ filled, ...p }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9Z" /></Svg>
)
export const IconAlert = (p) => (
  <Svg {...p}><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17.5h.01" /></Svg>
)
export const IconCheck = (p) => (<Svg {...p}><path d="M5 12.5l4.5 4.5L19 6.5" /></Svg>)
export const IconChevronLeft = (p) => (<Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>)
export const IconChevronRight = (p) => (<Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>)
export const IconMenu = (p) => (<Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>)
export const IconClose = (p) => (<Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>)
export const IconLogout = (p) => (
  <Svg {...p}><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h11" /></Svg>
)
export const IconSend = (p) => (<Svg {...p}><path d="M5 12 20 4l-5 16-3.5-6.5L5 12Z" /></Svg>)
export const IconPaperclip = (p) => (<Svg {...p}><path d="M21 11.5 12.5 20a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" /></Svg>)
export const IconRepeat = (p) => (<Svg {...p}><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></Svg>)
export const IconDownload = (p) => (<Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></Svg>)
export const IconClock = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 1.8" /></Svg>)
export const IconCheckCircle = ({ filled, ...p }) => (<Svg {...p}><circle cx="12" cy="12" r="9" fill={filled ? 'currentColor' : 'none'} /><path d="M8.5 12.2l2.3 2.3 4.7-4.8" stroke={filled ? '#0a0a0c' : 'currentColor'} /></Svg>)
export const IconTarget = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Svg>)
export const IconWallet = (p) => (<Svg {...p}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a1 1 0 0 1 1 1v15H6.5A2.5 2.5 0 0 1 4 17.5Z" /><path d="M4 7h16M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z" /></Svg>)
export const IconTrendingUp = (p) => (<Svg {...p}><path d="M4 17l6-6 4 4 6-7" /><path d="M15 8h5v5" /></Svg>)
export const IconArrowDown = (p) => (<Svg {...p}><path d="M12 4v15M6 13l6 6 6-6" /></Svg>)
export const IconArrowUp = (p) => (<Svg {...p}><path d="M12 20V5M6 11l6-6 6 6" /></Svg>)
export const IconCopy = (p) => (<Svg {...p}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Svg>)
export const IconReply = (p) => (<Svg {...p}><path d="M9 8 4 12l5 4" /><path d="M5 12h8a6 6 0 0 1 6 6v1" /></Svg>)

'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { IconSparkles, IconStar, IconSend, IconTrash, IconPaperclip, IconClose, IconCopy, IconReply } from '@/lib/icons'

const EXAMPLES = [
  'Gastei 42 reais no mercado pelo Pix hoje.',
  'Paguei a fatura inteira do Nubank hoje.',
  'Onde estou gastando acima do meu orçamento?',
  'Quanto preciso guardar por mês para minhas metas?',
]

const MAX_FILE_MB = 10
const ACCEPTED_EXT = ['pdf', 'csv', 'ofx', 'txt']

// Renderiza markdown simples (negrito, listas, parágrafos) como JSX seguro.
function renderInline(text, kp) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={`${kp}-b-${i}`}>{p.slice(2, -2)}</strong>
      : <span key={`${kp}-s-${i}`}>{p}</span>
  )
}

function formatMessage(content) {
  const lines = String(content).split('\n')
  const blocks = []
  let list = []
  const flush = (k) => {
    if (list.length) { blocks.push(<ul key={`ul-${k}`} className="chat-list">{list}</ul>); list = [] }
  }
  lines.forEach((line, i) => {
    const t = line.trim()
    if (/^[-*]\s+/.test(t)) {
      list.push(<li key={`li-${i}`}>{renderInline(t.replace(/^[-*]\s+/, ''), `li-${i}`)}</li>)
    } else {
      flush(i)
      if (t !== '') blocks.push(<p key={`p-${i}`} className="chat-p">{renderInline(line, `p-${i}`)}</p>)
    }
  })
  flush('end')
  return blocks
}

export default function ChatClient({ initialMessages, userId, userName }) {
  const router = useRouter()
  const supabase = createClient()

  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [pendingUser, setPendingUser] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [filterStarred, setFilterStarred] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [actionMsg, setActionMsg] = useState(null) // mensagem aberta no menu (segurar/botão direito)
  const [attachment, setAttachment] = useState(null) // { name, mimeType, data(base64) }
  const [quickReplies, setQuickReplies] = useState([])
  const [replyTo, setReplyTo] = useState(null)
  const [swiping, setSwiping] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  const threadRef = useRef(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const pressTimer = useRef(null)
  const swipeRef = useRef(null)

  // Lê o arquivo escolhido e guarda em base64 (vai junto da próxima mensagem).
  const onPickFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo
    if (!file) return
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!ACCEPTED_EXT.includes(ext)) {
      setError('Arquivo não suportado. Envie PDF, CSV, OFX ou TXT.')
      return
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Arquivo muito grande (máx. ${MAX_FILE_MB} MB).`)
      return
    }
    setError(null)
    setQuickReplies([])
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] || ''
      setAttachment({ name: file.name, mimeType: file.type || 'application/octet-stream', data: base64 })
    }
    reader.onerror = () => setError('Não consegui ler o arquivo.')
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages, pendingUser, sending])

  const send = async (textArg) => {
    let text = (textArg ?? input).trim()
    // Só com anexo (sem texto): usa um pedido padrão de organização.
    if (text.length < 2 && attachment) text = 'Organize os lançamentos deste arquivo pra mim.'
    if (text.length < 2 || sending) return
    const attach = attachment
    const reply = replyTo
    setInput('')
    setAttachment(null)
    setError(null)
    setPendingUser({ text: attach ? `${text}\n\nAnexo: ${attach.name}` : text, reply })
    setSending(true)
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userText: text, attachment: attach || undefined, replyToId: reply?.id || undefined }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erro na IA')

      const savedUser = result.userMessage && reply && !result.userMessage.reply_preview
        ? { ...result.userMessage, reply_to_id: reply.id, reply_preview: reply.content.slice(0, 280), reply_role: reply.role }
        : result.userMessage
      setMessages(prev => [...prev, savedUser, result.assistantMessage].filter(Boolean))
      setQuickReplies(Array.isArray(result.quickReplies) ? result.quickReplies : [])
      setReplyTo(null)
      setPendingUser(null)
      router.refresh() // sincroniza dados (despesas/receitas) que a IA possa ter mudado
    } catch (e) {
      setError(e.message)
      setPendingUser(null)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const toggleStar = async (msg) => {
    const next = !msg.is_starred
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_starred: next } : m))
    const { error: starError } = await supabase
      .from('chat_messages')
      .update({ is_starred: next })
      .eq('id', msg.id)
      .eq('user_id', userId)

    if (starError) {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_starred: !next } : m))
      setError('Não consegui atualizar esta favorita.')
    }
  }

  const chooseReply = (msg) => {
    setReplyTo(msg)
    setActionMsg(null)
    setSwiping(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const copyMessage = async (msg) => {
    try {
      await navigator.clipboard.writeText(msg.content)
      setCopiedId(msg.id)
      setTimeout(() => setCopiedId(null), 1600)
    } catch {
      setError('Não consegui copiar esta mensagem.')
    }
  }

  const clearAll = async () => {
    await supabase.from('chat_messages').delete().eq('user_id', userId)
    setMessages([])
    setConfirmClear(false)
    setFilterStarred(false)
  }

  const deleteMsg = async (msg) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id))
    setActionMsg(null)
    await supabase.from('chat_messages').delete().eq('id', msg.id).eq('user_id', userId)
  }

  // Segurar a mensagem (~0,45s) abre o menu de ações.
  const startPress = (msg) => {
    cancelPress()
    pressTimer.current = setTimeout(() => setActionMsg(msg), 450)
  }
  const cancelPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null }
  }


  const startGesture = (event, msg) => {
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* alguns navegadores não expõem captura */ }
    swipeRef.current = { id: msg.id, startX: event.clientX, startY: event.clientY, offset: 0 }
    startPress(msg)
  }
  const moveGesture = (event, msg) => {
    const gesture = swipeRef.current
    if (!gesture || gesture.id !== msg.id) return
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    if (Math.abs(dx) > 7 || Math.abs(dy) > 7) cancelPress()
    if (dx >= 0 || Math.abs(dx) < Math.abs(dy)) return
    gesture.offset = Math.max(-82, dx)
    setSwiping({ id: msg.id, offset: gesture.offset })
  }
  const endGesture = (msg) => {
    cancelPress()
    const gesture = swipeRef.current
    swipeRef.current = null
    if (gesture?.id === msg.id && gesture.offset <= -54) chooseReply(msg)
    else setSwiping(null)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const onInputChange = (e) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(140, Math.max(48, e.target.scrollHeight))}px`
  }

  const shown = filterStarred ? messages.filter(m => m.is_starred) : messages
  const firstName = userName ? userName.split(' ')[0] : null

  return (
    <div className="page legacy-page chat-page anim">
      <header className="app-topbar chat-header">
        <div className="chat-head-title">
          <div className="chat-head-mark"><IconSparkles size={18} /></div>
          <div>
            <h1 className="page-title" style={{ fontSize: '1.25rem' }}>Assistente IA</h1>
            <p className="page-sub">Converse, tire dúvidas e organize suas finanças.</p>
          </div>
        </div>
        <div className="chat-toolbar">
          <button
            className={`btn-ghost ${filterStarred ? 'active-toggle' : ''}`}
            onClick={() => setFilterStarred(v => !v)}
            title="Mostrar só as mensagens marcadas"
          >
            <IconStar size={15} filled={filterStarred} /> Favoritas
          </button>
          {messages.length > 0 && (
            <button className="btn-ghost" onClick={() => setConfirmClear(true)}><IconTrash size={15} /> Limpar</button>
          )}
        </div>
      </header>

      <div className="chat-thread" ref={threadRef} aria-live="polite">
        {shown.length === 0 && !pendingUser ? (
          <div className="chat-empty">
            <div className="chat-empty-mark"><IconSparkles size={26} /></div>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>
              {filterStarred ? 'Nenhuma mensagem favorita ainda' : `Olá${firstName ? ', ' + firstName : ''}! Como posso ajudar?`}
            </div>
            {!filterStarred && (
              <div className="chat-examples">
                {EXAMPLES.map((ex, i) => (
                  <button key={i} className="chat-example" onClick={() => send(ex)}>{ex}</button>
                ))}
              </div>
            )}
          </div>
        ) : (
          shown.map((m) => (
            <div key={m.id} className={`chat-msg ${m.role} ${swiping?.id === m.id ? 'swiping' : ''}`}>
              <span className={`chat-swipe-cue ${swiping?.id === m.id && swiping.offset <= -54 ? 'ready' : ''}`} aria-hidden="true"><IconReply size={16} /></span>
              <div
                className={`chat-bubble ${m.is_starred ? 'starred' : ''}`}
                style={swiping?.id === m.id ? { transform: `translateX(${swiping.offset}px)` } : undefined}
                onPointerDown={(event) => startGesture(event, m)}
                onPointerMove={(event) => moveGesture(event, m)}
                onPointerUp={() => endGesture(m)}
                onPointerLeave={() => { cancelPress(); if (swipeRef.current?.id !== m.id) setSwiping(null) }}
                onPointerCancel={() => { cancelPress(); swipeRef.current = null; setSwiping(null) }}
                onContextMenu={(e) => { e.preventDefault(); setActionMsg(m) }}
              >
                {m.reply_preview && (
                  <div className="chat-quoted-message">
                    <span>{m.reply_role === 'assistant' ? 'Assistente IA' : 'Você'}</span>
                    <p>{m.reply_preview}</p>
                  </div>
                )}
                {formatMessage(m.content)}
                {m.role === 'assistant' && m.model && <div className="chat-meta">via {m.model}</div>}
              </div>
              <button
                className={`chat-star ${m.is_starred ? 'on' : ''}`}
                onClick={() => toggleStar(m)}
            title={m.is_starred ? 'Remover dos favoritos' : 'Favoritar mensagem'}
              >
                <IconStar size={16} filled={m.is_starred} />
              </button>
            </div>
          ))
        )}

        {pendingUser && (
          <div className="chat-msg user">
            <div className="chat-bubble">
              {pendingUser.reply && <div className="chat-quoted-message"><span>{pendingUser.reply.role === 'assistant' ? 'Assistente IA' : 'Você'}</span><p>{pendingUser.reply.content}</p></div>}
              {formatMessage(pendingUser.text)}
            </div>
          </div>
        )}
        {sending && <div className="chat-typing">FinDash IA está digitando…</div>}
        {!sending && quickReplies.length > 0 && !filterStarred && (
          <div className="chat-quick-replies" aria-label="Respostas sugeridas">
            {quickReplies.map(reply => <button key={reply} onClick={() => send(reply)}>{reply}</button>)}
          </div>
        )}
        {error && <div className="ai-feedback error" style={{ alignSelf: 'flex-start' }}>{error}</div>}
      </div>

      <div className="chat-input-wrap">
        {replyTo && (
          <div className="chat-reply-composer">
            <span className="chat-reply-icon"><IconReply size={15} /></span>
            <div><strong>Respondendo a {replyTo.role === 'assistant' ? 'Assistente IA' : 'você'}</strong><p>{replyTo.content}</p></div>
            <button onClick={() => setReplyTo(null)} aria-label="Cancelar resposta"><IconClose size={14} /></button>
          </div>
        )}
        {attachment && (
          <div className="chat-attach-chip">
            <IconPaperclip size={13} />
            <span className="chat-attach-name">{attachment.name}</span>
            <button className="chat-attach-x" onClick={() => setAttachment(null)} aria-label="Remover anexo"><IconClose size={12} /></button>
          </div>
        )}
        <div className="chat-input-bar">
          <input ref={fileRef} type="file" accept=".pdf,.csv,.ofx,.txt" onChange={onPickFile} style={{ display: 'none' }} />
          <button className="chat-attach-btn" onClick={() => fileRef.current?.click()} disabled={sending}
            title="Anexar extrato ou fatura (PDF, CSV, OFX, TXT)" aria-label="Anexar arquivo">
            <IconPaperclip size={17} />
          </button>
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={1}
            value={input}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder={attachment ? 'Diga o que fazer com o arquivo (ou só envie)…' : 'Escreva sua mensagem…'}
            disabled={sending}
          />
          <button className="chat-send" onClick={() => send()} disabled={sending || (input.trim().length < 2 && !attachment)} aria-label="Enviar">
            <IconSend size={18} />
          </button>
        </div>
      </div>

      {/* Confirmar limpeza */}
      <div className={`modal-backdrop ${confirmClear ? 'open' : ''}`}>
        <div className="modal-box" style={{ maxWidth: '380px' }}>
          <div className="modal-hd">
            <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#fff' }}>Limpar conversa</div>
            <button className="modal-close" onClick={() => setConfirmClear(false)}>✕</button>
          </div>
          <div className="modal-bd">
            <p style={{ fontSize: '.85rem', color: 'var(--text2)', lineHeight: 1.6 }}>
              Isso apaga todo o histórico do chat. Seus lançamentos (despesas e receitas) <strong style={{ color: 'var(--text)' }}>não são afetados</strong>.
            </p>
          </div>
          <div className="modal-ft">
            <button className="nav-btn" onClick={() => setConfirmClear(false)}>Cancelar</button>
            <button className="btn-ai" style={{ background: 'var(--neg)' }} onClick={clearAll}>Limpar histórico</button>
          </div>
        </div>
      </div>

      {/* Menu da mensagem — segurar a mensagem ou clicar com o botão direito */}
      {actionMsg && (
        <div className="msg-sheet-backdrop" onClick={() => setActionMsg(null)}>
          <div className="msg-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="msg-sheet-preview">{actionMsg.content.length > 140 ? actionMsg.content.slice(0, 140) + '…' : actionMsg.content}</div>
            <button className="msg-sheet-btn" onClick={() => chooseReply(actionMsg)}>
              <IconReply size={16} /> Responder
            </button>
            <button className="msg-sheet-btn" onClick={() => copyMessage(actionMsg)}>
              <IconCopy size={16} /> {copiedId === actionMsg.id ? 'Mensagem copiada' : 'Copiar mensagem'}
            </button>
            <button className="msg-sheet-btn" onClick={() => { toggleStar(actionMsg); setActionMsg(null) }}>
              <IconStar size={16} filled={actionMsg.is_starred} />
              {actionMsg.is_starred ? 'Remover dos favoritos' : 'Favoritar mensagem'}
            </button>
            <button className="msg-sheet-btn danger" onClick={() => deleteMsg(actionMsg)}>
              <IconTrash size={16} /> Apagar mensagem
            </button>
            <button className="msg-sheet-btn cancel" onClick={() => setActionMsg(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

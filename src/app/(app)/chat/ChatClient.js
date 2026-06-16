'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { IconSparkles, IconStar, IconSend, IconTrash } from '@/lib/icons'

const EXAMPLES = [
  'Quanto eu gasto por mês somando todos os cartões?',
  'Adicione a fatura da Havan, 120 reais em Maio',
  'Qual cartão está mais apertado em relação ao limite?',
  'Se eu atrasar a fatura do Nubank 5 dias, quanto pago de juros?',
]

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

  const threadRef = useRef(null)
  const inputRef = useRef(null)
  const pressTimer = useRef(null)

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages, pendingUser, sending])

  const send = async (textArg) => {
    const text = (textArg ?? input).trim()
    if (text.length < 2 || sending) return
    setInput('')
    setError(null)
    setPendingUser(text)
    setSending(true)
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userText: text }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erro na IA')

      setMessages(prev => [...prev, result.userMessage, result.assistantMessage].filter(Boolean))
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
    await supabase.from('chat_messages').update({ is_starred: next }).eq('id', msg.id)
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

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const shown = filterStarred ? messages.filter(m => m.is_starred) : messages
  const firstName = userName ? userName.split(' ')[0] : null

  return (
    <div className="chat-page">
      <header className="chat-header">
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
            <IconStar size={15} filled={filterStarred} /> Marcadas
          </button>
          {messages.length > 0 && (
            <button className="btn-ghost" onClick={() => setConfirmClear(true)}><IconTrash size={15} /> Limpar</button>
          )}
        </div>
      </header>

      <div className="chat-thread" ref={threadRef}>
        {shown.length === 0 && !pendingUser ? (
          <div className="chat-empty">
            <div className="chat-empty-mark"><IconSparkles size={26} /></div>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>
              {filterStarred ? 'Nenhuma mensagem marcada ainda' : `Olá${firstName ? ', ' + firstName : ''}! Como posso ajudar?`}
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
            <div key={m.id} className={`chat-msg ${m.role}`}>
              <div
                className={`chat-bubble ${m.is_starred ? 'starred' : ''}`}
                onPointerDown={() => startPress(m)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
                onContextMenu={(e) => { e.preventDefault(); setActionMsg(m) }}
              >
                {formatMessage(m.content)}
                {m.role === 'assistant' && m.model && <div className="chat-meta">via {m.model}</div>}
              </div>
              <button
                className={`chat-star ${m.is_starred ? 'on' : ''}`}
                onClick={() => toggleStar(m)}
                title={m.is_starred ? 'Desmarcar' : 'Marcar mensagem'}
              >
                <IconStar size={16} filled={m.is_starred} />
              </button>
            </div>
          ))
        )}

        {pendingUser && (
          <div className="chat-msg user">
            <div className="chat-bubble">{formatMessage(pendingUser)}</div>
          </div>
        )}
        {sending && <div className="chat-typing">FinDash IA está digitando…</div>}
        {error && <div className="ai-feedback error" style={{ alignSelf: 'flex-start' }}>Erro: {error}</div>}
      </div>

      <div className="chat-input-bar">
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escreva sua mensagem…"
          disabled={sending}
        />
        <button className="chat-send" onClick={() => send()} disabled={sending || input.trim().length < 2} aria-label="Enviar">
          <IconSend size={18} />
        </button>
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
            <button className="msg-sheet-btn" onClick={() => { toggleStar(actionMsg); setActionMsg(null) }}>
              <IconStar size={16} filled={actionMsg.is_starred} />
              {actionMsg.is_starred ? 'Desmarcar' : 'Marcar para a IA usar de contexto'}
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

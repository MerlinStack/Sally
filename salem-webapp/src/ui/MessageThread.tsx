import { useState, type FormEvent } from 'react';
import type { Conversation, Message } from '../salem/types';

interface Props {
  conversation: Conversation | null;
  messages: Message[];
  currentUserId: string;
  onSend: (text: string) => Promise<void>;
  error: string | null;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MessageThread({
  conversation,
  messages,
  currentUserId,
  onSend,
  error,
}: Props) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (text.length === 0 || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setDraft('');
    } finally {
      setSending(false);
    }
  }

  if (!conversation) {
    return (
      <section className="salem-thread">
        <p className="salem-empty">Select a conversation to read it.</p>
      </section>
    );
  }

  return (
    <section className="salem-thread" aria-label={conversation.title}>
      <header className="salem-thread-header">
        <div>
          <h2 className="salem-thread-title">{conversation.title}</h2>
          <span className="salem-thread-topic">{conversation.topic}</span>
        </div>
        {/*
          Trust mode is shown permanently and is not a toggle. It reflects
          what the engine actually does today: there is no E2EE in the server
          or the SDK yet, so every conversation is 'verified'.
        */}
        <span className="salem-mode" title="Conversation trust mode">
          {conversation.trustMode}
        </span>
      </header>

      <div className="salem-messages">
        {messages.length === 0 ? (
          <p className="salem-empty">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const own = m.senderId === currentUserId;
            return (
              <article
                key={`${m.senderId}:${m.seq}`}
                className={own ? 'salem-message salem-message-own' : 'salem-message'}
              >
                <div className="salem-message-head">
                  {own ? 'you' : m.senderId} · {formatTime(m.ts)}
                  {m.id !== undefined ? ` · #${m.id}` : ''}
                </div>
                {/* Plain text only. Drafty rendering is a later task; this
                    must never become dangerouslySetInnerHTML. */}
                <div className="salem-message-body">{m.text}</div>
              </article>
            );
          })
        )}
      </div>

      <form className="salem-composer" onSubmit={handleSubmit}>
        <label className="salem-sr-only" htmlFor="composer">
          Message
        </label>
        <textarea
          id="composer"
          value={draft}
          placeholder="Write a message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit(e);
            }
          }}
        />
        <button
          type="submit"
          className="salem-button"
          disabled={sending || draft.trim().length === 0}
        >
          Send
        </button>
      </form>

      {error ? (
        <p className="salem-error" role="alert" style={{ padding: '0 16px 12px' }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
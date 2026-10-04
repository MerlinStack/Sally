import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Topic } from 'tinode-sdk';
import { SalemClient } from './salem/client';
import { loadConfig } from './salem/config';
import type {
  ConnectionState,
  Conversation,
  Message,
} from './salem/types';
import LoginForm from './ui/LoginForm';
import ConversationList from './ui/ConversationList';
import MessageThread from './ui/MessageThread';

/**
 * Salem application shell.
 *
 * Wiring only: create the client, reflect connection state, hold
 * conversation/message state. All protocol access goes through SalemClient.
 *
 * The conversation list is seeded manually by topic name for now. Populating
 * it from the 'me' topic subscription set (i.e. real contacts) is part of the
 * client build-out, not this scaffold.
 */
export default function App() {
  const config = useMemo(() => loadConfig(), []);
  const client = useMemo(() => SalemClient.create(config), [config]);

  const [state, setState] = useState<ConnectionState>('idle');
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.onStateChange = setState;
    client.onMessage = (_topicName, message) => {
      // seq < 0 is the presence placeholder emitted by the client; it carries
      // no text and must not appear in the thread.
      if (message.seq < 0) return;
      setMessages((prev) =>
        prev.some((m) => m.seq === message.seq && m.senderId === message.senderId)
          ? prev
          : [...prev, message],
      );
    };
    client.onError = (err: Error) => setError(err.message);

    void client.connect().catch((err: Error) => setError(err.message));
  }, [client]);

  const handleSignIn = useCallback(
    async (username: string, password: string) => {
      setError(null);
      try {
        setUserId(await client.signIn(username, password));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed.');
      }
    },
    [client],
  );

  const handleOpenByTopic = useCallback(
    async (topicName: string, title: string) => {
      setError(null);
      const conversation = client.describeConversation(topicName, title);
      setConversations((prev) =>
        prev.some((c) => c.topic === conversation.topic)
          ? prev
          : [...prev, conversation],
      );
      await handleSelect(conversation);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client],
  );

  const handleSelect = useCallback(
    async (conversation: Conversation) => {
      setError(null);
      setSelected(conversation);
      setMessages([]);
      try {
        const topic: Topic = await client.openConversation(conversation.topic);
        setMessages(await client.loadHistory(topic));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not open conversation.',
        );
      }
    },
    [client],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!selected) return;
      try {
        const topic: Topic = await client.openConversation(selected.topic);
        await client.sendText(topic, text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send message.');
      }
    },
    [client, selected],
  );

  const handleSignOut = useCallback(async () => {
    setUserId(null);
    setConversations([]);
    setSelected(null);
    setMessages([]);
    await client.disconnect();
    void client.connect().catch((err: Error) => setError(err.message));
  }, [client]);

  if (!userId) {
    return (
      <LoginForm state={state} error={error} onSubmit={handleSignIn} />
    );
  }

  return (
    <div className="salem-shell">
      <aside className="salem-sidebar">
        <div className="salem-brand">
          <h1 className="salem-brand-name">Salem</h1>
          <p className="salem-brand-sub">Communication</p>
        </div>
        <div className="salem-identity">
          <span>
            <span
              className="salem-status"
              data-state={state}
              aria-hidden="true"
            />{' '}
            <code>{userId}</code>
          </span>
          <button
            type="button"
            className="salem-button salem-button-quiet"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </button>
        </div>
        <OpenConversationForm onOpen={handleOpenByTopic} />
        <ConversationList
          conversations={conversations}
          selected={selected}
          onSelect={(c) => void handleSelect(c)}
        />
      </aside>
      <MessageThread
        conversation={selected}
        messages={messages}
        currentUserId={userId}
        onSend={handleSend}
        error={error}
      />
    </div>
  );
}

function OpenConversationForm({
  onOpen,
}: {
  onOpen: (topicName: string, title: string) => Promise<void>;
}) {
  const [topicName, setTopicName] = useState('');
  const [title, setTitle] = useState('');

  return (
    <form
      className="salem-identity"
      style={{ display: 'block' }}
      onSubmit={(e) => {
        e.preventDefault();
        const name = topicName.trim();
        if (name.length === 0) return;
        void onOpen(name, title.trim() || name);
        setTopicName('');
        setTitle('');
      }}
    >
      <label className="salem-sr-only" htmlFor="topic-name">
        Topic name
      </label>
      <input
        id="topic-name"
        placeholder="Topic name, e.g. p2p…"
        value={topicName}
        onChange={(e) => setTopicName(e.target.value)}
        style={{
          width: '100%',
          font: 'inherit',
          padding: '4px 6px',
          marginBottom: 4,
          border: '1px solid var(--salem-line)',
          borderRadius: 4,
          background: 'var(--salem-bg)',
          color: 'inherit',
        }}
      />
      <label className="salem-sr-only" htmlFor="topic-title">
        Display name
      </label>
      <input
        id="topic-title"
        placeholder="Display name"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{
          width: '100%',
          font: 'inherit',
          padding: '4px 6px',
          border: '1px solid var(--salem-line)',
          borderRadius: 4,
          background: 'var(--salem-bg)',
          color: 'inherit',
        }}
      />
    </form>
  );
}
import type { Conversation } from '../salem/types';

interface Props {
  conversations: Conversation[];
  selected: Conversation | null;
  onSelect: (conversation: Conversation) => void;
}

export default function ConversationList({
  conversations,
  selected,
  onSelect,
}: Props) {
  if (conversations.length === 0) {
    return (
      <p className="salem-empty">
        No conversations yet. Open one by topic name above.
      </p>
    );
  }

  return (
    <ul className="salem-conversations">
      {conversations.map((c) => (
        <li key={c.topic}>
          <button
            type="button"
            className="salem-conversation"
            aria-current={selected?.topic === c.topic}
            onClick={() => onSelect(c)}
          >
            <p className="salem-conversation-title">{c.title}</p>
            <span className="salem-conversation-meta">
              <span>{c.kind}</span>
              <span aria-hidden="true">·</span>
              <span>{c.trustMode}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
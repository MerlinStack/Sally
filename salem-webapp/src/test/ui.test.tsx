import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from '../ui/LoginForm';
import ConversationList from '../ui/ConversationList';
import MessageThread from '../ui/MessageThread';
import type { Conversation, Message } from '../salem/types';

const conversation: Conversation = {
  topic: 'p2pAbCdEf',
  kind: 'direct',
  title: 'Robin',
  trustMode: 'verified',
};

const messages: Message[] = [
  { seq: 1, id: 11, ts: 1700000000000, senderId: 'usrAlice', text: 'hello' },
  { seq: 2, id: 12, ts: 1700000060000, senderId: 'usrMe', text: 'hi there' },
];

describe('LoginForm', () => {
  it('disables submit until the connection is ready', () => {
    render(
      <LoginForm state="connecting" error={null} onSubmit={async () => {}} />,
    );
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
  });

  it('enables submit once connected and a username is entered', async () => {
    const user = userEvent.setup();
    render(<LoginForm state="connected" error={null} onSubmit={async () => {}} />);
    const button = screen.getByRole('button', { name: /sign in/i });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/username/i), 'alice');
    expect(button).toBeEnabled();
  });

  it('surfaces errors accessibly', () => {
    render(
      <LoginForm
        state="failed"
        error="Authentication failed"
        onSubmit={async () => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Authentication failed');
  });
});

describe('ConversationList', () => {
  it('prompts when there are no conversations', () => {
    render(
      <ConversationList conversations={[]} selected={null} onSelect={() => {}} />,
    );
    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
  });

  it('marks the selected conversation', () => {
    render(
      <ConversationList
        conversations={[conversation]}
        selected={conversation}
        onSelect={() => {}}
      />,
    );
    const button = screen.getByRole('button', { name: /robin/i });
    expect(button).toHaveAttribute('aria-current', 'true');
  });
});

describe('MessageThread', () => {
  it('shows an empty state when no conversation is selected', () => {
    render(
      <MessageThread
        conversation={null}
        messages={[]}
        currentUserId="usrMe"
        onSend={async () => {}}
        error={null}
      />,
    );
    expect(screen.getByText(/select a conversation/i)).toBeInTheDocument();
  });

  it('renders message text and aligns own messages', () => {
    const { container } = render(
      <MessageThread
        conversation={conversation}
        messages={messages}
        currentUserId="usrMe"
        onSend={async () => {}}
        error={null}
      />,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('hi there')).toBeInTheDocument();
    expect(container.querySelectorAll('.salem-message-own')).toHaveLength(1);
  });

  it('always displays the trust mode', () => {
    render(
      <MessageThread
        conversation={conversation}
        messages={[]}
        currentUserId="usrMe"
        onSend={async () => {}}
        error={null}
      />,
    );
    expect(screen.getByTitle(/trust mode/i)).toHaveTextContent('verified');
  });

  it('renders message text as text, never as HTML', () => {
    const xss: Message[] = [
      {
        seq: 1,
        ts: 1700000000000,
        senderId: 'usrAlice',
        text: '<img src=x onerror="alert(1)">',
      },
    ];
    const { container } = render(
      <MessageThread
        conversation={conversation}
        messages={xss}
        currentUserId="usrMe"
        onSend={async () => {}}
        error={null}
      />,
    );
    // The payload must remain inert text.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
  });
});
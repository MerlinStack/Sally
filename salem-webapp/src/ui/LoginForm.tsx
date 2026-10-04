import { useState, type FormEvent } from 'react';
import type { ConnectionState } from '../salem/types';

interface Props {
  state: ConnectionState;
  error: string | null;
  onSubmit: (username: string, password: string) => Promise<void>;
}

/**
 * Basic-auth sign-in against the Salem server.
 *
 * The `basic` scheme sends credentials derived from the password, so this is
 * only appropriate over TLS in production. Salem's trust model treats the
 * login channel as part of its threat surface; see
 * docs/salem-trust-architecture.md.
 */
export default function LoginForm({ state, error, onSubmit }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = state === 'connected';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(username, password);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="salem-login">
      <h1>Salem</h1>
      <p className="salem-hint">Sign in to your Salem server.</p>

      <form onSubmit={handleSubmit}>
        <label className="salem-field">
          <span>Username</span>
          <input
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        <label className="salem-field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button
          type="submit"
          className="salem-button"
          disabled={!ready || busy || username.length === 0}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {!ready && !error ? (
        <p className="salem-hint" style={{ marginTop: 16 }}>
          <span className="salem-status" data-state={state} aria-hidden="true" />{' '}
          {state === 'connecting' ? 'Connecting to server…' : 'Not connected.'}
        </p>
      ) : null}

      {error ? (
        <p className="salem-error" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
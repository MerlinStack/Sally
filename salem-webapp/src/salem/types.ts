/**
 * Salem domain types.
 *
 * These are Salem's own vocabulary, deliberately independent of the Tinode
 * wire protocol so that protocol details do not leak into the UI layer.
 */

/** Trust mode of a conversation. See docs/salem-trust-architecture.md. */
export type TrustMode =
  /** End-to-end encrypted. Server cannot read content. Not implemented yet. */
  | 'private'
  /** Server-readable; policy enforcement applies. */
  | 'verified';

/**
 * Conversation kind. Mirrors Tinode topic types, but as a Salem concept:
 * a conversation is either a direct chat or a group/channel.
 */
export type ConversationKind = 'direct' | 'group' | 'channel';

export interface Conversation {
  /** Server topic name, e.g. "p2p..." or "grp...". Opaque to the UI. */
  topic: string;
  kind: ConversationKind;
  /** Display name of the peer or group. */
  title: string;
  /** Set while trust mode is negotiable; immutable once established. */
  trustMode: TrustMode;
  /** Peer's last known presence, if the server reported one. */
  presence?: 'online' | 'offline' | undefined;
}

export interface Message {
  /** Per-sender sequence id. Unique within a conversation. */
  seq: number;
  /** Server-assigned id, present once the server has acknowledged. */
  id?: number | undefined;
  /** Server timestamp in milliseconds. */
  ts: number;
  senderId: string;
  /** Plain-text projection for display. */
  text: string;
}

/** Connection lifecycle, surfaced to the UI. */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'authenticating'
  | 'authenticated'
  | 'disconnected'
  | 'failed';
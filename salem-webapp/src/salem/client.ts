/**
 * SalemClient - the single place that talks to the Tinode/Salem engine.
 *
 * Responsibilities:
 *  - own the SDK connection lifecycle
 *  - authenticate and expose the current identity
 *  - subscribe to conversations and deliver normalised messages
 *
 * Deliberate non-responsibilities:
 *  - no trust-mode enforcement yet (see docs/salem-trust-architecture.md §8;
 *    the policy service and E2EE codec are later steps)
 *  - no Drafty rendering; messages are flattened to plain text here so the UI
 *    never handles rich payloads until the renderer exists
 */

import { Drafty, Tinode, type Topic } from 'tinode-sdk';
import type { SalemConfig } from './config';
import type {
  ConnectionState,
  Conversation,
  ConversationKind,
  Message,
} from './types';

export interface SalemClientEvents {
  onStateChange?: (state: ConnectionState) => void;
  onMessage?: (topic: string, message: Message) => void;
  onError?: (error: Error) => void;
}

/** Tinode topic names encode their kind in the first three characters. */
function kindFromTopic(topic: string): ConversationKind {
  if (topic.startsWith('p2p')) return 'direct';
  if (topic.startsWith('chn')) return 'channel';
  return 'group';
}

/** Drafty -> plain text. Untrusted input must never be treated as HTML. */
function toPlainText(content: Drafty | string | undefined): string {
  if (content === undefined || content === null) return '';
  if (typeof content === 'string') return content;
  if (typeof content.txt === 'string' && content.txt.length > 0) return content.txt;
  // Fall back to the SDK's own projection rather than guessing at the
  // document structure.
  try {
    return content.preview(4096);
  } catch {
    return '';
  }
}

export class SalemClient {
  private readonly config: SalemConfig;
  private tinode: Tinode | null = null;
  private readonly subscribed = new Set<string>();
  private currentUserId: string | null = null;

  /**
   * Event handlers. Assign after `create()`; safe to reassign at any time.
   * They are plain properties rather than constructor arguments so a React
   * shell can attach them in an effect without recreating the client.
   */
  onStateChange?: (state: ConnectionState) => void;
  onMessage?: (topic: string, message: Message) => void;
  onError?: (error: Error) => void;

  private constructor(config: SalemConfig) {
    this.config = config;
  }

  static create(config: SalemConfig): SalemClient {
    return new SalemClient(config);
  }

  /**
   * The SDK instance, created on first use.
   *
   * Deliberately lazy: `new Tinode(...)` immediately touches the storage
   * layer (it calls `deleteDatabase()` on the IndexedDB provider), so
   * constructing it eagerly would make `SalemClient.create()` require a
   * browser environment. Deferring keeps topic classification and input
   * validation pure and testable without a DOM or a database provider.
   */
  private get sdk(): Tinode {
    if (!this.tinode) {
      this.tinode = new Tinode({
        host: this.config.host,
        appName: this.config.appName,
        appVersion: this.config.appVersion,
        apiKey: this.config.apiKey,
        persist: this.config.persist,
      });
    }
    return this.tinode;
  }

  private setState(state: ConnectionState): void {
    this.onStateChange?.(state);
  }

  /** Open the WebSocket. Resolves once the server handshake completes. */
  async connect(): Promise<void> {
    this.setState('connecting');
    try {
      await this.sdk.connect();
      this.setState('connected');
    } catch (err) {
      this.setState('failed');
      throw this.toError(err);
    }
  }

  /** Authenticate with the `basic` scheme. */
  async signIn(username: string, password: string): Promise<string> {
    this.setState('authenticating');
    try {
      await this.sdk.loginBasic(username, password);
      this.currentUserId = this.sdk.getCurrentUserID();
      this.setState('authenticated');
      return this.currentUserId ?? '';
    } catch (err) {
      this.setState('connected');
      throw this.toError(err);
    }
  }

  getUserId(): string | null {
    return this.currentUserId ?? this.sdk.getCurrentUserID();
  }

  getServerVersion(): string {
    return this.sdk.getServerVersion();
  }

  /** The authenticated user's own topic, carrying their profile and contacts. */
  me(): Topic {
    return this.sdk.getMeTopic();
  }

  /**
   * Subscribe to a conversation and start receiving messages.
   *
   * Realtime delivery works by assigning `onData` on the Topic instance -
   * `subscribe()` itself takes no callback. Idempotent: calling twice for the
   * same topic does not double-subscribe.
   */
  async openConversation(topicName: string): Promise<Topic> {
    const topic = this.sdk.getTopic(topicName);

    if (!this.subscribed.has(topicName)) {
      topic.onData = (msg) => {
        this.onMessage?.(topicName, {
          seq: msg.seq,
          id: msg.id,
          ts: msg.ts ?? Date.now(),
          senderId: msg.from ?? '',
          text: toPlainText(msg.content),
        });
      };
      topic.onPres = (pres) => {
        // Presence is surfaced through the conversation list, not here.
        if (pres.what === 'on' || pres.what === 'off') {
          this.onMessage?.(topicName, {
            seq: -1,
            ts: pres.tstamp ?? Date.now(),
            senderId: pres.user ?? '',
            text: '',
          });
        }
      };
      await topic.subscribe();
      this.subscribed.add(topicName);
    }

    return topic;
  }

  /** Fetch one page of history, oldest first. */
  async loadHistory(topic: Topic, limit = 50): Promise<Message[]> {
    await topic.getMeta({ limit });
    return topic.messages().map((msg) => ({
      seq: msg.seq,
      id: msg.id,
      ts: msg.ts ?? Date.now(),
      senderId: msg.from ?? '',
      text: toPlainText(msg.content),
    }));
  }

  /** Send plain text. Resolves with the server-assigned message id. */
  async sendText(topic: Topic, text: string): Promise<number> {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new Error('Cannot send an empty message.');
    }
    return topic.publish(trimmed);
  }

  /** Build a conversation descriptor for the UI. */
  describeConversation(topicName: string, title: string): Conversation {
    return {
      topic: topicName,
      kind: kindFromTopic(topicName),
      title,
      // Default to 'verified' because that is what the engine does today:
      // there is no E2EE in the server or SDK yet. Flipping this to 'private'
      // before the codec exists would be a lie.
      trustMode: 'verified',
    };
  }

  async disconnect(): Promise<void> {
    await this.sdk.disconnect();
    this.setState('idle');
  }

  private toError(err: unknown): Error {
    if (err instanceof Error) return err;
    if (typeof err === 'string') return new Error(err);
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Unknown error';
    return new Error(message);
  }
}
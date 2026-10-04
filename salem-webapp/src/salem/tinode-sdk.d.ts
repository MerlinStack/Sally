/**
 * Local type declarations for `tinode-sdk`.
 *
 * The published package (v0.25.4, Apache-2.0) ships only a minified UMD
 * bundle with no bundled types and no `exports` map. These declarations were
 * derived by introspecting the installed package, NOT from guesses:
 *
 *   node -e "console.log(Object.keys(require('tinode-sdk')))"
 *   // -> [ 'AccessMode', 'Drafty', 'TheCard', 'Tinode' ]
 *
 * Important: the package uses NAMED exports. There is no default export, so
 * `import Tinode from 'tinode-sdk'` yields undefined.
 *
 * Realtime events are delivered by assigning callbacks onto a Topic instance
 * (`topic.onData = fn`). `Topic.subscribe()` takes no callback argument -
 * this was verified against the bundle, where callbacks are copied onto the
 * instance at construction (`this.onData = callbacks.onData`).
 */

declare module 'tinode-sdk' {
  /** Rich-text message payload. See docs/drafty.md in the server repo. */
  export class Drafty {
    /** Plain-text projection of the document, if computed. */
    txt?: string | null;
    readonly length?: number;
    toString(): string;
    preview(maxLen?: number): string;
  }

  /** Contact card fields (docs/thecard.md). */
  export class TheCard {
    fn?: string | null;
    note?: string | null;
    org?: string | null;
    email?: string | null;
    tel?: string | null;
    [key: string]: unknown;
  }

  /** Permission bitmask. `AccessMode._JOIN` is the "join" privilege. */
  export const AccessMode: Record<string, number> & {
    _NONE: number;
    _JOIN: number;
    _READ: number;
    _WRITE: number;
    _PRES: number;
    _APPROVE: number;
    _SHARE: number;
    _DELETE: number;
    _OWNER: number;
  };

  export interface TinodeConfig {
    /** WebSocket host, e.g. "ws://localhost:6060" or "wss://host". */
    host: string;
    /** Use TLS. Defaults to true for wss hosts. */
    secure?: boolean;
    /** Sent as AppName; identifies the client to the Salem server. */
    appName?: string;
    /** Sent as AppVersion. */
    appVersion?: string;
    /** Token proving this client is allowed to talk to the server. */
    apiKey?: string;
    /** 'ws' or 'lp'. Auto-detected when omitted. */
    transport?: 'ws' | 'lp';
    /** Persist messages/topic metadata in IndexedDB. */
    persist?: boolean;
    platform?: string;
  }

  export interface MessageRef {
    /** Per-sender sequence id. */
    seq: number;
    /** Server-assigned id, populated after publish. */
    id?: number;
    ts?: number;
    from?: string;
    /** Drafty document, or a plain string for untrusted servers. */
    content?: Drafty | string;
    /** MIME headers, e.g. { mime: "text/plain" }. */
    head?: Record<string, string>;
    read?: number;
    recv?: number;
  }

  export interface Presence {
    what: string;
    src?: string;
    tstamp?: number;
    desc?: string;
    user?: string;
  }

  export interface TopicCallbacks {
    /** Inbound message (the `{data}` packet). */
    onData?: (msg: MessageRef) => void;
    onMeta?: (meta: unknown) => void;
    onPres?: (pres: Presence) => void;
    onInfo?: (info: { topic?: string; read?: number; recv?: number }) => void;
    onMetaDesc?: (topic: Topic) => void;
    onMetaSub?: (sub: unknown) => void;
    onSubsUpdated?: (topic: Topic) => void;
    onTagsUpdated?: (topic: Topic) => void;
    onCredsUpdated?: (topic: Topic) => void;
    onAuxUpdated?: (topic: Topic) => void;
    onDeleteTopic?: (topic: Topic) => void;
    onAllMessagesReceived?: (topic: Topic) => void;
  }

  export class Topic {
    constructor(topic: TopicLike, server: Tinode, callbacks?: TopicCallbacks);

    /** Requested data pages: limit, id ranges, and paging direction. */
    subscribe(
      getParams?: { limit?: number; data?: unknown },
      setParams?: Record<string, unknown>,
    ): Promise<unknown>;

    /** Send content as a message. Resolves with the server-assigned id. */
    publish(content: Drafty | string, noEcho?: boolean): Promise<number>;
    publishMessage(pub: { head?: Record<string, string>; content: Drafty | string }, attachments?: unknown): Promise<number>;

    getMeta(params?: Record<string, unknown>): Promise<unknown>;
    leave(): Promise<unknown>;
    invite(uid: string, mode?: number): Promise<unknown>;
    sendText(text: string): Promise<number>;
    readMessages(from: number, limit: number): Promise<unknown>;

    /** In-memory message buffer, ordered by seq. */
    messages(): MessageRef[];
    /** Cached 'me' topic descriptor. */
    getTopicDesc?(): TopicLike;
    /** Topic display name. */
    getName(): string;

    /** Realtime callbacks are assigned as instance properties. */
    onData?: (msg: MessageRef) => void;
    onPres?: (pres: Presence) => void;
    onInfo?: (info: { topic?: string; read?: number; recv?: number }) => void;
    onMetaDesc?: (topic: Topic) => void;
    onDeleteTopic?: (topic: Topic) => void;
  }

  export interface TopicLike {
    fn?: string;
    note?: string;
    /** 'p2p' | 'grp' | 'chn' | 'me' | 'fnd' | 'sys' | 'slf' */
    topic?: string;
  }

  export class Tinode {
    constructor(config: TinodeConfig, onComplete?: (err?: unknown) => void);

    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    isReady(): boolean;
    isAuthenticated(): boolean;

    /** `basic` scheme: (username, password). */
    loginBasic(username: string, password: string): Promise<unknown>;
    login(scheme: string, secret: Record<string, string>, cred?: unknown): Promise<unknown>;
    loginToken(token: string, cred?: unknown): Promise<unknown>;
    logout(): Promise<unknown>;

    /** Current user's uid, or null before login. */
    getCurrentUserID(): string | null;
    getServerVersion(): string;
    getServerParam(key: string, def?: string): string;
    getAuthToken(): string | null;
    setAuthToken(token: string): void;

    /** The authenticated user's own 'me' topic. */
    getMeTopic(): Topic;
    getFndTopic(): Topic;
    getTopic(name: string): Topic;

    createAccountBasic(
      uname: string,
      password: string,
      tags: TheCard | Record<string, unknown>,
      desc?: { public?: string },
    ): Promise<{ user?: string; token?: string } | undefined>;
    updateAccountBasic(
      uname: string,
      currentPassword: string,
      password: string,
      tags: TheCard | Record<string, unknown>,
      desc?: { public?: string },
    ): Promise<unknown>;
  }
}
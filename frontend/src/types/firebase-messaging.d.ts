declare module 'firebase/messaging' {
  import type { FirebaseApp } from 'firebase/app';

  export type Messaging = object;

  export interface MessagePayload {
    notification?: {
      title?: string;
      body?: string;
    };
    data?: Record<string, string>;
  }

  export function getMessaging(app?: FirebaseApp): Messaging;

  export function getToken(
    messaging: Messaging,
    options?: { vapidKey?: string }
  ): Promise<string>;

  export function onMessage(
    messaging: Messaging,
    nextOrObserver: (payload: MessagePayload) => void
  ): () => void;
}

/**
 * Stand-in for the Socket.IO client in the demo. The app's live views call
 * on / off / emit exactly as they would against the API's /live namespace; here
 * the events come from the in-browser simulation worker instead of Redis.
 */
type Handler = (payload: never) => void;

export class DemoSocket {
  private handlers = new Map<string, Set<Handler>>();
  readonly connected = true;

  on(event: string, fn: Handler): this {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn);
    return this;
  }

  off(event: string, fn?: Handler): this {
    if (fn) this.handlers.get(event)?.delete(fn);
    else this.handlers.delete(event);
    return this;
  }

  /** Client → server messages (room subscriptions) need no handling: there is one visitor. */
  emit(_event: string, _payload?: unknown): this {
    return this;
  }

  close(): void {
    /* nothing to close */
  }

  /** Server → client delivery, used by the demo backend. */
  deliver(event: string, payload: unknown): void {
    for (const fn of [...(this.handlers.get(event) ?? [])]) (fn as (p: unknown) => void)(payload);
  }
}

export const demoSocket = new DemoSocket();

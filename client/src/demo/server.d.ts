export function getDemoServer(): Promise<unknown>;
export function onStatus(fn: (status: string) => void): () => void;
export function demoFetch(input: string, init?: { method?: string; headers?: Record<string, string>; body?: BodyInit | null }): Promise<Response>;
export function subscribeLive(fn: (evt: Record<string, unknown> & { at: string }) => void): Promise<{ simulator: boolean; unsubscribe: () => void }>;
export function resetDemoData(): Promise<void>;

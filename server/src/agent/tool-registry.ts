// Tool registry — replaces the giant switch in tool-executor.ts.
// New tools should register themselves here instead of adding a case.
// Migration is incremental: anything not yet registered falls through to the switch.

export type ToolHandler = (input: Record<string, unknown>) => Promise<string> | string;

const handlers = new Map<string, ToolHandler>();

export function registerTool(name: string, handler: ToolHandler): void {
  if (handlers.has(name)) {
    console.warn(`[ToolRegistry] Duplicate registration for "${name}" — overwriting`);
  }
  handlers.set(name, handler);
}

export function registerTools(entries: Record<string, ToolHandler>): void {
  for (const [name, handler] of Object.entries(entries)) {
    registerTool(name, handler);
  }
}

export function hasTool(name: string): boolean {
  return handlers.has(name);
}

export function getTool(name: string): ToolHandler | undefined {
  return handlers.get(name);
}

export function listTools(): string[] {
  return [...handlers.keys()].sort();
}

// Returns null if no handler is registered (caller falls back to legacy switch).
export async function tryExecute(
  name: string,
  input: Record<string, unknown>
): Promise<string | null> {
  const handler = handlers.get(name);
  if (!handler) return null;
  const result = await handler(input);
  return result;
}

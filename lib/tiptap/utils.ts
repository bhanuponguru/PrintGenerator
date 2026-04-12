/** Shared guard helpers for the Tiptap node modules. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Returns true when a string can be parsed as an absolute URL. */
export function isAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return !!parsed.protocol && !!parsed.hostname;
  } catch {
    return false;
  }
}

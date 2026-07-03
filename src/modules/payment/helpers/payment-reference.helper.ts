export function normalizePaysuiteReference(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, 50);
}

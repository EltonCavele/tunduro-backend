export function getDeletedUserEmail(userId: string): string {
  return `deleted-${userId}@deleted.local`;
}

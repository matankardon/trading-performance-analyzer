const GROUP_ORDER = ["Today", "Yesterday", "Previous 7 days", "Older"];

function localDayStart(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function deriveConversationTitle(message) {
  const withoutControls = [...String(message ?? "")].map((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? " " : character;
  }).join("");
  const title = withoutControls
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
  return title || "New chat";
}

export function conversationGroup(updatedAt, now = new Date()) {
  const updatedDay = localDayStart(updatedAt);
  const today = localDayStart(now);
  if (!updatedDay || !today) return "Older";
  const daysAgo = Math.floor((today.getTime() - updatedDay.getTime()) / 86_400_000);
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo <= 7) return "Previous 7 days";
  return "Older";
}

export function relativeConversationTime(updatedAt, now = new Date()) {
  const updated = new Date(updatedAt);
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(updated.getTime()) || Number.isNaN(current.getTime())) return "Unknown time";
  const elapsed = Math.max(0, current.getTime() - updated.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && conversationGroup(updatedAt, now) === "Today") return `${hours}h ago`;
  if (conversationGroup(updatedAt, now) === "Yesterday") return "Yesterday";
  const days = Math.floor(elapsed / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return updated.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function groupConversations(conversations, now = new Date()) {
  const groups = new Map(GROUP_ORDER.map((label) => [label, []]));
  (Array.isArray(conversations) ? conversations : []).forEach((conversation) => {
    groups.get(conversationGroup(conversation.updated_at ?? conversation.updatedAt, now)).push(conversation);
  });
  return GROUP_ORDER
    .map((label) => ({ label, conversations: groups.get(label) }))
    .filter(({ conversations: entries }) => entries.length > 0);
}

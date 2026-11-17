// Tiny inline Markdown for config strings: only **strong** and *em*. Input is escaped first.
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function inlineMd(src: string): string {
  return src
    .replace(/[&<>"']/g, (c) => ESC[c])
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

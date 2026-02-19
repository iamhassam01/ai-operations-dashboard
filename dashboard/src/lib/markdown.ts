// ─── Shared Markdown Renderer ─────────────────────────────────────────
// Converts markdown text to HTML for display in chat bubbles,
// task detail drawers, and other UI surfaces.

export function renderMarkdown(text: string): string {
  if (!text) return '';
  let html = text;

  // Escape HTML entities for safety
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const label = lang ? `<span class="chat-code-lang">${lang}</span>` : '';
    return `<div class="chat-code-block">${label}<pre><code>${code.trim()}</code></pre></div>`;
  });

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');

  // Tables (must run before paragraph/line-break processing)
  html = html.replace(/((?:\|[^\n]+\|[ \t]*\n?)+)/g, (_match, tableBlock: string) => {
    const rows = tableBlock.trim().split('\n').map((r: string) => r.trim());
    if (rows.length < 2) return tableBlock;

    // Verify second row is a separator (|---|---|)
    if (!/^\|[\s:|-]+\|$/.test(rows[1])) return tableBlock;

    const parseRow = (row: string) =>
      row.split('|').slice(1, -1).map((c: string) => c.trim());

    const headers = parseRow(rows[0]);
    const headerHtml = headers.map((h: string) => `<th>${h}</th>`).join('');

    const bodyHtml = rows
      .slice(2)
      .filter((r: string) => r.trim())
      .map((row: string) => {
        const cells = parseRow(row);
        return `<tr>${cells.map((c: string) => `<td>${c}</td>`).join('')}</tr>`;
      })
      .join('');

    return `<div class="chat-table-wrapper"><table class="chat-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
  });

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 class="chat-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="chat-h3">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="chat-h2">$1</h2>');

  // Links [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>',
  );

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="chat-hr"/>');

  // Ordered lists
  html = html.replace(/(?:^|\n)((?:\d+\.\s+.+\n?)+)/g, (_m, block: string) => {
    const items = block
      .trim()
      .split('\n')
      .map((l: string) => l.replace(/^\d+\.\s+/, '').trim())
      .filter(Boolean)
      .map((item: string) => `<li>${item}</li>`)
      .join('');
    return `<ol class="chat-ol">${items}</ol>`;
  });

  // Unordered lists
  html = html.replace(/(?:^|\n)((?:[-*]\s+.+\n?)+)/g, (_m, block: string) => {
    const items = block
      .trim()
      .split('\n')
      .map((l: string) => l.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean)
      .map((item: string) => `<li>${item}</li>`)
      .join('');
    return `<ul class="chat-ul">${items}</ul>`;
  });

  // Blockquotes
  html = html.replace(/(?:^|\n)((?:&gt;\s?.+\n?)+)/g, (_m, block: string) => {
    const content = block
      .trim()
      .split('\n')
      .map((l: string) => l.replace(/^&gt;\s?/, ''))
      .join('<br/>');
    return `<blockquote class="chat-blockquote">${content}</blockquote>`;
  });

  // Double newlines → paragraph breaks
  html = html.replace(/\n\n+/g, '</p><p class="chat-p">');
  // Single newlines → line breaks
  html = html.replace(/\n/g, '<br/>');

  if (!/^<(h[2-4]|div|ol|ul|blockquote|hr|p|table)/.test(html)) {
    html = `<p class="chat-p">${html}</p>`;
  }

  return html;
}

// Splits a raw job description into renderable blocks:
//   "## Heading"            → { type: 'heading', text }
//   "- item" / "• item"     → { type: 'bullet', text }
//   other consecutive lines → { type: 'paragraph', text } (blank line ends it)
export function parseDescription(text) {
  if (!text || !text.trim()) return [];

  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((raw) => {
      const line = raw.trim();
      if (!line) {
        flush();
      } else if (line.startsWith('## ')) {
        flush();
        blocks.push({ type: 'heading', text: line.slice(3).trim() });
      } else if (/^[-•*]\s+/.test(line)) {
        flush();
        blocks.push({ type: 'bullet', text: line.replace(/^[-•*]\s+/, '') });
      } else {
        paragraph.push(line);
      }
    });
  flush();

  return blocks;
}

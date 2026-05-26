function htmlEscape(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function codeTag(value: unknown): string {
  return `<code>${htmlEscape(value)}</code>`;
}

export { htmlEscape, codeTag };

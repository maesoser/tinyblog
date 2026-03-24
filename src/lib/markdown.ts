import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import typescript  from 'highlight.js/lib/languages/typescript';
import javascript  from 'highlight.js/lib/languages/javascript';
import python      from 'highlight.js/lib/languages/python';
import bash        from 'highlight.js/lib/languages/bash';
import sql         from 'highlight.js/lib/languages/sql';
import json        from 'highlight.js/lib/languages/json';
import yaml        from 'highlight.js/lib/languages/yaml';
import go          from 'highlight.js/lib/languages/go';
import css         from 'highlight.js/lib/languages/css';
import xml         from 'highlight.js/lib/languages/xml';
import markdown    from 'highlight.js/lib/languages/markdown';
import rust        from 'highlight.js/lib/languages/rust';

// ── Register languages ─────────────────────────────────────────────────────

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python',     python);
hljs.registerLanguage('bash',       bash);
hljs.registerLanguage('shell',      bash);  // alias
hljs.registerLanguage('sql',        sql);
hljs.registerLanguage('json',       json);
hljs.registerLanguage('yaml',       yaml);
hljs.registerLanguage('go',         go);
hljs.registerLanguage('css',        css);
hljs.registerLanguage('xml',        xml);
hljs.registerLanguage('html',       xml);   // alias
hljs.registerLanguage('markdown',   markdown);
hljs.registerLanguage('rust',       rust);

// ── marked configuration ───────────────────────────────────────────────────

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    /**
     * Override code block rendering to inject highlight.js tokens at render
     * time. The output HTML has colours baked in — no client-side JS needed.
     * Unknown / unspecified languages fall through to escaped plaintext.
     */
    code({ text, lang }): string {
      const validLang = lang && hljs.getLanguage(lang) ? lang : null;
      const highlighted = validLang
        ? hljs.highlight(text, { language: validLang }).value
        : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const langClass = validLang ?? 'plaintext';
      return `<pre><code class="hljs language-${langClass}">${highlighted}</code></pre>\n`;
    },
  },
});

/**
 * Render a markdown string to an HTML string (body fragment, no <html> wrapper).
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  return marked.parse(markdown);
}

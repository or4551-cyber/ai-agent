export async function webBrowse(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AI-Agent/1.0',
    },
    signal: AbortSignal.timeout(15000),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text')) {
    return `Non-text content (${contentType}), size: ${res.headers.get('content-length')} bytes`;
  }

  const html = await res.text();
  // Strip HTML tags for a clean text version
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Truncate to avoid huge context
  const maxLen = 8000;
  return text.length > maxLen ? text.substring(0, maxLen) + '\n...(truncated)' : text;
}

export async function webSearch(query: string): Promise<string> {
  // Use DuckDuckGo HTML for a simple search without API key
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AI-Agent/1.0',
    },
    signal: AbortSignal.timeout(15000),
  });

  const html = await res.text();
  // Extract result snippets
  const results: string[] = [];
  const regex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null && results.length < 10) {
    const link = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    if (title && link) {
      results.push(`${title}\n  ${link}`);
    }
  }

  // Also try to get snippets
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null && snippets.length < 10) {
    snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
  }

  const combined = results.map((r, i) => {
    return snippets[i] ? `${r}\n  ${snippets[i]}` : r;
  });

  return combined.length > 0
    ? `Search results for "${query}":\n\n${combined.join('\n\n')}`
    : `No results found for "${query}"`;
}

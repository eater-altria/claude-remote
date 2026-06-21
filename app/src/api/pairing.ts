/**
 * Pairing payload encoded in the QR codes the server/relay print. Mirrors
 * server/src/pairing.ts — keep both in sync.
 *
 * Canonical form:  claude-remote://add?url=<baseUrl>&token=<token>&name=<label>
 *   - `token` is present in server-printed QRs (full one-tap add).
 *   - `token` is absent in relay-printed QRs (the relay never sees it), so the
 *     scan screen prefills the address and asks the user to paste the token.
 *
 * We also accept a bare http(s):// URL (treated as address-only) and a plain
 * JSON `{url,token,name}` blob, to be forgiving about what got encoded.
 */
export interface Pairing {
  url: string;
  token?: string;
  name?: string;
}

export function parsePairing(raw: string): Pairing | null {
  const text = raw.trim();
  if (!text) return null;

  // claude-remote://add?url=...&token=...&name=...
  if (/^claude-remote:\/\//i.test(text)) {
    const q = text.indexOf('?');
    if (q < 0) return null;
    const params = new URLSearchParams(text.slice(q + 1));
    const url = params.get('url')?.trim();
    if (!url) return null;
    return clean({ url, token: params.get('token') ?? undefined, name: params.get('name') ?? undefined });
  }

  // Plain JSON blob.
  if (text.startsWith('{')) {
    try {
      const o = JSON.parse(text) as Partial<Pairing>;
      if (o && typeof o.url === 'string' && o.url.trim()) {
        return clean({ url: o.url, token: o.token, name: o.name });
      }
    } catch {
      /* not JSON — fall through */
    }
    return null;
  }

  // Bare address (relay-style, token entered manually).
  if (/^https?:\/\//i.test(text)) return clean({ url: text });

  return null;
}

function clean(p: Pairing): Pairing {
  return {
    url: p.url.trim().replace(/\/+$/, ''),
    token: p.token?.trim() || undefined,
    name: p.name?.trim() || undefined,
  };
}

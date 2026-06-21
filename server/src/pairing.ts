/**
 * Pairing URI shared by the QR-code onboarding flow. The mobile app scans one of
 * these (printed as a QR on server/relay startup) to add a server without typing
 * the address + token by hand.
 *
 * Form: claude-remote://add?url=<baseUrl>&token=<token>&name=<label>
 *   - `token` is omitted for relay-printed QRs (the relay never sees the raw
 *     token), in which case the app prompts for it after prefilling the address.
 *
 * The app mirrors this format in app/src/api/pairing.ts — keep both in sync.
 */
export function pairingUri(opts: { url: string; token?: string; name?: string }): string {
  const p = new URLSearchParams();
  p.set('url', opts.url);
  if (opts.token) p.set('token', opts.token);
  if (opts.name) p.set('name', opts.name);
  return `claude-remote://add?${p.toString()}`;
}

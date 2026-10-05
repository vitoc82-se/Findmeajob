// A random id this browser makes up for itself and sends with the public search calls,
// so the rate limit can tell phones on the same mobile network apart. It identifies
// nobody (no account, no personal data) and is only a counter key; clearing site data
// gives a new one, which is why the per-IP and global caps still stand behind it.
const KEY = "fmaj-did";

export function deviceId(): string {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved && /^[a-z0-9]{16,40}$/.test(saved)) return saved;
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const id = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "";
  }
}

export function deviceHeaders(): Record<string, string> {
  const id = deviceId();
  return id ? { "x-fmaj-did": id } : {};
}

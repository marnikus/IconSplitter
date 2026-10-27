/** Basenames only, portable to Windows; FTP commands must never receive control bytes. */
export function safeMediaName(name: string): boolean {
  if (name.length > 190 || /[/\\%:<>"|?*]/.test(name) || name.trim() !== name) return false;
  if (Array.from(name).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return false;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(name)) return false;
  return /^[^.].*\.(jpg|jpeg|png|svg|eps|zip)$/i.test(name);
}

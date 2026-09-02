const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'yahoo.co.uk', 'gmx.de', 'gmx.net', 'web.de', 'icloud.com',
  'me.com', 'proton.me', 'protonmail.com', 'mail.ru', 'yandex.ru', 'qq.com',
]);
const ROLE_WORDS = new Set([
  'info', 'admin', 'office', 'contact', 'secretariat', 'secretary', 'board',
  'exec', 'team', 'mail', 'email', 'kontakt', 'buero', 'bureau', 'general',
  'president', 'chair', 'communications', 'comms', 'membership', 'hello',
]);

/**
 * Heuristic: does this address look like an individual's private mailbox?
 * @param {unknown} email
 * @returns {boolean}
 */
export function looksPersonal(email) {
  if (typeof email !== 'string' || !email.includes('@')) return false;
  const [local, domain] = email.toLowerCase().split('@');
  if (FREE_MAIL.has(domain)) return true;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.some((p) => ROLE_WORDS.has(p))) return false;
  // firstname.lastname or f.lastname patterns
  if (parts.length >= 2 && parts.every((p) => /^[a-z]+$/.test(p)) && parts.some((p) => p.length >= 3)) {
    return true;
  }
  return false;
}

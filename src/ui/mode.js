/**
 * @param {{location: {search: string}, auth: import('../ports/index.js').AuthPort, config: any}} deps
 * @returns {Promise<'read'|'edit'>}
 */
export async function detectMode({ location, auth, config }) {
  const hasParam = new URLSearchParams(location.search).has(config.editParam || 'edit');
  const trigger = config.editTrigger || 'either';

  if ((trigger === 'session' || trigger === 'either') && auth.hasSession()) {
    if (await auth.restore()) return 'edit';
  }
  if ((trigger === 'param' || trigger === 'either') && hasParam) {
    return 'edit';
  }
  return 'read';
}

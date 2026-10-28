// How a guest with ?k= is classified, and how an owner save keeps an old link key.
// Pure functions so the emulator-free tests can lock the production cases.

export function decideGuestAccess({ sessionOpened, sharingMode, base }) {
  if (sessionOpened) return 'viewer'
  // A stray ?k= on a public (or unreadable) document must not block the library.
  // Link mode with a rejected session stays closed. Unreadable sharing falls
  // through to a books probe: public mode succeeds, a wrong link key does not.
  if (sharingMode === 'link') return 'denied'
  if (base === 'probe') return 'probe'
  return base
}

export function planSharingSave({
  mode,
  allowComments,
  existingSharingLinkKey = '',
  linkDocKey = '',
  localKey = '',
  nextLinkKey = '',
}) {
  const explicit = typeof nextLinkKey === 'string' ? nextLinkKey : ''
  const preserved = explicit || localKey || linkDocKey || existingSharingLinkKey || ''
  return {
    sharing: { mode, allowComments: !!allowComments },
    // Write this to hondoko-config/link BEFORE replacing sharing.
    // Null means there was no key to keep (caller may mint one only for mode=link).
    writeLinkKeyFirst: preserved || null,
  }
}

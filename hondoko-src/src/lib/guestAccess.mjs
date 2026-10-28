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

const URL_SAFE = /^[A-Za-z0-9_-]+$/

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
  const sharing = { mode, allowComments: !!allowComments }
  const safe = typeof preserved === 'string' && URL_SAFE.test(preserved)
  // New or existing keys of 8+ go to the private link doc. sharing.linkKey is removed.
  if (safe && preserved.length >= 8 && preserved.length <= 128) {
    return { sharing, writeLinkKeyFirst: preserved, preserveShortLinkKey: false }
  }
  // An already issued 1–7 character key cannot be copied: link-doc writes require 8+.
  // Leave it on sharing so the handed-out ?k= still matches. Do not mint a replacement.
  if (!explicit && safe && preserved.length >= 1 && preserved.length < 8) {
    return {
      sharing: { ...sharing, linkKey: preserved },
      writeLinkKeyFirst: null,
      preserveShortLinkKey: true,
    }
  }
  return { sharing, writeLinkKeyFirst: null, preserveShortLinkKey: false }
}

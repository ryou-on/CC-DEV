export function decideGuestAccess(input: {
  sessionOpened: boolean
  sharingMode: string | null
  base: string
}): string

export function planSharingSave(input: {
  mode: string
  allowComments: boolean
  existingSharingLinkKey?: string | null
  linkDocKey?: string | null
  localKey?: string | null
  nextLinkKey?: string | null
}): {
  sharing: { mode: string; allowComments: boolean; linkKey?: string }
  writeLinkKeyFirst: string | null
  preserveShortLinkKey: boolean
}

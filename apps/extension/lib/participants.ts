/**
 * The one derivation of "who is in the room" for every UI. The popup's list and
 * the sidebar's tiles both render this, so they cannot disagree about order,
 * naming, or which peers are hidden.
 */
import type { PeerId } from '@gj/shared';
import type { PeerMediaState, Snapshot } from './messages';
import { isObserver } from './peer-id';

export type Participant = {
  peerId: PeerId;
  name: string;
  self: boolean;
  leader: boolean;
  /** Mesh state as seen from this client; null for self and for peers not yet negotiated. */
  media: PeerMediaState | null;
  /** Our own detector for self, the remote analyser for peers. */
  speaking: boolean;
  /** Our own toggle for self, the peer's self-report for others, null until they have told us. */
  micOn: boolean | null;
  camOn: boolean | null;
  /** The mesh connection to this peer dropped (never true for self). */
  lost: boolean;
};

export type ParticipantsOptions = {
  /** Put the local participant first (the sidebar); otherwise keep the server's join order (the popup). */
  selfFirst?: boolean;
  /** Label for the local participant when the snapshot has no name for it. */
  selfName?: string;
};

export function participantsFrom(
  s: Pick<Snapshot, 'peers' | 'yourPeerId' | 'room' | 'peerMedia'> & Partial<Pick<Snapshot, 'speaking' | 'micOn' | 'camOn'>>,
  { selfFirst = false, selfName = 'You' }: ParticipantsOptions = {},
): Participant[] {
  const me = s.yourPeerId;
  const leaderId = s.room?.leaderId ?? null;
  const out: Participant[] = [];
  for (const p of s.peers) {
    if (isObserver(p.peerId)) continue;
    const self = p.peerId === me;
    const media = self ? null : s.peerMedia[p.peerId] ?? null;
    out.push({
      peerId: p.peerId, name: p.name, self, leader: p.peerId === leaderId, media,
      speaking: self ? s.speaking ?? false : media?.speaking ?? false,
      micOn: self ? s.micOn ?? null : media?.micOn ?? null,
      camOn: self ? s.camOn ?? null : media?.camOn ?? null,
      lost: !self && !!media && (media.connectionState === 'disconnected' || media.connectionState === 'failed'),
    });
  }
  if (me && !out.some((p) => p.self)) {
    // Between "join sent" and the server's room frame we are not in the peer list yet.
    out.unshift({ peerId: me, name: selfName, self: true, leader: leaderId === me, media: null, speaking: s.speaking ?? false, micOn: s.micOn ?? null, camOn: s.camOn ?? null, lost: false });
  }
  if (selfFirst) out.sort((a, b) => Number(b.self) - Number(a.self));
  return out;
}

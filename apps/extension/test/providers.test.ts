import { describe, it, expect } from 'vitest';
import { adapterForDocument, playerUrlOf } from '../lib/providers';

const WIX_EMBED = 'https://embed.wix.com/video?instanceId=11111111-2222-4333-8444-555555555555&channelId=0123456789abcdef0123456789abcdef&videoId=fedcba9876543210fedcba9876543210&compId=comp-abc123';
const WIX_SITE = 'https://example.wixsite.com/site/videos';
const YOUTUBE = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

/** The content script is injected into every matching frame; this is what decides whether it stays. */
describe('which documents the player script runs in', () => {
  it('runs in a Wix video widget, framed on any site or opened on its own', () => {
    expect(adapterForDocument(WIX_EMBED, false)?.providerId).toBe('wixvideo');
    expect(adapterForDocument(WIX_EMBED, true)?.providerId).toBe('wixvideo');
  });

  it('stays out of the frames of a site that is not embedded', () => {
    // YouTube and HBO Max put frames of their own host in the page; the player is the top document.
    expect(adapterForDocument(YOUTUBE, true)?.providerId).toBe('youtube');
    expect(adapterForDocument(YOUTUBE, false)).toBeNull();
    expect(adapterForDocument('https://play.hbomax.com/video/watch/b411d5ce-0436-44a5-856b-473fc140fe79', false)).toBeNull();
  });

  it('stays out of an embedded provider\'s frames that are not a video', () => {
    expect(adapterForDocument('https://embed.wix.com/video?channelId=0123456789abcdef0123456789abcdef', false)).toBeNull();
    // The harness's Drive shape frames a fake YouTube embed on a harness host; that frame is not the player.
    expect(adapterForDocument('http://127.0.0.1:14173/ytembed', false)).toBeNull();
    expect(adapterForDocument('http://localhost:14173/wixembed/urn:hbo:episode:G0000001', false)?.providerId).toBe('harness');
  });
});

describe('the active tab\'s player, for the popup', () => {
  it('is the tab itself on a player site', () => {
    expect(playerUrlOf(YOUTUBE, [YOUTUBE, 'https://www.youtube.com/embed/other'])).toBe(YOUTUBE);
  });

  it('is the video widget\'s frame on a Wix site', () => {
    expect(playerUrlOf(WIX_SITE, [WIX_SITE, 'https://static.parastorage.com/services/x.html', WIX_EMBED])).toBe(WIX_EMBED);
  });

  it('is nothing on a page with no player', () => {
    expect(playerUrlOf('https://example.com/', ['https://example.com/', 'https://www.youtube.com/embed/aqz-KE-bpKQ'])).toBeNull();
  });
});

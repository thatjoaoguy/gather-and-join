/**
 * The page-world half of the Disney+ adapter (lib/providers/disney-page.ts).
 * Not a manifest entry: the worker injects it into a Disney+ player frame when
 * that frame's content script asks (`mainWorld`), so it only ever runs where the
 * user has granted Disney+. Wiring only.
 */
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { DisneyPage } from '../lib/providers/disney-page';
import { domChannel, FROM_PAGE, TO_PAGE } from '../lib/providers/disney-channel';

export default defineUnlistedScript(() => {
  // A re-injected content script asks again; one copy per document is enough.
  const w = window as unknown as { __gjDisneyBridge?: boolean };
  if (w.__gjDisneyBridge) return;
  w.__gjDisneyBridge = true;
  new DisneyPage(document, domChannel(document, FROM_PAGE, TO_PAGE)).start();
});

# Gather & Join design system · v1.0

Open [index.html](index.html) in a browser. This is the final visual specification: foundations, room popup, setup, participant HUD, interactive controls, motion, and feedback states. Everything loads locally without a build or server.

The system is dark, welcoming, polished, and simple for friends and family. Participants stay visible; the streaming content stays the focus.

## Approved foundation

- **Typography:** Quicksand, bundled locally in weights 400, 500, 600, and 700.
- **Shape and motion:** round and playful. Panels 28px, controls 22px, small participant tiles 14px, avatars circular.
- **Brand balance:** purple for Join, warm pink-red for Create, with equal action weight in the lobby.
- **Mark:** Softer heart, the original heart-shaped loveseat without feet or a play icon. Purple left half, red right half.
- **Wordmark:** purple “Gather”, white (`#FFFFFF`) ampersand, red “Join”, supplied as outlined SVG.
- **Primary lockup:** mark to the left of the name. Do not stack the mark above the wordmark; their color boundaries should not imply a shared vertical split.
- **Environment:** dark mode only. Large surfaces and the viewing HUD remain subdued.

### Color tokens

| Role | CSS token | Value | Usage |
| --- | --- | --- | --- |
| Canvas | `--bg` | `#101014` | Page background |
| Surface | `--surface` | `#1C1922` | Panels |
| Raised | `--raised` | `#272130` | Hover surfaces |
| Field | `--field` | `#141118` | Inputs, inset content |
| Decorative border | `--line` | `#44394E` | Dividers and panel edges |
| Control border | `--control-border` | `#8F7FA0` | Essential control boundaries |
| Primary text | `--text` | `#F4F0FA` | Body and headings |
| Secondary text | `--muted` | `#C3BACF` | Help and metadata |
| Purple | `--purple` | `#B9A0FF` | Join and primary recovery actions |
| Brand red | `--red` | `#FA8294` | Create and brand details |
| Accent text | `--on-accent` | `#1C112E` | Text on solid accent buttons |
| Focus | `--focus` | `#D5C3FF` | 3px outline, 4px offset |

### Semantic colors

| Role | Foreground / border | Background tint | CSS tokens | Meaning |
| --- | --- | --- | --- | --- |
| Info | `#94C5FF` | `#192536` | `--info`, `--info-bg` | Helpful context or role changes |
| Warning | `#F2C66D` | `#2B2419` | `--warning`, `--warning-bg` | A condition needs attention |
| Success | `#86D6B0` | `#192A24` | `--success`, `--success-bg` | An action completed or connection recovered |
| Error | `#FF9B8C` | `#2E1E20` | `--error`, `--error-bg` | An action failed and needs recovery |

Always pair semantic color with explicit wording and a status symbol. Errors use the separate coral tone, a dark tinted panel, an error icon, and a clear heading. Recovery actions remain purple. A small hue difference alone does not distinguish errors from brand red.

Keep persistent “Connected” labels neutral. Success feedback is brief; unresolved warnings and errors remain visible. During playback use restrained labels and messages rather than bright fills across large areas.

### Typography and layout reference

| Role | Size / weight | Line height |
| --- | --- | --- |
| Product heading | 26px / 700 | 1.18 |
| Section heading | 22px / 700 | 1.2 |
| Body | 14px / 500 | 1.55 |
| Action | 14px / 700 | 1.55 |
| Field label | 13px / 600 | 1.5 |
| Compact status | 12px / 500 | 1.5 |
| Room code | 25px / 700, 0.15em tracking | 1.55 |

Spacing scale: 4, 8, 12, 16, 24, 32px. Popup target: 360px wide, 24px padding, 12px control gaps, minimum 44px control height. Constrain the live popup to its available height and allow scrolling. Large showcase headings are document typography, not popup typography.

The HUD reference uses a 180px rail on wide windows; the current extension uses 240px. Validate that change with real video and fullscreen layouts. Keep tile order stable and protect subtitles. The narrow showcase rail demonstrates compact sizing; production participant overflow still needs implementation.

### Motion

- Arrival: `360ms cubic-bezier(.2,.9,.3,1.35)`, 10px rise with slight overshoot.
- Button hover: 2px lift; press: scale to 96%.
- Color feedback: 120ms ease.
- No idle bounce, moving gradients, pulsing speaking borders, or repeated retry animations while watching.
- System reduced-motion preferences always win. Remove movement and transitions while retaining immediate text feedback.

## Brand assets

`brand/lockup.svg` is the primary horizontal mark-and-name asset. `brand/wordmark.svg` contains the name alone. Both use Quicksand Bold converted to vector paths after shaping with kerning, and require no font loading at display time. White and dark single-color variants are supplied for both. Keep the assets’ spacing and aspect ratios intact. Use the primary color versions on dark backgrounds; choose the dark single-color version on light backgrounds so the ampersand remains visible.

`brand/mark.svg` is the canonical vector geometry on a 128 × 128 transparent canvas. `brand/mark-white.svg` and `brand/mark-dark.svg` preserve the same shape in one color. PNG exports at 16, 32, 48, 128, 256, and 512px are rasterizations of that approved geometry with transparent backgrounds.

Use the color mark by default, and the white or dark versions for single-color contexts or background contrast. Preserve the viewBox padding, proportions, and center seam. Keep purple on the left and red on the right. Do not add feet, a play symbol, gradients, or other details. Alongside the wordmark, the image is decorative; when used alone, supply an accessible name such as “Gather & Join”.

The 16px icon uses the same approved geometry; its center seam is small. The extension's toolbar icons (`apps/extension/public/icon`) are rasterized from `mark.svg` with a tight square crop (viewBox `10 8.5 108 108`) so the mark fills Chrome's icon frame; the padded PNGs here remain the general-purpose exports. The lockup ships on the popup and setup page (`apps/extension/public/brand`).

## Files

| File | Purpose |
| --- | --- |
| [index.html](index.html) | Canonical interactive visual specification |
| [system.css](system.css) | Approved tokens and showcase styles |
| [system.js](system.js) | Local interaction simulations |
| [fonts.css](fonts.css) | Quicksand declarations |
| [Horizontal lockup](brand/lockup.svg) | Primary mark and outlined name; white/dark variants alongside it |
| [Outlined wordmark](brand/wordmark.svg) | Name-only vector asset; no font dependency |
| [Brand mark](brand/mark.svg) | Canonical color SVG; white/dark variants and PNG icon sizes alongside it |
| `fonts/quicksand-*.ttf` | Approved font weights |
| [Font license](fonts/quicksand-LICENSE.txt) | Quicksand redistribution license |

Decision comparisons, generated screenshots, rejected font families, and deliberation notes have been removed. Approved outcomes are consolidated here and in the showcase.

## Implementation boundary

This is the design specification. It is applied to the extension as of the
commit that follows the approved screens (`screens/index.html`): the popup, the
setup page and the participant HUD implement those screens, with the tokens in
`apps/extension/lib/ui/system.css` and the HUD's own copy inside its shadow root. Interactions simulate room activity, permissions, device toggles, and settings. Copying the sample room code uses the browser clipboard; no other interaction affects external state.

Apply the system to:

- `apps/extension/entrypoints/popup/`: lobby, room controls, validation, recovery.
- `apps/extension/entrypoints/options/`: device permissions, ducking, connection settings.
- `apps/extension/lib/sidebar/sidebar-view.ts`: participant HUD; preserve shadow-root isolation, fullscreen mounting, and live media streams.

Bundle fonts for each extension surface, including the HUD’s shadow root. Preserve current behavior: mic on by default, camera opt-in, ducking off by default, manual resume after buffering, host-controlled episode changes, and everyone able to play/pause.

Product dependencies remain separate from styling: invites carrying the server address and room code, host setup guidance, connection-quality detection, and participant overflow. Speaking state (derived locally from each peer's audio level), remote mute indicators (a `media` frame on the wire) and server reachability (a connect-and-ping probe) were implemented alongside the screens. A room host and the person running the server are distinct roles. A broader icon library and illustration system are outside this specification.

## Validation

Browser checks cover local assets and links, room validation, joining/creating/leaving, media toggles, connection-address validation, status feedback, reduced motion, and responsive overflow at 390, 768, and 1440px. Visual inspection covers the final palette and representative surfaces.

Checked contrast ratios: purple action text 8.16:1; red action text 7.43:1; secondary text on surfaces 9.28:1; input border on field 5.09:1. Semantic foreground on tint: info 8.60:1, warning 9.55:1, success 8.77:1, error 7.80:1. This is not a full accessibility audit.

Implementation acceptance: keyboard operation and visible focus; labeled toggle states; validation tied to help text; polite status announcements; no color-only meaning; at least 4.5:1 text contrast and 3:1 essential control boundaries; reduced-motion support; stable participants and unobstructed subtitles in normal and fullscreen viewing.

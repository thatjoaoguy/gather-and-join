---
sidebar_position: 1
title: Install
---

# Install the extension

Gather & Join is a browser extension for Chrome and Firefox. It needs Chrome (or
another Chromium-based browser that installs from the Chrome Web Store) or
Firefox 140 or later and, for the call, a microphone. A camera is optional.
Everyone in a room can use either browser.

## From the Chrome Web Store

The listing is unlisted for now: install from the link the person hosting your
server shares with you. Chrome keeps it updated automatically, usually within a
few hours of a release; to do it now, turn on Developer mode at
`chrome://extensions` and press **Update**. The setup page shows the version
you have at the bottom, and says when it is behind the server's.

## In Firefox

Gather & Join is not on addons.mozilla.org yet. Until it is, each release carries
a Firefox package that Firefox loads as a temporary add-on:

1. Download `gather-and-join-<version>-firefox.zip` from the
   [latest release](https://github.com/thatjoaoguy/gather-and-join/releases/latest).
2. Open `about:debugging#/runtime/this-firefox` and press **Load Temporary Add-on…**.
3. Pick the ZIP you downloaded. The setup page opens by itself.

Firefox removes a temporary add-on when it quits, so you load it again the next
time, and allow the microphone and paste the address again with it. Nothing
updates it either: download the new package when a release comes out.

In a room, Firefox keeps your microphone and camera in a pinned Gather & Join tab,
because it only lets a tab use them. The tab comes to the front for a moment when
you join and when you turn the camera on, then goes back to the show. Leave it
open: closing it mutes you, and it closes by itself when you leave the room.

## First-time setup

1. Click the extension's icon and open **Connection & device setup**. In Firefox
   the icon is under the Extensions button (the puzzle piece) until you pin it.
2. Press **Allow microphone**. Allow the camera too if you want to use it.
3. Paste the **connection address** the host shared with you (it usually starts
   with `wss://`) and press **Save address**.

You only do this once, unless the host's address changes.

## Building it yourself

The repository builds the extension for both browsers with one command; the
[quick start](/docs/development#quick-start) has the details. Load the Chrome
build unpacked from `chrome://extensions` with Developer mode on, or the Firefox
build from `about:debugging` as above.

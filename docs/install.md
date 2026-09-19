---
sidebar_position: 1
title: Install
---

# Install the extension

Gather & Join is a Chrome extension. It needs Chrome (or another Chromium-based
browser that installs from the Chrome Web Store) and, for the call, a
microphone. A camera is optional.

## From the Chrome Web Store

The listing is unlisted for now: install from the link the person hosting your
server shares with you. Chrome keeps it updated automatically.

## First-time setup

1. Click the extension's icon and open **Connection & device setup**.
2. Press **Allow microphone**. Allow the camera too if you want to use it.
3. Paste the **connection address** the host shared with you (it usually starts
   with `wss://`) and press **Save address**.

You only do this once, unless the host's address changes.

## Building it yourself

The repository builds the extension with one command; the README's Quick start
has the details. Load the built folder unpacked from `chrome://extensions` with
Developer mode on.

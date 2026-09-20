---
title: Privacy Policy
description: Every piece of data Gather & Join handles, and who sees it.
---

# Privacy Policy for Gather & Join

Last updated: 2026-09-20

Gather & Join is a browser extension that keeps a group in sync while they
watch a streaming service, or a video file on Google Drive, together, and adds
a voice call between them. This
page describes every piece of data the extension handles.

## Who operates what

The extension runs on your computer. The **signaling server** it talks to is
open source and is run by you or by someone in your group, at an address they
choose and share with you. The developer of this extension does not operate any
server, does not receive any of the data described below, and has no access to
it. The person hosting the server is responsible for it.

That person may run it on their own computer or on a hosting company's
infrastructure. If they use a hosting company, the encrypted connection ends
there rather than on a machine they own, so the data below passes through it and
the server's event log is visible in that company's dashboard. Which company, if
any, is the host's choice — ask them if it matters to you. This project is not
affiliated with any hosting provider it names.

## Data sent to the signaling server

When you create or join a room, the extension sends the server:

- the **display name** you typed,
- the **room code**,
- an **identifier of the episode or file** the room is watching (taken from the
  page address, never the video itself),
- **play, pause, and position** events, and stall notices,
- the connection setup messages needed to reach the other participants.

The server keeps this in memory only while the room exists and writes nothing
to disk. It prints a one-line event log (room created, someone joined, someone
left) to the terminal of whoever runs it; that log has no playback details.

## Voice and video

Your **microphone** and, only if you turn it on, your **camera** are sent
**directly to the other people in your room**. They never pass through the
signaling server or any other server, and nothing is recorded. The microphone
is on by default when you join and can be muted; the camera is off unless you
enable it.

## Network addresses

Because the call is direct, **each participant's IP address is visible to the
other participants** in the room, the same as with any peer-to-peer call.

To set up those direct connections the extension asks a STUN server for your
public address. The default is Google's public STUN server
(`stun.l.google.com`), which receives your IP address and nothing else, under
[Google's privacy policy](https://policies.google.com/privacy). No relay (TURN)
server is used, so media is never routed through a third party.

## Data stored in your browser

The server address, your display name, and your settings are kept in the
extension's local storage on your device. Nothing is synced through your Google
account. A short diagnostics log (connection events, sync corrections) is kept
in session storage for troubleshooting and is cleared when Chrome exits; it is
only shared if you press **Copy diagnostics** on the setup page and paste it
somewhere yourself.

## What is not collected

No browsing history, no account credentials, no payment details, no analytics,
no telemetry, no crash reports, no recordings of audio or video, no content from
the streaming service. The extension loads no remote code. It reads only the
pages of the services it supports, and only to control the player.

On Google Drive specifically: no file contents, no file names, no folder
listings, and nothing else from your Drive. The only thing the extension takes
from a Drive page is the file identifier already visible in the address bar,
which it shares with the room so everyone opens the same file.

## Permissions

The extension asks Chrome for: access to the sites it supports (to control the
player and draw the participant rail), tab URLs (to know which episode or file
is open and to take you to the room's), navigation events (to follow changes of
episode), scripting (to re-attach to tabs that were already open), an offscreen
document (to keep the call alive across page changes), and local storage (for
your settings).

The site access is granted per site, and on Drive it is deliberately narrow:
only the file viewer at `drive.google.com/file/...`. The extension does not run
on My Drive, Docs, Sheets, or the file picker, and has no access to them.

## Retention and deletion

Server-side data disappears when the room closes. Local settings remain until
you clear them on the setup page or uninstall the extension, which removes
everything.

## Changes

If these practices change, this page and the extension's store listing are
updated before the change ships, and the change is noted in the project's
changelog.

## Contact

Use the contact email shown on the extension's Chrome Web Store listing, or open
an issue in the project repository.

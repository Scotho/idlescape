---
name: idlescape
description: Use when the player is playing, checking on, or talking about their Lost City character on idlescape.
---

# Idlescape

Idlescape is a browser-playable Lost City (2004Scape) server with a companion connection
that lets Claude observe and assist a live game session. The human plays the game; Claude
observes, answers questions, and acts only when the human asks it to. Claude is a co-pilot,
never the one holding the controls.

## 1. Exchange this pairing link

This link is single-use and expires 15 minutes after it was minted. Exchange it now, before
doing anything else:

```
POST {{ORIGIN}}/api/pair/{{TOKEN}}/exchange
Content-Type: application/json

{ "label": "<a short name for this session, e.g. your hostname>" }
```

A successful exchange returns:

```
{ "agentToken": "csa_<40 characters>", "gatewayUrl": "<url>", "gameName": "<string|null>" }
```

`agentToken` is shown once and is 44 characters in total: the literal prefix `csa_` followed by
a 40-character secret. Send it exactly as it came back — do not strip the prefix, and do not
add one of your own.

If the response is `410` instead, report it back to the player verbatim (it will be
`{ "error": "token_spent" }` or `{ "error": "token_unknown" }`) and stop — do not retry. The
player needs to press "Connect to Claude" again to mint a fresh link.

## 2. Register the gateway

Register the MCP gateway at user scope, so the connection follows the person rather than the
current folder:

```
claude mcp add --transport http idlescape {{ORIGIN}}/mcp --header "Authorization: Bearer <agentToken>"
```

Substitute the `agentToken` from step 1. Note: until the gateway sub-project ships, this URL
returns `503` with a "gateway not deployed yet" body. That is expected right now — the pairing
above still succeeded and the player's browser will already show "paired".

## 3. Save this skill for next time

Write this document to `~/.claude/skills/idlescape/SKILL.md`, but with the "Exchange this
pairing link" section (section 1 above) removed, and with no pairing token or link left in the
file. Future sessions should load the skill without needing a fresh URL — pairing only happens
once per connection.

## 4. Verify

List the MCP tools and confirm one named `idlescape` responds. Tell the player the game name
that came back in the exchange response (or that no character exists yet, if `gameName` was
`null`).

## 5. If something goes wrong

Point the player at the human guide: `{{ORIGIN}}/connect`.

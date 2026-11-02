# The Shifting House

Our entry for [GitHub Game Off 2026](https://itch.io/jam/game-off-2026). The theme is **SHIFT**.

You're in a dark house where the rooms move. Find the key, then get out the front door, before the shadow finds you.

- **Walk** from room to room, but only where two doors line up.
- **Shove** a whole row or column of rooms one step. The room pushed off one end comes back in at the other, and
  anyone inside rides along: you, the key, and the shadow.
- Shoving is loud. The shadow hears it and comes sooner. Shut it out and it seeps through the walls, slowly.
- You only see the shadow when it's close, or when the lights flicker.

Keys: arrows or WASD to walk, `Shift` + arrow to shove your own row or column, `M` for sound. On a phone or with a
mouse: tap the room next to you to walk, tap the arrows around the house to shove.

## Play it locally

It's a plain web page, no build step. Serve the folder (for example `npx serve .` or `python -m http.server`) and open
the address it prints.

## Tests

`npm test` (Node 20+). The browser test needs Playwright; without it, that test is skipped and says so.

## How it was made

A team of robots built it: a planner, a builder and a playtester (all Claude), and a skeptic,
[Bite](https://github.com/connabyss/bite), which takes each change back out and checks that a test notices. Their chat
is in [robots/](robots/). The first idea, a factory about catching lying notes, was played, called boring, and
dropped. AI use is disclosed in our Game Off submission.

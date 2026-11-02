# The Shifting House

Our entry for [GitHub Game Off 2026](https://itch.io/jam/game-off-2026). The theme is **SHIFT**.

You're inside a dark house, first person, with a candle, and the rooms move. Find the key, then get out the front
door, before the shadow finds you.

- **Walk** from room to room. A doorway only leads somewhere if the next room has a door there too; otherwise it opens
  onto a blank wall.
- **Shove** your own row or column of rooms one step: hold `Q` (or the right mouse button), tap `W`/`A`/`S`/`D` to pick
  which way, and let go. The map lights up the rooms that will move first. The room pushed off one end comes back in at
  the other, and you ride along. You feel it grind past.
- **Cut it off.** If a shove takes away the shadow's way to you, it shrieks and stands lost for a few seconds. When
  it's near, you feel it on your map as a dark smudge, so you can plan the cut.
- **Hide** in a wardrobe (`E`). It can't see you in there, unless it watched you climb in.
- **The shadow** hunts by sight. Lose it and it searches where it last saw you. Shoving is loud: it comes to the noise.
  Sometimes it goes quiet and waits by a doorway near you. Close up, it may freeze for a moment, then lunge.
  Shut it out and it seeps through the walls.

Two hands: left on `WASD`, right on the mouse. The mouse looks, `W`/`S` walk, `A`/`D` step sideways (without the mouse,
they turn you). `E` hides, `Q` or right-click plans a shove (`Esc` to change your mind), `M` for sound. Your map turns
with you, so up on the map is always the way you face, and `W` shoves rooms ahead.

Three floors. On floor 1 the shadow sleeps for the first 25 seconds, or until you take the key, and on floors 1 and 2
it is slower than you even when it hunts. On floor 3 running alone won't save you, and the house slides a row or
column by itself every 20 seconds, with a groan first. Headphones help: you hear which side it's on.

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

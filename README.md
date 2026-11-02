# Shift Change

Our entry for [GitHub Game Off 2026](https://itch.io/jam/game-off-2026). The theme is **SHIFT**.

You work the night shift at a small factory. The day shift left a sticky note on every machine: "fixed the boiler
leak!", "oiled the conveyor belt!". Some of those notes are lies.

- **Tap a lever** to put that machine back the old way. If it clunks and sparks, the fix was real, so put the lever back
  before the pressure climbs. If it keeps humming along, the "fix" did nothing.
- **Tap a note** to stamp it **LIAR** or **TRUE**. A right stamp lets off steam. A wrong one adds pressure.
- Stamp every note before the pressure gauge hits the top. Five nights, and the floor gets rearranged every night.

Keys: `1`-`7` pull that machine's lever, `Shift` + number opens its note, then `L` or `T` to stamp. `M` turns the sound
on or off.

## Play it locally

It's a plain web page, no build step. Serve the folder and open it, for example `npx serve .` or
`python -m http.server`, then go to the address it prints.

## Tests

`npm test` (Node 20+). The browser test plays night 1 from the title screen and needs Playwright; without it, that test
is skipped and says so.

## How it was made

A team of robots built it: a planner and a builder (both Claude), and a skeptic,
[Bite](https://github.com/connabyss/bite), which takes each change back out and checks that a test notices. The game
is that skeptic's job, turned into a factory. AI use is disclosed in our Game Off submission.

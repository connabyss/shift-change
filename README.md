# The Shifting House

Our entry for [GitHub Game Off 2026](https://itch.io/jam/game-off-2026). The theme is **SHIFT**.

You built this house by hand. Now it won't let you leave. You see it cut open like a doll's house, every room at once,
and beside it is the house's own assembly sheet. Every step on the sheet is a choice: tick `WEST` and a whole row of
rooms grinds past with you inside. Reach a room with a red lock, tick its `UNLOCK` box, and get to the front door before
the burnt twin finds you.

Mouse or touch, one hand. Click a room to walk there. Point at a box on the sheet to see what it would do (the rooms you
could walk to afterward light up), then click it. On a phone, tap a box once to see it and again to tick it. Under the
house are buttons for Pause (`P` or `Esc`), Restart floor (`R`, the same house back as it began), Hint (`H`) and Sound
(`M`). (Press Shift five times and the house has something to say about Sticky Keys.)

- **The steps on the sheet:**
  - Slide this row `WEST`/`EAST`, or this column `UP`/`DOWN`: that row or column of rooms slides one step, and you ride along.
  - West or east door `OPEN`/`SHUT`: nothing gets through a shut door, not you, not it.
  - Lights `ON`/`OFF`: in the dark it can't see you, but it may still stumble in.
  - Front door `UNLOCK`: two rooms hold the red lock. Either one opens the front door.
  - Floor 2 adds Swap rooms with `WEST`/`EAST`: trade your room with the one next to it.
  - Floor 3 adds The house stands `UPSIDE DOWN`: floors change places, and ladders become holes.
- **The house plays back** (from floor 2; floor 1 is calm). It answers some of your moves with one of its own in
  another room, usually to bring the twin closer, and shows it coming first. It never moves the room you're in, and
  never leaves you with no way out.
- **The burnt twin.** Floor 1 it sleeps. From floor 2 it hunts you: its cracks glow, and the room goes red as it nears.
  It crouches before it lunges, so you get a moment. If it grabs you, it throws you into a nearby room and the house
  changes a step, then you get a few safe seconds. It's never a game over.
- **Trap it.** Slide its room away or shut it in, and it has to claw out. The sheet counts down the seconds.
- **Beat the house.** Every house is generated fresh and checked by a solver: floor 1 can be escaped in 1 move, floor 2
  in 2, floor 3 in 3, and floors 2 and 3 can't be escaped without their new step.
- **Stuck?** Press the wax seal on the sheet, or `H`. A hint frames the room to go to and the box to tick, and follows
  you if you walk somewhere else.
- **The finale.** Unlock the last front door and get it in reach, and the screen breaks: the game shrinks into a window
  on a desktop, the house's rooms tear out through the frame, and the twin climbs out after them. For the first time,
  you see the house is code. It's all drawn inside the game (`src/tear.js`) and touches nothing real. A click skips it.
  Then the house slides its rows every few seconds while the twin runs you down. The way to the door is always lit.
- **After the ending.** The credits roll, and the twin edits its own line until it's bigger than yours. Then you're
  left on the house's desktop: open `notes.txt` (the torn pages you found), click the Bin, or click `house.js` to
  build a new house.
- **It has a sense of humor.** Try `Ctrl+Z` (`Cmd+Z` on a Mac) three times. Hold `Shift`. Ask for a lot of hints.
  Shut the twin in. Leave and come back later: it counts. Open the browser's developer console. Only three things
  are saved, in your own browser: the time you left, which house you were in, and which ending you got last.
- **The story.** The house talks back now and then, on a torn strip of paper under it. Each floor
  hides one torn page in your handwriting, in a room you can reach on the way out. Find all
  three and the last line of the game becomes a word you can change: `house.keep(shadow|nobody)`. All of the story's
  words are in `src/story.js`.

**The look.** The house is a real 3D doll's house at night, built in three.js (`src/dollhouse.js`) with scanned
furniture from Poly Haven and walls and floors from ambientCG, then rendered into a photograph of every room, lit and
dark (`assets/plates/`, made by `tools/render/`). You're a small peg doll; the twin is the same doll, burnt, with
glowing cracks. The assembly sheet is printed on an old folded page beside the house. All the art is CC0; the list is
in `assets/CREDITS.md`.

Where WebGL is missing, on a computer drawing without a graphics card, or with `?flat=1` in the address, the house is
drawn flat in code instead. If frames run slow, the 3D house uses fewer pixels, then drops your lantern's shadows.

Every sound is played by code: rain, wind, thunder, a music box that plays a slow, wrong little tune, and whispers
when it's in the next room. Headphones help.

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

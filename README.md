# The Shifting House

Our entry for [GitHub Game Off 2026](https://itch.io/jam/game-off-2026). The theme is **SHIFT**.

You wrote this house. Now it won't let you leave. You see it cut open like a doll's house, every room at once, and
beside it is the house's own source code. Every yellow word in it is a choice: change `east` to `west` and a whole row
of rooms grinds past with you inside. Reach a room with a red lock, change its word, and get to the front door before
the shadow finds you.

Mouse only, one hand. (Press Shift five times and the house has something to say about Sticky Keys.) Click a room to walk there. Point at a word to see what it would do (the rooms you could walk to
afterwards light up green), then click it. `M` turns the sound off and on.

- **The words:**
  - `this.row.shift(west|east)` / `this.column.shift(up|down)`: that row or column of rooms slides one step, and you ride along.
  - `this.door.east = open`: open or shut a wall between two rooms. Nothing gets through a shut door, not you, not it.
  - `this.lights = on`: in the dark it can't see you, but it may still stumble in.
  - `frontDoor.locked = true`: two rooms hold this line. Either one opens the front door.
  - Floor 2 adds `this.swap(west|east)`: trade your room with the one next to it.
  - Floor 3 adds `house.upsideDown = false`: turn the whole house over. Floors change places, and ladders become holes.
- **The house plays back.** After each of your moves it makes one of its own in another room: it slides a row, swaps
  a room or shuts a door, usually to bring the shadow closer. It types the line in red a moment before it happens, so
  you can see it coming. It never moves the room you're in, and never leaves you with no way out. Sit still too long
  and it moves anyway. From floor 2 it likes to copy your favourite words.
- **One new thing at a time.** Floor 1 is just you and the house; the shadow sleeps through it. Floor 2 wakes the
  shadow, floor 3 brings the flip and the finale. During play the only words are the house's own moves; torn pages
  are read on the screen between floors.
- **The finale.** Unlock the last front door and the screen breaks: the game shrinks into a window on a desktop, the
  house's rooms tear out through the frame, it shifts the desktop's rows like its own, a "not responding" box comes
  up and the house rewrites its button to `Stay`, and the shadow climbs out after them. Then the rooms slam back in. It's
  all drawn inside the game (`src/tear.js`), so it looks the same on Windows, Mac and Linux and touches nothing real.
  A click skips it. Then the house turns itself over, then slides its rows every few seconds
  while the shadow runs you down faster. The way to the door is always lit. The browser tab and the code's file name
  change as it happens. At the very end, the camera pulls back from the house.
- **Trap the shadow.** Slide its room away or shut it in, and it has to claw through a wall to get out. A bar shows how long you have.
- **Beat the house.** Floor 1 needs 1 move, floor 2 needs 2, floor 3 needs 3. The top of the screen shows your moves
  next to the house's best. Every house is generated fresh and checked by a solver: it can be escaped in exactly that
  many moves, and floors 2 and 3 can't be escaped without their new word.
- **Stuck?** After 20 seconds, `house.hint();` appears. It frames the room to go to and the word to click.
- **You can't lose.** If it catches you, it drags you back to your first room. What you changed stays changed, and it
  gets a little slower each time.

- **After the ending.** The credits roll, and the shadow edits its own line until it's bigger than yours. Then you're
  left on the house's desktop: open `notes.txt` (the torn pages you found), click the Bin, or click `house.js` to
  build a new house.
- **It has a sense of humour.** Try `Ctrl+Z` (`Cmd+Z` on a Mac) three times. Hold `Shift`. Ask for a lot of hints.
  Shut the shadow in. Leave and come back later: it counts. Open the browser's developer console. Only three things
  are saved, in your own browser: the time you left, which house you were in, and which ending you got last.
- **The story.** The house talks back now and then, in a line typed under it. Each floor starts with a note from its
  commit log, and each floor hides one torn page in your handwriting, in a room you can reach on the way out. Find all
  three and the last line of the game becomes a word you can change: `house.keep(shadow|nobody)`. All of the story's
  words are in `src/story.js`.

Everything you see and hear is drawn and played by code: no image or sound files. Rain, wind, thunder, a music box
that plays a slow, wrong little tune, and whispers when it's in the next room. Headphones help.

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

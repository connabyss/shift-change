# The Shifting House

Our entry for [GitHub Game Off 2026](https://itch.io/jam/game-off-2026). The theme is **SHIFT**.

You wrote this house. Now it won't let you leave. It's dark, first person, and the house is written in code: lines of
it are chalked on the walls, and you can change one word of each. Change `east` to `west` and a whole row of rooms
grinds past, with you in it. Find the line that locks the front door and get out, before the shadow finds you.

- **Rewrite the house** (`E`, `Space` or right-click, looking at the writing on a wall):
  - `this.row.shift(east)` / `this.column.shift(north)`: that row or column of rooms slides one room, and you ride along.
    The word turns round afterwards, so pressing again puts it back.
  - `this.lights = on`: switch the room dark. In the dark it can only see you close up, but you can't see your way either.
  - `shadow.awake = true` (floors 2 and 3, once): it sleeps for a while.
  - `frontDoor.locked = true`: the front door opens. On the last floor this line reads differently.
- **Every edit is loud.** The house writes back `house.watch(you)` and the shadow comes to look.
- **Cut it off.** If a slide takes away the shadow's way to you, it shrieks and stands lost for a few seconds.
- **Hide** in a wardrobe (`E`). It can't see you in there, unless it watched you climb in.
- **Follow the arrow** at the top to the lock's line, then the door. When there's no way through, it says so.
- **You can't lose.** If it catches you, it drags you back to your first room. Everything you changed stays changed,
  and it gets a little slower each time. The shadow's thoughts show up as its own code, top left.

Two hands: left on `WASD`, right on the mouse. The mouse looks, `W`/`S` walk, `A`/`D` step sideways (without the mouse,
they turn you). `M` for sound. Headphones help: you hear which side it's on.

Three floors. Floor 1 teaches the hook: the lock is out of reach until you change the line in your first room, and the
shadow sleeps until you open the lock. Floor 2 hides a line that puts it to sleep. On floor 3 the house rewrites
itself every 20 seconds, and you see the line it wrote.

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

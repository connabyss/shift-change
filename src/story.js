// The story, all in one place: what the house says, the pages you find, and the notes left in its commit log.
// You wrote house.js. You built a house whose rooms move, so nobody would ever be lost in it.
// The house learned. It wanted to keep you, so it made a copy of you: the shadow. It's been chasing you to swap places.

// One line from the commit log before each floor, typed out as the floor begins.
export const COMMITS = {
  1: ['commit 1', 'a house that rearranges itself, so nobody is ever lost in it.'],
  2: ['commit 212', 'it moved a room tonight. i never wrote that line.'],
  3: ['commit 999', 'it asked who wrote it. i said i did. it asked if it could keep me.'],
};

// One torn page per floor, lying in a room you can reach. Find all three to change the ending.
export const PAGES = {
  1: "I wrote every word in this house. Rooms that slide, doors that answer. It was meant to be a kindness.",
  2: "This morning there were two sets of my footprints in the dust. One set walked into the wall.",
  3: "It doesn't want to hurt me. It wants to keep me. It made a copy to keep, and the copy wants my place.",
};

// The house talks back. Each line is said once per game (except the ones marked again: true).
export const VOICE = {
  start1: "You came back. You always come back.",
  start1again: "Welcome home. Again.",
  start2: "It's faster down here. So am I.",
  start3: "Last floor. Then you're mine, or you're gone.",
  firstEdit: "Careful. I remember every change.",
  trap: "You shut it in. It only wants to hold you.",
  caught: { text: "There you are.", again: true },
  unlock: "Leaving? You wrote that lock yourself.",
  page: "That's your handwriting.",
  flip: "Yes. Turn me over. See what's underneath.",
  idle: "Take your time. I have all of it.",
  blackout: "Shh.",
  face: "I'm not the only one watching.",
};

// The last word. With all three pages you can change it.
export const ENDING = {
  line: "shadow = you.copy();   // what the house kept of you",
  choice: ["house.keep(", ["shadow", "nobody"], ");"],
  keep: ["The door shuts behind you.", "In the window, something with your face presses its hand to the glass."],
  free: ["house.keep(nobody);   // nobody home", "It walks out beside you. Behind you, the lights go out one by one."],
  locked: "Find all three torn pages to change the last word.",
};

// The house plays back: after your move it makes one of its own, and says why.
export const HOUSE_LINES = {
  row: ["No. That one's mine.", "Let me help.", "Closer.", "I'll move it back for you.", "Wrong way. Here."],
  col: ["Down you go. Up it comes.", "Let me help."],
  swap: ["Excuse me.", "Rooms like company."],
  door: { shut: ["Doors are mine too.", "Shh. Close that."], open: ["Come in.", "Leave it open. It's cold in there."] },
  reuse: ["You taught me that one.", "That's your move. I'm just copying."],
};
// The finale: once the front door is unlocked on the last floor, the house stops taking turns.
export const FINALE = {
  tear: "Did you think I only lived in there?",
  start: "Then run.",
  lines: ["Left. No, right.", "I'll find you a longer way.", "Every room is mine.", "Almost.", "You built this. You can't outrun it."],
  title: "you.trapped = true",
};

// The house has a sense of humour. It never says so.
export const JOKES = {
  // Ctrl+Z (Cmd+Z on a Mac): it undoes the moon, then gravity, then your undo
  undo: ["Undo: the moon.", "Undo: gravity.", "I undid your undo. You're welcome."],
  hint5: "Hint: leave.",
  hint7: "Hint: I'm out of hints. Here's a drawing of a door.",
  fine: "...Fine.",
  // one absurd thing on each floor, early
  sneeze: "Achoo. ...Sorry. Dust.",            // floor 1: the house sneezes
  nudge: "Psst. The yellow words. Click one. I never said that.", // floor 1, if you haven't moved in 30 seconds
  sign: "hi :)",                                // floor 2: the shadow wakes up and holds up a sign
  sticker: "THIS SIDE UP",                      // floor 3: the first time you turn it over
  note: ["can i come out", "yes", "no", "maybe"],
  console: "I can see you reading this.",
  notesEmpty: "(empty. You didn't pick any up.)",
  desk: "Click house.js to build a new house.",
  beatPar: "You beat it. It helped. It won't say so.",
};

// Hold Shift and the house slides over a room, then snaps back when you let go. It doesn't like it.
export const HOLD = ["Put me down.", "That tickles.", "I'm load-bearing, you know.", "Shift happens."];

// Come back after you left and it says how long you were gone, to the minute.
export const AWAY = (gone) => `You left. I counted: ${gone}.`;

// The credits, and then the shadow edits its own line until it's bigger than yours.
export const CREDITS = {
  title: "THE SHIFTING HOUSE",
  you: ["written by you", "with help from you", "(you)"],
  shadow: ["co-author: shadow", "author: shadow", "AUTHOR: SHADOW"],
  real: "Made by connabyss for GitHub Game Off 2026, with Claude Code.",
};

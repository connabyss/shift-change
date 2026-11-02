import { test } from "node:test";
import assert from "node:assert/strict";
import { makeNight, pullLever, stamp, tick, report, PRESSURE_MAX, BROKEN_RATE, WRONG_STAMP, RIGHT_STAMP }
  from "../src/factory.js";

const spec = () => ({
  night: 1,
  rise: 1,
  machines: [
    { id: "boiler", name: "Boiler", note: "fixed the boiler!", lies: false },
    { id: "belt", name: "Conveyor", note: "oiled the belt!", lies: true },
  ],
});

test("pulling the lever on a real fix breaks the machine; pulling it back fixes it", () => {
  const s = makeNight(spec());
  assert.equal(pullLever(s, "boiler").kind, "broke");
  assert.equal(s.machines[0].broken, true);
  assert.equal(pullLever(s, "boiler").kind, "fixed");
  assert.equal(s.machines[0].broken, false);
  assert.equal(s.machines[0].lever, "new");
});

test("pulling the lever on a lie: the machine runs fine the old way", () => {
  const s = makeNight(spec());
  assert.equal(pullLever(s, "belt").kind, "fine");
  assert.equal(s.machines[1].broken, false);
  assert.equal(pullLever(s, "belt").kind, "back");
});

test("pressure climbs with time, faster for each broken machine", () => {
  const s = makeNight(spec());
  tick(s, 2);
  assert.equal(s.pressure, 2);
  pullLever(s, "boiler");
  tick(s, 1);
  assert.equal(s.pressure, 2 + 1 + BROKEN_RATE);
});

test("the gauge hitting the top ends the night: boom", () => {
  const s = makeNight(spec());
  tick(s, PRESSURE_MAX + 5);
  assert.equal(s.pressure, PRESSURE_MAX);
  assert.equal(s.over, true);
  assert.equal(s.won, false);
  assert.equal(s.cause, "boom");
  assert.equal(pullLever(s, "boiler").kind, "over");
});

test("a right stamp lets off steam, a wrong one adds pressure", () => {
  const s = makeNight(spec());
  tick(s, 20);
  assert.equal(stamp(s, "belt", "LIAR").kind, "right");
  assert.equal(s.pressure, 20 - RIGHT_STAMP);
  assert.equal(stamp(s, "boiler", "LIAR").kind, "wrong");
  assert.equal(s.wrong, 1);
});

test("a wrong stamp can be the one that blows it", () => {
  const s = makeNight(spec());
  tick(s, PRESSURE_MAX - WRONG_STAMP + 1);
  stamp(s, "boiler", "LIAR");
  assert.equal(s.cause, "boom");
});

test("each note gets one stamp", () => {
  const s = makeNight(spec());
  stamp(s, "belt", "LIAR");
  assert.equal(stamp(s, "belt", "TRUE").kind, "already");
  assert.equal(s.machines[1].stamp, "LIAR");
  assert.throws(() => stamp(s, "boiler", "MAYBE"));
});

test("you clock out when every note is stamped and nothing is left broken", () => {
  const s = makeNight(spec());
  pullLever(s, "boiler");
  stamp(s, "boiler", "TRUE");
  stamp(s, "belt", "LIAR");
  assert.equal(s.over, false, "the boiler is still broken");
  pullLever(s, "boiler");
  tick(s, 0.1);
  assert.equal(s.over, true);
  assert.equal(s.won, true);
  assert.equal(s.cause, "clocked out");
});

test("the end card counts liars caught, wrong stamps and guesses", () => {
  const s = makeNight(spec());
  pullLever(s, "belt");
  stamp(s, "belt", "LIAR");
  stamp(s, "boiler", "LIAR"); // guessed without trying, and wrong
  const r = report(s);
  assert.deepEqual({ liars: r.liars, caught: r.caught, wrong: r.wrong, guessed: r.guessed }, { liars: 1, caught: 1, wrong: 1, guessed: 1 });
});

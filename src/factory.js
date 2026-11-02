// The rules of the factory. No drawing in here: the page asks these functions what happened.
//
// The day shift left a sticky note on each machine: "fixed the boiler!". You can pull a machine's lever back
// to the old way. If the fix was real, the machine breaks (and the pressure climbs fast until you put it back).
// If the machine still runs fine the old way, the fix did nothing: the note lied. Stamp every note LIAR or TRUE
// before the pressure gauge hits the top.

export const PRESSURE_MAX = 100;
export const BROKEN_RATE = 9; // extra pressure per second for each broken machine
export const WRONG_STAMP = 25; // pressure for a wrong stamp
export const RIGHT_STAMP = 8; // a right stamp lets off this much steam

export function makeNight(spec) {
  return {
    night: spec.night,
    rise: spec.rise, // pressure per second, just from the factory running
    pressure: 0,
    peak: 0,
    time: 0,
    over: false,
    won: false,
    cause: null,
    wrong: 0,
    machines: spec.machines.map((m) => ({ ...m, lever: "new", broken: false, stamp: null, tried: false })),
  };
}

export function machine(state, id) {
  const m = state.machines.find((x) => x.id === id);
  if (!m) throw new Error(`no machine ${id}`);
  return m;
}

// Pull the lever: new way -> old way, or back again. Returns what the machine did.
export function pullLever(state, id) {
  if (state.over) return { kind: "over" };
  const m = machine(state, id);
  if (m.lever === "new") {
    m.lever = "old";
    m.tried = true;
    if (m.lies) return { kind: "fine" }; // the "fix" did nothing: the old way runs just as well
    m.broken = true;
    return { kind: "broke" };
  }
  m.lever = "new";
  const was = m.broken;
  m.broken = false;
  return { kind: was ? "fixed" : "back" };
}

// Stamp a note LIAR or TRUE. Each note gets one stamp.
export function stamp(state, id, verdict) {
  if (state.over) return { kind: "over" };
  if (verdict !== "LIAR" && verdict !== "TRUE") throw new Error(`stamp LIAR or TRUE, not ${verdict}`);
  const m = machine(state, id);
  if (m.stamp) return { kind: "already" };
  m.stamp = verdict;
  const right = (verdict === "LIAR") === m.lies;
  if (right) {
    state.pressure = Math.max(0, state.pressure - RIGHT_STAMP);
  } else {
    state.wrong += 1;
    addPressure(state, WRONG_STAMP);
  }
  finish(state);
  return { kind: right ? "right" : "wrong" };
}

export function brokenCount(state) {
  return state.machines.filter((m) => m.broken).length;
}

// Time passes: the gauge climbs, faster for every broken machine.
export function tick(state, dt) {
  if (state.over) return;
  state.time += dt;
  addPressure(state, (state.rise + BROKEN_RATE * brokenCount(state)) * dt);
  finish(state);
}

function addPressure(state, amount) {
  state.pressure = Math.min(PRESSURE_MAX, state.pressure + amount);
  state.peak = Math.max(state.peak, state.pressure);
  if (state.pressure >= PRESSURE_MAX) {
    state.over = true;
    state.won = false;
    state.cause = "boom";
  }
}

function finish(state) {
  if (state.over) return;
  if (state.machines.every((m) => m.stamp) && brokenCount(state) === 0) {
    state.over = true;
    state.won = true;
    state.cause = "clocked out";
  }
}

// How the night went, for the end card.
export function report(state) {
  const liars = state.machines.filter((m) => m.lies);
  const caught = liars.filter((m) => m.stamp === "LIAR").length;
  return {
    won: state.won,
    liars: liars.length,
    caught,
    wrong: state.wrong,
    guessed: state.machines.filter((m) => m.stamp && !m.tried).length,
    peak: Math.round(state.peak),
    seconds: Math.round(state.time),
  };
}

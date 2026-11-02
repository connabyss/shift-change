// The nights. Each one has its own seed: which notes lie, and where the machines stand on the floor.
// The floor shifts between nights, so you can't just remember last night's spots.

export function rng(seed) {
  // mulberry32: small and seeded, never Math.random, so a night plays the same every time
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MACHINES = [
  { id: "boiler", name: "Boiler", note: "fixed the boiler leak!" },
  { id: "belt", name: "Conveyor", note: "oiled the conveyor belt!" },
  { id: "press", name: "Big Press", note: "lined up the big press!" },
  { id: "fan", name: "Cooling Fan", note: "balanced the fan blades!" },
  { id: "bell", name: "Shift Bell", note: "unstuck the shift bell!" },
  { id: "kettle", name: "Tea Kettle", note: "descaled the kettle!" },
  { id: "pump", name: "Water Pump", note: "patched the pump valve!" },
  { id: "crane", name: "Claw Crane", note: "tightened the crane claw!" },
];

// Spots on the floor, as fractions of the floor's width and height: a 4 x 2 grid.
export const SPOTS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: (i % 4 + 0.5) / 4, y: (Math.floor(i / 4) + 0.5) / 2 }));

export const LAST_NIGHT = 5;

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Night 1: 3 machines, 1 liar. Each night after that: one more machine, more liars, a faster gauge.
export function nightSpec(night, seed = 1337) {
  if (night < 1 || night > LAST_NIGHT) throw new Error(`no night ${night}`);
  const rand = rng(seed * 31 + night);
  const count = night + 2;
  const liars = Math.max(1, Math.min(count - 1, Math.round(count * (0.25 + 0.06 * night))));
  const picked = shuffle(MACHINES, rand).slice(0, count);
  const lying = new Set(shuffle(picked.map((m) => m.id), rand).slice(0, liars));
  const spots = shuffle(SPOTS, rand);
  return {
    night,
    rise: 0.9 + 0.35 * (night - 1),
    machines: picked.map((m, i) => ({ ...m, lies: lying.has(m.id), x: spots[i].x, y: spots[i].y })),
  };
}

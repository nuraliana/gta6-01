// Solmar Bay — small math helpers shared by every system.
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

// Shortest signed turn from angle a to angle b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}
export function angleLerp(a, b, t) { return a + angleDiff(a, b) * clamp(t, 0, 1); }

export function dist2(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

// Push a circle (x, z, radius) out of an axis-aligned box collider.
// Returns the corrected position, or null when there is no overlap.
// Colliders are {x, z, hx, hz}.
export function pushOutOfBox(x, z, r, box) {
  const cx = clamp(x, box.x - box.hx, box.x + box.hx);
  const cz = clamp(z, box.z - box.hz, box.z + box.hz);
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, z: cz + (dz / d) * r };
  }
  // Centre inside the box: push out along the smallest penetration axis.
  const px = box.hx + r - Math.abs(x - box.x);
  const pz = box.hz + r - Math.abs(z - box.z);
  if (px < pz) return { x: box.x + (x >= box.x ? box.hx + r : -(box.hx + r)), z };
  return { x, z: box.z + (z >= box.z ? box.hz + r : -(box.hz + r)) };
}

// Nearest point on segment (ax,az)-(bx,bz) to (px,pz), plus the distance.
export function nearestOnSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = clamp(t, 0, 1);
  const x = ax + dx * t, z = az + dz * t;
  return { x, z, d: dist2(px, pz, x, z) };
}

// MARISOL HEAT — combat.js
// One job: fighting. Fists (F, 3-hit combo feel via swing arc), pistol and
// SMG (hitscan cone with tracer + muzzle flash that blooms), enemy health
// pips via a floating bar, and cash / health / ammo pickups that glow.
import * as THREE from "three";
import { dist } from "./util.js";

export function createCombat(scene, particles, audio) {
  const state = {
    weapon: "pistol", ammo: 24, smgAmmo: 0, hasSmg: false,
    punchTimer: 0, shootCooldown: 0,
  };
  const pickups = [];
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(6);
  tracerGeo.setAttribute("position", new THREE.BufferAttribute(tracerPos, 3));
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0 }));
  tracer.frustumCulled = false;
  scene.add(tracer);
  // muzzle flash: a small emissive sprite at the gun, blooms for one frame
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe14a }));
  flash.visible = false;
  scene.add(flash);

  function spawnPickup(x, z, kind) {
    const colors = { cash: 0x2aff5a, health: 0xff4a5a, ammo: 0xffe14a };
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: colors[kind], emissive: colors[kind], emissiveIntensity: 1.4, roughness: 0.3 }));
    m.position.set(x, 0.8, z);
    scene.add(m);
    pickups.push({ mesh: m, kind, x, z, t: 0 });
  }

  return {
    state, pickups, spawnPickup,
    selectWeapon(name) {
      if (name === "smg" && !state.hasSmg) return false;
      state.weapon = name;
      return true;
    },
    // Hitscan cone from the player toward aim point; returns what was hit.
    shoot(origin, aimX, aimZ, targets, heliPos, onHeliHit) {
      if (state.shootCooldown > 0) return null;
      const isSmg = state.weapon === "smg";
      if (state.weapon === "pistol" && state.ammo <= 0) return "empty";
      if (isSmg && state.smgAmmo <= 0) return "empty";
      state.shootCooldown = isSmg ? 0.11 : 0.32;
      if (state.weapon === "pistol") state.ammo--; else state.smgAmmo--;
      const ang = Math.atan2(aimX - origin.x, aimZ - origin.z);
      // tracer from gun to aim
      tracerPos[0] = origin.x; tracerPos[1] = 1.4; tracerPos[2] = origin.z;
      tracerPos[3] = aimX; tracerPos[4] = 1.2; tracerPos[5] = aimZ;
      tracerGeo.attributes.position.needsUpdate = true;
      tracer.material.opacity = 0.9;
      flash.position.set(origin.x + Math.sin(ang) * 0.8, 1.4, origin.z + Math.cos(ang) * 0.8);
      flash.visible = true;
      setTimeout(() => { flash.visible = false; }, 60);
      particles.burst(origin.x + Math.sin(ang), 1.4, origin.z + Math.cos(ang), 3, [1, 0.85, 0.3], 2, 0.25, 2);
      audio.shoot();
      // heli: hitting the spotlight cone's owner counts as a heli hit
      if (heliPos && dist(aimX, aimZ, heliPos.x, heliPos.z) < 8) {
        if (onHeliHit()) return "heli-down";
        return "heli-hit";
      }
      let best = null, bd = 26 * 26;
      for (const t of targets) {
        const d = (t.x - origin.x) ** 2 + (t.z - origin.z) ** 2;
        if (d < bd) {
          // cone check: target within ~12 degrees of the aim ray
          const ta = Math.atan2(t.x - origin.x, t.z - origin.z);
          let diff = Math.abs(((ta - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (diff < 0.22) { bd = d; best = t; }
        }
      }
      if (best) {
        best.hp -= isSmg ? 34 : 50;
        particles.burst(best.x, 1.4, best.z, 6, [1, 0.3, 0.2], 4, 0.5, 2);
        return best.hp <= 0 ? "kill" : "hit";
      }
      return "miss";
    },
    punch(origin, angle, targets) {
      if (state.punchTimer > 0) return null;
      state.punchTimer = 0.35;
      audio.punch();
      const px = origin.x + Math.sin(angle) * 1.4, pz = origin.z + Math.cos(angle) * 1.4;
      for (const t of targets) {
        if (dist(t.x, t.z, px, pz) < 1.8) {
          t.hp -= 25;
          particles.burst(t.x, 1.2, t.z, 5, [1, 1, 1], 3, 0.4, 2);
          return t.hp <= 0 ? "kill" : "hit";
        }
      }
      return "miss";
    },
    update(dt, playerX, playerZ, onPickup) {
      if (state.shootCooldown > 0) state.shootCooldown -= dt;
      if (state.punchTimer > 0) state.punchTimer -= dt;
      tracer.material.opacity = Math.max(0, tracer.material.opacity - dt * 6);
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        p.t += dt;
        p.mesh.position.y = 0.8 + Math.sin(p.t * 3) * 0.15;
        p.mesh.rotation.y += dt * 2;
        if (dist(playerX, playerZ, p.x, p.z) < 1.6) {
          scene.remove(p.mesh);
          pickups.splice(i, 1);
          audio.pickup();
          onPickup(p.kind);
        }
      }
    },
  };
}

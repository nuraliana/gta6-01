// MARISOL HEAT — input.js
// One job: keyboard + mouse (+ basic touch). Tracks held keys, edge-triggered
// presses, and mouse drag for the chase camera / photo mode.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let dragX = 0, dragY = 0, dragging = false, lastX = 0, lastY = 0;
  let touchX = 0, touchY = 0;

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());

  canvas.addEventListener("mousedown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener("mouseup", () => { dragging = false; });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    dragX += e.clientX - lastX; dragY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener("touchstart", (e) => {
    const t = e.touches[0]; touchX = t.clientX; touchY = t.clientY;
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    dragX += (t.clientX - touchX) * 2; dragY += (t.clientY - touchY) * 2;
    touchX = t.clientX; touchY = t.clientY;
  }, { passive: true });

  return {
    down(code) { return keys.has(code); },
    // Edge trigger: true once per physical press.
    wasPressed(code) {
      if (pressed.has(code)) { pressed.delete(code); return true; }
      return false;
    },
    consumeDrag() { const d = { x: dragX, y: dragY }; dragX = 0; dragY = 0; return d; },
    axis() {
      let x = 0, z = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) z += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) z -= 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
      return { x, z };
    },
  };
}

// Solmar Bay — keyboard + mouse input. WASD/arrows move, mouse drag orbits
// the camera, a click fires the pistol. Exposes a plain state object.
export class Input {
  constructor() {
    this.keys = new Set();
    this.dragDX = 0;
    this.dragDY = 0;
    this.dragging = false;
    this.clicked = false;
    this.clickX = 0;
    this.clickY = 0;
    this.anyKey = false;
    this.lastTX = undefined;
    this.lastTY = undefined;
  }

  attach(canvas) {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.toLowerCase());
      this.anyKey = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.clicked = true;
      this.clickX = e.clientX;
      this.clickY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.dragDX += e.movementX || 0;
      this.dragDY += e.movementY || 0;
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    // Touch: one finger drag orbits, tap fires.
    canvas.addEventListener('touchstart', (e) => {
      this.dragging = true;
      this.clicked = true;
      const t = e.touches[0];
      this.clickX = t.clientX; this.clickY = t.clientY;
      this.lastTX = t.clientX; this.lastTY = t.clientY;
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (this.lastTX !== undefined) {
        this.dragDX += t.clientX - this.lastTX;
        this.dragDY += t.clientY - this.lastTY;
      }
      this.lastTX = t.clientX; this.lastTY = t.clientY;
    }, { passive: true });
    canvas.addEventListener('touchend', () => { this.dragging = false; this.lastTX = undefined; });
  }

  down(...names) { return names.some((n) => this.keys.has(n)); }
  axis() {
    const x = (this.down('d', 'arrowright') ? 1 : 0) - (this.down('a', 'arrowleft') ? 1 : 0);
    const y = (this.down('w', 'arrowup') ? 1 : 0) - (this.down('s', 'arrowdown') ? 1 : 0);
    return { x, y };
  }
  pressed(name) {
    if (!this.keys.has(name)) return false;
    this.keys.delete(name);
    return true;
  }
  takeDrag() {
    const d = { x: this.dragDX, y: this.dragDY };
    this.dragDX = 0; this.dragDY = 0;
    return d;
  }
  takeClick() {
    if (!this.clicked) return null;
    this.clicked = false;
    return { x: this.clickX, y: this.clickY };
  }
}

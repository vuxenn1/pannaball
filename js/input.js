// Pannaball: yerel oyuncu kontrolcüsü.
// Masaüstü: WASD / Ok tuşları hareket, fare nişan, sol tık şut, Shift boost.
// Mobil: Sanal sol joystick (360° hareket ve nişan), sağ şut butonu ve boost butonu.
// Tuş ve joystick yönleri ekrana göredir; saha döndüğünde renderer dünya yönüne çevirir.

NB.LocalController = class {
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, has: false };
    this.lastTouch = -Infinity; // dokunmadan sonra tarayıcının taklit ettiği fare olaylarını yok saymak için
    this.kickQueued = false;

    // Mobil dokunmatik kontrollerin durumu
    this.touchJoystick = { active: false, x: 0, y: 0, touchId: null };
    this.touchSprint = false;

    // Klavye tuşları (WASD, Ok tuşları, Shift)
    const blockKeys = new Set([
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
    ]);

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (blockKeys.has(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());

    // Fare hareketleri (dokunmadan hemen sonra gelen sahte fare olayları sayılmaz)
    const realMouse = () => performance.now() - this.lastTouch > 800;
    window.addEventListener('touchstart', () => { this.lastTouch = performance.now(); }, { passive: true, capture: true });
    canvas.addEventListener('mousemove', (e) => {
      if (!realMouse()) return;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.has = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && realMouse()) this.kickQueued = true;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mobil dokunmatik olayları bağla
    this.initTouchControls();
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  initTouchControls() {
    window.addEventListener('touchstart', () => {
      document.body.classList.add('has-touch');
    }, { once: true, passive: true });

    const zone = document.getElementById('joystick-zone');
    const knob = document.getElementById('joystick-knob');
    const btnShoot = document.getElementById('touch-btn-shoot');
    const btnBoost = document.getElementById('touch-btn-boost');

    if (zone && knob) {
      const maxRadius = 40; // joystick topuzunun kayabileceği maksimum piksel
      let startX = 0, startY = 0;

      const handleTouchStart = (e) => {
        if (this.touchJoystick.active) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        e.preventDefault();
        const rect = zone.getBoundingClientRect();
        startX = rect.left + rect.width / 2;
        startY = rect.top + rect.height / 2;
        this.touchJoystick.active = true;
        this.touchJoystick.touchId = touch.identifier;
        this.updateJoystick(touch.clientX, touch.clientY, startX, startY, maxRadius, knob);
      };

      const handleTouchMove = (e) => {
        if (!this.touchJoystick.active) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === this.touchJoystick.touchId) {
            e.preventDefault();
            this.updateJoystick(touch.clientX, touch.clientY, startX, startY, maxRadius, knob);
            break;
          }
        }
      };

      const handleTouchEnd = (e) => {
        if (!this.touchJoystick.active) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === this.touchJoystick.touchId) {
            e.preventDefault();
            this.touchJoystick.active = false;
            this.touchJoystick.touchId = null;
            this.touchJoystick.x = 0;
            this.touchJoystick.y = 0;
            knob.style.transition = 'transform 0.12s ease-out';
            knob.style.transform = 'translate(0px, 0px)';
            break;
          }
        }
      };

      zone.addEventListener('touchstart', handleTouchStart, { passive: false });
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd, { passive: false });
      window.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    }

    if (btnShoot) {
      btnShoot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.kickQueued = true;
        btnShoot.classList.add('active');
      }, { passive: false });
      const endShoot = (e) => {
        if (e.cancelable) e.preventDefault();
        btnShoot.classList.remove('active');
      };
      btnShoot.addEventListener('touchend', endShoot, { passive: false });
      btnShoot.addEventListener('touchcancel', endShoot, { passive: false });
    }

    if (btnBoost) {
      btnBoost.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.touchSprint = true;
        btnBoost.classList.add('active');
      }, { passive: false });
      const endBoost = (e) => {
        if (e.cancelable) e.preventDefault();
        this.touchSprint = false;
        btnBoost.classList.remove('active');
      };
      btnBoost.addEventListener('touchend', endBoost, { passive: false });
      btnBoost.addEventListener('touchcancel', endBoost, { passive: false });
    }
  }

  updateJoystick(clientX, clientY, startX, startY, maxRadius, knob) {
    const dx = clientX - startX;
    const dy = clientY - startY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = dist > 0 ? Math.atan2(dy, dx) : 0;
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    knob.style.transition = 'none';
    knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;

    const deadzone = 4;
    if (dist > deadzone) {
      const normDist = Math.min(1, (clampedDist - deadzone) / (maxRadius - deadzone));
      this.touchJoystick.x = Math.cos(angle) * normDist;
      this.touchJoystick.y = Math.sin(angle) * normDist;
    } else {
      this.touchJoystick.x = 0;
      this.touchJoystick.y = 0;
    }
  }

  getInput(player) {
    const r = this.renderer;

    // 1. Dokunmatik joystick (mobil)
    const hasTouch = this.touchJoystick.active && (Math.hypot(this.touchJoystick.x, this.touchJoystick.y) > 0.04);

    // 2. Klavye (WASD ve ok tuşları)
    const keyX = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    const keyY = (this.down('KeyS', 'ArrowDown') ? 1 : 0) - (this.down('KeyW', 'ArrowUp') ? 1 : 0);

    let sx = 0, sy = 0; // ekran yönünde hareket
    if (hasTouch) {
      sx = this.touchJoystick.x;
      sy = this.touchJoystick.y;
      const len = Math.hypot(sx, sy);
      if (len > 1) { sx /= len; sy /= len; }
    } else if (keyX || keyY) {
      const len = Math.hypot(keyX, keyY);
      sx = keyX / len;
      sy = keyY / len;
    }
    const mv = r.screenDirToWorld(sx, sy);

    // Nişan: fare varsa fareye, yoksa (mobil) hareket yönüne
    let aim = player.aim;
    if (this.mouse.has && !hasTouch) {
      const m = r.screenToWorld(this.mouse.x, this.mouse.y);
      if (Number.isFinite(m.x) && Number.isFinite(m.y)) aim = Math.atan2(m.y - player.y, m.x - player.x);
    } else if (Math.hypot(sx, sy) > 0.08) {
      aim = Math.atan2(mv.y, mv.x);
    }
    const moveX = mv.x, moveY = mv.y;

    const sprint = this.down('ShiftLeft', 'ShiftRight') || this.touchSprint;
    const kick = this.kickQueued;
    this.kickQueued = false;

    return {
      moveX,
      moveY,
      sprint,
      kick,
      aim,
    };
  }
};

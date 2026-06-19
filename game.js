/**
 * NEON SLINGER: HYPER DASH - Core Game Engine v4 (The Organic Vector Update)
 * Highly polished, math-rich, physics-enabled Canvas gameplay.
 * Features:
 *   - Smooth inertia-based drift physics with momentum transfer.
 *   - Bouncing physics off 3000x3000px arena walls.
 *   - Camera space translation and rendering.
 *   - Infinite-scrolling Modulo grid with Algebraic wave ripples.
 *   - XP level-up upgrade progression card system with upgrade synergies.
 *   - Multi-dash chaining, orbital laser drones, and kinetic plasma waves.
 *   - Hyper EMP Bomb ultimate weapon screen clearing.
 *   - Off-screen neon radar blips to guide the player.
 *   - Squash & Stretch visual scale deformations.
 *   - Organic Enemy Classes:
 *     - Jellyfish Hunter: pulses, squashes/stretches, trails 4 Bezier tentacles.
 *     - Neon Serpent: 9-segment crawler. Slicing body links severs and explodes tail chain.
 *   - Epic Robotic Overlord Boss (Dread-Spider):
 *     - 4 procedurally jointed legs using Inverse Kinematics (IK) walk cycles.
 *     - Severable legs: slicing legs blows them off as physics debris, slowing and tilting the boss.
 *     - Rotating armor plates and multi-phase bullet hell redirection.
 */

// Global Game Configuration
const CONFIG = {
  arenaSize: 3000,
  playerSize: 15,
  playerDashRadius: 35, // Base slash hitbox width
  baseEnemySpawnRate: 1500, // ms between spawns
  minEnemySpawnRate: 350,
  maxBullets: 200,
  maxParticles: 1500, // Slightly expanded particle limit for extra juice!
  maxComboTime: 3200, // ms to keep combo alive
  maxShield: 100,
  maxEnergy: 100,
  maxBomb: 100,
  energyDrainRate: 24, // per sec in bullet time
  energyRecoveryRate: 18, // per sec while normal
  shardEnergyRefill: 5,
  shardShieldRefill: 1.5,
  shardScoreValue: 120,
  maxDashRange: 320,
};

// Vector helpers
const Vec = {
  dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  lerp: (a, b, t) => a + (b - a) * t,
  dot: (x1, y1, x2, y2) => x1 * x2 + y1 * y2,
  clamp: (val, min, max) => Math.max(min, Math.min(max, val))
};

// Upgrades Tree Definitions
const UPGRADES = {
  multidash: {
    id: 'multidash',
    title: 'MULTIDASH',
    desc: '連続ダッシュ枠が＋1増加！最大3回までスタック可能になり、息つく暇もない高速の連続斬撃が可能になります。',
    icon: '⚡',
    colorClass: 'cyan',
    apply: (game) => {
      game.player.maxDashCharges = Math.min(3, game.player.maxDashCharges + 1);
      game.player.dashCharges = game.player.maxDashCharges;
    }
  },
  photon_blade: {
    id: 'photon_blade',
    title: 'PHOTON BLADE',
    desc: 'ダッシュ斬撃の攻撃判定幅が＋60%拡大し、かつ最大ダッシュ移動距離が＋20%延長されます。',
    icon: '⚔️',
    colorClass: 'pink',
    apply: (game) => {
      game.player.playerDashRadius = Math.ceil(game.player.playerDashRadius * 1.6);
      game.player.maxDashRange = Math.ceil(game.player.maxDashRange * 1.20);
    }
  },
  shield_cell: {
    id: 'shield_cell',
    title: 'SHIELD EXPANSION',
    desc: '最大シールド容量が＋25増加し、さらに現在のシールドが即座に50回復します。耐久システムを強化。',
    icon: '🛡️',
    colorClass: 'green',
    apply: (game) => {
      game.player.maxShield += 25;
      game.player.shield = Math.min(game.player.maxShield, game.player.shield + 50);
    }
  },
  void_vortex: {
    id: 'void_vortex',
    title: 'VOID VORTEX',
    desc: 'エネルギー破片（シャード）を引き寄せる磁力吸収半径が＋150%広がり、超広範囲から自動回収します。',
    icon: '🌀',
    colorClass: 'cyan',
    apply: (game) => {
      game.player.magnetRadius = Math.ceil(game.player.magnetRadius * 2.5);
    }
  },
  orbital_drone: {
    id: 'orbital_drone',
    title: 'ORBITAL DRONE',
    desc: '自機の周囲を回転し、視界に入る最寄りの敵に向けて自動で高エネルギーレーザーを放つ支援ドローンを召喚。',
    icon: '🤖',
    colorClass: 'yellow',
    apply: (game) => {
      game.player.droneCount = Math.min(3, game.player.droneCount + 1);
      game.player.drones = [];
      for (let i = 0; i < game.player.droneCount; i++) {
        game.player.drones.push(new Drone(i));
      }
    }
  },
  plasma_wave: {
    id: 'plasma_wave',
    title: 'PLASMA WAVE',
    desc: 'ダッシュ終了時に強力な衝撃波を周囲に発生させ、被弾サークル内の敵弾を全て追尾ロケットに変換します。',
    icon: '🔥',
    colorClass: 'purple',
    apply: (game) => {
      game.player.hasPlasmaWave = true;
    }
  },
  turbo_regen: {
    id: 'turbo_regen',
    title: 'TURBO REGENERATOR',
    desc: '連続ダッシュのチャージ回復速度および、バレットタイム減速時のエネルギー回復速度が＋50%上昇。',
    icon: '🔌',
    colorClass: 'yellow',
    apply: (game) => {
      game.player.energyRegenMult *= 1.5;
      game.player.dashCooldownDuration *= 0.7;
    }
  },
  chronos_field: {
    id: 'chronos_field',
    title: 'CHRONOS FIELD',
    desc: '自機の周囲に時空歪曲フィールドを展開。領域内に侵入した敵弾や敵の速度を80%低下させ、安全な回避エリアを確保します。',
    icon: '⏳',
    colorClass: 'cyan',
    apply: (game) => {
      game.player.hasChronosField = true;
      game.player.chronosFieldRadius = 140;
    }
  },
  chain_lightning: {
    id: 'chain_lightning',
    title: 'TESLA CHAIN',
    desc: 'ダッシュ斬撃で敵を切った際、周囲の敵へ連鎖する高電圧カオス電撃（テスラ・アーク）を放ち、一網打尽にします。',
    icon: '⚡',
    colorClass: 'purple',
    apply: (game) => {
      game.player.hasChainLightning = true;
    }
  },
  laser_scythe: {
    id: 'laser_scythe',
    title: 'LASER SCYTHE',
    desc: 'ダッシュ時に自機の両脇にネオンカラーのレーザー刃を突き出します。当たり判定が劇的に横へ拡張されます。',
    icon: '📐',
    colorClass: 'pink',
    apply: (game) => {
      game.player.hasLaserScythe = true;
    }
  },
  phantom_decoy: {
    id: 'phantom_decoy',
    title: 'PHANTOM DECOY',
    desc: 'ダッシュ開始位置に、敵弾を引きつけるデコイホログラムを生成。1.5秒後に爆発し、敵弾を全て味方の追尾弾に変換します。',
    icon: '👥',
    colorClass: 'yellow',
    apply: (game) => {
      game.player.hasPhantomDecoy = true;
    }
  }
};

const UPGRADE_MAX_LEVELS = {
  multidash: 2,
  photon_blade: 5,
  shield_cell: 5,
  void_vortex: 3,
  orbital_drone: 3,
  plasma_wave: 1,
  turbo_regen: 5,
  chronos_field: 1,
  chain_lightning: 1,
  laser_scythe: 1,
  phantom_decoy: 1,
};

// ==========================================
// A. Smooth Interpolated Camera
// ==========================================
class Camera {
  constructor(w, h) {
    this.x = CONFIG.arenaSize / 2;
    this.y = CONFIG.arenaSize / 2;
    this.w = w;
    this.h = h;
  }

  update(px, py, dt) {
    this.x = Vec.lerp(this.x, px, 0.08 * dt);
    this.y = Vec.lerp(this.y, py, 0.08 * dt);

    const minX = this.w / 2;
    const maxX = CONFIG.arenaSize - this.w / 2;
    const minY = this.h / 2;
    const maxY = CONFIG.arenaSize - this.h / 2;

    if (maxX > minX) this.x = Vec.clamp(this.x, minX, maxX);
    else this.x = CONFIG.arenaSize / 2;
    if (maxY > minY) this.y = Vec.clamp(this.y, minY, maxY);
    else this.y = CONFIG.arenaSize / 2;
  }
}

// ==========================================
// B. Dynamic Algebraic Ripple Grid
// ==========================================
class GridRipple {
  constructor(x, y, force, maxRadius, duration = 650) {
    this.x = x;
    this.y = y;
    this.force = force;
    this.maxRadius = maxRadius;
    this.duration = duration;
    this.age = 0;
  }

  update(dt) {
    this.age += 16.6 * dt;
    return this.age < this.duration;
  }
}

class WarpGrid {
  constructor() {
    this.spacing = 60;
    this.ripples = [];
    this.gravityWell = null;
  }

  update(dt) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      if (!this.ripples[i].update(dt)) {
        this.ripples.splice(i, 1);
      }
    }
  }

  applyExplosion(x, y, force, radius, duration = 650) {
    this.ripples.push(new GridRipple(x, y, force, radius, duration));
  }

  applyLineForce(x1, y1, x2, y2, force, radius) {
    const dist = Vec.dist(x1, y1, x2, y2);
    const steps = Math.ceil(dist / 50);
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const rx = Vec.lerp(x1, x2, t);
      const ry = Vec.lerp(y1, y2, t);
      this.applyExplosion(rx, ry, force, radius, 400);
    }
  }

  getWarpedPoint(x, y) {
    let wx = x;
    let wy = y;

    if (this.gravityWell) {
      const dx = x - this.gravityWell.x;
      const dy = y - this.gravityWell.y;
      const dist = Math.hypot(dx, dy);
      if (dist < this.gravityWell.radius && dist > 0) {
        const factor = 1 - dist / this.gravityWell.radius;
        const pull = factor * factor * this.gravityWell.force;
        wx -= (dx / dist) * pull;
        wy -= (dy / dist) * pull;
      }
    }

    for (let i = 0; i < this.ripples.length; i++) {
      const rip = this.ripples[i];
      const dx = x - rip.x;
      const dy = y - rip.y;
      const dist = Math.hypot(dx, dy);
      
      const currentRadius = (rip.age / rip.duration) * rip.maxRadius;
      const width = 120;
      const distFromWave = Math.abs(dist - currentRadius);

      if (distFromWave < width && dist > 0) {
        const lifeFactor = 1 - (rip.age / rip.duration);
        const waveFactor = Math.sin((1 - distFromWave / width) * Math.PI) * lifeFactor;
        const push = waveFactor * rip.force;
        
        wx += (dx / dist) * push;
        wy += (dy / dist) * push;
      }
    }
    return { x: wx, y: wy };
  }

  draw(ctx, width, height, camX, camY, feverActive) {
    ctx.strokeStyle = feverActive ? 'rgba(255, 0, 85, 0.15)' : 'rgba(0, 243, 255, 0.08)';
    ctx.lineWidth = 1;

    const spacing = this.spacing;
    const startX = Math.floor((camX - width / 2) / spacing) * spacing - spacing;
    const endX = Math.ceil((camX + width / 2) / spacing) * spacing + spacing;
    const startY = Math.floor((camY - height / 2) / spacing) * spacing - spacing;
    const endY = Math.ceil((camY + height / 2) / spacing) * spacing + spacing;

    for (let y = startY; y <= endY; y += spacing) {
      if (y < 0 || y > CONFIG.arenaSize) continue;
      ctx.beginPath();
      let first = true;
      for (let x = startX; x <= endX; x += 30) {
        const cx = Vec.clamp(x, 0, CONFIG.arenaSize);
        const wp = this.getWarpedPoint(cx, y);
        const sx = wp.x - camX + width / 2;
        const sy = wp.y - camY + height / 2;

        if (first) {
          ctx.moveTo(sx, sy);
          first = false;
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
    }

    for (let x = startX; x <= endX; x += spacing) {
      if (x < 0 || x > CONFIG.arenaSize) continue;
      ctx.beginPath();
      let first = true;
      for (let y = startY; y <= endY; y += 30) {
        const cy = Vec.clamp(y, 0, CONFIG.arenaSize);
        const wp = this.getWarpedPoint(x, cy);
        const sx = wp.x - camX + width / 2;
        const sy = wp.y - camY + height / 2;

        if (first) {
          ctx.moveTo(sx, sy);
          first = false;
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
    }

    ctx.strokeStyle = feverActive ? 'rgba(255, 0, 85, 0.5)' : 'rgba(0, 243, 255, 0.35)';
    ctx.lineWidth = 6;
    ctx.strokeRect(0 - camX + width / 2, 0 - camY + height / 2, CONFIG.arenaSize, CONFIG.arenaSize);
    
    ctx.strokeStyle = feverActive ? 'rgba(255, 0, 85, 0.08)' : 'rgba(0, 243, 255, 0.06)';
    ctx.lineWidth = 25;
    ctx.strokeRect(-10 - camX + width / 2, -10 - camY + height / 2, CONFIG.arenaSize + 20, CONFIG.arenaSize + 20);
  }
}

// ==========================================
// C. Helpers / Particles / Drone / Shockwave
// ==========================================
class Particle {
  constructor(x, y, color, type = 'shatter') {
    this.x = x;
    this.y = y;
    this.color = color;
    this.type = type; // 'shatter', 'slash', 'homingTrail', 'feverSpark', 'wallSpark', 'legDebris'
    
    this.life = 1.0;
    
    if (type === 'shatter') {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 9 + 4;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.size = Math.random() * 5 + 3.5;
      this.decay = Math.random() * 0.018 + 0.012;
      this.friction = 0.95;
      this.magnetized = false;
    } else if (type === 'slash') {
      this.vx = (Math.random() - 0.5) * 3;
      this.vy = (Math.random() - 0.5) * 3;
      this.size = Math.random() * 12 + 6;
      this.decay = Math.random() * 0.07 + 0.045;
      this.friction = 0.98;
    } else if (type === 'feverSpark') {
      this.vx = (Math.random() - 0.5) * 4;
      this.vy = -(Math.random() * 3 + 2);
      this.size = Math.random() * 4.5 + 2;
      this.decay = Math.random() * 0.015 + 0.01;
      this.friction = 1.0;
    } else if (type === 'homingTrail') {
      this.vx = (Math.random() - 0.5) * 2;
      this.vy = (Math.random() - 0.5) * 2;
      this.size = Math.random() * 4 + 2;
      this.decay = 0.09;
      this.friction = 0.94;
    } else if (type === 'wallSpark') {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 12 + 6;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.size = Math.random() * 6 + 3;
      this.decay = Math.random() * 0.03 + 0.02;
      this.friction = 0.92;
    } else if (type === 'legDebris') {
      // Big metal leg junk pieces flying off
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.size = Math.random() * 12 + 8;
      this.decay = Math.random() * 0.012 + 0.008;
      this.friction = 0.96;
      this.rot = Math.random() * Math.PI;
      this.rotSpeed = (Math.random() - 0.5) * 0.15;
    }
  }

  update(px, py, magnetRadius, isPlayerInvuln, dt) {
    this.life -= this.decay * dt;
    
    if (this.type === 'shatter') {
      const dx = px - this.x;
      const dy = py - this.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist < magnetRadius) {
        this.magnetized = true;
      }
      
      if (this.magnetized && isPlayerInvuln !== 'dead') {
        const pull = 0.65;
        this.vx += (dx / dist) * pull * dt;
        this.vy += (dy / dist) * pull * dt;
        this.vx *= 0.88;
        this.vy *= 0.88;
      } else {
        this.vx *= this.friction;
        this.vy *= this.friction;
      }
    } else {
      this.vx *= this.friction;
      this.vy *= this.friction;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.type === 'legDebris') {
      this.rot += this.rotSpeed * dt;
    }
  }

  draw(ctx, cx, cy, w, h) {
    const sx = this.x - cx + w / 2;
    const sy = this.y - cy + h / 2;
    
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    
    if (this.type === 'shatter' || this.type === 'wallSpark') {
      ctx.shadowBlur = 8;
      ctx.shadowColor = this.color;
      ctx.beginPath();
      ctx.arc(sx, sy, this.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'slash') {
      ctx.beginPath();
      ctx.moveTo(sx - this.size, sy);
      ctx.lineTo(sx, sy - this.size / 2);
      ctx.lineTo(sx + this.size, sy);
      ctx.lineTo(sx, sy + this.size / 2);
      ctx.closePath();
      ctx.fill();
    } else if (this.type === 'legDebris') {
      // Draw rectangular debris
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.translate(sx, sy);
      ctx.rotate(this.rot);
      ctx.strokeRect(-this.size/2, -this.size/4, this.size, this.size/2);
    } else {
      ctx.beginPath();
      ctx.arc(sx, sy, this.size * this.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

class Drone {
  constructor(id) {
    this.id = id;
    this.angle = 0;
    this.shootCooldown = 750;
    this.lastShot = 0;
    this.radius = 45;
  }

  update(px, py, gameTime, enemies, onShootLaser, dt) {
    this.angle += 0.05 * dt;
    this.x = px + Math.cos(this.angle + (this.id * Math.PI * 0.66)) * this.radius;
    this.y = py + Math.sin(this.angle + (this.id * Math.PI * 0.66)) * this.radius;

    if (gameTime - this.lastShot > this.shootCooldown) {
      let target = null;
      let minDist = 380;
      
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.sliced) continue;
        const d = Vec.dist(this.x, this.y, e.x, e.y);
        if (d < minDist) {
          minDist = d;
          target = e;
        }
      }

      if (target) {
        onShootLaser(this.x, this.y, target);
        this.lastShot = gameTime + (Math.random() - 0.5) * 150;
      }
    }
  }

  draw(ctx, cx, cy, w, h) {
    const sx = this.x - cx + w / 2;
    const sy = this.y - cy + h / 2;
    
    ctx.save();
    ctx.fillStyle = '#ffe600';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ffe600';
    ctx.beginPath();
    ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(255, 230, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

class Shockwave {
  constructor(x, y, maxRadius = 150, color = '#b026ff') {
    this.x = x;
    this.y = y;
    this.radius = 15;
    this.maxRadius = maxRadius;
    this.color = color;
    this.active = true;
    this.speed = 4.5;
  }

  update(dt) {
    this.radius += this.speed * dt;
    if (this.radius >= this.maxRadius) {
      this.active = false;
    }
  }

  draw(ctx, cx, cy, w, h) {
    const sx = this.x - cx + w / 2;
    const sy = this.y - cy + h / 2;
    const alpha = Vec.clamp(1 - (this.radius / this.maxRadius), 0, 1);
    
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

class LaserBeam {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.life = 1.0;
    this.decay = 0.12;
  }
  update(dt) {
    this.life -= this.decay * dt;
    return this.life > 0;
  }
  draw(ctx, cx, cy, w, h) {
    ctx.save();
    ctx.strokeStyle = '#ffe600';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ffe600';
    ctx.lineWidth = 3.5 * this.life;
    ctx.globalAlpha = Vec.clamp(this.life, 0, 1);
    ctx.beginPath();
    ctx.moveTo(this.x1 - cx + w / 2, this.y1 - cy + h / 2);
    ctx.lineTo(this.x2 - cx + w / 2, this.y2 - cy + h / 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ==========================================
// C2. Interactive Menu Particles & Decoy
// ==========================================
class MenuParticle {
  constructor(w, h) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 0.8 + 0.3;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.size = Math.random() * 2.8 + 1.2;
    this.color = ['#00f3ff', '#ff0055', '#ffe600', '#39ff14', '#b026ff'][Math.floor(Math.random() * 5)];
    this.alpha = Math.random() * 0.5 + 0.3;
  }

  update(mouseX, mouseY, w, h) {
    this.x += this.vx;
    this.y += this.vy;

    // Screen wrap
    if (this.x < 0) this.x = w;
    if (this.x > w) this.x = 0;
    if (this.y < 0) this.y = h;
    if (this.y > h) this.y = 0;

    // React to mouse coordinates (gravitate towards then glide)
    const dx = mouseX - this.x;
    const dy = mouseY - this.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist < 180 && dist > 10) {
      // Pull particles slowly
      this.x += (dx / dist) * 1.5;
      this.y += (dy / dist) * 1.5;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class PhantomDecoy {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 16;
    this.life = 1500; // ms duration
    this.maxLife = 1500;
    this.color = '#ffe600';
    this.pulse = 0;
  }

  update(dt, bullets, onExplode, game) {
    this.life -= 16.6 * dt;
    this.pulse += 0.25 * dt;

    if (this.life <= 0) {
      onExplode(this.x, this.y);
      return false; // delete
    }

    // Pull nearby bullets (aggro)
    const aggroRadius = 320;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      const dx = this.x - b.x;
      const dy = this.y - b.y;
      const dist = Math.hypot(dx, dy);

      if (dist < aggroRadius) {
        // Bend bullet trajectory towards decoy
        const force = (1 - dist / aggroRadius) * 0.18;
        const targetAng = Math.atan2(dy, dx);
        
        const bSpeed = Math.hypot(b.vx, b.vy);
        const curAng = Math.atan2(b.vy, b.vx);
        
        let diff = targetAng - curAng;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        const newAng = curAng + diff * force * dt;
        b.vx = Math.cos(newAng) * bSpeed;
        b.vy = Math.sin(newAng) * bSpeed;
      }
    }
    return true;
  }

  draw(ctx, cx, cy, w, h) {
    const sx = this.x - cx + w / 2;
    const sy = this.y - cy + h / 2;
    const ratio = this.life / this.maxLife;

    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = ratio * 0.75;
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.color;

    // Glowing wireframe diamond (Decoy hologram)
    ctx.translate(sx, sy);
    ctx.rotate(this.pulse * 0.05);
    const pulseScale = 1.0 + Math.sin(this.pulse) * 0.15;
    ctx.scale(pulseScale, pulseScale);
    
    ctx.beginPath();
    ctx.moveTo(0, -this.radius);
    ctx.lineTo(this.radius, 0);
    ctx.lineTo(0, this.radius);
    ctx.lineTo(-this.radius, 0);
    ctx.closePath();
    ctx.stroke();

    // Pulse rings
    ctx.strokeStyle = 'rgba(255, 230, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * (2 - ratio), 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}


// ==========================================
// D. Organic Enemy Classes v4
// ==========================================
class BaseEnemy {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.type = type;
    this.sliced = false;
    this.sliceTimer = 0;
    
    // Squash & Stretch Scale Matrices
    this.scaleX = 1.0;
    this.scaleY = 1.0;
  }

  damageRecoil(dx, dy, force = 2.5) {
    const angle = Math.atan2(dy, dx);
    this.vx += Math.cos(angle) * force;
    this.vy += Math.sin(angle) * force;
    this.scaleX = 0.7;
    this.scaleY = 1.35; // squash
  }

  updateScales(dt) {
    this.scaleX = Vec.lerp(this.scaleX, 1.0, 0.14 * dt);
    this.scaleY = Vec.lerp(this.scaleY, 1.0, 0.14 * dt);
  }
}

// 1. Basic Triangles & Heavies
class HexEnemy extends BaseEnemy {
  constructor(x, y, type) {
    super(x, y, type);
    if (type === 'basic') {
      this.radius = 16;
      this.speed = 2.4;
      this.hp = 1;
      this.color = '#00f3ff';
      this.scoreVal = 100;
    } else { // heavy
      this.radius = 28;
      this.speed = 0.9;
      this.hp = 6;
      this.color = '#ffe600';
      this.scoreVal = 500;
    }
  }

  update(px, py, dt, gameTime, onShoot) {
    if (this.sliced) { this.sliceTimer += dt; return; }
    
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(0.85, dt);
    this.vy *= Math.pow(0.85, dt);
    this.updateScales(dt);

    const dx = px - this.x;
    const dy = py - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
      this.x += (dx / dist) * this.speed * dt;
      this.y += (dy / dist) * this.speed * dt;
    }
  }

  draw(ctx, cx, cy, w, h, timeScale) {
    const sx = this.x - cx + w / 2;
    const sy = this.y - cy + h / 2;
    
    ctx.save();
    ctx.shadowBlur = 10 * (1 / timeScale);
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    ctx.translate(sx, sy);
    ctx.scale(this.scaleX, this.scaleY);

    if (this.sliced) {
      ctx.globalAlpha = 0.7;
      const shift = Math.sin(this.sliceTimer * 0.12) * 8;
      
      // Draw split
      ctx.beginPath();
      if (this.type === 'basic') {
        ctx.arc(-shift, -shift, this.radius, Math.PI * 0.75, Math.PI * 1.75);
      } else {
        ctx.arc(-shift, -shift, this.radius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.beginPath();
      ctx.arc(shift, shift, this.radius, Math.PI * 1.75, Math.PI * 0.75);
      ctx.fill();
    } else {
      ctx.beginPath();
      if (this.type === 'basic') {
        ctx.moveTo(0, -this.radius);
        ctx.lineTo(this.radius, this.radius * 0.85);
        ctx.lineTo(-this.radius, this.radius * 0.85);
        ctx.closePath();
      } else { // heavy
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const hx = Math.cos(angle) * this.radius;
          const hy = Math.sin(angle) * this.radius;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

// 2. Swimmimg Jellyfish Hunter (Squash Swimming & Bezier Tentacles)
class JellyfishEnemy extends BaseEnemy {
  constructor(x, y) {
    super(x, y, 'jellyfish');
    this.radius = 16;
    this.speed = 2.1;
    this.hp = 2;
    this.color = '#ff00aa'; // Pulsing Magenta
    this.scoreVal = 250;
    
    // Wave cycle
    this.swimPhase = Math.random() * Math.PI * 2;
    this.shootCooldown = 1800;
    this.lastShot = 0;
    
    // History array for dynamic wiggly tentacle nodes path lagging
    this.history = [];
    for(let i=0; i<15; i++) {
      this.history.push({x: x, y: y});
    }
  }

  update(px, py, dt, gameTime, onShoot) {
    if (this.sliced) { this.sliceTimer += dt; return; }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(0.85, dt);
    this.vy *= Math.pow(0.85, dt);
    this.updateScales(dt);

    // Dynamic swim cycles: squash & stretch based on sine velocity waves!
    this.swimPhase += 0.08 * dt;
    const pulseFactor = Math.sin(this.swimPhase);
    
    let currentSpeed = this.speed;
    if (pulseFactor > 0.2) {
      // Contract bell -> boost forward!
      this.scaleX = 0.7;
      this.scaleY = 1.35;
      currentSpeed = this.speed * 2.3;
    } else {
      // Expand bell -> drift glide
      this.scaleX = 1.25;
      this.scaleY = 0.8;
      currentSpeed = this.speed * 0.4;
    }

    const dx = px - this.x;
    const dy = py - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
      this.x += (dx / dist) * currentSpeed * dt;
      this.y += (dy / dist) * currentSpeed * dt;
    }

    // Lag tentacle history coordinates
    this.history.unshift({x: this.x, y: this.y});
    if (this.history.length > 18) this.history.pop();

    // Fire bullet patterns
    if (gameTime - this.lastShot > this.shootCooldown && dist < 360) {
      onShoot(this.x, this.y, Math.atan2(dy, dx));
      this.lastShot = gameTime + (Math.random() - 0.5) * 300;
      this.scaleX = 0.5; this.scaleY = 1.5; // huge recoil squash
    }
  }

  draw(ctx, cx, cy, w, h, timeScale) {
    const sx = this.x - cx + w / 2;
    const sy = this.y - cy + h / 2;

    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;

    // 1. Draw 4 wiggling Bezier tentacles lagging behind body path!
    if (!this.sliced) {
      ctx.strokeStyle = 'rgba(255, 0, 170, 0.4)';
      ctx.lineWidth = 2;
      for (let t = 0; t < 4; t++) {
        ctx.beginPath();
        ctx.moveTo(sx - 10 + t * 6.5, sy);
        
        // Compute waves
        let prevX = sx - 10 + t * 6.5;
        let prevY = sy;
        for (let i = 1; i < this.history.length; i++) {
          const node = this.history[i];
          const lagX = node.x - cx + w / 2;
          const lagY = node.y - cy + h / 2;
          
          const wiggle = Math.sin(this.swimPhase + i * 0.45 + t * 1.5) * 4.5;
          const targetX = lagX - 10 + t * 6.5 + wiggle;
          const targetY = lagY + i * 1.2;
          
          // Draw curved links
          ctx.quadraticCurveTo(prevX, prevY, (prevX + targetX)/2, (prevY + targetY)/2);
          prevX = targetX;
          prevY = targetY;

          // Bioluminescent bulbs at the tips of tentacles
          if (i === this.history.length - 1) {
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ff00aa';
            ctx.beginPath();
            ctx.arc(targetX, targetY, 4.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
        ctx.stroke();
      }
    }

    // 2. Draw Pulsing jellyfish bell cap
    ctx.translate(sx, sy);
    ctx.scale(this.scaleX, this.scaleY);

    ctx.fillStyle = this.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Half circle cap dome
    ctx.arc(0, 0, this.radius, Math.PI, 0);
    // Wavy bottom rim edge
    ctx.quadraticCurveTo(this.radius * 0.5, 6, 0, 0);
    ctx.quadraticCurveTo(-this.radius * 0.5, 6, -this.radius, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Spawn organic electric discharge lines inside the cap (Wow detail!)
    if (!this.sliced && Math.random() < 0.2) {
      ctx.strokeStyle = '#00f3ff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-this.radius * 0.75, -2);
      ctx.lineTo(-this.radius * 0.3, -this.radius * 0.55);
      ctx.lineTo(this.radius * 0.25, -this.radius * 0.15);
      ctx.lineTo(this.radius * 0.75, -1);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// 3. Wiggling Segmented Serpent (Slice link severs tail segments!)
class SerpentEnemy extends BaseEnemy {
  constructor(x, y) {
    super(x, y, 'serpent');
    this.radius = 12; // head radius
    this.speed = 2.6;
    this.hp = 1; // head hp
    this.color = '#39ff14'; // Neon Green
    this.scoreVal = 300;

    this.wiggleAngle = Math.random() * 10;
    this.angle = 0; // facing angle
    
    // 9 body segments
    this.segments = [];
    for (let i = 0; i < 9; i++) {
      this.segments.push({
        x: x,
        y: y,
        radius: 12 - i * 0.8, // tappers towards tail
        hp: 1,
        color: 'rgba(57, 255, 20, 0.75)'
      });
    }
  }

  update(px, py, dt, gameTime, onShoot) {
    if (this.sliced) { this.sliceTimer += dt; return; }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(0.85, dt);
    this.vy *= Math.pow(0.85, dt);
    this.updateScales(dt);

    // Sine snake crawl wiggle motion towards player
    this.wiggleAngle += 0.15 * dt;
    const dx = px - this.x;
    const dy = py - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
      this.angle = Math.atan2(dy, dx) + Math.sin(this.wiggleAngle) * 0.38;
      this.x += Math.cos(this.angle) * this.speed * dt;
      this.y += Math.sin(this.angle) * this.speed * dt;
    }

    // Update body segments trailing head
    let prevX = this.x;
    let prevY = this.y;
    
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const sdx = prevX - seg.x;
      const sdy = prevY - seg.y;
      const sdist = Math.hypot(sdx, sdy);
      
      const gap = 14; // spacing constraint
      if (sdist > gap) {
        const ratio = gap / sdist;
        seg.x = prevX - sdx * ratio;
        seg.y = prevY - sdy * ratio;
      }
      prevX = seg.x;
      prevY = seg.y;
    }
  }

  draw(ctx, cx, cy, w, h, timeScale) {
    // 1. Draw trailing body segments first (back to front)
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i];
      const ssx = seg.x - cx + w / 2;
      const ssy = seg.y - cy + h / 2;
      
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = this.color;
      ctx.fillStyle = seg.color;
      ctx.beginPath();
      ctx.arc(ssx, ssy, seg.radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw wiggling glow dust stardust around segments
      if (Math.random() < 0.15) {
        ctx.fillStyle = 'rgba(57, 255, 20, 0.9)';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(ssx + (Math.random() - 0.5) * 16, ssy + (Math.random() - 0.5) * 16, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw grid skeletal connection rings
      if (i > 0) {
        const nextSeg = this.segments[i - 1];
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ssx, ssy);
        ctx.lineTo(nextSeg.x - cx + w / 2, nextSeg.y - cy + h / 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Draw head
    const sx = this.x - cx + w / 2;
    const sy = this.y - cy + h / 2;
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;

    ctx.translate(sx, sy);
    ctx.rotate(this.angle + Math.PI / 2); // Rotate head facing crawling direction
    ctx.scale(this.scaleX, this.scaleY);

    ctx.beginPath();
    // Diamond head shape
    ctx.moveTo(0, -this.radius * 1.3);
    ctx.lineTo(this.radius * 0.75, 0);
    ctx.lineTo(0, this.radius * 1.3);
    ctx.lineTo(-this.radius * 0.75, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw glowing red cyber-eyes (Wow detail!)
    ctx.fillStyle = '#ff0055';
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(-this.radius * 0.35, -this.radius * 0.4, 2.5, 0, Math.PI * 2);
    ctx.arc(this.radius * 0.35, -this.radius * 0.4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
}

// ==========================================
// D2. Boss Unit v4 (Dread-Spider Overlord)
// ==========================================
class Boss {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.maxHp = 250; // Increased HP for massive boss scale
    this.hp = 250;
    this.radius = 130; // Core chassis radius (scaled up from 50)
    this.color = '#ff003c';
    
    this.state = 'spawning'; // 'spawning', 'patrolling', 'targeting', 'charging', 'defeated'
    this.angle = 0;
    this.attackTimer = 0;
    this.attackPhase = 0; // 0: radial, 1: dash, 2: shield
    
    this.targetLockX = 0;
    this.targetLockY = 0;
    this.shieldBlocks = [];
    this.isOverdrive = false; // Phase 3 overload indicator
    
    // Scale vectors
    this.scaleX = 1.0;
    this.scaleY = 1.0;

    // Boss Chassis tilt vectors (severed legs tilt body)
    this.tiltX = 0;
    this.tiltY = 0;

    // 4 Jointed Leg Units (Robotic spider limb chains)
    // Anchored wider for the massive chassis size
    this.legs = [
      this.createLeg(0, -Math.PI * 0.75, -110, -90), // Top Left
      this.createLeg(1, -Math.PI * 0.25, -110, 90),  // Bottom Left
      this.createLeg(2, Math.PI * 0.25, 110, -90),   // Top Right
      this.createLeg(3, Math.PI * 0.75, 110, 90)     // Bottom Right
    ];
  }

  createLeg(id, angleOffset, localX, localY) {
    return {
      id: id,
      localX: localX, // shoulder anchor coordinate relative to core center
      localY: localY,
      angleOffset: angleOffset,
      hp: 35, // More durable legs
      maxHp: 35,
      severed: false,
      
      // IK Foot step positions
      footX: 0,
      footY: 0,
      targetFootX: 0,
      targetFootY: 0,
      stepProgress: 1.0,
      
      // Joint nodes
      kneeX: 0,
      kneeY: 0
    };
  }

  update(player, dt, gameTime, onSpawnBullet, onDebrisEjected) {
    this.angle += 0.012 * dt;
    
    // Recover scale matrices
    this.scaleX = Vec.lerp(this.scaleX, 1.0, 0.12 * dt);
    this.scaleY = Vec.lerp(this.scaleY, 1.0, 0.12 * dt);

    if (this.state === 'spawning') {
      const d = Vec.dist(this.x, this.y, 1500, 1500);
      if (d > 10) {
        const dirX = 1500 - this.x;
        const dirY = 1500 - this.y;
        this.x += (dirX / d) * 3.0 * dt;
        this.y += (dirY / d) * 3.0 * dt;
      } else {
        this.state = 'patrolling';
        this.attackTimer = 0;
        this.attackPhase = 0;
      }
      this.updateLegIK(dt);
      return;
    }

    if (this.state === 'defeated') {
      this.x += (Math.random() - 0.5) * 5;
      this.y += (Math.random() - 0.5) * 5;
      this.updateLegIK(dt);
      
      // Defeated sparks
      if (Math.random() < 0.6) {
        onDebrisEjected(this.x + (Math.random()-0.5)*180, this.y + (Math.random()-0.5)*180, '#ff003c', 'wallSpark');
      }
      return;
    }

    // Overdrive (Phase 3) Trigger at <30% HP
    if (this.hp < this.maxHp * 0.3 && !this.isOverdrive) {
      this.isOverdrive = true;
      window.audio.playSe('se_fever'); // play warning fanfare
      if (player.gameRef) {
        player.gameRef.triggerFlash('damage');
        player.gameRef.shakeIntensity = 25;
      }
    }

    // Overdrive particle ejectors
    if (this.isOverdrive && Math.random() < 0.4) {
      // Heavy toxic cyberpunk smoke (using dark purple/gray slash particles)
      onDebrisEjected(this.x + (Math.random()-0.5)*160, this.y + (Math.random()-0.5)*160, 'rgba(120, 60, 160, 0.45)', 'slash');
      // Dangerous red sparks
      onDebrisEjected(this.x + (Math.random()-0.5)*120, this.y + (Math.random()-0.5)*120, '#ff0055', 'feverSpark');
    }

    // Eject permanent blue arc sparks from severed leg shoulder sockets
    this.legs.forEach(leg => {
      if (leg.severed && Math.random() < 0.3) {
        const shoulderX = this.x + Math.cos(this.angle + leg.angleOffset) * (this.radius * 0.55);
        const shoulderY = this.y + Math.sin(this.angle + leg.angleOffset) * (this.radius * 0.55);
        onDebrisEjected(shoulderX, shoulderY, '#00f3ff', 'wallSpark');
      }
    });

    // Phase 2 shield block orbit updates (scaled outward for giant chassis)
    if (this.attackPhase === 2 && this.shieldBlocks.length > 0) {
      for (let i = 0; i < this.shieldBlocks.length; i++) {
        const block = this.shieldBlocks[i];
        block.orbitAngle += 0.022 * dt;
        block.x = this.x + Math.cos(block.orbitAngle) * (this.radius + 65);
        block.y = this.y + Math.sin(block.orbitAngle) * (this.radius + 65);
      }
    }

    this.attackTimer += 16.6 * dt;

    // Determine speed multiplier based on active legs (severed legs slow down boss!)
    const activeLegsCount = this.legs.filter(l => !l.severed).length;
    const legSpeedMult = activeLegsCount / 4; // 1.0 down to 0

    // Adjust chassis tilt based on severed legs
    const leftSevered = (this.legs[0].severed ? 1 : 0) + (this.legs[1].severed ? 1 : 0);
    const rightSevered = (this.legs[2].severed ? 1 : 0) + (this.legs[3].severed ? 1 : 0);
    this.tiltX = Vec.lerp(this.tiltX, (leftSevered - rightSevered) * 20, 0.1 * dt);

    if (this.state === 'patrolling') {
      const patrolAng = gameTime * 0.0006;
      const targetX = 1500 + Math.cos(patrolAng) * 260;
      const targetY = 1500 + Math.sin(patrolAng * 1.5) * 200;
      
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      
      // Speed multiplier incorporates leg speed
      const basePatrolSteer = this.isOverdrive ? 0.035 : 0.02;
      this.x += dx * basePatrolSteer * legSpeedMult * dt;
      this.y += dy * basePatrolSteer * legSpeedMult * dt;

      // Attacks
      if (this.attackPhase === 0) {
        // Radial bullet spirals (faster and denser in overdrive)
        const spiralSpeed = this.isOverdrive ? 0.007 : 0.0035;
        const moduloRate = this.isOverdrive ? 80 : 160;
        
        if (Math.floor(this.attackTimer) % moduloRate < 16.6) {
          const spAng = (gameTime * spiralSpeed) % (Math.PI * 2);
          const bulletCount = this.isOverdrive ? 9 : 5;
          for (let i = 0; i < bulletCount; i++) {
            const finalAng = spAng + (Math.PI * 2 / bulletCount) * i;
            onSpawnBullet(this.x, this.y, finalAng);
          }
        }
      } else if (this.attackPhase === 2) {
        // Spawn orbital guard shield plates once (scaled to 220 orbit, larger size)
        if (this.shieldBlocks.length === 0) {
          const numShields = this.isOverdrive ? 6 : 4; // More shields in overdrive
          for (let i = 0; i < numShields; i++) {
            const startAng = (Math.PI * 2 / numShields) * i;
            this.shieldBlocks.push({
              x: this.x + Math.cos(startAng) * (this.radius + 65),
              y: this.y + Math.sin(startAng) * (this.radius + 65),
              radius: 32, // Large shield block
              orbitAngle: startAng,
              hp: 5,      // More HP
              color: '#ffe600'
            });
          }
        }

        // Concentrated target streams (faster fire in overdrive)
        const shootInterval = this.isOverdrive ? 450 : 850;
        if (this.attackTimer % shootInterval < 16.6) {
          const ang = Math.atan2(player.y - this.y, player.x - this.x);
          onSpawnBullet(this.x, this.y, ang - 0.25);
          onSpawnBullet(this.x, this.y, ang);
          onSpawnBullet(this.x, this.y, ang + 0.25);
          if (this.isOverdrive) {
            onSpawnBullet(this.x, this.y, ang - 0.5);
            onSpawnBullet(this.x, this.y, ang + 0.5);
          }
        }
      }

      const phaseTimerLimit = this.isOverdrive ? 5000 : 7000;
      if (this.attackTimer >= phaseTimerLimit) {
        this.attackTimer = 0;
        this.attackPhase = (this.attackPhase + 1) % 3;
        
        if (this.attackPhase === 1) {
          this.state = 'targeting';
          this.targetLockX = player.x;
          this.targetLockY = player.y;
        } else {
          this.shieldBlocks = [];
        }
      }
    } 
    else if (this.state === 'targeting') {
      const targetWait = this.isOverdrive ? 800 : 1400; // Aim faster in overdrive
      if (this.attackTimer >= targetWait) {
        this.state = 'charging';
        this.attackTimer = 0;
        
        const lockAng = Math.atan2(this.targetLockY - this.y, this.targetLockX - this.x);
        // Severed legs slow charge down; Overdrive gives base speed boost!
        const baseSpeed = this.isOverdrive ? 24.5 : 17.5;
        const chargeSpeed = baseSpeed * (0.3 + 0.7 * legSpeedMult);
        this.vx = Math.cos(lockAng) * chargeSpeed;
        this.vy = Math.sin(lockAng) * chargeSpeed;
        
        // Squash stretch aim impact
        this.scaleX = 0.55;
        this.scaleY = 1.45;
        window.audio.playSe('se_dash');
      }
    } 
    else if (this.state === 'charging') {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= Math.pow(0.97, dt);
      this.vy *= Math.pow(0.97, dt);

      let bounced = false;
      const boundMin = 120;
      const boundMax = CONFIG.arenaSize - 120;

      if (this.x < boundMin) { this.x = boundMin; this.vx = -this.vx; bounced = true; }
      else if (this.x > boundMax) { this.x = boundMax; this.vx = -this.vx; bounced = true; }

      if (this.y < boundMin) { this.y = boundMin; this.vy = -this.vy; bounced = true; }
      else if (this.y > boundMax) { this.y = boundMax; this.vy = -this.vy; bounced = true; }

      if (bounced) {
        const shrapCount = this.isOverdrive ? 20 : 14;
        for (let i = 0; i < shrapCount; i++) {
          const ang = (Math.PI * 2 / shrapCount) * i;
          onSpawnBullet(this.x, this.y, ang);
        }
        window.audio.playSe('se_hit');
        this.scaleX = 1.4; this.scaleY = 0.6; // flat impact squash
        if (player.gameRef) player.gameRef.shakeIntensity = 25;
      }

      if (Math.hypot(this.vx, this.vy) < 1.5) {
        this.state = 'patrolling';
        this.attackTimer = 0;
      }
    }

    // Update Foot IK Walk cycles
    this.updateLegIK(dt);
  }

  // ==========================================
  // INVERSE KINEMATICS FOOT STEP LEGS
  // ==========================================
  updateLegIK(dt) {
    // Thigh and Shin lengths scaled up significantly (from 45 to 135)
    const L1 = 135;
    const L2 = 135;

    this.legs.forEach(leg => {
      if (leg.severed) return;

      // Shoulder joint position on chassis (body space)
      // Rotate shoulder relative to core angle
      const shoulderX = this.x + Math.cos(this.angle + leg.angleOffset) * (this.radius * 0.55);
      const shoulderY = this.y + Math.sin(this.angle + leg.angleOffset) * (this.radius * 0.55);

      // Foot step plant calculations
      // Target foot print offsets based on movement direction
      const vx = this.state === 'charging' ? this.vx : (this.x - (this.lastX || this.x));
      const vy = this.state === 'charging' ? this.vy : (this.y - (this.lastY || this.y));
      
      // Resting position scaled out to match the giant leg joints (from 110 to 290)
      const footRestX = this.x + Math.cos(this.angle + leg.angleOffset) * 290;
      const footRestY = this.y + Math.sin(this.angle + leg.angleOffset) * 290;

      // If foot is too far from resting point, trigger stepping action!
      const distToRest = Vec.dist(leg.footX, leg.footY, footRestX, footRestY);
      // Scaled trigger distance from 80 to 190
      if (distToRest > 190 && leg.stepProgress >= 1.0) {
        leg.stepProgress = 0;
        // Step forward along moving direction
        leg.targetFootX = footRestX + vx * 16;
        leg.targetFootY = footRestY + vy * 16;
      }

      // Smooth step slide interpolation
      if (leg.stepProgress < 1.0) {
        leg.stepProgress += 0.12 * dt;
        // Raise foot vertically (visual sine bump)
        const t = Math.min(1.0, leg.stepProgress);
        leg.footX = Vec.lerp(leg.footX, leg.targetFootX, t);
        leg.footY = Vec.lerp(leg.footY, leg.targetFootY, t);
      }

      // Solve joint knee position using trigonometry/vector midpoint offsets (Inverse Kinematics!)
      const dx = leg.footX - shoulderX;
      const dy = leg.footY - shoulderY;
      const D = Math.hypot(dx, dy);

      if (D >= L1 + L2) {
        // Stretch straight out
        leg.kneeX = shoulderX + (dx / D) * L1;
        leg.kneeY = shoulderY + (dy / D) * L1;
      } else if (D > 0) {
        // Midpoint of segment shoulder-to-foot
        const midX = (shoulderX + leg.footX) / 2;
        const midY = (shoulderY + leg.footY) / 2;
        
        // Perpendicular vector direction
        const px = -dy / D;
        const py = dx / D;
        
        // Solve knee altitude offset using Pythagoras
        const H = Math.sqrt(L1 * L1 - (D / 2) * (D / 2));
        
        // Bend knees outwards based on left/right side
        const bendDir = (leg.id === 0 || leg.id === 1) ? -1 : 1;
        leg.kneeX = midX + px * H * bendDir;
        leg.kneeY = midY + py * H * bendDir;
      }
    });

    this.lastX = this.x;
    this.lastY = this.y;
  }

  // Sever boss leg
  severLeg(legId, onDebrisEjected) {
    const leg = this.legs[legId];
    if (!leg || leg.severed) return;
    
    leg.severed = true;
    
    // Eject massive severed leg segments as flying physics debris!
    onDebrisEjected(leg.kneeX, leg.kneeY, this.color, 'legDebris');
    onDebrisEjected(leg.footX, leg.footY, this.color, 'legDebris');
    
    // Major explosion at sever point
    this.hp -= 25.0; // leg loss damages core!
  }

  draw(ctx, cx, cy, w, h) {
    const sx = this.x - cx + w / 2;
    const sy = this.y - cy + h / 2;

    ctx.save();
    ctx.shadowBlur = this.isOverdrive ? 30 : 20;
    ctx.shadowColor = this.color;

    // 1. Draw Robotic Jointed Legs
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 7; // Thicker lines for giant legs
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.legs.forEach(leg => {
      if (leg.severed) return;
      
      const shoulderX = this.x + Math.cos(this.angle + leg.angleOffset) * (this.radius * 0.55);
      const shoulderY = this.y + Math.sin(this.angle + leg.angleOffset) * (this.radius * 0.55);

      const shsX = shoulderX - cx + w / 2;
      const shsY = shoulderY - cy + h / 2;
      const knsX = leg.kneeX - cx + w / 2;
      const knsY = leg.kneeY - cy + h / 2;
      const ftsX = leg.footX - cx + w / 2;
      const ftsY = leg.footY - cy + h / 2;

      ctx.beginPath();
      // Draw Thigh segment
      ctx.moveTo(shsX, shsY);
      ctx.lineTo(knsX, knsY);
      // Draw Shin segment
      ctx.lineTo(ftsX, ftsY);
      ctx.stroke();

      // Draw glowing joint cap circles
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(knsX, knsY, 9, 0, Math.PI * 2);
      ctx.arc(ftsX, ftsY, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw Target aim warning laser line
    if (this.state === 'targeting') {
      const lockSx = this.targetLockX - cx + w / 2;
      const lockSy = this.targetLockY - cy + h / 2;
      
      ctx.strokeStyle = 'rgba(255, 0, 60, 0.65)';
      ctx.lineWidth = 5;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(lockSx, lockSy);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.strokeStyle = varColor('pink');
      ctx.strokeRect(lockSx - 18, lockSy - 18, 36, 36);
      ctx.beginPath();
      ctx.arc(lockSx, lockSy, 12, 0, Math.PI*2);
      ctx.stroke();
    }

    // Draw Shield Blocks (orbiting giant plates)
    if (this.attackPhase === 2 && this.shieldBlocks.length > 0) {
      for (let i = 0; i < this.shieldBlocks.length; i++) {
        const block = this.shieldBlocks[i];
        const bsx = block.x - cx + w / 2;
        const bsy = block.y - cy + h / 2;
        
        ctx.save();
        ctx.fillStyle = block.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = block.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bsx, bsy, block.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2. Draw Core chassis (Tilt and Squash applied!)
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    ctx.scale(this.scaleX, this.scaleY);
    // Apply body tilt shift
    ctx.translate(this.tiltX, this.tiltY);

    ctx.fillStyle = this.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;

    // Inner core sphere
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Octagram spikes
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (Math.PI / 4) * i;
      const rOuter = (i % 2 === 0) ? this.radius : this.radius * 0.65;
      const px = Math.cos(ang) * rOuter;
      const py = Math.sin(ang) * rOuter;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw glowing Overdrive cyber-eyes (Wow detail!)
    const eyeFlash = this.isOverdrive ? (Math.floor(Date.now() * 0.008) % 2 === 0 ? '#ff003c' : '#ffffff') : '#ffe600';
    ctx.fillStyle = eyeFlash;
    ctx.shadowColor = eyeFlash;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(-this.radius * 0.28, -this.radius * 0.2, 16, 0, Math.PI * 2);
    ctx.arc(this.radius * 0.28, -this.radius * 0.2, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ==========================================
// D3. Colossus Leviathan Boss Class (Version 6)
// ==========================================
class ColossusLeviathan {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.maxHp = 750; // Colossal HP pool
    this.hp = 750;
    this.radius = 110; // Giant head radius
    this.color = '#39ff14'; // Cyber Green
    this.type = 'leviathan';
    
    this.state = 'spawning'; // 'spawning', 'patrolling', 'targeting', 'charging', 'defeated'
    this.angle = 0;
    this.attackTimer = 0;
    this.attackPhase = 0; // 0: spiral barrage, 1: sweeps/rings, 2: targeting/charging
    this.isOverdrive = false;
    
    // Scale vectors for squash/stretch visual feedback
    this.scaleX = 1.0;
    this.scaleY = 1.0;
    
    // We create 10 segments trailing the head
    this.segments = [];
    for (let i = 0; i < 10; i++) {
      this.segments.push({
        id: i,
        x: x,
        y: y,
        radius: 85 - i * 4.5, // tapers down from 85 to 45
        hp: 30 + (10 - i) * 10,              // HP per segment
        maxHp: 30 + (10 - i) * 10,
        color: '#39ff14',
        isSevered: false,
        shootCooldown: 900,
        lastShot: 0,
        armorAngle: Math.random() * Math.PI,
        armorSpeed: (Math.random() - 0.5) * 0.04
      });
    }
    
    // Emitter array for scheduling sequential cascading explosions
    this.explodingSegments = [];
  }
  
  update(player, dt, gameTime, onSpawnBullet, onDebrisEjected) {
    this.updateScales(dt);
    
    if (this.state === 'spawning') {
      const d = Vec.dist(this.x, this.y, 1500, 1500);
      if (d > 10) {
        const dirX = 1500 - this.x;
        const dirY = 1500 - this.y;
        this.x += (dirX / d) * 3.5 * dt;
        this.y += (dirY / d) * 3.5 * dt;
        this.angle = Math.atan2(dirY, dirX);
      } else {
        this.state = 'patrolling';
        this.attackTimer = 0;
        this.attackPhase = 0;
      }
      this.updateSegments(dt);
      this.updateExplodingSegments(dt, player, onDebrisEjected);
      return;
    }
    
    if (this.state === 'defeated') {
      this.x += (Math.random() - 0.5) * 6 * dt;
      this.y += (Math.random() - 0.5) * 6 * dt;
      this.updateSegments(dt);
      this.updateExplodingSegments(dt, player, onDebrisEjected);
      
      if (Math.random() < 0.8) {
        onDebrisEjected(this.x + (Math.random()-0.5)*150, this.y + (Math.random()-0.5)*150, this.color, 'wallSpark');
      }
      return;
    }
    
    // Check Overdrive below 35% HP
    if (this.hp < this.maxHp * 0.35 && !this.isOverdrive) {
      this.isOverdrive = true;
      this.color = '#ff0055'; // Flashes crimson
      window.audio.playSe('se_fever');
      if (player.gameRef) {
        player.gameRef.triggerFlash('damage');
        player.gameRef.shakeIntensity = 28;
      }
      // Change color of all non-severed segments to pink
      this.segments.forEach(seg => {
        if (!seg.isSevered) seg.color = '#ff0055';
      });
    }
    
    // Eject warning smoke/sparks if in overdrive
    if (this.isOverdrive && Math.random() < 0.5) {
      onDebrisEjected(this.x + (Math.random()-0.5)*120, this.y + (Math.random()-0.5)*120, 'rgba(255, 0, 85, 0.45)', 'slash');
      onDebrisEjected(this.x + (Math.random()-0.5)*100, this.y + (Math.random()-0.5)*100, '#ffe600', 'feverSpark');
    }
    
    this.attackTimer += 16.6 * dt;
    
    // Update active segments armor rotation and random firing pods
    this.segments.forEach(seg => {
      if (seg.isSevered) return;
      seg.armorAngle += seg.armorSpeed * dt;
      
      // Firing bullets from segments
      const activeSegsCount = this.segments.filter(s => !s.isSevered).length;
      let shootInterval = this.isOverdrive ? 500 : 1000;
      shootInterval += activeSegsCount * 50; // slower if more segments are alive to balance difficulty
      
      if (gameTime - seg.lastShot > shootInterval && Math.random() < 0.3) {
        const bulletAngle = Math.atan2(player.y - seg.y, player.x - seg.x) + (Math.random() - 0.5) * 0.25;
        onSpawnBullet(seg.x, seg.y, bulletAngle);
        if (this.isOverdrive) {
          onSpawnBullet(seg.x, seg.y, bulletAngle - 0.4);
          onSpawnBullet(seg.x, seg.y, bulletAngle + 0.4);
        }
        seg.lastShot = gameTime + (Math.random() - 0.5) * 200;
      }
    });
    
    const activeSegsCount = this.segments.filter(s => !s.isSevered).length;
    const baseCrawlingSpeed = (this.isOverdrive ? 3.5 : 2.2) + (10 - activeSegsCount) * 0.2;
    
    if (this.state === 'patrolling') {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist > 50) {
        const targetAng = Math.atan2(dy, dx);
        let diff = targetAng - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        const turnRate = this.isOverdrive ? 0.05 : 0.035;
        this.angle += diff * turnRate * dt;
      }
      
      const crawlAng = this.angle + Math.sin(gameTime * 0.006) * 0.28;
      this.vx = Math.cos(crawlAng) * baseCrawlingSpeed;
      this.vy = Math.sin(crawlAng) * baseCrawlingSpeed;
      
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      
      if (this.attackPhase === 0) {
        const spiralSpeed = this.isOverdrive ? 0.009 : 0.005;
        const shootRate = this.isOverdrive ? 70 : 130;
        if (Math.floor(this.attackTimer) % shootRate < 16.6) {
          const spAng = (gameTime * spiralSpeed) % (Math.PI * 2);
          const bulletCount = this.isOverdrive ? 8 : 4;
          for (let i = 0; i < bulletCount; i++) {
            const finalAng = spAng + (Math.PI * 2 / bulletCount) * i;
            onSpawnBullet(this.x, this.y, finalAng);
          }
        }
      } else if (this.attackPhase === 1) {
        const shootRate = this.isOverdrive ? 400 : 750;
        if (this.attackTimer % shootRate < 16.6) {
          const ringCount = this.isOverdrive ? 16 : 10;
          for (let i = 0; i < ringCount; i++) {
            const finalAng = (Math.PI * 2 / ringCount) * i;
            onSpawnBullet(this.x, this.y, finalAng);
          }
          window.audio.playSe('se_aim');
        }
      }
      
      const phaseLimit = this.isOverdrive ? 4500 : 6500;
      if (this.attackTimer >= phaseLimit) {
        this.attackTimer = 0;
        this.attackPhase = (this.attackPhase + 1) % 3;
        
        if (this.attackPhase === 2) {
          this.state = 'targeting';
        }
      }
    } 
    else if (this.state === 'targeting') {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const targetAng = Math.atan2(dy, dx);
      
      let diff = targetAng - this.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.angle += diff * 0.12 * dt;
      
      this.vx *= Math.pow(0.85, dt);
      this.vy *= Math.pow(0.85, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      
      const chargeDelay = this.isOverdrive ? 700 : 1200;
      if (this.attackTimer >= chargeDelay) {
        this.state = 'charging';
        this.attackTimer = 0;
        
        const chargeSpeed = this.isOverdrive ? 26 : 18;
        this.vx = Math.cos(this.angle) * chargeSpeed;
        this.vy = Math.sin(this.angle) * chargeSpeed;
        
        this.scaleX = 0.5; this.scaleY = 1.6;
        window.audio.playSe('se_dash');
      }
    } 
    else if (this.state === 'charging') {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      
      this.vx *= Math.pow(0.97, dt);
      this.vy *= Math.pow(0.97, dt);
      
      if (Math.random() < 0.6) {
        onDebrisEjected(this.x, this.y, this.color, 'slash');
      }
      
      let bounced = false;
      const boundMin = 100;
      const boundMax = CONFIG.arenaSize - 100;
      
      if (this.x < boundMin) { this.x = boundMin; this.vx = -this.vx; bounced = true; }
      else if (this.x > boundMax) { this.x = boundMax; this.vx = -this.vx; bounced = true; }
      
      if (this.y < boundMin) { this.y = boundMin; this.vy = -this.vy; bounced = true; }
      else if (this.y > boundMax) { this.y = boundMax; this.vy = -this.vy; bounced = true; }
      
      if (bounced) {
        this.angle = Math.atan2(this.vy, this.vx);
        const shrapnel = this.isOverdrive ? 24 : 14;
        for (let i = 0; i < shrapnel; i++) {
          onSpawnBullet(this.x, this.y, (Math.PI * 2 / shrapnel) * i);
        }
        window.audio.playSe('se_hit');
        this.scaleX = 1.5; this.scaleY = 0.55;
        if (player.gameRef) player.gameRef.shakeIntensity = 24;
      }
      
      if (Math.hypot(this.vx, this.vy) < 2.0) {
        this.state = 'patrolling';
        this.attackTimer = 0;
        this.attackPhase = 0;
      }
    }
    
    this.updateSegments(dt);
    this.updateExplodingSegments(dt, player, onDebrisEjected);
  }
  
  updateSegments(dt) {
    let prevX = this.x;
    let prevY = this.y;
    let prevRadius = this.radius;
    
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.isSevered) continue;
      
      const dx = prevX - seg.x;
      const dy = prevY - seg.y;
      const dist = Math.hypot(dx, dy);
      
      const gap = (prevRadius + seg.radius) * 0.62;
      if (dist > gap && dist > 0) {
        const ratio = gap / dist;
        seg.x = prevX - dx * ratio;
        seg.y = prevY - dy * ratio;
      }
      
      prevX = seg.x;
      prevY = seg.y;
      prevRadius = seg.radius;
    }
  }
  
  updateExplodingSegments(dt, player, onDebrisEjected) {
    for (let i = this.explodingSegments.length - 1; i >= 0; i--) {
      const es = this.explodingSegments[i];
      es.timer -= 16.6 * dt;
      if (es.timer <= 0) {
        if (player.gameRef) {
          const game = player.gameRef;
          game.grid.applyExplosion(es.x, es.y, es.radius * 0.4, es.radius * 3, 500);
          game.shakeIntensity = Math.min(25, game.shakeIntensity + 8);
          game.spawnBurstParticles(es.x, es.y, es.color, 25, 'shatter');
          game.spawnBurstParticles(es.x, es.y, '#ffffff', 8, 'slash');
          
          game.shockwaves.push(new Shockwave(es.x, es.y, es.radius * 2.2, es.color));
          
          game.gainXP(800 * (1 + game.combo * 0.1));
          game.player.energy = Math.min(game.player.maxEnergy, game.player.energy + 12);
          game.player.shield = Math.min(game.player.maxShield, game.player.shield + 4.5);
          
          window.audio.playSe('se_bomb');
          game.triggerFlash('hit');
        }
        
        for (let j = 0; j < 4; j++) {
          onDebrisEjected(es.x, es.y, es.color, 'legDebris');
        }
        
        this.explodingSegments.splice(i, 1);
      }
    }
  }
  
  updateScales(dt) {
    this.scaleX = Vec.lerp(this.scaleX, 1.0, 0.12 * dt);
    this.scaleY = Vec.lerp(this.scaleY, 1.0, 0.12 * dt);
  }
  
  damageRecoil(dx, dy, force = 2.0) {
    this.scaleX = 0.65;
    this.scaleY = 1.45;
  }
  
  severSegment(segIndex) {
    const count = this.segments.length - segIndex;
    
    for (let i = this.segments.length - 1; i >= segIndex; i--) {
      const seg = this.segments[i];
      seg.isSevered = true;
      
      const delay = (i - segIndex) * 150;
      this.explodingSegments.push({
        x: seg.x,
        y: seg.y,
        radius: seg.radius,
        color: seg.color,
        timer: delay
      });
    }
    
    this.segments.splice(segIndex);
    this.hp -= 15 * count; // Reduced HP loss per segment to make fight more strategic
  }
  
  draw(ctx, cx, cy, w, h, player) {
    const halfW = w / 2;
    const halfH = h / 2;
    const sx = this.x - cx + halfW;
    const sy = this.y - cy + halfH;
    
    ctx.save();
    ctx.shadowBlur = this.isOverdrive ? 25 : 18;
    ctx.shadowColor = this.color;
    
    let prevSegX = sx;
    let prevSegY = sy;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.isSevered) continue;
      
      const ssx = seg.x - cx + halfW;
      const ssy = seg.y - cy + halfH;
      
      ctx.save();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(prevSegX, prevSegY);
      
      const dist = Vec.dist(prevSegX, prevSegY, ssx, ssy);
      if (dist > 10) {
        const midX = (prevSegX + ssx) / 2;
        const midY = (prevSegY + ssy) / 2;
        const perpX = -(ssy - prevSegY) / dist;
        const perpY = (ssx - prevSegX) / dist;
        const offset = (Math.random() - 0.5) * 12;
        ctx.lineTo(midX + perpX * offset, midY + perpY * offset);
      }
      ctx.lineTo(ssx, ssy);
      ctx.stroke();
      ctx.restore();
      
      prevSegX = ssx;
      prevSegY = ssy;
    }
    
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i];
      if (seg.isSevered) continue;
      
      const ssx = seg.x - cx + halfW;
      const ssy = seg.y - cy + halfH;
      
      ctx.save();
      ctx.translate(ssx, ssy);
      
      ctx.save();
      ctx.rotate(seg.armorAngle);
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = (Math.PI / 3) * k;
        const hx = Math.cos(ang) * (seg.radius + 8);
        const hy = Math.sin(ang) * (seg.radius + 8);
        if (k === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
      
      ctx.fillStyle = seg.color;
      for (let k = 0; k < 3; k++) {
        ctx.save();
        ctx.rotate((Math.PI * 2 / 3) * k);
        ctx.beginPath();
        ctx.moveTo(seg.radius + 6, -8);
        ctx.lineTo(seg.radius + 16, 0);
        ctx.lineTo(seg.radius + 6, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, seg.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      if (Math.random() < 0.22) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(-seg.radius * 0.4, 0);
        ctx.lineTo(-seg.radius * 0.1, -seg.radius * 0.22);
        ctx.lineTo(seg.radius * 0.1, seg.radius * 0.22);
        ctx.lineTo(seg.radius * 0.4, 0);
        ctx.stroke();
      }
      
      ctx.restore();
    }
    
    this.explodingSegments.forEach(es => {
      const essx = es.x - cx + halfW;
      const essy = es.y - cy + halfH;
      ctx.save();
      ctx.translate(essx, essy);
      ctx.fillStyle = (Math.floor(Date.now() / 60) % 2 === 0) ? '#ffffff' : es.color;
      ctx.shadowColor = es.color;
      ctx.shadowBlur = 35;
      ctx.beginPath();
      ctx.arc(0, 0, es.radius * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    
    if (this.state === 'targeting') {
      const lockSx = player.x - cx + halfW;
      const lockSy = player.y - cy + halfH;
      
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 0, 85, 0.75)';
      ctx.lineWidth = 6;
      ctx.setLineDash([15, 12]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(lockSx, lockSy);
      ctx.stroke();
      
      ctx.strokeStyle = '#ffe600';
      ctx.strokeRect(lockSx - 24, lockSy - 24, 48, 48);
      ctx.restore();
    }
    
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    ctx.scale(this.scaleX, this.scaleY);
    
    ctx.fillStyle = this.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.5;
    
    ctx.beginPath();
    ctx.moveTo(this.radius * 0.7, -this.radius * 0.4);
    ctx.lineTo(this.radius * 1.3, 0);
    ctx.lineTo(this.radius * 0.7, this.radius * 0.4);
    ctx.lineTo(-this.radius * 0.25, this.radius * 0.7);
    ctx.lineTo(-this.radius * 0.7, this.radius * 0.35);
    ctx.lineTo(-this.radius * 0.7, -this.radius * 0.35);
    ctx.lineTo(-this.radius * 0.25, -this.radius * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-this.radius * 0.6, -this.radius * 0.35);
    ctx.quadraticCurveTo(-this.radius * 1.1, -this.radius * 0.6, -this.radius * 1.35, -this.radius * 0.3);
    ctx.moveTo(-this.radius * 0.6, this.radius * 0.35);
    ctx.quadraticCurveTo(-this.radius * 1.1, this.radius * 0.6, -this.radius * 1.35, this.radius * 0.3);
    ctx.stroke();
    
    const eyeColor = this.isOverdrive ? (Math.floor(Date.now() * 0.008) % 2 === 0 ? '#ffffff' : '#ff003c') : '#ff0055';
    ctx.fillStyle = eyeColor;
    ctx.shadowColor = eyeColor;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(this.radius * 0.55, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(this.radius * 0.28, 0);
    ctx.lineTo(this.radius * 0.82, 0);
    ctx.stroke();
    
    ctx.restore();
    
    ctx.restore();
  }
}

// ==========================================
// D4. Boss Plasma Ring Class
// ==========================================
class BossPlasmaRing {
  constructor(x, y, maxRadius = 400, color = '#b026ff') {
    this.x = x;
    this.y = y;
    this.radius = 20;
    this.maxRadius = maxRadius;
    this.color = color;
    this.speed = 3.5;
    this.active = true;
    this.damagedPlayer = false;
  }
  
  update(player, dt) {
    this.radius += this.speed * dt;
    if (this.radius >= this.maxRadius) {
      this.active = false;
    }
    
    // Check collision with player
    if (!this.damagedPlayer && player.state !== 'dashing' && player.invincibilityTimer <= 0) {
      const d = Vec.dist(player.x, player.y, this.x, this.y);
      if (Math.abs(d - this.radius) < 20) {
        this.damagedPlayer = true;
        return true; // flag to damage player
      }
    }
    return false;
  }
  
  draw(ctx, cx, cy, w, h) {
    const sx = this.x - cx + w / 2;
    const sy = this.y - cy + h / 2;
    const alpha = Math.max(0, 1 - (this.radius / this.maxRadius));
    
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 6;
    ctx.shadowBlur = 20;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Inner hot-white highlight
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ==========================================
// D5. Vortex Singularity Boss Class
// ==========================================
class VortexSingularity {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.maxHp = 900;
    this.hp = 900;
    this.radius = 90; // Event horizon core radius
    this.color = '#b026ff'; // Neon Purple/magenta
    this.type = 'vortex';
    
    this.state = 'spawning'; // 'spawning', 'patrolling', 'vortex', 'defeated'
    this.angle = 0;
    this.attackTimer = 0;
    this.attackPhase = 0; // 0: spiral bullet barrage, 1: gravity vortex implosion, 2: expanding plasma rings
    this.isOverdrive = false;
    
    this.scaleX = 1.0;
    this.scaleY = 1.0;
    
    // Concentric orbiting shields
    this.shieldBlocks = [];
    
    // Ring 0 (inner): 6 blocks, orbit radius = 140
    for (let i = 0; i < 6; i++) {
      this.shieldBlocks.push({
        orbitAngle: (Math.PI * 2 / 6) * i,
        radius: 18,
        ringIndex: 0,
        orbitRadius: 140,
        speed: 0.018,
        hp: 3,
        maxHp: 3,
        color: '#00f3ff' // Cyan
      });
    }
    
    // Ring 1 (middle): 8 blocks, orbit radius = 200
    for (let i = 0; i < 8; i++) {
      this.shieldBlocks.push({
        orbitAngle: (Math.PI * 2 / 8) * i,
        radius: 22,
        ringIndex: 1,
        orbitRadius: 200,
        speed: -0.013,
        hp: 4,
        maxHp: 4,
        color: '#b026ff' // Purple
      });
    }
    
    // Ring 2 (outer): 10 blocks, orbit radius = 260
    for (let i = 0; i < 10; i++) {
      this.shieldBlocks.push({
        orbitAngle: (Math.PI * 2 / 10) * i,
        radius: 26,
        ringIndex: 2,
        orbitRadius: 260,
        speed: 0.009,
        hp: 5,
        maxHp: 5,
        color: '#ff0055' // Pink
      });
    }
  }
  
  update(player, dt, gameTime, onSpawnBullet, onDebrisEjected) {
    this.updateScales(dt);
    const game = player.gameRef;
    
    if (this.state === 'spawning') {
      const d = Vec.dist(this.x, this.y, 1500, 1500);
      if (d > 10) {
        const dirX = 1500 - this.x;
        const dirY = 1500 - this.y;
        this.x += (dirX / d) * 3.5 * dt;
        this.y += (dirY / d) * 3.5 * dt;
        this.angle = Math.atan2(dirY, dirX);
      } else {
        this.state = 'patrolling';
        this.attackTimer = 0;
        this.attackPhase = 0;
      }
      this.updateShields(dt);
      return;
    }
    
    if (this.state === 'defeated') {
      this.x += (Math.random() - 0.5) * 6 * dt;
      this.y += (Math.random() - 0.5) * 6 * dt;
      this.updateShields(dt);
      
      if (Math.random() < 0.8) {
        onDebrisEjected(this.x + (Math.random()-0.5)*150, this.y + (Math.random()-0.5)*150, this.color, 'wallSpark');
      }
      return;
    }
    
    // Trigger overdrive at < 35% HP
    if (this.hp < this.maxHp * 0.35 && !this.isOverdrive) {
      this.isOverdrive = true;
      this.color = '#ff0055';
      window.audio.playSe('se_fever');
      if (game) {
        game.triggerFlash('damage');
        game.shakeIntensity = 30;
      }
    }
    
    if (this.isOverdrive && Math.random() < 0.5) {
      onDebrisEjected(this.x + (Math.random()-0.5)*120, this.y + (Math.random()-0.5)*120, 'rgba(255, 0, 85, 0.45)', 'slash');
      onDebrisEjected(this.x + (Math.random()-0.5)*100, this.y + (Math.random()-0.5)*100, '#ffe600', 'feverSpark');
    }
    
    this.attackTimer += 16.6 * dt;
    this.angle += 0.01 * dt;
    
    this.updateShields(dt);
    
    // Core pulser
    const pulseRate = this.state === 'vortex' ? 0.15 : 0.05;
    const pulseWidth = this.state === 'vortex' ? 0.12 : 0.04;
    const currentPulse = 1.0 + Math.sin(gameTime * pulseRate) * pulseWidth;
    this.scaleX = currentPulse;
    this.scaleY = currentPulse;
    
    if (this.state === 'patrolling') {
      const driftAng = gameTime * 0.0004;
      const targetX = 1500 + Math.cos(driftAng) * 220;
      const targetY = 1500 + Math.sin(driftAng * 1.3) * 180;
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      this.x += dx * 0.015 * dt;
      this.y += dy * 0.015 * dt;
      
      if (this.attackPhase === 0) {
        const shootRate = this.isOverdrive ? 80 : 140;
        if (Math.floor(this.attackTimer) % shootRate < 16.6) {
          const spAng = (gameTime * (this.isOverdrive ? 0.008 : 0.004)) % (Math.PI * 2);
          const bulletCount = this.isOverdrive ? 10 : 5;
          for (let i = 0; i < bulletCount; i++) {
            const finalAng = spAng + (Math.PI * 2 / bulletCount) * i;
            onSpawnBullet(this.x, this.y, finalAng);
          }
        }
      } else if (this.attackPhase === 2) {
        // Expanding plasma rings
        const ringInterval = this.isOverdrive ? 1500 : 2500;
        if (Math.floor(this.attackTimer) % ringInterval < 16.6) {
          if (game) {
            game.bossPlasmaRings.push(new BossPlasmaRing(this.x, this.y, 650, this.color));
          }
          window.audio.playSe('se_aim');
        }
        
        // Aimed triple-spread
        const shootInterval = this.isOverdrive ? 450 : 800;
        if (Math.floor(this.attackTimer) % shootInterval < 16.6) {
          const ang = Math.atan2(player.y - this.y, player.x - this.x);
          onSpawnBullet(this.x, this.y, ang);
          onSpawnBullet(this.x, this.y, ang - 0.25);
          onSpawnBullet(this.x, this.y, ang + 0.25);
          if (this.isOverdrive) {
            onSpawnBullet(this.x, this.y, ang - 0.5);
            onSpawnBullet(this.x, this.y, ang + 0.5);
          }
        }
      }
      
      const phaseLimit = this.isOverdrive ? 5000 : 7000;
      if (this.attackTimer >= phaseLimit) {
        this.attackTimer = 0;
        this.attackPhase = (this.attackPhase + 1) % 3;
        if (this.attackPhase === 1) {
          this.state = 'vortex';
          if (game) {
            game.grid.gravityWell = { x: this.x, y: this.y, force: 160, radius: 700 };
          }
        }
      }
    }
    else if (this.state === 'vortex') {
      const targetX = 1500;
      const targetY = 1500;
      this.x = Vec.lerp(this.x, targetX, 0.08 * dt);
      this.y = Vec.lerp(this.y, targetY, 0.08 * dt);
      
      if (game && game.grid.gravityWell) {
        game.grid.gravityWell.x = this.x;
        game.grid.gravityWell.y = this.y;
        game.grid.gravityWell.force = 160 + Math.sin(gameTime * 0.05) * 40;
      }
      
      // Gravitational attraction
      const dx = this.x - player.x;
      const dy = this.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 15) {
        const pullForce = (this.isOverdrive ? 0.38 : 0.24) * dt;
        player.vx += (dx / dist) * pullForce;
        player.vy += (dy / dist) * pullForce;
      }
      
      // Pull bullets
      if (game) {
        for (let i = 0; i < game.bullets.length; i++) {
          const b = game.bullets[i];
          const bdx = this.x - b.x;
          const bdy = this.y - b.y;
          const bdist = Math.hypot(bdx, bdy);
          if (bdist > 15) {
            const bpull = 0.22 * dt;
            b.vx += (bdx / bdist) * bpull;
            b.vy += (bdy / bdist) * bpull;
            const bspeed = Math.hypot(b.vx, b.vy);
            if (bspeed > 8.0) {
              b.vx = (b.vx / bspeed) * 8.0;
              b.vy = (b.vy / bspeed) * 8.0;
            }
          }
        }
      }
      
      // Radial sweeps
      const shootRate = this.isOverdrive ? 60 : 110;
      if (Math.floor(this.attackTimer) % shootRate < 16.6) {
        const rAng = (gameTime * 0.006) % (Math.PI * 2);
        const streams = this.isOverdrive ? 8 : 4;
        for (let i = 0; i < streams; i++) {
          onSpawnBullet(this.x, this.y, rAng + (Math.PI * 2 / streams) * i);
        }
      }
      
      if (game && Math.random() < 0.3) {
        game.shakeIntensity = Math.max(game.shakeIntensity, 3);
      }
      
      const vortexLimit = this.isOverdrive ? 4000 : 5500;
      if (this.attackTimer >= vortexLimit) {
        this.state = 'patrolling';
        this.attackTimer = 0;
        this.attackPhase = 2; // Expand plasma rings next
        if (game) {
          game.grid.gravityWell = null;
        }
      }
    }
  }
  
  updateShields(dt) {
    this.shieldBlocks.forEach(block => {
      block.orbitAngle += block.speed * dt;
      block.x = this.x + Math.cos(block.orbitAngle) * block.orbitRadius;
      block.y = this.y + Math.sin(block.orbitAngle) * block.orbitRadius;
    });
  }
  
  updateScales(dt) {
    this.scaleX = Vec.lerp(this.scaleX, 1.0, 0.1 * dt);
    this.scaleY = Vec.lerp(this.scaleY, 1.0, 0.1 * dt);
  }
  
  damageRecoil(dx, dy, force = 2.0) {
    this.scaleX = 0.7;
    this.scaleY = 1.35;
  }
  
  draw(ctx, cx, cy, w, h, player) {
    const halfW = w / 2;
    const halfH = h / 2;
    const sx = this.x - cx + halfW;
    const sy = this.y - cy + halfH;
    
    ctx.save();
    ctx.shadowBlur = this.isOverdrive ? 30 : 20;
    ctx.shadowColor = this.color;
    
    // Draw guide lines
    const activeRings = [false, false, false];
    this.shieldBlocks.forEach(sb => {
      activeRings[sb.ringIndex] = true;
    });
    
    ctx.lineWidth = 1.5;
    const ringRadii = [140, 200, 260];
    const ringColors = ['rgba(0, 243, 255, 0.08)', 'rgba(176, 38, 255, 0.08)', 'rgba(255, 0, 85, 0.08)'];
    for (let r = 0; r < 3; r++) {
      if (activeRings[r]) {
        ctx.strokeStyle = ringColors[r];
        ctx.beginPath();
        ctx.arc(sx, sy, ringRadii[r], 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    
    // Draw shield blocks as tangent capsules
    this.shieldBlocks.forEach(block => {
      const bsx = block.x - cx + halfW;
      const bsy = block.y - cy + halfH;
      
      ctx.save();
      ctx.fillStyle = block.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = block.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      
      ctx.translate(bsx, bsy);
      ctx.rotate(block.orbitAngle + Math.PI / 2);
      
      ctx.beginPath();
      ctx.arc(0, -block.radius * 0.4, block.radius * 0.5, Math.PI, 0);
      ctx.lineTo(block.radius * 0.5, block.radius * 0.4);
      ctx.arc(0, block.radius * 0.4, block.radius * 0.5, 0, Math.PI);
      ctx.closePath();
      
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
    
    // Draw Core event horizon and swirling plasma disk
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    ctx.scale(this.scaleX, this.scaleY);
    
    if (this.state === 'vortex') {
      ctx.strokeStyle = 'rgba(176, 38, 255, 0.35)';
      ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        ctx.save();
        const rScale = 1.0 + k * 0.3 + Math.sin(Date.now() * 0.01 - k * 0.5) * 0.1;
        ctx.scale(rScale, rScale);
        ctx.rotate(this.angle * (k % 2 === 0 ? -1.5 : 1.5));
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.9, 0, Math.PI * 1.4);
        ctx.stroke();
        ctx.restore();
      }
    }
    
    // Event horizon (black hole core)
    ctx.fillStyle = '#020205';
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Swirling center glow
    const plasmaGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, this.radius * 0.5);
    plasmaGrad.addColorStop(0, '#ffffff');
    plasmaGrad.addColorStop(0.35, this.color);
    plasmaGrad.addColorStop(1, 'transparent');
    
    ctx.fillStyle = plasmaGrad;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Swirling vector arcs on event core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((Math.PI / 2) * i + this.angle * 2.0);
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.32, 0, Math.PI * 0.6);
      ctx.stroke();
      ctx.restore();
    }
    
    ctx.restore();
    ctx.restore();
  }
}

// Helper color lookup
function varColor(name) {
  if (name === 'pink') return '#ff0055';
  if (name === 'cyan') return '#00f3ff';
  return '#ffffff';
}

// ==========================================
// E. Bullets & Rockets
// ==========================================
class Bullet {
  constructor(x, y, angle, speed = 4) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = 5.5;
    this.color = '#ff0055';
    this.active = true;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx, cx, cy, w, h) {
    const sx = this.x - cx + w / 2;
    const sy = this.y - cy + h / 2;
    
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class HomingMissile {
  constructor(x, y, angle, speed = 8.5) {
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.angle = angle;
    this.radius = 6;
    this.color = '#39ff14';
    this.active = true;
    this.life = 3200;
  }

  update(enemies, boss, dt) {
    this.life -= 16.6 * dt;
    if (this.life <= 0) {
      this.active = false;
      return;
    }

    let target = null;
    let minDist = 99999;
    
    if (boss && boss.state !== 'defeated') {
      target = boss;
    } else {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.sliced) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < minDist) {
          minDist = d;
          target = e;
        }
      }
    }

    if (target) {
      const targetAngle = Math.atan2(target.y - this.y, target.x - this.x);
      let diff = targetAngle - this.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      
      this.angle += diff * 0.16 * dt;
    }

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
  }

  draw(ctx, cx, cy, w, h) {
    const sx = this.x - cx + w / 2;
    const sy = this.y - cy + h / 2;
    
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);
    ctx.beginPath();
    ctx.moveTo(this.radius * 2.5, 0);
    ctx.lineTo(-this.radius, -this.radius);
    ctx.lineTo(-this.radius * 0.5, 0);
    ctx.lineTo(-this.radius, this.radius);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
  }
}

// ==========================================
// F. Master Game Controller
// ==========================================
class GameEngine {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.width = 0;
    this.height = 0;
    this.resizeCanvas();
    
    this.camera = new Camera(this.width, this.height);
    
    this.state = 'menu';
    this.score = 0;
    this.displayScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.gameTime = 0;
    this.lastSpawnTime = 0;
    this.loopRunning = false;
    
    this.upgradeCardOptions = [];
    
    this.player = {
      x: CONFIG.arenaSize / 2,
      y: CONFIG.arenaSize / 2,
      vx: 0,
      vy: 0,
      
      level: 1,
      xp: 0,
      xpNeeded: 1000,
      
      maxShield: CONFIG.maxShield,
      shield: CONFIG.maxShield,
      
      maxEnergy: CONFIG.maxEnergy,
      energy: CONFIG.maxEnergy,
      energyRegenMult: 1.0,
      
      state: 'idle',
      dashCharges: 1,
      maxDashCharges: 1,
      dashCooldownTimer: 0,
      dashCooldownDuration: 1250,
      
      dashStart: { x: 0, y: 0 },
      dashTarget: { x: 0, y: 0 },
      dashProgress: 0,
      dashSpeed: 0.125,
      playerDashRadius: CONFIG.playerDashRadius,
      maxDashRange: CONFIG.maxDashRange,
      
      magnetRadius: 240,
      hasPlasmaWave: false,
      droneCount: 0,
      drones: [],
      
      bombCharge: 0,
      maxBombCharge: CONFIG.maxBomb,
      invincibilityTimer: 0,
      upgradeLevels: {
        multidash: 0,
        photon_blade: 0,
        shield_cell: 0,
        void_vortex: 0,
        orbital_drone: 0,
        plasma_wave: 0,
        turbo_regen: 0,
        chronos_field: 0,
        chain_lightning: 0,
        laser_scythe: 0,
        phantom_decoy: 0,
      },
    };
    
    this.timeScale = 1.0;
    this.targetTimeScale = 1.0;
    this.hitstopFrames = 0;
    this.shakeIntensity = 0;
    
    this.grid = null;
    this.enemies = [];
    this.bullets = [];
    this.missiles = [];
    this.particles = [];
    this.lasers = [];
    this.shockwaves = [];
    this.bossPlasmaRings = [];
    
    // V5 Hyper Juice State Variables
    this.menuParticles = [];
    this.decoys = [];
    this.teslaArcs = [];
    
    this.player.afterimages = [];
    this.player.hasChronosField = false;
    this.player.chronosFieldRadius = 0;
    this.player.hasChainLightning = false;
    this.player.hasLaserScythe = false;
    this.player.hasPhantomDecoy = false;
    
    this.player.droneMegaLaser = false;
    this.player.chronosTeslaSynergy = false;
    this.synergySplashText = "";
    this.synergySplashTimer = 0;
    
    this.boss = null;
    this.bossWarningTimer = 0;
    this.bossScoreMilestone = 20000;
    this.bossSpawnCount = 0;
    this.bossHasBeenHit = false;
    
    this.feverActive = false;
    this.mouse = { x: 0, y: 0, isDown: false, dragStart: { x: 0, y: 0 } };
    
    this.dom = {
      menu: document.getElementById('menu-screen'),
      hud: document.getElementById('hud-overlay'),
      levelUpScreen: document.getElementById('level-up-screen'),
      cardSlots: document.getElementById('upgrade-card-slots'),
      gameOver: document.getElementById('game-over-screen'),
      startBtn: document.getElementById('start-btn'),
      restartBtn: document.getElementById('restart-btn'),
      audioBtn: document.getElementById('audio-toggle'),
      score: document.getElementById('score-display'),
      levelLabel: document.getElementById('level-label'),
      xpBar: document.getElementById('xp-bar-fill'),
      xpText: document.getElementById('xp-text'),
      shieldBar: document.getElementById('shield-bar-fill'),
      shieldText: document.getElementById('shield-text'),
      energyBar: document.getElementById('energy-bar-fill'),
      energyText: document.getElementById('energy-text'),
      bombBar: document.getElementById('bomb-bar-fill'),
      bombText: document.getElementById('bomb-text'),
      bombAlert: document.getElementById('bomb-alert-hint'),
      comboContainer: document.getElementById('combo-container'),
      comboCount: document.getElementById('combo-count-text'),
      comboRating: document.getElementById('combo-rating-text'),
      feverOverlay: document.getElementById('fever-overlay'),
      feverSplash: document.getElementById('fever-splash'),
      flashOverlay: document.getElementById('flash-overlay'),
      finalScore: document.getElementById('final-score'),
      maxCombo: document.getElementById('max-combo'),
      loaderMsg: document.getElementById('loader-msg'),
      
      bossHud: document.getElementById('boss-hud'),
      bossHpFill: document.getElementById('boss-hp-fill'),
      bossWarningOverlay: document.getElementById('boss-warning-overlay'),
      matrixVignette: document.getElementById('matrix-vignette'),
      overdriveOverlay: document.getElementById('overdrive-overlay')
    };

    window.addEventListener('resize', () => this.resizeCanvas());
    this.setupInputs();
    this.spawnMenuParticles();
    this.tick();
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    this.width = rect.width || window.innerWidth;
    this.height = rect.height || window.innerHeight;
    
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
    
    if (this.camera) {
      this.camera.w = this.width;
      this.camera.h = this.height;
    }
    if (!this.grid) {
      this.grid = new WarpGrid();
    }
    this.spawnMenuParticles();
  }

  spawnMenuParticles() {
    if (this.state === 'menu') {
      this.menuParticles = [];
      for (let i = 0; i < 110; i++) {
        this.menuParticles.push(new MenuParticle(this.width, this.height));
      }
    }
  }

  setupInputs() {
    const getCoords = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    const handleStart = (coords) => {
      if (this.state !== 'playing' || this.player.state === 'dashing') return;
      
      if (this.player.dashCharges >= 1 && this.player.energy > 8) {
        this.player.state = 'aiming';
        this.mouse.isDown = true;
        this.mouse.dragStart = { x: coords.x, y: coords.y };
        window.audio.playSe('se_aim');
      }
    };

    const handleMove = (coords) => {
      this.mouse.x = coords.x;
      this.mouse.y = coords.y;
    };

    const handleEnd = () => {
      if (!this.mouse.isDown || this.player.state !== 'aiming') return;
      this.mouse.isDown = false;
      
      const dx = this.mouse.x - this.mouse.dragStart.x;
      const dy = this.mouse.y - this.mouse.dragStart.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist > 18) {
        this.player.state = 'dashing';
        this.player.dashCharges--;
        this.player.dashStart = { x: this.player.x, y: this.player.y };
        
        if (this.player.hasPhantomDecoy) {
          this.decoys.push(new PhantomDecoy(this.player.x, this.player.y));
        }
        
        const angle = Math.atan2(dy, dx);
        const dashDist = Math.min(dist * 2.2, this.player.maxDashRange);
        
        this.player.dashTarget = {
          x: Vec.clamp(this.player.x + Math.cos(angle) * dashDist, 20, CONFIG.arenaSize - 20),
          y: Vec.clamp(this.player.y + Math.sin(angle) * dashDist, 20, CONFIG.arenaSize - 20)
        };
        
        this.player.dashProgress = 0;
        this.shakeIntensity = this.feverActive ? 20 : 12;
        window.audio.playSe('se_dash');
        
        this.spawnBurstParticles(this.player.x, this.player.y, '#ffffff', 12, 'slash');
        this.grid.applyLineForce(this.player.x, this.player.y, this.player.dashTarget.x, this.player.dashTarget.y, 40, 110);
      } else {
        this.player.state = 'idle';
      }
    };

    this.canvas.addEventListener('mousedown', (e) => handleStart(getCoords(e)));
    this.canvas.addEventListener('mousemove', (e) => handleMove(getCoords(e)));
    window.addEventListener('mouseup', handleEnd);

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleStart(getCoords(e));
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      handleMove(getCoords(e));
    }, { passive: false });
    window.addEventListener('touchend', handleEnd);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.state === 'playing') {
        e.preventDefault();
        this.triggerMegaBomb();
      }
      // Debug cheat key to spawn the next boss instantly!
      if (e.code === 'KeyB' && this.state === 'playing') {
        e.preventDefault();
        this.triggerBossWarning();
      }
    });

    this.canvas.addEventListener('dblclick', (e) => {
      if (this.state === 'playing') {
        e.preventDefault();
        this.triggerMegaBomb();
      }
    });

    this.dom.startBtn.addEventListener('click', () => this.startGame());
    this.dom.restartBtn.addEventListener('click', () => this.startGame());
    this.dom.audioBtn.addEventListener('click', () => {
      const isMuted = !window.audio.isMuted;
      window.audio.setMute(isMuted);
      if (isMuted) this.dom.audioBtn.classList.add('muted');
      else this.dom.audioBtn.classList.remove('muted');
    });
  }

  async startGame() {
    this.dom.startBtn.disabled = true;
    this.dom.loaderMsg.textContent = "SYNCHRONIZING AUDIO NODES...";
    
    await window.audio.init((pct) => {
      this.dom.loaderMsg.textContent = `LOADING ASSETS... ${Math.round(pct * 100)}%`;
    });
    
    this.score = 0;
    this.displayScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.gameTime = 0;
    this.lastSpawnTime = 0;
    this.feverActive = false;
    
    this.player.x = CONFIG.arenaSize / 2;
    this.player.y = CONFIG.arenaSize / 2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.level = 1;
    this.player.xp = 0;
    this.player.xpNeeded = 1000;
    this.player.maxShield = CONFIG.maxShield;
    this.player.shield = CONFIG.maxShield;
    this.player.maxEnergy = CONFIG.maxEnergy;
    this.player.energy = CONFIG.maxEnergy;
    this.player.energyRegenMult = 1.0;
    
    this.player.state = 'idle';
    this.player.dashCharges = 1;
    this.player.maxDashCharges = 1;
    this.player.dashCooldownTimer = 0;
    this.player.dashCooldownDuration = 1250;
    this.player.playerDashRadius = CONFIG.playerDashRadius;
    this.player.maxDashRange = CONFIG.maxDashRange;
    
    this.player.magnetRadius = 240;
    this.player.hasPlasmaWave = false;
    this.player.droneCount = 0;
    this.player.drones = [];
    this.player.bombCharge = 0;
    this.player.invincibilityTimer = 0;
    this.player.upgradeLevels = {
      multidash: 0,
      photon_blade: 0,
      shield_cell: 0,
      void_vortex: 0,
      orbital_drone: 0,
      plasma_wave: 0,
      turbo_regen: 0,
      chronos_field: 0,
      chain_lightning: 0,
      laser_scythe: 0,
      phantom_decoy: 0,
    };
    
    // Reset V5 states
    this.player.hasChronosField = false;
    this.player.chronosFieldRadius = 0;
    this.player.hasChainLightning = false;
    this.player.hasLaserScythe = false;
    this.player.hasPhantomDecoy = false;
    this.player.droneMegaLaser = false;
    this.player.chronosTeslaSynergy = false;
    this.player.afterimages = [];
    this.decoys = [];
    this.teslaArcs = [];
    this.synergySplashText = "";
    this.synergySplashTimer = 0;
    this.menuParticles = [];
    
    this.dom.matrixVignette.classList.remove('active');
    this.dom.overdriveOverlay.classList.remove('active');
    
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    
    this.enemies = [];
    this.bullets = [];
    this.missiles = [];
    this.particles = [];
    this.lasers = [];
    this.shockwaves = [];
    this.bossPlasmaRings = [];
    this.grid = new WarpGrid();
    
    this.boss = null;
    this.bossWarningTimer = 0;
    this.bossScoreMilestone = 20000;
    this.bossSpawnCount = 0;
    this.bossHasBeenHit = false;
    
    this.dom.menu.style.opacity = '0';
    setTimeout(() => { this.dom.menu.style.display = 'none'; }, 500);
    this.dom.gameOver.classList.remove('active');
    this.dom.hud.style.opacity = '1';
    this.dom.feverOverlay.classList.remove('fever-active');
    this.dom.feverSplash.classList.remove('splash-active');
    this.dom.levelUpScreen.style.display = 'none';
    this.dom.bombAlert.classList.remove('active');
    
    this.dom.bossWarningOverlay.style.display = 'none';
    this.dom.bossHud.style.display = 'none';
    this.dom.bossHud.style.opacity = '0';
    
    this.dom.startBtn.disabled = false;
    this.dom.loaderMsg.textContent = "READY TO ENGAGE";
    
    this.state = 'playing';
    
    window.audio.playBgm('normal');
    window.audio.playSe('se_start');
    
    this.spawnBurstParticles(this.player.x, this.player.y, '#00f3ff', 20, 'slash');
    
    if (!this.loopRunning) {
      this.loopRunning = true;
      this.tick();
    }
  }

  gameOver() {
    this.state = 'gameover';
    window.audio.stopBgm();
    window.audio.playSe('se_gameover');
    
    this.dom.finalScore.textContent = Math.round(this.score).toLocaleString();
    this.dom.maxCombo.textContent = this.maxCombo.toLocaleString();
    this.dom.gameOver.classList.add('active');
    this.dom.hud.style.opacity = '0';
    
    this.dom.bossHud.style.display = 'none';
    this.dom.bossWarningOverlay.style.display = 'none';
    
    this.spawnBurstParticles(this.player.x, this.player.y, '#ff0055', 60, 'shatter');
    this.spawnBurstParticles(this.player.x, this.player.y, '#ffffff', 20, 'slash');
    this.shakeIntensity = 32;
  }

  triggerFlash(type) {
    this.dom.flashOverlay.className = `screen-flash flash-${type}`;
    void this.dom.flashOverlay.offsetWidth;
  }

  tick() {
    if (this.state === 'menu') {
      // Update interactive menu stardust particles
      for (let i = 0; i < this.menuParticles.length; i++) {
        this.menuParticles[i].update(this.mouse.x, this.mouse.y, this.width, this.height);
      }
      this.render();
      requestAnimationFrame(() => this.tick());
      return;
    }

    if (this.state === 'gameover') {
      this.render();
      requestAnimationFrame(() => this.tick());
      return;
    }
    
    if (this.state === 'paused') {
      requestAnimationFrame(() => this.tick());
      return;
    }

    if (this.hitstopFrames > 0) {
      this.hitstopFrames--;
      this.grid.applyExplosion(this.player.x, this.player.y, (Math.random() - 0.5) * 5, 200);
      this.grid.update(1.0);
      this.render();
      requestAnimationFrame(() => this.tick());
      return;
    }
    
    const dt = this.timeScale;

    if (this.player.state === 'aiming') {
      this.targetTimeScale = 0.08;
      window.audio.setBulletTime(true);
      this.dom.matrixVignette.classList.add('active');
      
      this.player.energy = Math.max(0, this.player.energy - CONFIG.energyDrainRate * 0.016);
      if (this.player.energy <= 0) {
        this.mouse.isDown = false;
        this.player.state = 'idle';
      }
    } else {
      this.targetTimeScale = 1.0;
      window.audio.setBulletTime(false);
      this.dom.matrixVignette.classList.remove('active');
      
      this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + CONFIG.energyRecoveryRate * this.player.energyRegenMult * 0.016);
    }
    
    this.timeScale = Vec.lerp(this.timeScale, this.targetTimeScale, 0.18);
    this.gameTime += 16.6 * dt;
    
    this.updateGameplay(dt);
    this.render();
    
    requestAnimationFrame(() => this.tick());
  }

  updateGameplay(dt) {
    // Update V5 Timers & Arrays
    if (this.synergySplashTimer > 0) {
      this.synergySplashTimer -= 16.6 * dt;
    }
    if (this.player.invincibilityTimer > 0) {
      this.player.invincibilityTimer -= 16.6 * dt;
    }

    // Record Player Afterimages
    const speed = Math.hypot(this.player.vx, this.player.vy);
    if (this.player.state === 'dashing' || speed > 8) {
      if (Math.random() < 0.6) {
        this.player.afterimages.unshift({
          x: this.player.x,
          y: this.player.y,
          life: 1.0,
          vx: this.player.vx * 0.15,
          vy: this.player.vy * 0.15
        });
      }
    }
    // Update afterimages life
    for (let i = this.player.afterimages.length - 1; i >= 0; i--) {
      const ai = this.player.afterimages[i];
      ai.life -= 0.08 * dt;
      ai.x += ai.vx * dt;
      ai.y += ai.vy * dt;
      if (ai.life <= 0) {
        this.player.afterimages.splice(i, 1);
      }
    }

    // Update Boss Plasma Rings
    for (let i = this.bossPlasmaRings.length - 1; i >= 0; i--) {
      const pr = this.bossPlasmaRings[i];
      const hit = pr.update(this.player, dt);
      if (hit) {
        this.damagePlayer(15);
      }
      if (!pr.active) {
        this.bossPlasmaRings.splice(i, 1);
      }
    }

    // Update Tesla Arcs
    for (let i = this.teslaArcs.length - 1; i >= 0; i--) {
      this.teslaArcs[i].life -= 0.12 * dt;
      if (this.teslaArcs[i].life <= 0) {
        this.teslaArcs.splice(i, 1);
      }
    }

    // Update Phantom Decoys
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const active = this.decoys[i].update(dt, this.bullets, (dx, dy) => {
        // Detonation explodes nearby bullets into homing missiles!
        this.grid.applyExplosion(dx, dy, 35, 240);
        this.spawnBurstParticles(dx, dy, '#ffe600', 16, 'shatter');
        window.audio.playSe('se_bomb');
        
        const convertRadius = 240;
        for (let j = this.bullets.length - 1; j >= 0; j--) {
          const b = this.bullets[j];
          const d = Vec.dist(dx, dy, b.x, b.y);
          if (d < convertRadius) {
            const ang = Math.atan2(b.y - dy, b.x - dx) + (Math.random() - 0.5) * 0.4;
            this.missiles.push(new HomingMissile(b.x, b.y, ang, 9.0));
            this.bullets.splice(j, 1);
          }
        }
      }, this);
      if (!active) {
        this.decoys.splice(i, 1);
      }
    }

    // Chronos Tesla Synergy auto-shock inside Chronos Field
    if (this.player.chronosTeslaSynergy && Math.floor(this.gameTime) % 60 < 16.6 * dt) {
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.sliced) continue;
        const d = Vec.dist(this.player.x, this.player.y, e.x, e.y);
        if (d < this.player.chronosFieldRadius) {
          e.hp -= 0.8;
          // Spawn electrical arc lines
          this.teslaArcs.push({
            x1: this.player.x, y1: this.player.y,
            x2: e.x, y2: e.y,
            life: 1.0,
            color: '#b026ff'
          });
          window.audio.playSe('se_aim');
          this.spawnBurstParticles(e.x, e.y, '#b026ff', 3, 'slash');
          
          if (e.hp <= 0) {
            e.sliced = true;
            this.explodeEnemy(e);
            this.enemies.splice(i, 1);
          }
        }
      }
    }

    if (this.player.dashCharges < this.player.maxDashCharges) {
      this.player.dashCooldownTimer += 16.6 * dt;
      if (this.player.dashCooldownTimer >= this.player.dashCooldownDuration) {
        this.player.dashCharges++;
        this.player.dashCooldownTimer = 0;
      }
    } else {
      this.player.dashCooldownTimer = 0;
    }

    if (this.state === 'boss_warning') {
      this.bossWarningTimer += 16.6 * dt;
      this.player.vx *= Math.pow(0.85, dt);
      this.player.vy *= Math.pow(0.85, dt);
      this.player.x += this.player.vx * dt;
      this.player.y += this.player.vy * dt;
      
      this.camera.update(this.player.x, this.player.y, dt);
      this.grid.update(dt);
      
      if (this.bossWarningTimer >= 3000) {
        this.state = 'playing';
        this.dom.bossWarningOverlay.style.display = 'none';
        
        const bossNameLabel = document.getElementById('boss-name-label');
        if (this.nextBossType === 'spider') {
          this.boss = new Boss(1500, 1500);
          if (bossNameLabel) bossNameLabel.textContent = 'NEON OVERLORD';
        } else if (this.nextBossType === 'leviathan') {
          this.boss = new ColossusLeviathan(1500, 1500);
          if (bossNameLabel) bossNameLabel.textContent = 'COLOSSUS LEVIATHAN';
        } else {
          this.boss = new VortexSingularity(1500, 1500);
          if (bossNameLabel) bossNameLabel.textContent = 'VORTEX SINGULARITY';
        }
        this.bossSpawnCount++;
        
        this.dom.bossHud.style.display = 'flex';
        void this.dom.bossHud.offsetWidth;
        this.dom.bossHud.style.opacity = '1';
      }
      return;
    }

    if (this.player.state === 'idle') {
      const mouseWorldX = this.mouse.x - this.width / 2 + this.camera.x;
      const mouseWorldY = this.mouse.y - this.height / 2 + this.camera.y;
      
      const dx = mouseWorldX - this.player.x;
      const dy = mouseWorldY - this.player.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 10) {
        const steerStrength = 0.0022;
        this.player.vx += dx * steerStrength * dt;
        this.player.vy += dy * steerStrength * dt;
      }

      this.player.vx *= Math.pow(0.88, dt);
      this.player.vy *= Math.pow(0.88, dt);
      
      this.player.x += this.player.vx * dt;
      this.player.y += this.player.vy * dt;

      this.handleWallCollisions();

      // Spawn movement exhaust particles
      if (speed > 1.0 && Math.random() < 0.38) {
        const angle = Math.atan2(this.player.vy, this.player.vx) + Math.PI; // opposite direction
        const pX = this.player.x + Math.cos(angle) * CONFIG.playerSize;
        const pY = this.player.y + Math.sin(angle) * CONFIG.playerSize;
        
        const p = new Particle(pX, pY, 'rgba(0, 243, 255, 0.7)', 'homingTrail');
        p.vx = -this.player.vx * 0.15 + (Math.random() - 0.5) * 1.5;
        p.vy = -this.player.vy * 0.15 + (Math.random() - 0.5) * 1.5;
        p.decay = 0.045; // last slightly longer
        this.particles.push(p);
      }
    }
    else if (this.player.state === 'aiming') {
      this.player.vx *= Math.pow(0.82, dt);
      this.player.vy *= Math.pow(0.82, dt);
      this.player.x += this.player.vx * dt;
      this.player.y += this.player.vy * dt;
      
      this.handleWallCollisions();
      this.grid.applyExplosion(this.player.x, this.player.y, -1.0, 110);
    }
    else if (this.player.state === 'dashing') {
      this.player.dashProgress += this.player.dashSpeed;
      
      const curX = Vec.lerp(this.player.dashStart.x, this.player.dashTarget.x, this.player.dashProgress);
      const curY = Vec.lerp(this.player.dashStart.y, this.player.dashTarget.y, this.player.dashProgress);
      
      this.checkSlices(this.player.x, this.player.y, curX, curY);
      
      this.player.x = curX;
      this.player.y = curY;
      
      if (Math.random() < 0.8) {
        this.particles.push(new Particle(this.player.x, this.player.y, '#ffffff', 'slash'));
      }

      if (this.player.dashProgress >= 1.0) {
        this.player.state = 'idle';
        this.player.invincibilityTimer = 250; // 250ms of grace period invincibility after dash
        
        const dashAngle = Math.atan2(this.player.dashTarget.y - this.player.dashStart.y, this.player.dashTarget.x - this.player.dashStart.x);
        const exitSpeed = 8.5;
        this.player.vx = Math.cos(dashAngle) * exitSpeed;
        this.player.vy = Math.sin(dashAngle) * exitSpeed;
        
        this.triggerAnimeSliceExplosions();
        
        if (this.player.hasPlasmaWave) {
          this.triggerPlasmaWave();
        }
      }
    }

    this.camera.update(this.player.x, this.player.y, dt);

    if (this.boss) {
      this.boss.update(this.player, dt, this.gameTime, (bx, by, ang) => {
        if (this.bullets.length < CONFIG.maxBullets) {
          this.bullets.push(new Bullet(bx, by, ang, 3.5 + (this.player.level * 0.1)));
        }
      }, (dbx, dby, color, type) => {
        // Leg debris emitter
        this.particles.push(new Particle(dbx, dby, color, type));
      });

      if (this.boss.isOverdrive && this.boss.state !== 'defeated') {
        this.dom.overdriveOverlay.classList.add('active');
        window.audio.setBgmSpeed(1.6);
      } else {
        this.dom.overdriveOverlay.classList.remove('active');
      }

      if (this.boss.state !== 'defeated' && this.player.state !== 'dashing') {
        const d = Vec.dist(this.player.x, this.player.y, this.boss.x, this.boss.y);
        if (d < this.boss.radius + CONFIG.playerSize) {
          this.damagePlayer(25);
          // Push player radially away from the boss center
          const angle = Math.atan2(this.player.y - this.boss.y, this.player.x - this.boss.x);
          const pushForce = 12.0;
          this.player.vx = Math.cos(angle) * pushForce;
          this.player.vy = Math.sin(angle) * pushForce;
        }
      }
    }

    for (let i = 0; i < this.player.drones.length; i++) {
      const scanTargets = this.boss ? [this.boss] : this.enemies;
      this.player.drones[i].update(this.player.x, this.player.y, this.gameTime, scanTargets, (sx, sy, tgt) => {
        this.lasers.push(new LaserBeam(sx, sy, tgt.x, tgt.y));
        
        // Mega laser synergy deals double damage
        let damageVal = this.player.droneMegaLaser ? 1.45 : 0.65;
        if (tgt === this.boss) {
          this.bossHasBeenHit = true;
          if (this.boss.type === 'leviathan') {
            const activeSegs = this.boss.segments.filter(s => !s.isSevered).length;
            if (activeSegs > 0) damageVal *= 0.15;
          } else if (this.boss.type === 'vortex') {
            const activeShields = this.boss.shieldBlocks.length;
            if (activeShields > 0) damageVal *= 0.05;
          }
        }
        tgt.hp -= damageVal;
        window.audio.playSe('se_aim');
        
        // Drone Mega Laser synergy converts target's nearby bullets into homing missiles on hit!
        if (this.player.droneMegaLaser && Math.random() < 0.35) {
          const convertRadius = 140;
          for (let j = this.bullets.length - 1; j >= 0; j--) {
            const b = this.bullets[j];
            const d = Vec.dist(tgt.x, tgt.y, b.x, b.y);
            if (d < convertRadius) {
              const ang = Math.atan2(b.y - tgt.y, b.x - tgt.x) + (Math.random() - 0.5) * 0.4;
              this.missiles.push(new HomingMissile(b.x, b.y, ang, 9.0));
              this.bullets.splice(j, 1);
            }
          }
        }
        
        if (tgt.hp <= 0) {
          if (tgt === this.boss) {
            this.defeatBoss();
          } else {
            tgt.sliced = true;
            this.explodeEnemy(tgt);
            const index = this.enemies.indexOf(tgt);
            if (index !== -1) this.enemies.splice(index, 1);
          }
        } else {
          this.spawnBurstParticles(tgt.x, tgt.y, tgt.color, 4, 'slash');
        }
      }, dt);
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.update(dt);
      
      if (!sw.active) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      this.checkShockwaveInteractions(sw);
    }

    for (let i = this.lasers.length - 1; i >= 0; i--) {
      if (!this.lasers[i].update(dt)) {
        this.lasers.splice(i, 1);
      }
    }

    if (!this.boss) {
      let currentSpawnRate = CONFIG.baseEnemySpawnRate - (this.score * 0.0035);
      if (this.feverActive) currentSpawnRate = Math.max(CONFIG.minEnemySpawnRate, currentSpawnRate * 0.45);
      else currentSpawnRate = Math.max(CONFIG.minEnemySpawnRate, currentSpawnRate);
      
      if (this.gameTime - this.lastSpawnTime > currentSpawnRate) {
        this.spawnEnemy();
        this.lastSpawnTime = this.gameTime;
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      
      let localDt = dt;
      if (this.player.hasChronosField) {
        const d = Vec.dist(this.player.x, this.player.y, e.x, e.y);
        if (d < this.player.chronosFieldRadius) {
          localDt = dt * 0.25; // 75% slow inside Chronos Field!
        }
      }
      
      e.update(this.player.x, this.player.y, localDt, this.gameTime, (bx, by, ang) => {
        if (this.bullets.length < CONFIG.maxBullets) {
          this.bullets.push(new Bullet(bx, by, ang, 3.8 + (this.score * 0.00004)));
        }
      });

      if (!e.sliced && this.player.state !== 'dashing') {
        const d = Vec.dist(this.player.x, this.player.y, e.x, e.y);
        if (d < e.radius + CONFIG.playerSize) {
          this.damagePlayer(15);
          e.sliced = true;
          this.explodeEnemy(e);
          this.enemies.splice(i, 1);
        }
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      
      let localDt = dt;
      if (this.player.hasChronosField) {
        const d = Vec.dist(this.player.x, this.player.y, b.x, b.y);
        if (d < this.player.chronosFieldRadius) {
          localDt = dt * 0.2; // 80% slow inside Chronos Field!
        }
      }
      
      b.update(localDt);
      
      if (b.x < 0 || b.x > CONFIG.arenaSize || b.y < 0 || b.y > CONFIG.arenaSize) {
        this.bullets.splice(i, 1);
        continue;
      }
      
      if (this.player.state !== 'dashing') {
        const d = Vec.dist(this.player.x, this.player.y, b.x, b.y);
        if (d < b.radius + CONFIG.playerSize) {
          this.damagePlayer(8);
          this.bullets.splice(i, 1);
          this.triggerFlash('damage');
        }
      }
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.update(this.enemies, this.boss, dt);
      
      if (!m.active) {
        this.missiles.splice(i, 1);
        continue;
      }
      
      if (Math.random() < 0.4) {
        this.particles.push(new Particle(m.x, m.y, '#39ff14', 'homingTrail'));
      }

      if (this.boss && this.boss.state !== 'defeated') {
        if (this.boss.type === 'leviathan') {
          let hitSegment = false;
          for (let k = 0; k < this.boss.segments.length; k++) {
            const seg = this.boss.segments[k];
            if (seg.isSevered) continue;
            const d = Vec.dist(m.x, m.y, seg.x, seg.y);
            if (d < seg.radius + m.radius) {
              seg.hp -= 0.3; // homing missiles deal moderate damage to segments
              this.bossHasBeenHit = true;
              m.active = false;
              this.spawnBurstParticles(seg.x, seg.y, seg.color, 5, 'slash');
              window.audio.playSe('se_hit');
              if (seg.hp <= 0) {
                this.boss.severSegment(k);
                if (this.boss.hp <= 0) {
                  this.defeatBoss();
                }
              }
              hitSegment = true;
              break;
            }
          }
          if (hitSegment) {
            this.missiles.splice(i, 1);
            continue;
          }
        } else if (this.boss.type === 'vortex') {
          let hitShield = false;
          for (let k = 0; k < this.boss.shieldBlocks.length; k++) {
            const sb = this.boss.shieldBlocks[k];
            const d = Vec.dist(m.x, m.y, sb.x, sb.y);
            if (d < sb.radius + m.radius) {
              sb.hp -= 0.5; // homing missiles damage shields
              this.bossHasBeenHit = true;
              m.active = false;
              this.spawnBurstParticles(sb.x, sb.y, sb.color, 5, 'slash');
              window.audio.playSe('se_hit');
              if (sb.hp <= 0) {
                this.boss.shieldBlocks.splice(k, 1);
                this.grid.applyExplosion(sb.x, sb.y, 20, 110);
              }
              hitShield = true;
              break;
            }
          }
          if (hitShield) {
            this.missiles.splice(i, 1);
            continue;
          }
        }
        
        const d = Vec.dist(m.x, m.y, this.boss.x, this.boss.y);
        if (d < this.boss.radius + m.radius) {
          this.bossHasBeenHit = true;
          let dmg = 0.15;
          if (this.boss.type === 'leviathan') {
            dmg = 1.0;
            const activeSegs = this.boss.segments.filter(s => !s.isSevered).length;
            if (activeSegs > 0) dmg *= 0.15; // 85% armor reduction
          } else if (this.boss.type === 'vortex') {
            dmg = 1.0;
            const activeShields = this.boss.shieldBlocks.length;
            if (activeShields > 0) dmg *= 0.05; // 95% armor reduction
          }
          this.boss.hp -= dmg;
          m.active = false;
          
          if (this.boss.hp <= 0) {
            this.defeatBoss();
          } else {
            this.spawnBurstParticles(this.boss.x, this.boss.y, this.boss.color, 4, 'slash');
            window.audio.playSe('se_hit');
          }
          this.missiles.splice(i, 1);
          continue;
        }
      }
      
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (e.sliced) continue;
        
        const d = Vec.dist(m.x, m.y, e.x, e.y);
        if (d < e.radius + m.radius) {
          e.hp--;
          m.active = false;
          if (e.hp <= 0) {
            e.sliced = true;
            this.explodeEnemy(e);
            this.enemies.splice(j, 1);
          } else {
            this.spawnBurstParticles(e.x, e.y, e.color, 4, 'slash');
            window.audio.playSe('se_hit');
          }
          this.missiles.splice(i, 1);
          break;
        }
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update(this.player.x, this.player.y, this.player.magnetRadius, this.player.state, dt);
      
      if (p.type === 'shatter' && p.magnetized) {
        const d = Vec.dist(this.player.x, this.player.y, p.x, p.y);
        if (d < CONFIG.playerSize + 6) {
          this.gainXP(CONFIG.shardScoreValue * (1 + this.combo * 0.05));
          this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + CONFIG.shardEnergyRefill);
          this.player.shield = Math.min(this.player.maxShield, this.player.shield + CONFIG.shardShieldRefill);
          this.particles.splice(i, 1);
          
          if (Math.random() < 0.16) {
            window.audio.playSe('se_absorb');
          }
          continue;
        }
      }
      
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    this.grid.update(dt);

    if (this.combo > 0) {
      if (this.boss && !this.bossHasBeenHit) {
        this.comboTimer = CONFIG.maxComboTime;
      } else {
        this.comboTimer -= 16.6 * dt;
        if (this.comboTimer <= 0) {
          this.resetCombo();
        }
      }
    }

    if (this.feverActive && Math.random() < 0.25) {
      const spawnX = Math.random() * this.width + this.camera.x - this.width/2;
      this.particles.push(new Particle(spawnX, this.camera.y + this.height/2 + 10, 'rgba(255, 0, 85, 0.4)', 'feverSpark'));
    }

    if (!this.boss && this.state === 'playing' && this.score >= this.bossScoreMilestone) {
      this.triggerBossWarning();
    }

    this.updateHUD();
  }

  handleWallCollisions() {
    const boundMin = 20;
    const boundMax = CONFIG.arenaSize - 20;
    let bounced = false;

    if (this.player.x < boundMin) {
      this.player.x = boundMin;
      this.player.vx = -this.player.vx * 1.35;
      bounced = true;
    } else if (this.player.x > boundMax) {
      this.player.x = boundMax;
      this.player.vx = -this.player.vx * 1.35;
      bounced = true;
    }

    if (this.player.y < boundMin) {
      this.player.y = boundMin;
      this.player.vy = -this.player.vy * 1.35;
      bounced = true;
    } else if (this.player.y > boundMax) {
      this.player.y = boundMax;
      this.player.vy = -this.player.vy * 1.35;
      bounced = true;
    }

    if (bounced) {
      this.shakeIntensity = 20;
      window.audio.playSe('se_hit');
      this.spawnBurstParticles(this.player.x, this.player.y, '#00f3ff', 18, 'wallSpark');
      this.grid.applyExplosion(this.player.x, this.player.y, 32, 160);
    }
  }

  checkSlices(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return;
    
    let sliceRadius = this.player.playerDashRadius;
    if (this.player.hasLaserScythe) {
      sliceRadius = this.player.playerDashRadius + 60; // 60px hitbox expansion!
    }
    
    // Check Boss shields, core, and legs!
    if (this.boss && this.boss.state !== 'defeated') {
      // 1. Slice shields
      if (this.boss.shieldBlocks && this.boss.shieldBlocks.length > 0) {
        for (let i = this.boss.shieldBlocks.length - 1; i >= 0; i--) {
          const sb = this.boss.shieldBlocks[i];
          let t = Vec.clamp(((sb.x - x1) * dx + (sb.y - y1) * dy) / lenSq, 0, 1);
          if (Vec.dist(sb.x, sb.y, x1 + t * dx, y1 + t * dy) < sb.radius + sliceRadius) {
            sb.hp--;
            this.bossHasBeenHit = true;
            this.spawnBurstParticles(sb.x, sb.y, sb.color, 8, 'slash');
            window.audio.playSe('se_hit');
            if (sb.hp <= 0) {
              this.boss.shieldBlocks.splice(i, 1);
              this.grid.applyExplosion(sb.x, sb.y, 20, 110);
            }
          }
        }
      }

      if (this.boss.type === 'leviathan') {
        // A. Slicing body segments
        for (let i = 0; i < this.boss.segments.length; i++) {
          const seg = this.boss.segments[i];
          if (seg.isSevered) continue;
          
          let t = Vec.clamp(((seg.x - x1) * dx + (seg.y - y1) * dy) / lenSq, 0, 1);
          const cx = x1 + t * dx;
          const cy = y1 + t * dy;
          const dist = Vec.dist(seg.x, seg.y, cx, cy);
          
          if (dist < seg.radius + sliceRadius) {
            seg.hp--;
            this.bossHasBeenHit = true;
            this.spawnBurstParticles(seg.x, seg.y, seg.color, 8, 'slash');
            window.audio.playSe('se_hit');
            
            if (seg.hp <= 0) {
              this.boss.severSegment(i);
              this.incrementCombo();
              
              if (this.boss.hp <= 0) {
                this.defeatBoss();
              }
              break;
            }
          }
        }
        
        // B. Slicing head (weak-point)
        let t = Vec.clamp(((this.boss.x - x1) * dx + (this.boss.y - y1) * dy) / lenSq, 0, 1);
        const cx = x1 + t * dx;
        const cy = y1 + t * dy;
        if (Vec.dist(this.boss.x, this.boss.y, cx, cy) < this.boss.radius + sliceRadius) {
          if (this.boss.attackPhase === 2 && this.boss.shieldBlocks && this.boss.shieldBlocks.length > 0) {
            this.spawnBurstParticles(cx, cy, '#ffffff', 4, 'slash');
            window.audio.playSe('se_aim');
          } else {
            const activeSegs = this.boss.segments.filter(s => !s.isSevered).length;
            const armorMult = activeSegs > 0 ? 0.15 : 1.0;
            this.boss.hp -= 25.0 * armorMult; // Slicing the head directly deals massive damage, reduced by segments
            this.bossHasBeenHit = true;
            this.boss.damageRecoil(dx, dy);
            
            if (activeSegs > 0) {
              this.spawnBurstParticles(this.boss.x, this.boss.y, '#ffffff', 6, 'slash');
              this.spawnBurstParticles(this.boss.x, this.boss.y, this.boss.color, 10, 'slash');
              window.audio.playSe('se_aim'); // metal clang sound clue
            } else {
              this.spawnBurstParticles(this.boss.x, this.boss.y, this.boss.color, 16, 'slash');
              this.grid.applyExplosion(this.boss.x, this.boss.y, 30, 160);
              window.audio.playSe('se_hit');
            }
            
            if (this.boss.hp <= 0) {
              this.defeatBoss();
            }
          }
        }
      } else if (this.boss.type === 'vortex') {
        // C. Slicing Vortex Singularity Core
        let t = Vec.clamp(((this.boss.x - x1) * dx + (this.boss.y - y1) * dy) / lenSq, 0, 1);
        const cx = x1 + t * dx;
        const cy = y1 + t * dy;
        if (Vec.dist(this.boss.x, this.boss.y, cx, cy) < this.boss.radius + sliceRadius) {
          const activeShields = this.boss.shieldBlocks.length;
          this.bossHasBeenHit = true;
          if (activeShields > 0) {
            this.boss.hp -= 25.0 * 0.05; // 95% damage reduction
            this.spawnBurstParticles(cx, cy, '#ffffff', 4, 'slash');
            window.audio.playSe('se_aim');
          } else {
            this.boss.hp -= 25.0; // full core damage
            this.boss.damageRecoil(dx, dy);
            this.spawnBurstParticles(this.boss.x, this.boss.y, this.boss.color, 16, 'slash');
            this.grid.applyExplosion(this.boss.x, this.boss.y, 30, 160);
            window.audio.playSe('se_hit');
          }
          if (this.boss.hp <= 0) {
            this.defeatBoss();
          }
        }
      } else {
        // 2. Slice robotic legs (severing parts!)
        this.boss.legs.forEach(leg => {
          if (leg.severed) return;
          // Check slice segment thigh and shin lines
          const shoulderX = this.boss.x + Math.cos(this.boss.angle + leg.angleOffset) * (this.boss.radius * 0.6);
          const shoulderY = this.boss.y + Math.sin(this.boss.angle + leg.angleOffset) * (this.boss.radius * 0.6);

          // Segment A: Shoulder to Knee
          let t1 = Vec.clamp(((leg.kneeX - x1) * dx + (leg.kneeY - y1) * dy) / lenSq, 0, 1);
          const distA = Vec.dist(leg.kneeX, leg.kneeY, x1 + t1 * dx, y1 + t1 * dy);

          // Segment B: Knee to Foot
          let t2 = Vec.clamp(((leg.footX - x1) * dx + (leg.footY - y1) * dy) / lenSq, 0, 1);
          const distB = Vec.dist(leg.footX, leg.footY, x1 + t2 * dx, y1 + t2 * dy);

          // Legs are easier to hit if player has larger scythe
          const legHitWidth = this.player.hasLaserScythe ? 36 : 22;
          if (distA < legHitWidth || distB < legHitWidth) {
            leg.hp--;
            this.bossHasBeenHit = true;
            this.spawnBurstParticles(leg.kneeX, leg.kneeY, this.boss.color, 6, 'slash');
            window.audio.playSe('se_hit');

            if (leg.hp <= 0) {
              this.boss.severLeg(leg.id, (dbx, dby, col, type) => {
                this.particles.push(new Particle(dbx, dby, col, type));
              });
              this.grid.applyExplosion(leg.kneeX, leg.kneeY, 40, 180);
              this.shakeIntensity = 28;
              this.triggerFlash('hit');
              this.incrementCombo();
            }
          }
        });

        // 3. Slice core
        let t = Vec.clamp(((this.boss.x - x1) * dx + (this.boss.y - y1) * dy) / lenSq, 0, 1);
        const cx = x1 + t * dx;
        const cy = y1 + t * dy;
        
        if (Vec.dist(this.boss.x, this.boss.y, cx, cy) < this.boss.radius + sliceRadius) {
          if (this.boss.attackPhase === 2 && this.boss.shieldBlocks && this.boss.shieldBlocks.length > 0) {
            this.spawnBurstParticles(cx, cy, '#ffffff', 4, 'slash');
            window.audio.playSe('se_aim');
          } else {
            // Extra damage in overdrive
            this.boss.hp -= 8.0;
            this.bossHasBeenHit = true;
            this.spawnBurstParticles(this.boss.x, this.boss.y, this.boss.color, 12, 'slash');
            this.grid.applyExplosion(this.boss.x, this.boss.y, 25, 140);
            window.audio.playSe('se_hit');
            
            if (this.boss.hp <= 0) {
              this.defeatBoss();
            }
          }
        }
      }
    }

    // Check normal enemies
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.sliced) continue;
      
      let t = Vec.clamp(((e.x - x1) * dx + (e.y - y1) * dy) / lenSq, 0, 1);
      const cx = x1 + t * dx;
      const cy = y1 + t * dy;
      const dist = Vec.dist(e.x, e.y, cx, cy);

      if (dist < e.radius + sliceRadius) {
        if (e.type === 'serpent') {
          // Check slice against tail segments too (slicing links severs serpent!)
          let segHit = -1;
          for(let k = 0; k < e.segments.length; k++) {
            const seg = e.segments[k];
            if (Vec.dist(seg.x, seg.y, cx, cy) < seg.radius + sliceRadius) {
              segHit = k;
              break;
            }
          }

          if (segHit !== -1) {
            // Sever tail from segHit onwards!
            const count = e.segments.length - segHit;
            for(let j=e.segments.length-1; j >= segHit; j--) {
              const seg = e.segments[j];
              this.spawnBurstParticles(seg.x, seg.y, e.color, 6, 'shatter');
              this.grid.applyExplosion(seg.x, seg.y, 10, 50);
              e.segments.splice(j, 1);
            }
            this.score += 150 * count;
            window.audio.playSe('se_hit');
            this.incrementCombo();
            
            if (e.segments.length === 0) {
              e.sliced = true;
            }
            continue;
          }
        }

        e.hp--;
        e.damageRecoil(dx, dy, 2.8);

        if (e.hp <= 0) {
          e.sliced = true;
          this.incrementCombo();
          
          // Tesla Lightning Cascade
          if (this.player.hasChainLightning) {
            this.triggerTeslaChain(e);
          }
        } else {
          this.grid.applyExplosion(e.x, e.y, 16, 90);
          
          // Heavy shields emit physical metal wall sparks (Wow deflect detail!)
          const pCount = e.type === 'heavy' ? 10 : 5;
          const pType = e.type === 'heavy' ? 'wallSpark' : 'slash';
          this.spawnBurstParticles(e.x, e.y, e.color, pCount, pType);
          
          window.audio.playSe('se_hit');
        }
      }
    }
    
    // Check Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let t = Vec.clamp(((b.x - x1) * dx + (b.y - y1) * dy) / lenSq, 0, 1);
      const dist = Vec.dist(b.x, b.y, x1 + t * dx, y1 + t * dy);

      if (dist < b.radius + sliceRadius) {
        const bounceAng = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 0.8;
        this.missiles.push(new HomingMissile(b.x, b.y, bounceAng));
        this.bullets.splice(i, 1);
        window.audio.playSe('se_homing');
        this.spawnBurstParticles(b.x, b.y, '#39ff14', 4, 'homingTrail');
      }
    }
  }

  triggerTeslaChain(sourceEnemy) {
    let currentSource = sourceEnemy;
    let chainCount = 0;
    const maxChain = 6;
    const chainRadius = 280;
    const chainColor = '#b026ff'; // Purple cyber electric arcs

    while (chainCount < maxChain) {
      let target = null;
      let minDist = chainRadius;

      for (let i = 0; i < this.enemies.length; i++) {
        const potential = this.enemies[i];
        if (potential === currentSource || potential.sliced) continue;
        const d = Vec.dist(currentSource.x, currentSource.y, potential.x, potential.y);
        if (d < minDist) {
          minDist = d;
          target = potential;
        }
      }

      if (target) {
        target.hp -= 1.0;
        
        // Push electric line nodes
        this.teslaArcs.push({
          x1: currentSource.x, y1: currentSource.y,
          x2: target.x, y2: target.y,
          life: 1.0,
          color: chainColor
        });
        
        this.spawnBurstParticles(target.x, target.y, chainColor, 4, 'slash');
        
        if (target.hp <= 0) {
          target.sliced = true;
          this.explodeEnemy(target);
          const idx = this.enemies.indexOf(target);
          if (idx !== -1) this.enemies.splice(idx, 1);
        }
        
        currentSource = target;
        chainCount++;
      } else {
        break;
      }
    }
    if (chainCount > 0) {
      window.audio.playSe('se_aim'); // zipping electric sound fallback
    }
  }

  checkShockwaveInteractions(sw) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const d = Vec.dist(sw.x, sw.y, b.x, b.y);
      if (Math.abs(d - sw.radius) < 20) {
        const ang = Math.atan2(b.y - sw.y, b.x - sw.x) + (Math.random() - 0.5) * 0.4;
        this.missiles.push(new HomingMissile(b.x, b.y, ang));
        this.bullets.splice(i, 1);
        window.audio.playSe('se_homing');
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.sliced) continue;
      const d = Vec.dist(sw.x, sw.y, e.x, e.y);
      if (Math.abs(d - sw.radius) < 20) {
        const ang = Math.atan2(e.y - sw.y, e.x - sw.x);
        e.vx += Math.cos(ang) * 9.0;
        e.vy += Math.sin(ang) * 9.0;
        
        e.hp -= 1.0;
        if (e.hp <= 0) {
          e.sliced = true;
          this.explodeEnemy(e);
          this.enemies.splice(i, 1);
        } else {
          this.spawnBurstParticles(e.x, e.y, e.color, 4, 'slash');
        }
      }
    }

    if (this.boss && this.boss.state !== 'defeated') {
      if (this.boss.type === 'vortex') {
        // Shockwave hits Vortex shields
        for (let k = this.boss.shieldBlocks.length - 1; k >= 0; k--) {
          const sb = this.boss.shieldBlocks[k];
          const sbd = Vec.dist(sw.x, sw.y, sb.x, sb.y);
          if (Math.abs(sbd - sw.radius) < 25) {
            sb.hp -= 1.0;
            this.spawnBurstParticles(sb.x, sb.y, sb.color, 6, 'slash');
            if (sb.hp <= 0) {
              this.boss.shieldBlocks.splice(k, 1);
              this.grid.applyExplosion(sb.x, sb.y, 20, 110);
            }
          }
        }
      }

      const d = Vec.dist(sw.x, sw.y, this.boss.x, this.boss.y);
      if (Math.abs(d - sw.radius) < 35) {
        this.bossHasBeenHit = true;
        let dmg = 3.0;
        if (this.boss.type === 'leviathan') {
          const activeSegs = this.boss.segments.filter(s => !s.isSevered).length;
          if (activeSegs > 0) dmg *= 0.15;
        } else if (this.boss.type === 'vortex') {
          const activeShields = this.boss.shieldBlocks.length;
          if (activeShields > 0) dmg *= 0.05; // 95% reduction
        }
        this.boss.hp -= dmg;
        this.spawnBurstParticles(this.boss.x, this.boss.y, this.boss.color, 8, 'slash');
        if (this.boss.hp <= 0) {
          this.defeatBoss();
        }
      }
    }
  }

  gainXP(amount) {
    this.score += amount;
    this.player.bombCharge = Math.min(this.player.maxBombCharge, this.player.bombCharge + amount * 0.08);
    this.player.xp += amount * 0.4;
    
    if (this.player.xp >= this.player.xpNeeded) {
      this.player.xp -= this.player.xpNeeded;
      this.player.level++;
      this.player.xpNeeded = Math.ceil(this.player.xpNeeded * 1.35);
      this.triggerLevelUp();
    }
  }

  triggerLevelUp() {
    this.state = 'paused';
    window.audio.setBulletTime(true);
    
    const pool = Object.keys(UPGRADES).filter(id => {
      const currentLevel = this.player.upgradeLevels[id] || 0;
      const maxLevel = UPGRADE_MAX_LEVELS[id] || 1;
      return currentLevel < maxLevel;
    });

    if (pool.length === 0) {
      pool.push('shield_cell');
    }

    const shuffled = pool.sort(() => 0.5 - Math.random());
    this.upgradeCardOptions = shuffled.slice(0, 3);
    
    this.dom.cardSlots.innerHTML = '';
    
    this.upgradeCardOptions.forEach(id => {
      const up = UPGRADES[id];
      const card = document.createElement('div');
      card.className = `upgrade-card ${up.colorClass}`;
      card.dataset.upgradeId = up.id;
      
      const currentLevel = this.player.upgradeLevels[id] || 0;
      const maxLevel = UPGRADE_MAX_LEVELS[id] || 1;
      const levelText = `Lv ${currentLevel} / ${maxLevel}`;
      
      card.innerHTML = `
        <div class="card-icon" style="color: var(--neon-${up.colorClass})">${up.icon}</div>
        <h3 class="card-title">${up.title}</h3>
        <div class="card-level">${levelText}</div>
        <p class="card-desc">${up.desc}</p>
      `;
      
      card.addEventListener('click', () => this.applyUpgradeSelection(id));
      this.dom.cardSlots.appendChild(card);
    });

    this.dom.levelUpScreen.style.display = 'flex';
    window.audio.playSe('se_fever');
  }

  applyUpgradeSelection(id) {
    const up = UPGRADES[id];
    if (up) {
      up.apply(this);
      if (this.player.upgradeLevels[id] !== undefined) {
        this.player.upgradeLevels[id]++;
      } else {
        this.player.upgradeLevels[id] = 1;
      }
    }
    
    // Check upgrade synergy triggers
    this.checkSynergy();
    
    this.dom.levelUpScreen.style.display = 'none';
    this.state = 'playing';
    window.audio.setBulletTime(false);
    window.audio.playSe('se_start');
    
    this.grid.applyExplosion(this.player.x, this.player.y, 40, 240);
    this.spawnBurstParticles(this.player.x, this.player.y, '#39ff14', 20, 'slash');
  }

  checkSynergy() {
    // 1. Drone Mega Laser: ORBITAL DRONE + PLASMA WAVE
    if (this.player.droneCount > 0 && this.player.hasPlasmaWave) {
      if (!this.player.droneMegaLaser) {
        this.player.droneMegaLaser = true;
        this.triggerSynergySplash("SYNERGY ACTIVE: DRONE WAVE");
      }
    }
    // 2. Chronos Tesla Shock: CHRONOS FIELD + CHAIN LIGHTNING
    if (this.player.hasChronosField && this.player.hasChainLightning) {
      if (!this.player.chronosTeslaSynergy) {
        this.player.chronosTeslaSynergy = true;
        this.triggerSynergySplash("SYNERGY ACTIVE: CHRONOS TESLA");
      }
    }
  }

  triggerSynergySplash(text) {
    this.synergySplashText = text;
    this.synergySplashTimer = 2200; // ms display duration
    window.audio.playSe('se_fever');
    this.shakeIntensity = 15;
    this.grid.applyExplosion(this.player.x, this.player.y, 30, 200);
  }

  triggerPlasmaWave() {
    this.shockwaves.push(new Shockwave(this.player.x, this.player.y, 160, '#b026ff'));
    this.grid.applyExplosion(this.player.x, this.player.y, 25, 180);
    this.spawnBurstParticles(this.player.x, this.player.y, '#b026ff', 8, 'slash');
  }

  triggerMegaBomb() {
    if (this.player.bombCharge < this.player.maxBombCharge) return;
    this.player.bombCharge = 0;
    
    this.triggerFlash('hit');
    this.shakeIntensity = 38;
    
    window.audio.playSe('se_bomb');
    window.audio.duckBgm();

    this.grid.applyExplosion(this.player.x, this.player.y, 65, 800, 1100);
    this.shockwaves.push(new Shockwave(this.player.x, this.player.y, 750, '#ffe600'));
    
    this.hitstopFrames = 22;

    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const camX = this.camera.x;
    const camY = this.camera.y;

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const screenX = b.x - camX + halfW;
      const screenY = b.y - camY + halfH;
      
      if (screenX >= 0 && screenX <= this.width && screenY >= 0 && screenY <= this.height) {
        const ang = Math.atan2(b.y - this.player.y, b.x - this.player.x) + (Math.random() - 0.5) * 0.4;
        this.missiles.push(new HomingMissile(b.x, b.y, ang, 10));
        this.bullets.splice(i, 1);
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const screenX = e.x - camX + halfW;
      const screenY = e.y - camY + halfH;
      
      if (screenX >= -50 && screenX <= this.width + 50 && screenY >= -50 && screenY <= this.height + 50) {
        e.hp -= 10;
        if (e.hp <= 0) {
          e.sliced = true;
          this.explodeEnemy(e);
          this.enemies.splice(i, 1);
        } else {
          this.spawnBurstParticles(e.x, e.y, e.color, 8, 'slash');
        }
      }
    }

    if (this.boss && this.boss.state !== 'defeated') {
      const screenX = this.boss.x - camX + halfW;
      const screenY = this.boss.y - camY + halfH;
      if (screenX >= -100 && screenX <= this.width + 100 && screenY >= -100 && screenY <= this.height + 100) {
        if (this.boss.type === 'leviathan') {
          const activeSegs = this.boss.segments.filter(s => !s.isSevered).length;
          const armorMult = activeSegs > 0 ? 0.15 : 1.0;
          this.boss.hp -= 80.0 * armorMult; // Heavy head damage
          this.bossHasBeenHit = true;
          this.boss.segments.forEach(seg => {
            if (!seg.isSevered) seg.hp -= 10;
          });
          // Check if any segment is destroyed by EMP
          for (let k = 0; k < this.boss.segments.length; k++) {
            const seg = this.boss.segments[k];
            if (!seg.isSevered && seg.hp <= 0) {
              this.boss.severSegment(k);
              break;
            }
          }
        } else if (this.boss.type === 'vortex') {
          const activeShields = this.boss.shieldBlocks.length;
          const armorMult = activeShields > 0 ? 0.05 : 1.0;
          this.boss.hp -= 80.0 * armorMult; // core damage
          this.bossHasBeenHit = true;
          this.boss.shieldBlocks.forEach(sb => {
            sb.hp -= 2;
          });
          // Check if any shields are destroyed
          for (let k = this.boss.shieldBlocks.length - 1; k >= 0; k--) {
            if (this.boss.shieldBlocks[k].hp <= 0) {
              const sb = this.boss.shieldBlocks[k];
              this.boss.shieldBlocks.splice(k, 1);
              this.grid.applyExplosion(sb.x, sb.y, 20, 110);
            }
          }
        } else {
          this.boss.hp -= 30;
          this.bossHasBeenHit = true;
        }
        this.spawnBurstParticles(this.boss.x, this.boss.y, this.boss.color, 25, 'slash');
        if (this.boss.hp <= 0) {
          this.defeatBoss();
        }
      }
    }
  }

  triggerBossWarning() {
    this.state = 'boss_warning';
    this.bossWarningTimer = 0;
    this.bossHasBeenHit = false;
    
    // Choose next boss based on count
    const cycle = this.bossSpawnCount % 3;
    let bossType = 'spider';
    if (cycle === 1) bossType = 'leviathan';
    else if (cycle === 2) bossType = 'vortex';
    this.nextBossType = bossType;
    
    // Update HTML overlay classes & text
    const overlay = this.dom.bossWarningOverlay;
    overlay.classList.remove('warning-spider', 'warning-leviathan', 'warning-vortex');
    const subtext = overlay.querySelector('.boss-warning-subtext');
    
    if (bossType === 'spider') {
      overlay.classList.add('warning-spider');
      if (subtext) subtext.textContent = 'NEON OVERLORD INBOUND';
    } else if (bossType === 'leviathan') {
      overlay.classList.add('warning-leviathan');
      if (subtext) subtext.textContent = 'COLOSSUS LEVIATHAN INBOUND';
    } else {
      overlay.classList.add('warning-vortex');
      if (subtext) subtext.textContent = 'VORTEX SINGULARITY INBOUND';
    }
    
    overlay.style.display = 'flex';
    
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      this.explodeEnemy(this.enemies[i]);
    }
    this.enemies = [];
    this.bullets = [];
    
    window.audio.stopBgm();
    window.audio.playSe('se_start');
    
    this.shakeIntensity = 10;
  }

  defeatBoss() {
    if (this.boss.state === 'defeated') return;
    this.boss.state = 'defeated';
    
    this.dom.overdriveOverlay.classList.remove('active');
    window.audio.setBgmSpeed(1.0);
    
    this.triggerFlash('hit');
    this.shakeIntensity = 40;
    this.hitstopFrames = 30;
    
    window.audio.playSe('se_bomb');
    window.audio.duckBgm();

    this.grid.applyExplosion(this.boss.x, this.boss.y, 80, 800, 1500);
    this.shockwaves.push(new Shockwave(this.boss.x, this.boss.y, 600, this.boss.color));
    this.shockwaves.push(new Shockwave(this.boss.x, this.boss.y, 400, '#ffe600'));
    
    this.spawnBurstParticles(this.boss.x, this.boss.y, this.boss.color, 120, 'shatter');
    this.spawnBurstParticles(this.boss.x, this.boss.y, '#ffffff', 40, 'slash');
    
    this.score += 8000 * (1 + this.combo * 0.1);
    
    if (this.boss.type === 'leviathan') {
      // Explode all segments sequentially down to the tail
      this.boss.severSegment(0);
    } else if (this.boss.type === 'vortex') {
      // Blast remaining shield blocks
      this.boss.shieldBlocks.forEach(sb => {
        this.spawnBurstParticles(sb.x, sb.y, sb.color, 10, 'slash');
        this.particles.push(new Particle(sb.x, sb.y, sb.color, 'legDebris'));
      });
      this.boss.shieldBlocks = [];
      this.grid.gravityWell = null; // disable gravity well
    } else {
      // Blast legs away
      this.boss.legs.forEach(l => {
        this.boss.severLeg(l.id, (dbx, dby, col, type) => {
          this.particles.push(new Particle(dbx, dby, col, type));
        });
      });
    }

    setTimeout(() => {
      this.boss = null;
      this.dom.bossHud.style.opacity = '0';
      setTimeout(() => { this.dom.bossHud.style.display = 'none'; }, 500);
      
      window.audio.playBgm('normal');
      window.audio.playSe('se_fever');
      this.bossScoreMilestone = this.score + 35000;
    }, 1800);
  }

  spawnBossDebug() {
    this.triggerBossWarning();
  }

  incrementCombo() {
    this.combo++;
    this.comboTimer = CONFIG.maxComboTime;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }
    
    const rateFactor = 1.0 + Math.min(0.35, this.combo * 0.008);
    window.audio.setBgmSpeed(rateFactor);
    
    if (this.combo >= 15 && !this.feverActive) {
      this.triggerFever(true);
    }
  }

  resetCombo() {
    this.combo = 0;
    window.audio.setBgmSpeed(1.0);
    if (this.feverActive) {
      this.triggerFever(false);
    }
  }

  triggerFever(active) {
    this.feverActive = active;
    if (active) {
      this.dom.feverOverlay.classList.add('fever-active');
      this.dom.feverSplash.classList.add('splash-active');
      window.audio.playBgm('fever');
      window.audio.playSe('se_fever');
      
      this.grid.applyExplosion(this.player.x, this.player.y, 45, 300);
      this.spawnBurstParticles(this.player.x, this.player.y, '#ff00aa', 35, 'slash');
      
      setTimeout(() => {
        this.dom.feverSplash.classList.remove('splash-active');
      }, 1500);
    } else {
      this.dom.feverOverlay.classList.remove('fever-active');
      window.audio.playBgm('normal');
    }
  }

  damagePlayer(amount) {
    if (this.player.state === 'dashing') return;
    if (this.player.invincibilityTimer > 0) return;
    
    this.player.invincibilityTimer = 1000; // 1 second of invincibility
    this.player.shield = Math.max(0, this.player.shield - amount);
    this.shakeIntensity = 16;
    this.triggerFlash('damage');
    window.audio.playSe('se_hit');
    
    this.grid.applyExplosion(this.player.x, this.player.y, -30, 200);
    
    if (this.player.shield <= 0) {
      this.gameOver();
    }
  }

  triggerAnimeSliceExplosions() {
    let explosionTriggered = false;
    
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.sliced) {
        this.explodeEnemy(e);
        this.enemies.splice(i, 1);
        explosionTriggered = true;
      }
    }
    
    if (explosionTriggered) {
      this.hitstopFrames = Math.min(12, 3 + Math.floor(this.combo * 0.2));
      window.audio.duckBgm();
      this.triggerFlash('hit');
    }
  }

  explodeEnemy(enemy) {
    const scoreGain = enemy.scoreVal * (1 + this.combo * 0.15);
    this.gainXP(scoreGain);
    
    window.audio.playSe('se_hit');
    
    const force = enemy.type === 'heavy' ? 45 : 22;
    const radius = enemy.type === 'heavy' ? 250 : 130;
    this.grid.applyExplosion(enemy.x, enemy.y, force, radius);
    
    const particleCount = enemy.type === 'heavy' ? 30 : 12;
    this.spawnBurstParticles(enemy.x, enemy.y, enemy.color, particleCount, 'shatter');
    this.spawnBurstParticles(enemy.x, enemy.y, '#ffffff', Math.ceil(particleCount * 0.3), 'slash');
    
    if (enemy.type === 'heavy') {
      const bulletsNum = 8;
      for (let i = 0; i < bulletsNum; i++) {
        const angle = (Math.PI * 2 / bulletsNum) * i;
        if (this.bullets.length < CONFIG.maxBullets) {
          this.bullets.push(new Bullet(enemy.x, enemy.y, angle, 4.0));
        }
      }
    }
    
    this.shakeIntensity = Math.min(25, this.shakeIntensity + (enemy.type === 'heavy' ? 12 : 5));
  }

  spawnEnemy() {
    let x, y;
    const spawnDist = 480;
    const angle = Math.random() * Math.PI * 2;
    
    x = this.player.x + Math.cos(angle) * spawnDist;
    y = this.player.y + Math.sin(angle) * spawnDist;

    x = Vec.clamp(x, 40, CONFIG.arenaSize - 40);
    y = Vec.clamp(y, 40, CONFIG.arenaSize - 40);
    
    const roll = Math.random();
    let type = 'basic';
    
    // Spawn weights: Serpent, Jellyfish, Heavies, Basics
    if (this.score > 28000) {
      if (roll < 0.22) type = 'basic';
      else if (roll < 0.44) type = 'jellyfish';
      else if (roll < 0.76) type = 'serpent';
      else type = 'heavy';
    } else if (this.score > 9000) {
      if (roll < 0.30) type = 'basic';
      else if (roll < 0.60) type = 'jellyfish';
      else type = 'serpent';
    } else if (this.score > 2000) {
      if (roll < 0.50) type = 'basic';
      else type = 'jellyfish';
    }
    
    let newEnemy = null;
    if (type === 'jellyfish') {
      newEnemy = new JellyfishEnemy(x, y);
    } else if (type === 'serpent') {
      newEnemy = new SerpentEnemy(x, y);
    } else {
      newEnemy = new HexEnemy(x, y, type);
    }
    
    this.enemies.push(newEnemy);
  }

  spawnBurstParticles(x, y, color, count, type) {
    if (this.particles.length > CONFIG.maxParticles) return;
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, color, type));
    }
  }

  // ==========================================
  // VIEW RENDER METHOD
  // ==========================================
  render() {
    this.ctx.fillStyle = 'rgba(2, 2, 5, 0.28)';
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // Interactive menu stardust drawer
    if (this.state === 'menu') {
      this.ctx.save();
      for (let i = 0; i < this.menuParticles.length; i++) {
        this.menuParticles[i].draw(this.ctx);
      }
      this.ctx.restore();
      return;
    }
    
    this.ctx.save();
    
    if (this.shakeIntensity > 0.1) {
      const dx = (Math.random() - 0.5) * this.shakeIntensity;
      const dy = (Math.random() - 0.5) * this.shakeIntensity;
      const rot = (Math.random() - 0.5) * 0.012 * this.shakeIntensity;
      
      this.ctx.translate(this.width/2 + dx, this.height/2 + dy);
      this.ctx.rotate(rot);
      this.ctx.translate(-this.width/2, -this.height/2);
      
      this.shakeIntensity *= 0.9;
    }

    const camX = this.camera.x;
    const camY = this.camera.y;
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    
    this.grid.draw(this.ctx, this.width, this.height, camX, camY, this.feverActive);
    
    for (let i = 0; i < this.shockwaves.length; i++) {
      this.shockwaves[i].draw(this.ctx, camX, camY, this.width, this.height);
    }

    // Draw Boss Plasma Rings
    for (let i = 0; i < this.bossPlasmaRings.length; i++) {
      this.bossPlasmaRings[i].draw(this.ctx, camX, camY, this.width, this.height);
    }

    for (let i = 0; i < this.lasers.length; i++) {
      this.lasers[i].draw(this.ctx, camX, camY, this.width, this.height);
    }
    
    // Draw V5 Decoys
    for (let i = 0; i < this.decoys.length; i++) {
      this.decoys[i].draw(this.ctx, camX, camY, this.width, this.height);
    }
    
    // Draw V5 Tesla Arcs (Lightning Lines)
    for (let i = 0; i < this.teslaArcs.length; i++) {
      const arc = this.teslaArcs[i];
      const ax1 = arc.x1 - camX + halfW;
      const ay1 = arc.y1 - camY + halfH;
      const ax2 = arc.x2 - camX + halfW;
      const ay2 = arc.y2 - camY + halfH;
      const d = Vec.dist(ax1, ay1, ax2, ay2);
      if (d === 0) continue;
      
      this.ctx.save();
      this.ctx.strokeStyle = arc.color;
      this.ctx.lineWidth = (Math.random() * 2 + 1.6) * arc.life;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = arc.color;
      this.ctx.globalAlpha = arc.life;
      
      this.ctx.beginPath();
      this.ctx.moveTo(ax1, ay1);
      
      const segments = 6;
      for (let j = 1; j < segments; j++) {
        const t = j / segments;
        const lx = ax1 + (ax2 - ax1) * t;
        const ly = ay1 + (ay2 - ay1) * t;
        
        const offset = (Math.random() - 0.5) * 18 * arc.life;
        const perpX = -(ay2 - ay1) / d;
        const perpY = (ax2 - ax1) / d;
        
        this.ctx.lineTo(lx + perpX * offset, ly + perpY * offset);
      }
      this.ctx.lineTo(ax2, ay2);
      this.ctx.stroke();
      this.ctx.restore();
    }
    
    // Draw V5 Synergy Splash Alert
    if (this.synergySplashTimer > 0) {
      this.ctx.save();
      this.ctx.font = 'bold 1.7rem Orbitron';
      this.ctx.fillStyle = '#b026ff';
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = '#b026ff';
      this.ctx.textAlign = 'center';
      
      const ratio = this.synergySplashTimer / 2200;
      this.ctx.globalAlpha = ratio > 0.25 ? 1.0 : ratio * 4;
      
      const bounce = Math.sin(this.gameTime * 0.08) * 4;
      this.ctx.fillText(this.synergySplashText, halfW, halfH - 120 + bounce);
      this.ctx.restore();
    }

    if (this.player.state === 'aiming' && this.mouse.isDown) {
      const dx = this.mouse.x - this.mouse.dragStart.x;
      const dy = this.mouse.y - this.mouse.dragStart.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist > 18) {
        const angle = Math.atan2(dy, dx);
        const dashDist = Math.min(dist * 2.2, this.player.maxDashRange);
        
        const targetX = this.player.x + Math.cos(angle) * dashDist;
        const targetY = this.player.y + Math.sin(angle) * dashDist;
        
        this.ctx.save();
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#00f3ff';
        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.6)';
        this.ctx.lineWidth = 4;
        this.ctx.setLineDash([8, 6]);
        this.ctx.lineDashOffset = -this.gameTime * 0.25;
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.player.x - camX + halfW, this.player.y - camY + halfH);
        this.ctx.lineTo(targetX - camX + halfW, targetY - camY + halfH);
        this.ctx.stroke();
        
        this.ctx.beginPath();
        this.ctx.arc(targetX - camX + halfW, targetY - camY + halfH, this.player.playerDashRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 243, 255, 0.14)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([]);
        this.ctx.stroke();
        
        this.ctx.restore();
      }
    }
    
    if (this.state !== 'gameover' && this.state !== 'boss_warning') {
      const px = this.player.x - camX + halfW;
      const py = this.player.y - camY + halfH;
      const speed = Math.hypot(this.player.vx, this.player.vy);
      let angle = -Math.PI / 2; // default pointing up
      
      if (this.player.state === 'aiming' && this.mouse.isDown) {
        const dx = this.mouse.x - this.mouse.dragStart.x;
        const dy = this.mouse.y - this.mouse.dragStart.y;
        if (Math.hypot(dx, dy) > 18) {
          angle = Math.atan2(dy, dx);
        }
      } else if (this.player.state === 'dashing') {
        angle = Math.atan2(
          this.player.dashTarget.y - this.player.dashStart.y,
          this.player.dashTarget.x - this.player.dashStart.x
        );
      } else if (speed > 0.4) {
        angle = Math.atan2(this.player.vy, this.player.vx);
      }

      // Draw Chronos Field Area Circle
      if (this.player.hasChronosField) {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.45)';
        this.ctx.fillStyle = 'rgba(0, 243, 255, 0.035)';
        this.ctx.lineWidth = 1.8;
        this.ctx.setLineDash([8, 8]);
        this.ctx.lineDashOffset = this.gameTime * 0.15;
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = 'rgba(0, 243, 255, 0.4)';
        
        this.ctx.beginPath();
        this.ctx.arc(px, py, this.player.chronosFieldRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.restore();
      }

      this.ctx.save();
      if (this.player.invincibilityTimer > 0) {
        this.ctx.globalAlpha = (Math.floor(this.gameTime / 80) % 2 === 0) ? 0.25 : 0.8;
      }

      // Draw Laser Scythe blades during dash (flashy crescent shapes with hot-white cores)
      if (this.player.hasLaserScythe && this.player.state === 'dashing') {
        this.ctx.save();
        this.ctx.translate(px, py);
        this.ctx.rotate(angle);
        
        // 1. Draw outer glowing filled energy blade shape (Neon Pink)
        this.ctx.strokeStyle = '#ff00aa';
        this.ctx.lineWidth = 6;
        this.ctx.fillStyle = 'rgba(255, 0, 170, 0.22)';
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = '#ff00aa';

        // Left Wing Blade
        this.ctx.beginPath();
        this.ctx.moveTo(0, -CONFIG.playerSize);
        this.ctx.quadraticCurveTo(-20, -50, -45, -65); // sweep back and curve out
        this.ctx.quadraticCurveTo(-20, -35, 0, -CONFIG.playerSize - 4); // return curve
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // Right Wing Blade
        this.ctx.beginPath();
        this.ctx.moveTo(0, CONFIG.playerSize);
        this.ctx.quadraticCurveTo(-20, 50, -45, 65);
        this.ctx.quadraticCurveTo(-20, 35, 0, CONFIG.playerSize + 4);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // 2. Draw inner white "hot core" lines (highly electric and bright)
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2.2;
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = '#ffffff';

        this.ctx.beginPath();
        this.ctx.moveTo(0, -CONFIG.playerSize - 2);
        this.ctx.quadraticCurveTo(-18, -48, -42, -62);
        this.ctx.moveTo(0, CONFIG.playerSize + 2);
        this.ctx.quadraticCurveTo(-18, 48, -42, 62);
        this.ctx.stroke();
        
        this.ctx.restore();
      }

      // Draw Player Ghost Afterimages
      for (let i = 0; i < this.player.afterimages.length; i++) {
        const ai = this.player.afterimages[i];
        const aix = ai.x - camX + halfW;
        const aiy = ai.y - camY + halfH;
        
        this.ctx.save();
        this.ctx.globalAlpha = ai.life * 0.32;
        this.ctx.fillStyle = 'rgba(0, 243, 255, 0.45)';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#00f3ff';
        
        this.ctx.beginPath();
        this.ctx.moveTo(aix, aiy - CONFIG.playerSize);
        this.ctx.lineTo(aix + CONFIG.playerSize, aiy);
        this.ctx.lineTo(aix, aiy + CONFIG.playerSize);
        this.ctx.lineTo(aix - CONFIG.playerSize, aiy);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
      }

      // 1. Draw glowing HUD direction pointer in front of player
      if (speed > 1.2 && this.player.state !== 'dashing') {
        const arrowDist = CONFIG.playerSize * 2.6;
        const ax = px + Math.cos(angle) * arrowDist;
        const ay = py + Math.sin(angle) * arrowDist;
        
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.85)';
        this.ctx.fillStyle = 'rgba(0, 243, 255, 0.85)';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#00f3ff';
        this.ctx.lineWidth = 1.5;
        
        this.ctx.translate(ax, ay);
        this.ctx.rotate(angle);
        
        this.ctx.beginPath();
        this.ctx.moveTo(6, 0);
        this.ctx.lineTo(-5, -4);
        this.ctx.lineTo(-2, 0);
        this.ctx.lineTo(-5, 4);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
      }

      this.ctx.save();
      this.ctx.shadowBlur = 15;

      if (this.player.state === 'dashing') {
        this.ctx.shadowColor = '#ff0055';
        this.ctx.fillStyle = 'rgba(255, 0, 85, 0.5)';
        this.ctx.beginPath();
        this.ctx.arc(px - this.player.vx*2, py - this.player.vy*2, CONFIG.playerSize * 1.2, 0, Math.PI*2);
        this.ctx.fill();
        
        this.ctx.shadowColor = '#00f3ff';
        this.ctx.fillStyle = '#ffffff';
      } else {
        this.ctx.shadowColor = '#00f3ff';
        this.ctx.fillStyle = '#ffffff';
      }
      
      // 2. Draw rotated sleek vector ship shape
      this.ctx.save();
      this.ctx.translate(px, py);
      this.ctx.rotate(angle + Math.PI / 2);
      
      this.ctx.beginPath();
      this.ctx.moveTo(0, -CONFIG.playerSize * 1.55); // long nose
      this.ctx.lineTo(CONFIG.playerSize, 0); // right wing
      this.ctx.lineTo(0, CONFIG.playerSize * 0.75); // tail
      this.ctx.lineTo(-CONFIG.playerSize, 0); // left wing
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
      
      // 3. Draw outer stabilizer ring (centered, rotating independently)
      this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(px, py, CONFIG.playerSize * 1.7, this.gameTime * 0.003, this.gameTime * 0.003 + Math.PI * 1.5);
      this.ctx.stroke();
      
      if (this.player.maxDashCharges > 1) {
        for (let i = 0; i < this.player.maxDashCharges; i++) {
          this.ctx.fillStyle = (i < this.player.dashCharges) ? '#00f3ff' : 'rgba(255, 255, 255, 0.15)';
          this.ctx.beginPath();
          this.ctx.arc(px - 20 + i * 14, py + 28, 3.5, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }

      this.ctx.restore(); // for shadowBlur save
      this.ctx.restore(); // for outer invincibility globalAlpha save
      
      for (let i = 0; i < this.player.drones.length; i++) {
        this.player.drones[i].draw(this.ctx, camX, camY, this.width, this.height);
      }
    }
    
    if (this.boss) {
      this.boss.draw(this.ctx, camX, camY, this.width, this.height, this.player);
    }

    for (let i = 0; i < this.enemies.length; i++) {
      this.enemies[i].draw(this.ctx, camX, camY, this.width, this.height, this.timeScale);
    }
    
    for (let i = 0; i < this.bullets.length; i++) {
      this.bullets[i].draw(this.ctx, camX, camY, this.width, this.height);
    }
    
    for (let i = 0; i < this.missiles.length; i++) {
      this.missiles[i].draw(this.ctx, camX, camY, this.width, this.height);
    }
    
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].draw(this.ctx, camX, camY, this.width, this.height);
    }
    
    this.drawRadarBlips(camX, camY, halfW, halfH);

    this.ctx.restore();
  }

  drawRadarBlips(camX, camY, halfW, halfH) {
    this.enemies.forEach(e => {
      if (e.sliced) return;
      this.drawPointerArrow(e.x, e.y, e.color, camX, camY, halfW, halfH, 1400);
    });

    if (this.boss && this.boss.state !== 'defeated') {
      this.drawPointerArrow(this.boss.x, this.boss.y, this.boss.color || '#ff003c', camX, camY, halfW, halfH, 3000, 16);
    }
  }

  drawPointerArrow(tx, ty, color, camX, camY, halfW, halfH, maxD = 1400, size = 8) {
    const screenX = tx - camX + halfW;
    const screenY = ty - camY + halfH;
    
    const padding = 22;
    if (screenX < padding || screenX > this.width - padding || screenY < padding || screenY > this.height - padding) {
      const dx = tx - this.player.x;
      const dy = ty - this.player.y;
      const ang = Math.atan2(dy, dx);
      
      let bx = halfW + Math.cos(ang) * (halfW - padding);
      let by = halfH + Math.sin(ang) * (halfH - padding);
      
      bx = Vec.clamp(bx, padding, this.width - padding);
      by = Vec.clamp(by, padding, this.height - padding);
      
      const dist = Math.hypot(dx, dy);
      const alpha = Vec.clamp(1 - (dist / maxD), 0.25, 0.9);
      
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = color;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = color;
      
      this.ctx.translate(bx, by);
      this.ctx.rotate(ang);
      this.ctx.beginPath();
      this.ctx.moveTo(size, 0);
      this.ctx.lineTo(-size, -size * 0.7);
      this.ctx.lineTo(-size * 0.4, 0);
      this.ctx.lineTo(-size, size * 0.7);
      this.ctx.closePath();
      this.ctx.fill();
      
      this.ctx.restore();
    }
  }

  updateHUD() {
    this.displayScore = Math.floor(Vec.lerp(this.displayScore, this.score, 0.1));
    this.dom.score.textContent = this.displayScore.toLocaleString('en-US', { minimumIntegerDigits: 6, useGrouping: false });
    
    this.dom.levelLabel.textContent = `LEVEL ${this.player.level.toString().padStart(2, '0')}`;
    
    const xpPct = Vec.clamp((this.player.xp / this.player.xpNeeded) * 100, 0, 100);
    this.dom.xpBar.style.width = `${xpPct}%`;
    this.dom.xpText.textContent = `${Math.round(xpPct)}%`;

    const shieldPct = Vec.clamp((this.player.shield / this.player.maxShield) * 100, 0, 100);
    this.dom.shieldBar.style.width = `${shieldPct}%`;
    this.dom.shieldText.textContent = Math.round(this.player.shield);
    if (this.player.shield < this.player.maxShield * 0.35) {
      this.dom.shieldBar.classList.add('warning');
    } else {
      this.dom.shieldBar.classList.remove('warning');
    }
    
    const energyPct = Vec.clamp((this.player.energy / this.player.maxEnergy) * 100, 0, 100);
    this.dom.energyBar.style.width = `${energyPct}%`;
    this.dom.energyText.textContent = Math.round(this.player.energy);
    
    const bombPct = Vec.clamp((this.player.bombCharge / this.player.maxBombCharge) * 100, 0, 100);
    this.dom.bombBar.style.width = `${bombPct}%`;
    this.dom.bombText.textContent = `${Math.round(bombPct)}%`;
    if (this.player.bombCharge >= this.player.maxBombCharge) {
      this.dom.bombBar.classList.add('ready');
      this.dom.bombAlert.classList.add('active');
    } else {
      this.dom.bombBar.classList.remove('ready');
      this.dom.bombAlert.classList.remove('active');
    }

    if (this.boss && this.boss.state !== 'defeated') {
      const bossHpPct = Vec.clamp((this.boss.hp / this.boss.maxHp) * 100, 0, 100);
      this.dom.bossHpFill.style.width = `${bossHpPct}%`;
    }

    if (this.combo > 0) {
      this.dom.comboContainer.classList.add('active');
      this.dom.comboCount.textContent = this.combo;
      
      let rating = "COMBO";
      if (this.combo >= 40) rating = "GODLIKE!!!!";
      else if (this.combo >= 25) rating = "HYPER!!!";
      else if (this.combo >= 15) rating = "GREAT!!";
      else if (this.combo >= 5) rating = "GOOD!";
      
      this.dom.comboRating.textContent = rating;
      
      const bumpScale = 1.0 + Math.min(0.4, (this.comboTimer / CONFIG.maxComboTime) * 0.3);
      this.dom.comboContainer.style.transform = `scale(${bumpScale})`;
    } else {
      this.dom.comboContainer.classList.remove('active');
    }
  }
}

// Initial Launch on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.game = new GameEngine();
});

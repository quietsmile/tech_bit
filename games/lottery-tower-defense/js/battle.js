/* ============================================================
 * 战场模拟引擎：野怪波次 / 单位自动攻击 / 弹道 / 伤害数字 / 特效
 * 不依赖 DOM（canvas 传 null 时为纯逻辑模拟，便于自动化测试）
 * ============================================================ */
class Battle {
  /**
   * @param canvas 战场画布（可为 null）
   * @param hooks  { onKill(monster, player), onEscape(monster), onWave(n, isBoss), onShoot(unit) }
   */
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.w = 960;
    this.h = 540;
    this.hooks = hooks || {};
    this.units = [];
    this.monsters = [];
    this.projectiles = [];
    this.floaters = [];
    this.particles = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.wave = 0;
    this.time = 0;
    this.nextWaveAt = CONFIG.waveInterval * 0.5;  // 首波稍早
    this.escaped = 0;
    this.totalKills = 0;
    this.bossAlive = false;
  }

  /* ---------- 单位 ---------- */
  clampUnit(x,y) {
    return {
      x: Math.max(35, Math.min(this.w-35, x)),
      y: Math.max(48, Math.min(this.h-45, y))
    };
  }

  moveUnit(unit,x,y) {
    const point=this.clampUnit(x,y);
    unit.x=point.x;unit.y=point.y;unit.baseY=point.y;
    this.burst(unit.x,unit.y,unit.owner.color,8,60);
  }

  unitAt(x,y,player) {
    return this.unitsOf(player).find(unit=>Math.hypot(unit.x-x,unit.y-y)<24);
  }

  addUnit(player, item, x, y) {
    const point=this.clampUnit(x,y);
    const unit = {
      id: Math.random().toString(36).slice(2),
      owner: player,
      item,
      kind: item.kind,
      x: point.x,
      baseY: point.y,
      y: point.y,
      wanderT: Math.random() * 10,
      cd: Math.random() * 0.6,
      angle: 0,
      recoil: 0,
      born: this.time,
    };
    this.units.push(unit);
    this.burst(unit.x, unit.y, player.color, 14, 90);
    return unit;
  }

  removeUnit(unit) {
    const i = this.units.indexOf(unit);
    if (i >= 0) this.units.splice(i, 1);
  }

  unitsOf(player) { return this.units.filter(u => u.owner === player); }

  lowestHpMonster(x, y, range) {
    let best = null;
    let bestHp = Infinity;
    const rr = range * range;
    for (const monster of this.monsters) {
      if (monster.dead) continue;
      const distance = (monster.x - x) ** 2 + (monster.y - y) ** 2;
      if (distance > rr) continue;
      if (monster.hp < bestHp) {
        bestHp = monster.hp;
        best = monster;
      }
    }
    return best;
    }

  /* ---------- 波次 ---------- */
  waveComposition(wave) {
    const list = [];
    const isBoss = wave % 5 === 0;
    const count = 4 + Math.floor(wave * 1.6);
    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      if (wave >= 6 && roll < 0.15) list.push('gargoyle');
      else if (wave >= 3 && roll < 0.42) list.push('orc');
      else if (wave >= 2 && roll < 0.68) list.push('bat');
      else list.push('slime');
    }
    if (isBoss) list.push('boss');
    return { list, isBoss };
  }

  spawnMonster(type) {
    const base = CONFIG.monsters[type];
    const scale = 1 + (this.wave - 1) * CONFIG.hpScalePerWave;
    const m = {
      type,
      name: base.name,
      x: -30 - Math.random() * 60,
      y: 60 + Math.random() * (this.h - 130),
      hp: Math.round(base.hp * scale),
      maxHp: Math.round(base.hp * scale),
      speed: base.speed * (1 + (this.wave - 1) * 0.02),
      reward: base.reward,
      r: base.r,
      bob: Math.random() * Math.PI * 2,
      boss: type === 'boss',
      hitFlash: 0,
    };
    if (m.boss) this.bossAlive = true;
    this.monsters.push(m);
  }

  /* ---------- 主更新 ---------- */
  update(dt) {
    this.time += dt;

    // 波次生成
    if (this.time >= this.nextWaveAt) {
      this.wave++;
      const comp = this.waveComposition(this.wave);
      this.spawnQueue.push(...comp.list);
      this.spawnTimer = 0;
      this.nextWaveAt += CONFIG.waveInterval;
      if (this.hooks.onWave) this.hooks.onWave(this.wave, comp.isBoss);
      if (comp.isBoss) { SFX.bossWave(); } else { SFX.wave(); }
    }
    if (this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnMonster(this.spawnQueue.shift());
        this.spawnTimer = 0.55;
      }
    }

    // 野怪移动
    for (const m of this.monsters) {
      m.x += m.speed * dt;
      m.bob += dt * (m.type === 'bat' ? 9 : 4);
      m.y += Math.sin(m.bob) * 8 * dt;
      m.hitFlash = Math.max(0, m.hitFlash - dt * 5);
      if (m.x > this.w - 46) {
        m.dead = true;
        m.escaped = true;
        this.escaped++;
        if (this.hooks.onEscape) this.hooks.onEscape(m);
        SFX.escape();
      }
    }

    // 单位索敌 / 开火
    for (const u of this.units) {
      u.wanderT += dt;
      // 士兵小范围游走，武器固定
      if (u.kind === 'soldier') {
        // 自动选择射程内血量最低的目标；没有目标时在地图上巡逻。
        let target = this.lowestHpMonster(u.x, u.y, u.item.range);
        if (!target) target = this.nearestMonster(u.x, u.y, 3000);
        let moveDistance = 0;
        if (target) moveDistance = Math.hypot(target.x - u.x, target.y - u.y);

        if (target && moveDistance > u.item.range * 0.55) {
          const attackSpeed = 46 + (u.item.tier || 0) * 22;
          const dx = target.x - u.x;
          const dy = target.y - u.y;
          const length = Math.hypot(dx, dy) || 1;
          u.x += dx / length * attackSpeed * dt;
          u.y += dy / length * attackSpeed * dt;
        } else if (!target) {
          if (!u.patrolGoal || Math.hypot(u.goalX - u.x, u.goalY - u.y) < 28) {
            u.goalX = 90 + Math.random() * (this.w - 190);
            u.goalY = 70 + Math.random() * (this.h - 140);
          }
          const dx = u.goalX - u.x;
          const dy = u.goalY - u.y;
          const length = Math.hypot(dx, dy) || 1;
          u.x += dx / length * 38 * dt;
          u.y += dy / length * 38 * dt;
        }
      }
      u.cd -= dt;
      u.recoil = Math.max(0, u.recoil - dt * 6);
      const target = this.lowestHpMonster(u.x, u.y, u.item.range);
      if (target) {
        u.angle = Math.atan2(target.y - u.y, target.x - u.x);
        if (u.cd <= 0) {
          u.cd = 1;                       // 每秒 1 次攻击，伤害 = dps
          u.recoil = 1;
          this.fire(u, target);
        }
      }
    }

    // 弹道
    for (const p of this.projectiles) {
      p.life -= dt;
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step || p.life <= 0) {
        p.dead = true;
        if (p.target && !p.target.dead && p.life > 0) this.damage(p.target, p.dmg, p.owner, p.tier);
      } else {
        p.x += dx / dist * step;
        p.y += dy / dist * step;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 6) p.trail.shift();
      }
    }

    // 伤害数字
    for (const f of this.floaters) {
      f.t += dt;
      f.y += f.vy * dt;
      f.vy *= 0.96;
    }
    // 粒子
    for (const pt of this.particles) {
      pt.t += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 60 * dt;
      pt.vx *= 0.98;
    }

    this.monsters = this.monsters.filter(m => !m.dead);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.floaters = this.floaters.filter(f => f.t < f.life);
    this.particles = this.particles.filter(p => p.t < p.life);
    if (this.floaters.length > 70) this.floaters.splice(0, this.floaters.length - 70);
    if (this.particles.length > 320) this.particles.splice(0, this.particles.length - 320);
  }

  nearestMonster(x, y, range) {
    let best = null, bd = range * range;
    for (const m of this.monsters) {
      if (m.dead) continue;
      const d = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  fire(u, target) {
    const tier = CONFIG.tierNames.indexOf(u.item.tierName) >= 0
      ? CONFIG.tierNames.indexOf(u.item.tierName) : (u.item.tier != null ? u.item.tier : 0);
    this.projectiles.push({
      x: u.x, y: u.y, tx: target.x, ty: target.y,
      target,
      speed: 420 + u.item.range,
      dmg: u.item.dps,
      owner: u.owner,
      tier,
      life: 2.2,
      trail: [],
    });
    if (this.hooks.onShoot) this.hooks.onShoot(u);
    SFX.shoot();
  }

  damage(m, dmg, player, tier) {
    if (m.dead) return;
    m.hp -= dmg;
    m.hitFlash = 1;
    player.damage += dmg;
    this.floater(m.x + (Math.random() * 16 - 8), m.y - m.r - 6,
      '-' + Math.round(dmg), player.color, 0.9, 15, 46);
    if (m.hp <= 0) {
      m.dead = true;
      this.totalKills++;
      this.killEffect(m, player);
      if (this.hooks.onKill) this.hooks.onKill(m, player);
    }
  }

  killEffect(m, player) {
    const col = m.boss ? '#ff4d4d' : '#ffd76a';
    this.burst(m.x, m.y, col, m.boss ? 42 : 18, m.boss ? 200 : 120);
    // 冲击波环
    this.particles.push({ ring: true, x: m.x, y: m.y, t: 0, life: m.boss ? 0.7 : 0.45, size: m.r });
    this.floater(m.x, m.y - m.r - 22, m.boss ? 'BOSS 击杀!' : '击杀!', '#ffffff', 1.1, m.boss ? 26 : 19, 70);
    if (m.boss) this.bossAlive = false;
    SFX.kill();
  }

  floater(x, y, txt, color, life, fontSize, vy) {
    this.floaters.push({ x, y, txt, color, t: 0, life, fontSize, vy });
  }

  burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        t: 0, life: 0.5 + Math.random() * 0.5,
        size: 2 + Math.random() * 3.5,
        color,
      });
    }
  }

  /* ---------- 渲染 ---------- */
  render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { w, h } = this;

    // 背景
    if (!this._bgGrad) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0d1b2e');
      g.addColorStop(1, '#070d18');
      this._bgGrad = g;
    }
    ctx.fillStyle = this._bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 网格
    ctx.strokeStyle = 'rgba(80,140,220,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += 48) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // 左侧野怪传送门（脉动）
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
    ctx.beginPath();
    ctx.arc(10, h / 2, 60 + pulse * 8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(160,60,255,${0.10 + pulse * 0.08})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(10, h / 2, 34 + pulse * 5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(190,90,255,${0.5 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // 右侧防御圣坛
    ctx.fillStyle = '#2a2038';
    ctx.fillRect(w - 34, 0, 34, h);
    ctx.fillStyle = `rgba(255,205,80,${0.7 + pulse * 0.3})`;
    ctx.fillRect(w - 34, 0, 5, h);
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 13px sans-serif';
    ctx.save();
    ctx.translate(w - 16, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('圣坛', 0, 4);
    ctx.restore();

    this._renderUnits(ctx);
    this._renderMonsters(ctx);
    this._renderProjectiles(ctx);
    this._renderParticles(ctx);
    this._renderFloaters(ctx);
  }

  _renderUnits(ctx) {
    for (const u of this.units) {
      const col = u.owner.color;
      const tier = u.item.tier != null ? u.item.tier : 0;
      const tierCol = CONFIG.tierColors[tier];
      // 阴影
      ctx.beginPath();
      ctx.ellipse(u.x, u.y + 12, 13, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();

      if (u.kind === 'weapon') {
        // 炮塔：底座 + 指向目标的炮管
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.fillStyle = '#232c3f';
        ctx.strokeStyle = tierCol;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-11, -9, 22, 20, 4);
        ctx.fill(); ctx.stroke();
        ctx.rotate(u.angle);
        ctx.fillStyle = col;
        const len = 16 + u.recoil * -4;
        ctx.fillRect(0, -3, len, 6);
        ctx.restore();
      } else {
        // 士兵：身体 + 头
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.fillStyle = col;
        ctx.strokeStyle = tierCol;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -13, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f5d7b2';
        ctx.fill();
        // 朝向武器的短线
        ctx.rotate(u.angle);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(8, 0); ctx.lineTo(15 - u.recoil * 3, 0);
        ctx.stroke();
        ctx.restore();
      }
      // 归属名牌
      ctx.fillStyle = col;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(u.owner.shortName || '', u.x, u.y + 24);
    }
  }

  _renderMonsters(ctx) {
    for (const m of this.monsters) {
      const x = m.x, y = m.y;
      ctx.save();
      // 阴影
      ctx.beginPath();
      ctx.ellipse(x, y + m.r + 6, m.r * 0.8, 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();

      const flash = m.hitFlash;
      switch (m.type) {
        case 'slime': {
          const sq = 1 + Math.sin(m.bob * 2) * 0.15;
          ctx.fillStyle = flash > 0 ? '#fff' : '#5ad46a';
          ctx.beginPath();
          ctx.ellipse(x, y, m.r * sq, m.r / sq, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0a2a10';
          ctx.beginPath(); ctx.arc(x - 4, y - 3, 2.4, 0, 7); ctx.arc(x + 4, y - 3, 2.4, 0, 7); ctx.fill();
          break;
        }
        case 'bat': {
          const flap = Math.sin(m.bob * 3) * 0.7;
          ctx.fillStyle = flash > 0 ? '#fff' : '#7a4bd6';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - m.r - 8, y - 10 + flap * 8);
          ctx.lineTo(x - 4, y + 4);
          ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + m.r + 8, y - 10 + flap * 8);
          ctx.lineTo(x + 4, y + 4);
          ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, m.r * 0.7, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ff5f5f';
          ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.8, 0, 7); ctx.arc(x + 3, y - 2, 1.8, 0, 7); ctx.fill();
          break;
        }
        case 'orc': {
          ctx.fillStyle = flash > 0 ? '#fff' : '#a06a3a';
          ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#5d3a18'; ctx.lineWidth = 3; ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.moveTo(x - 7, y + 6); ctx.lineTo(x - 4, y + 14); ctx.lineTo(x - 1, y + 6);
          ctx.moveTo(x + 7, y + 6); ctx.lineTo(x + 4, y + 14); ctx.lineTo(x + 1, y + 6);
          ctx.fill();
          ctx.fillStyle = '#2a1608';
          ctx.beginPath(); ctx.arc(x - 5, y - 4, 2.6, 0, 7); ctx.arc(x + 5, y - 4, 2.6, 0, 7); ctx.fill();
          break;
        }
        case 'gargoyle': {
          ctx.fillStyle = flash > 0 ? '#fff' : '#8d99ae';
          ctx.beginPath();
          ctx.moveTo(x, y - m.r); ctx.lineTo(x + m.r, y); ctx.lineTo(x, y + m.r); ctx.lineTo(x - m.r, y);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#4a5261'; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.fillStyle = '#ff9f1c';
          ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fill();
          break;
        }
        case 'boss': {
          const aura = 0.4 + 0.3 * Math.sin(this.time * 5);
          ctx.beginPath(); ctx.arc(x, y, m.r + 10, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,60,60,${aura * 0.35})`;
          ctx.fill();
          ctx.fillStyle = flash > 0 ? '#fff' : '#c0392b';
          ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#5e0000'; ctx.lineWidth = 4; ctx.stroke();
          // 王冠
          ctx.fillStyle = '#ffd700';
          ctx.beginPath();
          ctx.moveTo(x - 14, y - m.r + 2);
          ctx.lineTo(x - 14, y - m.r - 10); ctx.lineTo(x - 7, y - m.r - 3);
          ctx.lineTo(x, y - m.r - 13); ctx.lineTo(x + 7, y - m.r - 3);
          ctx.lineTo(x + 14, y - m.r - 10); ctx.lineTo(x + 14, y - m.r + 2);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffe9a8';
          ctx.beginPath(); ctx.arc(x - 8, y - 4, 3.4, 0, 7); ctx.arc(x + 8, y - 4, 3.4, 0, 7); ctx.fill();
          break;
        }
      }
      ctx.restore();

      // 血条
      const bw = m.r * 2.4, bh = 4.5;
      const ratio = Math.max(0, m.hp / m.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - bw / 2, y - m.r - 12, bw, bh);
      ctx.fillStyle = ratio > 0.5 ? '#5ad46a' : ratio > 0.25 ? '#ffd166' : '#ff5d5d';
      ctx.fillRect(x - bw / 2, y - m.r - 12, bw * ratio, bh);
    }
  }

  _renderProjectiles(ctx) {
    for (const p of this.projectiles) {
      // 拖尾
      if (p.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (const t of p.trail) ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = CONFIG.tierColors[p.tier] + '66';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.tier >= 3 ? 5 : 3.4, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.tierColors[p.tier];
      ctx.shadowColor = CONFIG.tierColors[p.tier];
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _renderParticles(ctx) {
    for (const p of this.particles) {
      const k = 1 - p.t / p.life;
      if (p.ring) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + (1 - k) * 46, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,220,120,${k * 0.9})`;
        ctx.lineWidth = 3 * k + 1;
        ctx.stroke();
      } else {
        ctx.globalAlpha = Math.max(k, 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.globalAlpha = 1;
      }
    }
  }

  _renderFloaters(ctx) {
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      const k = 1 - f.t / f.life;
      ctx.globalAlpha = Math.max(k, 0);
      ctx.font = `bold ${f.fontSize}px "Courier New",monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(f.txt, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { Battle }; }

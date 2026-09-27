/* 炫酷转盘：扇区大小直接按当前奖池等级概率绘制。 */
class Wheel {
  static updateCount = 0;
  static renderCount = 0;

  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.tiers = [0, 1, 2, 3];
    this.probabilities = opts.probabilities || [0.25, 0.25, 0.25, 0.25];
    this.boundaries = this.makeBoundaries(this.probabilities);
    this.rotation = -Math.PI / 2;
    this.highlight = -1;
    this.highlightT = 0;
    this.spinning = false;
    this._anim = null;
    this._lastTier = -1;
    this.draw();
  }

  makeBoundaries(probabilities) {
    const total = probabilities.reduce((sum, p) => sum + p, 0) || 1;
    let cursor = 0;
    return probabilities.map(probability => {
      const start = cursor;
      cursor += probability / total;
      return { start, end: cursor };
    });
  }

  setProbabilities(probabilities) {
    this.probabilities = probabilities;
    this.boundaries = this.makeBoundaries(probabilities);
    this.highlight = -1;
    this._lastTier = -1;
    this.draw();
  }

  tierCenterAngle(tier) {
    const boundary = this.boundaries[tier];
    return (boundary.start + boundary.end) / 2 * Math.PI * 2;
  }

  spin(tier, duration, onLand) {
    if (this.spinning || !this.boundaries[tier]) return false;
    const boundary = this.boundaries[tier];
    const center = this.tierCenterAngle(tier);
    const jitter = (Math.random() - 0.5) * (boundary.end - boundary.start) * Math.PI * 2 * 0.5;
    const start = this.rotation;
    const extra = Math.PI * 2 * (4 + Math.random() * 2);
    const desiredRotation = -Math.PI / 2 - center;
    const delta = ((desiredRotation - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const end = start + extra + delta + jitter;
    this.spinning = true;
    this.highlight = -1;
    this._lastTier = -1;
    this._anim = { start, end, t: 0, dur: duration, onLand, tier };
    SFX.spinStart();
    return true;
  }

  static ease(t) {
    const ACC = 0.12;
    const ACCVAL = 0.16;
    if (t < ACC) return (t / ACC) * (t / ACC) * ACCVAL;
    const u = (t - ACC) / (1 - ACC);
    return ACCVAL + (1 - ACCVAL) * (1 - Math.pow(1 - u, 3));
  }

  update(dt) {
    Wheel.updateCount++;
    if (this._anim) {
      const anim = this._anim;
      anim.t = Math.min(anim.dur, anim.t + dt * 1000);
      const progress = Math.min(1, anim.t / anim.dur);
      this.rotation = anim.start + (anim.end - anim.start) * Wheel.ease(progress);
      const tier = this.pointerTier();
      if (tier !== this._lastTier) {
        this._lastTier = tier;
        SFX.tick();
        if (this.opts.onTick) this.opts.onTick(tier);
      }
      if (progress >= 1) {
        this.rotation = anim.end;
        this.highlight = anim.tier;
        this.highlightT = 0;
        this._anim = null;
        this.spinning = false;
        if (anim.onLand) anim.onLand(anim.tier);
      }
    }
    if (this.highlight >= 0) this.highlightT += dt;
    this.draw();
  }

  pointerTier() {
    const angle = ((-Math.PI / 2 - this.rotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const ratio = angle / (Math.PI * 2);
    for (let tier = 0; tier < this.boundaries.length; tier++) {
      if (ratio >= this.boundaries[tier].start && ratio < this.boundaries[tier].end) return tier;
    }
    return this.boundaries.length - 1;
  }

  draw() {
    Wheel.renderCount++;
    const ctx = this.ctx;
    const size = this.canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 26;
    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(cx, cy, radius + 18, 0, Math.PI * 2);
    ctx.fillStyle = '#241533';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#b8860b';
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.rotation);

    this.boundaries.forEach((boundary, index) => {
      const tier = index;
      const color = CONFIG.tierColors[tier];
      const startAngle = boundary.start * Math.PI * 2;
      const endAngle = boundary.end * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.closePath();
      const gradient = ctx.createRadialGradient(0, 0, radius * .15, 0, 0, radius);
      gradient.addColorStop(0, this._shade(color, -.55));
      gradient.addColorStop(1, this._shade(color, -.15));
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,214,90,.85)';
      ctx.stroke();

      const middle = (startAngle + endAngle) / 2;
      if (endAngle - startAngle > .18) {
        ctx.save();
        ctx.rotate(middle);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = tier >= 2 ? '#fff' : 'rgba(255,255,255,.92)';
        ctx.font = 'bold 24px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillText(CONFIG.tierNames[tier], radius * .62, -10);
        ctx.font = '16px sans-serif';
        ctx.fillText('★'.repeat(tier + 1), radius * .62, 18);
        ctx.restore();
      }
    });

    ctx.beginPath();
    ctx.arc(0, 0, radius * .17, 0, Math.PI * 2);
    ctx.fillStyle = '#1a0f2e';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffd76a';
    ctx.stroke();
    ctx.restore();
  }

  _shade(hex, amount) {
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    if (amount >= 0) {
      r += (255 - r) * amount;
      g += (255 - g) * amount;
      b += (255 - b) * amount;
    } else {
      r *= 1 + amount;
      g *= 1 + amount;
      b *= 1 + amount;
    }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
}

class BackgroundManager {
  constructor() {
    this.stage = document.getElementById('bg-stage');
    this.bgList = [];
    this.currentIndex = 0;
    this.intervalSec = 60;
    this.timer = null;

    // High-visibility procedural SVG Cyber-Wallpapers when /resources/bg/ has 0 files
    this.fallbackWallpapers = [
      'radial-gradient(circle at 20% 20%, rgba(0, 229, 255, 0.45) 0%, rgba(13, 33, 79, 0.85) 45%, #050914 100%)',
      'radial-gradient(circle at 80% 25%, rgba(213, 0, 249, 0.45) 0%, rgba(49, 27, 146, 0.85) 50%, #060712 100%)',
      'radial-gradient(circle at 50% 75%, rgba(0, 230, 118, 0.40) 0%, rgba(0, 77, 64, 0.85) 50%, #040a0e 100%)',
      'radial-gradient(circle at 30% 70%, rgba(255, 145, 0, 0.42) 0%, rgba(183, 28, 28, 0.75) 50%, #08050c 100%)'
    ];
  }

  init(resourceManifest) {
    if (resourceManifest && Array.isArray(resourceManifest.bg) && resourceManifest.bg.length > 0) {
      this.bgList = this.shuffle([...resourceManifest.bg]);
      console.log('[Project A^2 BG] Loaded Background Images:', this.bgList);
    } else {
      console.log('[Project A^2 BG] Using built-in high-contrast cyber wallpapers (drop images into /resources/bg/ to override).');
    }
    this.applyNextBackground();
    this.setShuffleInterval(this.intervalSec);
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  setShuffleInterval(seconds) {
    this.intervalSec = Math.max(10, Number(seconds) || 60);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.applyNextBackground();
    }, this.intervalSec * 1000);
  }

  applyNextBackground() {
    if (!this.stage) return;

    const newLayer = document.createElement('div');
    newLayer.className = 'bg-layer';

    if (this.bgList.length > 0) {
      const url = this.bgList[this.currentIndex % this.bgList.length];
      this.currentIndex = (this.currentIndex + 1) % this.bgList.length;
      if (this.currentIndex === 0 && this.bgList.length > 1) {
        this.bgList = this.shuffle(this.bgList);
      }
      newLayer.style.backgroundImage = `url("${url}")`;
    } else {
      const grad = this.fallbackWallpapers[this.currentIndex % this.fallbackWallpapers.length];
      this.currentIndex += 1;
      newLayer.style.backgroundImage = `${grad}, repeating-linear-gradient(0deg, rgba(0,229,255,0.07) 0px, rgba(0,229,255,0.07) 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, rgba(0,229,255,0.07) 0px, rgba(0,229,255,0.07) 1px, transparent 1px, transparent 40px)`;
    }

    const vignette = this.stage.querySelector('.bg-vignette');
    this.stage.insertBefore(newLayer, vignette);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        newLayer.classList.add('active-bg');
      });
    });

    const layers = this.stage.querySelectorAll('.bg-layer');
    if (layers.length > 1) {
      const oldLayer = layers[0];
      oldLayer.classList.remove('active-bg');
      setTimeout(() => {
        if (oldLayer.parentNode) oldLayer.parentNode.removeChild(oldLayer);
      }, 1600);
    }
  }
}

window.BackgroundController = new BackgroundManager();

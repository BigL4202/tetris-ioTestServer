class BackgroundManager {
  constructor() {
    this.stage = document.getElementById('bg-stage');
    this.bgList = [];
    this.allCatalogItems = []; // [{ id, label, cssValue, isImage }]
    this.currentIndex = 0;
    this.intervalSec = 180; // Default 3 minutes
    this.lockedId = 'shuffle';
    this.timer = null;

    this.fallbackWallpapers = [
      { id: 'builtin_cyan', label: 'Cyber Cyan Grid', grad: 'radial-gradient(circle at 20% 20%, rgba(0, 229, 255, 0.45) 0%, rgba(13, 33, 79, 0.85) 45%, #050914 100%)' },
      { id: 'builtin_violet', label: 'Nebula Violet', grad: 'radial-gradient(circle at 80% 25%, rgba(213, 0, 249, 0.45) 0%, rgba(49, 27, 146, 0.85) 50%, #060712 100%)' },
      { id: 'builtin_emerald', label: 'Bio Emerald', grad: 'radial-gradient(circle at 50% 75%, rgba(0, 230, 118, 0.40) 0%, rgba(0, 77, 64, 0.85) 50%, #040a0e 100%)' },
      { id: 'builtin_solar', label: 'Solar Flare', grad: 'radial-gradient(circle at 30% 70%, rgba(255, 145, 0, 0.42) 0%, rgba(183, 28, 28, 0.75) 50%, #08050c 100%)' }
    ];
  }

  init(resourceManifest) {
    this.allCatalogItems = [];
    if (resourceManifest && Array.isArray(resourceManifest.bg) && resourceManifest.bg.length > 0) {
      this.bgList = this.shuffle([...resourceManifest.bg]);
      resourceManifest.bg.forEach((url, i) => {
        const rawName = decodeURIComponent(url.split('/').pop()).replace(/\.[^.]+$/, '');
        this.allCatalogItems.push({
          id: url,
          label: rawName || `Wallpaper ${i + 1}`,
          cssValue: `url("${url}")`,
          isImage: true
        });
      });
    }

    // Always append built-in cyber wallpapers so thumbnails grid always has rich options
    this.fallbackWallpapers.forEach(fw => {
      const gridOverlay = 'repeating-linear-gradient(0deg, rgba(0,229,255,0.07) 0px, rgba(0,229,255,0.07) 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, rgba(0,229,255,0.07) 0px, rgba(0,229,255,0.07) 1px, transparent 1px, transparent 40px)';
      this.allCatalogItems.push({
        id: fw.id,
        label: fw.label,
        cssValue: `${fw.grad}, ${gridOverlay}`,
        thumbPreview: fw.grad,
        isImage: false
      });
    });

    this.applyNextBackground();
    this.setShuffleInterval(this.intervalSec);
  }

  getCatalog() {
    return this.allCatalogItems;
  }

  setLockedBackground(id) {
    this.lockedId = id || 'shuffle';
    this.applyNextBackground(true);
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  setShuffleInterval(seconds) {
    this.intervalSec = Math.max(15, Number(seconds) || 180);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.lockedId === 'shuffle') {
        this.applyNextBackground();
      }
    }, this.intervalSec * 1000);
  }

  applyNextBackground(forceApplyLocked = false) {
    if (!this.stage || this.allCatalogItems.length === 0) return;

    const newLayer = document.createElement('div');
    newLayer.className = 'bg-layer';

    if (this.lockedId && this.lockedId !== 'shuffle') {
      const matched = this.allCatalogItems.find(item => item.id === this.lockedId) || this.allCatalogItems[0];
      newLayer.style.backgroundImage = matched.cssValue;
    } else {
      const item = this.allCatalogItems[this.currentIndex % this.allCatalogItems.length];
      this.currentIndex = (this.currentIndex + 1) % this.allCatalogItems.length;
      newLayer.style.backgroundImage = item.cssValue;
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
      }, 1300);
    }
  }
}

window.BackgroundController = new BackgroundManager();

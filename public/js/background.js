class BackgroundManager {
  constructor() {
    this.stage = document.getElementById('bg-stage');
    this.bgList = [];
    this.allCatalogItems = []; // Only populated from /resources/bg/
    this.currentIndex = 0;
    this.intervalSec = 180; // Default 3 minutes
    this.lockedId = 'shuffle';
    this.timer = null;
  }

  init(resourceManifest) {
    this.allCatalogItems = [];
    if (resourceManifest && Array.isArray(resourceManifest.bg) && resourceManifest.bg.length > 0) {
      this.bgList = this.shuffle([...resourceManifest.bg]);
      resourceManifest.bg.forEach((url, i) => {
        const rawName = decodeURIComponent(url.split('/').pop()).replace(/\.[^.]+$/, '');
        this.allCatalogItems.push({
          id: url,
          label: rawName || `Background ${i + 1}`,
          cssValue: `url("${url}")`,
          isImage: true
        });
      });
    }

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

  applyNextBackground() {
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

class BackgroundManager {
  constructor() {
    this.stage = document.getElementById('bg-stage');
    this.bgList = [];
    this.currentIndex = 0;
    this.intervalSec = 60;
    this.timer = null;

    // Fallback atmospheric palettes if user hasn't dropped images into /resources/bg/ yet
    this.fallbackGradients = [
      'radial-gradient(circle at 30% 25%, #0c3b5e 0%, #06152d 55%, #030710 100%)',
      'radial-gradient(circle at 70% 20%, #004d40 0%, #071929 60%, #040811 100%)',
      'radial-gradient(circle at 50% 40%, #1a237e 0%, #091224 65%, #03060c 100%)',
      'radial-gradient(circle at 25% 65%, #006064 0%, #081826 60%, #02050a 100%)'
    ];
  }

  init(resourceManifest) {
    if (resourceManifest && Array.isArray(resourceManifest.bg) && resourceManifest.bg.length > 0) {
      this.bgList = this.shuffle([...resourceManifest.bg]);
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
      if (this.currentIndex === 0) {
        this.bgList = this.shuffle(this.bgList);
      }
      newLayer.style.backgroundImage = `url("${url}")`;
    } else {
      const grad = this.fallbackGradients[this.currentIndex % this.fallbackGradients.length];
      this.currentIndex += 1;
      newLayer.style.background = grad;
    }

    const vignette = this.stage.querySelector('.bg-vignette');
    this.stage.insertBefore(newLayer, vignette);

    // Trigger CSS cross-fade
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        newLayer.classList.add('active-bg');
      });
    });

    // Clean up older layers after 1.6s transition
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

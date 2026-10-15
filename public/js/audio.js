class AudioManager {
  constructor() {
    this.musicVolume = 0.40;
    this.sfxVolume = 0.75;
    this.musicTracks = [];
    this.sfxFiles = new Map(); // canonicalName -> url
    this.currentMusicIndex = 0;
    this.musicElement = new Audio();
    this.musicElement.preload = 'auto';
    this.unlocked = false;

    // WebAudio API fallback synthesizer if /resources/sfx/ is empty or missing a specific cue
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = AudioCtx ? new AudioCtx() : null;

    this.musicElement.addEventListener('ended', () => {
      this.nextTrack();
    });
  }

  async init(resourceManifest) {
    if (resourceManifest && Array.isArray(resourceManifest.music)) {
      this.musicTracks = this.shuffle([...resourceManifest.music]);
    }
    if (resourceManifest && Array.isArray(resourceManifest.sfx)) {
      resourceManifest.sfx.forEach(url => {
        const filename = decodeURIComponent(url.split('/').pop()).toLowerCase();
        const baseName = filename.replace(/\.(wav|mp3|ogg)$/i, '');
        this.sfxFiles.set(baseName, url);
      });
    }

    // Unlock audio on first user interaction
    const unlockHandler = () => {
      if (!this.unlocked) {
        this.unlocked = true;
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        if (this.musicTracks.length > 0 && this.musicElement.paused) {
          this.playCurrentMusic();
        }
      }
    };
    window.addEventListener('keydown', unlockHandler, { once: false });
    window.addEventListener('pointerdown', unlockHandler, { once: false });
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  setMusicVolume(val) {
    this.musicVolume = Math.max(0, Math.min(1, val));
    this.musicElement.volume = this.musicVolume;
  }

  setSfxVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
  }

  playCurrentMusic() {
    if (this.musicTracks.length === 0) return;
    const trackUrl = this.musicTracks[this.currentMusicIndex % this.musicTracks.length];
    this.musicElement.src = trackUrl;
    this.musicElement.volume = this.musicVolume;
    this.musicElement.play().catch(() => {});
  }

  nextTrack() {
    if (this.musicTracks.length === 0) return;
    this.currentMusicIndex = (this.currentMusicIndex + 1) % this.musicTracks.length;
    if (this.currentMusicIndex === 0) {
      this.musicTracks = this.shuffle(this.musicTracks);
    }
    this.playCurrentMusic();
  }

  playSFX(name, comboIndex = 1) {
    if (this.sfxVolume <= 0) return;

    // Check if user dropped a matching file in /resources/sfx/
    const comboKey = name === 'combo' ? `combo_${Math.min(comboIndex, 16)}` : name;
    const matchedUrl = this.sfxFiles.get(comboKey) || this.sfxFiles.get(name);

    if (matchedUrl) {
      const snd = new Audio(matchedUrl);
      snd.volume = this.sfxVolume;
      snd.play().catch(() => {});
      return;
    }

    // Clean WebAudio synth fallback when file isn't in /resources/sfx/ yet
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      const vol = this.sfxVolume * 0.18;
      gain.gain.setValueAtTime(vol, now);

      switch (name) {
        case 'move':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(290, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
          osc.start(now);
          osc.stop(now + 0.035);
          break;
        case 'rotate':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(580, now + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
          osc.start(now);
          osc.stop(now + 0.055);
          break;
        case 'softdrop':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(210, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
          osc.start(now);
          osc.stop(now + 0.025);
          break;
        case 'harddrop':
          osc.type = 'square';
          osc.frequency.setValueAtTime(160, now);
          osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
          osc.start(now);
          osc.stop(now + 0.095);
          break;
        case 'hold':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(380, now + 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
          osc.start(now);
          osc.stop(now + 0.075);
          break;
        case 'lock':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(140, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        case 'lineclear':
        case 'combo': {
          osc.type = 'sine';
          const pitch = 330 * Math.pow(1.059463, Math.min(comboIndex, 15));
          osc.frequency.setValueAtTime(pitch, now);
          osc.frequency.exponentialRampToValueAtTime(pitch * 1.25, now + 0.14);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          osc.start(now);
          osc.stop(now + 0.16);
          break;
        }
        case 'tspin':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
          break;
        case 'garbage_in':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(130, now);
          osc.frequency.exponentialRampToValueAtTime(90, now + 0.16);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          osc.start(now);
          osc.stop(now + 0.18);
          break;
        case 'win':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.setValueAtTime(659.25, now + 0.1);
          osc.frequency.setValueAtTime(783.99, now + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc.start(now);
          osc.stop(now + 0.45);
          break;
        case 'lose':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.linearRampToValueAtTime(110, now + 0.35);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
          osc.start(now);
          osc.stop(now + 0.38);
          break;
        default:
          osc.stop(now);
          break;
      }
    } catch (e) {}
  }
}

window.AudioController = new AudioManager();

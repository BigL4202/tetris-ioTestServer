class AudioManager {
  constructor() {
    this.musicVolume = 0.40;
    this.sfxVolume = 0.75;
    this.musicTracks = [];
    this.sfxFiles = new Map();
    this.currentMusicIndex = 0;
    this.musicElement = new Audio();
    this.musicElement.crossOrigin = 'anonymous';
    this.musicElement.preload = 'auto';
    this.isPlayingMusic = false;

    // Procedural Synthwave Fallback Sequencer if /resources/music/ has 0 files
    this.synthTimer = null;
    this.synthStep = 0;
    this.synthPatternIndex = 0;
    this.synthPatterns = [
      [220, 261.63, 329.63, 440, 329.63, 261.63, 196.00, 246.94, 293.66, 392.00, 293.66, 246.94],
      [174.61, 220, 261.63, 349.23, 261.63, 220, 164.81, 196.00, 246.94, 329.63, 246.94, 196.00],
      [146.83, 220, 293.66, 349.23, 440, 349.23, 293.66, 220, 164.81, 246.94, 329.63, 392.00]
    ];

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = AudioCtx ? new AudioCtx() : null;

    this.musicElement.addEventListener('ended', () => {
      this.nextTrack();
    });

    this.musicElement.addEventListener('error', () => {
      this.startSynthFallbackMusic();
    });

    const tryStartAudio = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (!this.isPlayingMusic && this.musicVolume > 0) {
        this.playCurrentMusic();
      }
    };

    window.addEventListener('keydown', tryStartAudio);
    window.addEventListener('pointerdown', tryStartAudio);
  }

  async init(resourceManifest) {
    if (resourceManifest && Array.isArray(resourceManifest.music) && resourceManifest.music.length > 0) {
      this.musicTracks = this.shuffle([...resourceManifest.music]);
      console.log('[Project A^2 Audio] Loaded Music Tracks:', this.musicTracks);
    }
    if (resourceManifest && Array.isArray(resourceManifest.sfx)) {
      resourceManifest.sfx.forEach(url => {
        const filename = decodeURIComponent(url.split('/').pop()).toLowerCase();
        const baseName = filename.replace(/\.(wav|mp3|ogg|m4a)$/i, '');
        this.sfxFiles.set(baseName, url);
      });
    }
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
    if (this.musicVolume === 0 && this.synthTimer) {
      this.stopSynthFallbackMusic();
    }
  }

  setSfxVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
  }

  stopSynthFallbackMusic() {
    if (this.synthTimer) {
      clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
  }

  startSynthFallbackMusic() {
    if (!this.ctx || this.musicVolume <= 0) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.stopSynthFallbackMusic();
    this.isPlayingMusic = true;

    const pattern = this.synthPatterns[this.synthPatternIndex % this.synthPatterns.length];
    this.synthStep = 0;

    this.synthTimer = setInterval(() => {
      if (this.musicVolume <= 0 || !this.ctx || this.ctx.state !== 'running') return;
      const freq = pattern[this.synthStep % pattern.length];
      this.synthStep += 1;

      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = (this.synthStep % 4 === 0) ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const noteVol = this.musicVolume * 0.08;
        gain.gain.setValueAtTime(noteVol, now);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.19);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } catch (e) {}
    }, 210);
  }

  playCurrentMusic() {
    if (this.musicVolume <= 0) return;

    if (this.musicTracks.length > 0) {
      this.stopSynthFallbackMusic();
      const trackUrl = this.musicTracks[this.currentMusicIndex % this.musicTracks.length];
      this.musicElement.src = trackUrl;
      this.musicElement.volume = this.musicVolume;
      this.musicElement.play()
        .then(() => {
          this.isPlayingMusic = true;
        })
        .catch(() => {
          this.isPlayingMusic = false;
        });
    } else {
      // No external mp3s found — start procedural synthwave loop so music always works
      this.startSynthFallbackMusic();
    }
  }

  nextTrack() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.musicTracks.length > 0) {
      this.currentMusicIndex = (this.currentMusicIndex + 1) % this.musicTracks.length;
      if (this.currentMusicIndex === 0 && this.musicTracks.length > 1) {
        this.musicTracks = this.shuffle(this.musicTracks);
      }
      this.playCurrentMusic();
    } else {
      this.synthPatternIndex = (this.synthPatternIndex + 1) % this.synthPatterns.length;
      this.startSynthFallbackMusic();
    }
  }

  playSFX(name, comboIndex = 1) {
    if (this.sfxVolume <= 0) return;

    const comboKey = name === 'combo' ? `combo_${Math.min(comboIndex, 16)}` : name;
    const matchedUrl = this.sfxFiles.get(comboKey) || this.sfxFiles.get(name);

    if (matchedUrl) {
      const snd = new Audio(matchedUrl);
      snd.volume = this.sfxVolume;
      snd.play().catch(() => {});
      return;
    }

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

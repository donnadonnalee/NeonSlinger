/**
 * NEON SLINGER: HYPER DASH - Audio System
 * Uses Web Audio API for interactive, high-juice sound design.
 * Features:
 *  - Low-pass filter modulation for bullet-time aiming.
 *  - Dynamic BGM pitch/tempo shift based on combo/fever.
 *  - Volume ducking on heavy hit impacts.
 *  - Automatic synthesizer fallbacks if files fail to load (CORS, offline).
 */

class AudioController {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.bgmSource = null;
    this.feverSource = null;
    
    // Nodes
    this.masterGain = null;
    this.bgmGain = null;
    this.seGain = null;
    this.filterNode = null;
    
    // States
    this.isMuted = false;
    this.isInitialized = false;
    this.isBulletTime = false;
    this.currentBgmType = null; // 'normal', 'fever'
    this.bgmSpeedMultiplier = 1.0;
    
    // Fallback Synth Mode indicator
    this.useSynthFallback = false;
    this.synthBgmInterval = null;
    
    // Audio Paths
    this.audioPaths = {
      // BGM
      bgm_normal: 'SE_BGM/BGM/bgm_rock.mp3',
      bgm_fever: 'SE_BGM/BGM/bgm_boss_battle.mp3',
      
      // Sound Effects
      se_start: 'SE_BGM/SE/se_boss_open.mp3',
      se_aim: 'SE_BGM/SE/se_swing.mp3',
      se_dash: 'SE_BGM/SE/se_turbo.mp3',
      se_hit: 'SE_BGM/SE/se_swinghit.mp3',
      se_homing: 'SE_BGM/SE/se_bulletHoming.mp3',
      se_absorb: 'SE_BGM/SE/se_magnet.mp3',
      se_fever: 'SE_BGM/SE/se_fanfare.mp3',
      se_gameover: 'SE_BGM/SE/se_game_over.mp3',
      se_bomb: 'SE_BGM/SE/se_bomb.mp3'
    };
  }

  async init(progressCallback) {
    if (this.isInitialized) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Setup Audio Graph
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.ctx.destination);
    
    // Filter node for Bullet Time / Aiming (Lowpass filter)
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(20000, this.ctx.currentTime); // Open filter by default
    this.filterNode.connect(this.masterGain);
    
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.45;
    this.bgmGain.connect(this.filterNode);
    
    this.seGain = this.ctx.createGain();
    this.seGain.gain.value = 0.85;
    this.seGain.connect(this.masterGain); // SEs do not pass through the BGM filter, or they can if we want
    
    // Try to preload files
    const totalFiles = Object.keys(this.audioPaths).length;
    let loadedCount = 0;
    
    for (const [key, path] of Object.entries(this.audioPaths)) {
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        this.buffers[key] = await this.ctx.decodeAudioData(arrayBuffer);
        loadedCount++;
        if (progressCallback) progressCallback(loadedCount / totalFiles);
      } catch (err) {
        console.warn(`Failed to load audio asset: ${path}. Falling back to Web Audio Synthesizer.`, err);
        this.useSynthFallback = true;
      }
    }
    
    this.isInitialized = true;
    console.log(`Audio system initialized. Synth fallback: ${this.useSynthFallback}`);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Triggers lowpass filter sweep for Bullet Time
   * @param {boolean} active 
   */
  setBulletTime(active) {
    if (!this.isInitialized || this.isBulletTime === active) return;
    this.isBulletTime = active;
    
    const now = this.ctx.currentTime;
    if (active) {
      // Sweep filter frequency down rapidly
      this.filterNode.frequency.cancelScheduledValues(now);
      this.filterNode.frequency.setValueAtTime(this.filterNode.frequency.value, now);
      this.filterNode.frequency.exponentialRampToValueAtTime(300, now + 0.15);
      
      // Slightly reduce BGM volume during aiming to focus on planning
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
      this.bgmGain.gain.linearRampToValueAtTime(0.2, now + 0.15);
    } else {
      // Sweep filter frequency back to full range
      this.filterNode.frequency.cancelScheduledValues(now);
      this.filterNode.frequency.setValueAtTime(this.filterNode.frequency.value, now);
      this.filterNode.frequency.exponentialRampToValueAtTime(20000, now + 0.2);
      
      // Restore BGM volume
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
      this.bgmGain.gain.linearRampToValueAtTime(0.45, now + 0.2);
    }
  }

  /**
   * Sets the playback rate (speed/pitch) of the BGM based on difficulty/combo
   * @param {number} multiplier 1.0 is default, e.g. up to 1.3
   */
  setBgmSpeed(multiplier) {
    if (!this.isInitialized) return;
    const targetRate = Math.min(Math.max(multiplier, 0.9), 1.65);
    
    // Check if speed has changed significantly to avoid spamming intervals
    const hasChanged = Math.abs(this.bgmSpeedMultiplier - targetRate) > 0.02;
    this.bgmSpeedMultiplier = targetRate;
    
    if (!this.useSynthFallback) {
      const now = this.ctx.currentTime;
      if (this.bgmSource && this.bgmSource.playbackRate) {
        this.bgmSource.playbackRate.linearRampToValueAtTime(targetRate, now + 0.5);
      }
      if (this.feverSource && this.feverSource.playbackRate) {
        this.feverSource.playbackRate.linearRampToValueAtTime(targetRate, now + 0.5);
      }
    } else if (hasChanged && this.currentBgmType) {
      // Re-trigger loop immediately with new tempo constraints
      this.startSynthBgm(this.currentBgmType);
    }
  }

  /**
   * Momentarily duck the music volume on intense events (Game Juice!)
   */
  duckBgm() {
    if (!this.isInitialized) return;
    const now = this.ctx.currentTime;
    const defaultVol = this.isBulletTime ? 0.2 : 0.45;
    
    this.bgmGain.gain.cancelScheduledValues(now);
    this.bgmGain.gain.setValueAtTime(defaultVol, now);
    this.bgmGain.gain.setValueAtTime(defaultVol * 0.2, now + 0.02); // Instant duck
    this.bgmGain.gain.exponentialRampToValueAtTime(defaultVol, now + 0.25); // Smooth return
  }

  playBgm(type = 'normal') {
    if (!this.isInitialized) return;
    this.resume();
    
    if (this.currentBgmType === type) return;
    this.stopBgm();
    this.currentBgmType = type;

    if (this.useSynthFallback) {
      this.startSynthBgm(type);
      return;
    }

    const key = `bgm_${type}`;
    if (!this.buffers[key]) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers[key];
    source.loop = true;
    source.connect(this.bgmGain);
    source.start(0);

    if (type === 'normal') {
      this.bgmSource = source;
    } else {
      this.feverSource = source;
    }
  }

  stopBgm() {
    if (this.bgmSource) {
      try { this.bgmSource.stop(); } catch(e) {}
      this.bgmSource = null;
    }
    if (this.feverSource) {
      try { this.feverSource.stop(); } catch(e) {}
      this.feverSource = null;
    }
    this.stopSynthBgm();
    this.currentBgmType = null;
  }

  playSe(key) {
    if (!this.isInitialized) return;
    this.resume();
    
    if (this.useSynthFallback) {
      this.playSynthSe(key);
      return;
    }

    if (!this.buffers[key]) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers[key];
    
    // Apply pitch adjustment during bullet time for cool matrix sound
    if (this.isBulletTime && (key === 'se_hit' || key === 'se_dash')) {
      source.playbackRate.value = 0.6;
    }
    
    source.connect(this.seGain);
    source.start(0);
  }

  // ==========================================
  // PROCEDURAL SYNTHESIZER FALLBACK
  // ==========================================

  playSynthSe(key) {
    const now = this.ctx.currentTime;
    
    switch (key) {
      case 'se_start': {
        // Grand intro sweep
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(120, now);
        osc1.frequency.exponentialRampToValueAtTime(480, now + 0.4);
        osc2.frequency.setValueAtTime(240, now);
        osc2.frequency.exponentialRampToValueAtTime(960, now + 0.4);
        
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.seGain);
        
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.6);
        osc2.stop(now + 0.6);
        break;
      }
      case 'se_aim': {
        // Low sci-fi hum
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.3);
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        
        osc.connect(gain);
        gain.connect(this.seGain);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }
      case 'se_dash': {
        // Fast laser dash sweep
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(1600, now + 0.15);
        
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        
        osc.connect(gain);
        gain.connect(this.seGain);
        osc.start(now);
        osc.stop(now + 0.18);
        break;
      }
      case 'se_hit': {
        // Noise-like metal slice impact
        const oscNode = this.ctx.createOscillator();
        const noiseGain = this.ctx.createGain();
        oscNode.type = 'sawtooth';
        oscNode.frequency.setValueAtTime(80, now);
        oscNode.frequency.linearRampToValueAtTime(40, now + 0.1);
        
        noiseGain.gain.setValueAtTime(0.4, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        
        oscNode.connect(noiseGain);
        noiseGain.connect(this.seGain);
        oscNode.start(now);
        oscNode.stop(now + 0.12);
        
        // High click transient
        const click = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        click.type = 'sine';
        click.frequency.setValueAtTime(2000, now);
        clickGain.gain.setValueAtTime(0.3, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
        click.connect(clickGain);
        clickGain.connect(this.seGain);
        click.start(now);
        click.stop(now + 0.02);
        break;
      }
      case 'se_homing': {
        // High whistle shooting
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.12);
        
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc.connect(gain);
        gain.connect(this.seGain);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
      case 'se_absorb': {
        // Magnetic chime
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.linearRampToValueAtTime(1300, now + 0.08);
        
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        
        osc.connect(gain);
        gain.connect(this.seGain);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      }
      case 'se_fever': {
        // Epic fanfare arpeggio
        const notes = [261.63, 329.63, 392.00, 523.25]; // C E G C
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          
          gain.gain.setValueAtTime(0.001, now + idx * 0.08);
          gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.08 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);
          
          osc.connect(gain);
          gain.connect(this.seGain);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.2);
        });
        break;
      }
      case 'se_gameover': {
        // Sad detuned descending sweep
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(300, now);
        osc1.frequency.linearRampToValueAtTime(60, now + 0.8);
        osc2.frequency.setValueAtTime(303, now); // Detuned
        osc2.frequency.linearRampToValueAtTime(61, now + 0.8);
        
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.seGain);
        
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.9);
        osc2.stop(now + 0.9);
        break;
      }
      case 'se_bomb': {
        // Massive bass boom explosion
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
        
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        
        osc.connect(gain);
        gain.connect(this.seGain);
        osc.start(now);
        osc.stop(now + 0.6);
        
        // White noise splash fallback
        const splash = this.ctx.createOscillator();
        const splashGain = this.ctx.createGain();
        splash.type = 'triangle';
        splash.frequency.setValueAtTime(1000, now);
        splash.frequency.linearRampToValueAtTime(200, now + 0.4);
        
        splashGain.gain.setValueAtTime(0.35, now);
        splashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        
        splash.connect(splashGain);
        splashGain.connect(this.seGain);
        splash.start(now);
        splash.stop(now + 0.4);
        break;
      }
    }
  }

  startSynthBgm(type) {
    this.stopSynthBgm();
    
    // Synthesize a cool retro 8-bit techno bassline loop!
    let beat = 0;
    // Notes for arpeggiator (normal: A minor, fever: D minor fast)
    const normalScale = [110, 110, 130.81, 146.83, 110, 164.81, 146.83, 130.81]; 
    const feverScale = [146.83, 146.83, 174.61, 196.00, 146.83, 220.00, 196.00, 261.63]; 
    
    const scale = (type === 'fever') ? feverScale : normalScale;
    const baseTempo = (type === 'fever') ? 130 : 110; 
    const speedMult = this.bgmSpeedMultiplier || 1.0;
    const tempo = baseTempo * speedMult;
    const beatDuration = 60 / tempo / 2; // eighth notes
    
    const playTick = () => {
      const now = this.ctx.currentTime;
      const noteIndex = beat % scale.length;
      // Slight cyber frequency shift on overdrive/speed-up
      const pitchFactor = type === 'fever' ? speedMult : 1.0;
      const freq = scale[noteIndex] * pitchFactor;
      
      // Synthesize a punchy bass synth note
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = (type === 'fever') ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      
      // Add a decay filter sweep
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + beatDuration * 0.8);
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + beatDuration * 0.95);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);
      
      osc.start(now);
      osc.stop(now + beatDuration);
      
      // Chime overlays on the first beat of bars
      if (beat % 8 === 0) {
        const chime = this.ctx.createOscillator();
        const chimeGain = this.ctx.createGain();
        chime.type = 'sine';
        chime.frequency.setValueAtTime(freq * 4, now); 
        chimeGain.gain.setValueAtTime(0.05, now);
        chimeGain.gain.exponentialRampToValueAtTime(0.001, now + beatDuration * 2);
        
        chime.connect(chimeGain);
        chimeGain.connect(this.bgmGain);
        chime.start(now);
        chime.stop(now + beatDuration * 2);
      }
      
      beat++;
    };
    
    // Play first tick, then set interval
    playTick();
    const intervalMs = beatDuration * 1000;
    this.synthBgmInterval = setInterval(playTick, intervalMs);
  }

  stopSynthBgm() {
    if (this.synthBgmInterval) {
      clearInterval(this.synthBgmInterval);
      this.synthBgmInterval = null;
    }
  }

  setMute(mute) {
    this.isMuted = mute;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(mute ? 0 : 0.8, this.ctx.currentTime);
    }
  }
}

// Export singleton instance
window.audio = new AudioController();

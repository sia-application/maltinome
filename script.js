// Audio Context and Global State
let audioContext = null;
let isPlaying = false;
let metronomes = [];
let schedulerTimer = null;
let nextNoteTime = 0;
let scheduleAheadTime = 0.1;
let lookahead = 25;
let audioUnlocked = false;

// Unlock AudioContext for iOS
function unlockAudio() {
    if (audioUnlocked) return;

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('AudioContext resumed successfully');
        });
    }

    // Play a silent buffer to fully unlock
    const buffer = audioContext.createBuffer(1, 1, 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);

    audioUnlocked = true;

    // Remove listeners once unlocked
    document.removeEventListener('touchstart', unlockAudio);
    document.removeEventListener('click', unlockAudio);
}

// Add unlock listeners
document.addEventListener('touchstart', unlockAudio, { passive: false });
document.addEventListener('click', unlockAudio);

// DOM Elements
const playBtn = document.getElementById('play-btn');
const addMetronomeBtn = document.getElementById('add-metronome-btn');
const metronomesContainer = document.getElementById('metronomes-container');
const metronomeTemplate = document.getElementById('metronome-template');

// Pattern Definitions
const patterns = {
    'quarter': { beats: 4, subdivisions: 1, notes: [1, 1, 1, 1] },
    'triplet': { beats: 3, subdivisions: 1, notes: [1, 1, 1] },
    'triplet-hollow': { beats: 3, subdivisions: 1, notes: [1, 0, 1] },
    'sextuplet': { beats: 6, subdivisions: 1, notes: [1, 1, 1, 1, 1, 1] }
};

class Metronome {
    constructor(id) {
        this.id = id;
        this.tempo = 120;
        this.currentPattern = 'quarter';
        this.clickMultiplier = 1;
        this.offbeatMultiplier = 1;
        this.currentBeat = 0;
        this.isOffbeat = false;
        this.accentEnabled = true;
        this.volume = 1.0;
        this.offbeatVolume = 0.0;
        this.pitch = 800; // Default pitch
        this.isPlaying = false; // Individual playing state

        this.element = this.createUI();
        this.setupEventListeners();
    }

    createUI() {
        const clone = metronomeTemplate.content.cloneNode(true);
        const unit = clone.querySelector('.metronome-unit');

        // Append to container
        metronomesContainer.appendChild(unit);
        return unit;
    }

    remove() {
        this.element.remove();
        metronomes = metronomes.filter(m => m !== this);
    }

    setupEventListeners() {
        const el = this.element;

        // Removing
        el.querySelector('.remove-btn').addEventListener('click', () => {
            if (this.isPlaying) this.toggle(); // Stop if playing
            this.remove();
        });

        // Individual Play
        const playBtn = el.querySelector('.unit-play-btn');
        playBtn.addEventListener('click', () => this.toggle());

        // Tempo
        const tempoInput = el.querySelector('.tempo-input');
        const tempoSlider = el.querySelector('.tempo-slider');
        const updateTempo = (val) => {
            let v = parseInt(val);
            if (isNaN(v)) v = 120;
            v = Math.max(5, Math.min(999, v));
            this.tempo = v;
            tempoInput.value = v;
            tempoSlider.value = v;
        };

        tempoInput.addEventListener('change', (e) => updateTempo(e.target.value));
        tempoSlider.addEventListener('input', (e) => updateTempo(e.target.value));
        el.querySelector('.tempo-down').addEventListener('click', () => updateTempo(this.tempo - 1));
        el.querySelector('.tempo-up').addEventListener('click', () => updateTempo(this.tempo + 1));

        // Rhythm Patterns
        const rhythmBtns = el.querySelectorAll('.rhythm-btn');
        rhythmBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                rhythmBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentPattern = btn.dataset.pattern;
                this.currentBeat = 0;
                this.updateBeatDots();
            });
        });

        // Volume
        const volSlider = el.querySelector('.volume-slider');
        const volDisplay = el.querySelector('.volume-display');
        const muteBtn = el.querySelector('.main-mute-btn');

        const updateVol = (val) => {
            this.volume = parseInt(val) / 100;
            volSlider.value = val;
            volDisplay.textContent = val + '%';
            muteBtn.textContent = this.volume === 0 ? '🔇' : '🔈';
            muteBtn.classList.toggle('muted', this.volume === 0);
        };

        volSlider.addEventListener('input', (e) => updateVol(e.target.value));
        muteBtn.addEventListener('click', () => updateVol(Math.max(0, parseInt(volSlider.value) - 100)));
        el.querySelector('.main-volume-up').addEventListener('click', () => updateVol(Math.min(500, parseInt(volSlider.value) + 100)));

        // Offbeat Volume
        const offSlider = el.querySelector('.offbeat-volume-slider');
        const offDisplay = el.querySelector('.offbeat-volume-display');
        const offMuteBtn = el.querySelector('.offbeat-mute-btn');

        const updateOffVol = (val) => {
            this.offbeatVolume = parseInt(val) / 100;
            offSlider.value = val;
            offDisplay.textContent = val + '%';
            offMuteBtn.textContent = this.offbeatVolume === 0 ? '🔇' : '🔈';
            offMuteBtn.classList.toggle('muted', this.offbeatVolume === 0);
        };

        offSlider.addEventListener('input', (e) => updateOffVol(e.target.value));
        offMuteBtn.addEventListener('click', () => updateOffVol(Math.max(0, parseInt(offSlider.value) - 10)));
        el.querySelector('.offbeat-volume-up').addEventListener('click', () => updateOffVol(Math.min(500, parseInt(offSlider.value) + 10)));

        // Multipliers
        const multBtns = el.querySelectorAll('.multiplier-btn');
        multBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                multBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.clickMultiplier = parseInt(btn.dataset.multiplier);
            });
        });

        const offMultBtns = el.querySelectorAll('.offbeat-mult-btn');
        offMultBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                offMultBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.offbeatMultiplier = parseInt(btn.dataset.multiplier);
            });
        });

        // Pitch Control
        const pitchSlider = el.querySelector('.pitch-slider');
        const pitchDisplay = el.querySelector('.pitch-display');

        const updatePitch = (val) => {
            let v = parseInt(val);
            v = Math.max(200, Math.min(2000, v));
            this.pitch = v;
            pitchSlider.value = v;
            pitchDisplay.textContent = v + 'Hz';
        };

        if (pitchSlider) {
            pitchSlider.addEventListener('input', (e) => updatePitch(e.target.value));
            el.querySelector('.pitch-down').addEventListener('click', () => updatePitch(this.pitch - 50));
            el.querySelector('.pitch-up').addEventListener('click', () => updatePitch(this.pitch + 50));
        }

        // Toggles
        const offToggle = el.querySelector('.offbeat-toggle');
        offToggle.addEventListener('click', () => {
            this.isOffbeat = !this.isOffbeat;
            offToggle.classList.toggle('offbeat', this.isOffbeat);
        });

        const accToggle = el.querySelector('.accent-toggle');
        accToggle.addEventListener('click', () => {
            this.accentEnabled = !this.accentEnabled;
            accToggle.classList.toggle('active', this.accentEnabled);
        });

        // Initialize Dots
        this.updateBeatDots();

        // Detail Settings Toggle
        const detailToggle = el.querySelector('.detail-toggle');
        const detailSettings = el.querySelector('.detail-settings');

        if (detailToggle && detailSettings) {
            detailToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Detail toggle clicked');
                detailSettings.classList.toggle('open');
                const isOpen = detailSettings.classList.contains('open');
                detailToggle.textContent = isOpen ? '詳細設定 ▲' : '詳細設定 ▼';
            });
        } else {
            console.error('Detail toggle elements not found');
        }
    }

    updateBeatDots() {
        const container = this.element.querySelector('.beat-dots');
        const pattern = patterns[this.currentPattern];
        container.innerHTML = '';
        for (let i = 0; i < pattern.beats; i++) {
            const dot = document.createElement('span');
            dot.className = 'dot';
            if (pattern.notes[i] === 0) dot.style.opacity = '0.3';
            container.appendChild(dot);
        }
    }

    visualizeBeat(beatNumber) {
        const dots = this.element.querySelectorAll('.dot');
        dots.forEach((dot, i) => {
            dot.classList.remove('active', 'first');
            if (i === beatNumber) {
                dot.classList.add('active');
                if (i === 0) dot.classList.add('first');
            }
        });
    }

    clearVisuals() {
        this.element.querySelectorAll('.dot').forEach(d => d.classList.remove('active', 'first'));
    }

    toggle() {
        this.isPlaying = !this.isPlaying;
        const btn = this.element.querySelector('.unit-play-btn');

        if (this.isPlaying) {
            btn.classList.add('playing');
            btn.textContent = '■';

            // If global scheduler isn't running, start it
            if (!schedulerTimer) {
                // Ensure audio context is ready
                if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
                if (audioContext.state === 'suspended') audioContext.resume();

                // Sync start time
                const now = audioContext.currentTime;
                this.nextNoteTime = now + 0.05;
                this.currentBeat = 0;

                startSchedulerLoop();
            } else {
                // Join existing loop
                this.nextNoteTime = audioContext.currentTime + 0.05;
                this.currentBeat = 0;
            }
        } else {
            btn.classList.remove('playing');
            btn.textContent = '▶';
            this.clearVisuals();

            // If no metronomes are playing, stop scheduler
            checkAutoStop();
        }
        updateGlobalPlayState();
    }
}


// Global Scheduler State Management
function startSchedulerLoop() {
    if (!schedulerTimer) {
        scheduler();
        updateGlobalPlayState();
    }
}

function checkAutoStop() {
    const anyPlaying = metronomes.some(m => m.isPlaying);
    if (!anyPlaying) {
        clearTimeout(schedulerTimer);
        schedulerTimer = null;
    }
}

function updateGlobalPlayState() {
    const anyPlaying = metronomes.some(m => m.isPlaying);
    isPlaying = anyPlaying; // Sync global flag

    if (isPlaying) {
        playBtn.classList.add('playing');
        playBtn.querySelector('.play-icon').textContent = '■';
        playBtn.querySelector('.btn-text').textContent = 'すべてストップ';
    } else {
        playBtn.classList.remove('playing');
        playBtn.querySelector('.play-icon').textContent = '▶';
        playBtn.querySelector('.btn-text').textContent = 'すべてスタート';
    }
}


// Scheduler Logic
function scheduler() {

    // Correct loop implementation inside scheduler function:
    // Correct loop implementation inside scheduler function:
    metronomes.forEach(m => {
        if (!m.isPlaying) return; // Skip if not playing

        // Initialize nextNoteTime for new metronomes if needed, or track it on the instance
        if (!m.nextNoteTime) m.nextNoteTime = audioContext.currentTime + 0.1;

        while (m.nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
            scheduleMetronomeNote(m, m.nextNoteTime);
            advanceMetronomeNote(m);
        }
    });

    // Continue loop if anyone is playing
    if (metronomes.some(m => m.isPlaying)) {
        schedulerTimer = setTimeout(scheduler, lookahead);
    } else {
        schedulerTimer = null;
    }
}

function scheduleMetronomeNote(metronome, time) {
    const pattern = patterns[metronome.currentPattern];
    const beatNumber = metronome.currentBeat;

    // Visuals
    setTimeout(() => {
        if (isPlaying) metronome.visualizeBeat(beatNumber);
    }, (time - audioContext.currentTime) * 1000);

    if (pattern.notes[beatNumber] === 0) return;

    // Durations
    let beatDuration = 60.0 / metronome.tempo; // Quarter
    if (metronome.currentPattern === 'sextuplet') beatDuration /= 6;
    else if (metronome.currentPattern !== 'quarter') beatDuration /= 3; // Triplet variants

    const mainInterval = beatDuration / metronome.clickMultiplier;
    const offInterval = beatDuration / metronome.offbeatMultiplier;
    const offset = mainInterval / 2;

    let mainStart = metronome.isOffbeat ? time + offset : time;
    let offStart = metronome.isOffbeat ? time : time + offset;

    // Main Sounds
    if (metronome.volume > 0) {
        for (let i = 0; i < metronome.clickMultiplier; i++) {
            playTone(mainStart + i * mainInterval,
                (beatNumber === 0 && i === 0 && metronome.accentEnabled) ? metronome.pitch + 200 : metronome.pitch,
                metronome.volume, 'square');
        }
    }

    // Offbeat Sounds
    if (metronome.offbeatVolume > 0) {
        for (let i = 0; i < metronome.offbeatMultiplier; i++) {
            playTone(offStart + i * offInterval, 600, metronome.offbeatVolume, 'square');
        }
    }
}

function playTone(time, freq, vol, type) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(time);
    osc.stop(time + 0.05);
}

function advanceMetronomeNote(metronome) {
    const pattern = patterns[metronome.currentPattern];
    let duration = 60.0 / metronome.tempo;
    if (metronome.currentPattern === 'sextuplet') duration /= 6;
    else if (metronome.currentPattern !== 'quarter') duration /= 3;

    metronome.nextNoteTime += duration;
    metronome.currentBeat = (metronome.currentBeat + 1) % pattern.beats;
}

// Global Controls
async function togglePlay() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Ensure context is running
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    // Checking if any are playing
    const anyPlaying = metronomes.some(m => m.isPlaying);

    if (anyPlaying) {
        // STOP ALL
        metronomes.forEach(m => {
            if (m.isPlaying) m.toggle();
        });
    } else {
        // START ALL
        const now = audioContext.currentTime;
        const startDelay = 0.05;

        // Start everyone
        metronomes.forEach(m => {
            // We manually set state to avoid toggling logic interfering with sync start
            m.isPlaying = true;
            m.currentBeat = 0;
            m.nextNoteTime = now + startDelay;

            // Update UI for each
            const btn = m.element.querySelector('.unit-play-btn');
            btn.classList.add('playing');
            btn.textContent = '⏹';
        });

        startSchedulerLoop();
    }
}

function addMetronome() {
    const m = new Metronome(Date.now());
    metronomes.push(m);
}

// Init
playBtn.addEventListener('click', togglePlay);
addMetronomeBtn.addEventListener('click', addMetronome);

// Add initial metronome
addMetronome();

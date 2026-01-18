// Audio Context
let audioContext = null;
let isPlaying = false;
let tempo = 120;
let currentPattern = 'quarter';
let currentBeat = 0;
let isOffbeat = false;
let subdivisionSound = false;
let volume = 1.0;
let offbeatVolume = 1.0;
let schedulerTimer = null;
let nextNoteTime = 0;
let scheduleAheadTime = 0.1;
let lookahead = 25;

// DOM Elements
const playBtn = document.getElementById('play-btn');
const tempoSlider = document.getElementById('tempo-slider');
const tempoValue = document.getElementById('tempo-value');
const tempoDown = document.getElementById('tempo-down');
const tempoUp = document.getElementById('tempo-up');
const rhythmBtns = document.querySelectorAll('.rhythm-btn');
const beatDots = document.getElementById('beat-dots');
const offbeatToggle = document.getElementById('offbeat-toggle');
const subdivisionToggle = document.getElementById('subdivision-toggle');
const volumeSlider = document.getElementById('volume-slider');
const volumeDisplay = document.getElementById('volume-display');
const offbeatVolumeSlider = document.getElementById('offbeat-volume-slider');
const offbeatVolumeDisplay = document.getElementById('offbeat-volume-display');

// Pattern Definitions
const patterns = {
    'quarter': {
        beats: 4,
        subdivisions: 1,
        notes: [1, 1, 1, 1] // All beats sound
    },
    'triplet': {
        beats: 3,
        subdivisions: 1,
        notes: [1, 1, 1] // All triplet notes sound
    },
    'triplet-hollow': {
        beats: 3,
        subdivisions: 1,
        notes: [1, 0, 1] // First and third sound, middle is silent
    }
};

// Initialize
function init() {
    updateTempoDisplay();
    updateBeatDots();
    setupEventListeners();
}

// Setup Event Listeners
function setupEventListeners() {
    playBtn.addEventListener('click', togglePlay);

    tempoSlider.addEventListener('input', (e) => {
        tempo = parseInt(e.target.value);
        updateTempoDisplay();
    });

    tempoDown.addEventListener('click', () => {
        tempo = Math.max(40, tempo - 5);
        tempoSlider.value = tempo;
        updateTempoDisplay();
    });

    tempoUp.addEventListener('click', () => {
        tempo = Math.min(240, tempo + 5);
        tempoSlider.value = tempo;
        updateTempoDisplay();
    });

    rhythmBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            rhythmBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPattern = btn.dataset.pattern;
            currentBeat = 0;
            updateBeatDots();
        });
    });

    offbeatToggle.addEventListener('click', () => {
        isOffbeat = !isOffbeat;
        offbeatToggle.classList.toggle('offbeat', isOffbeat);
    });

    subdivisionToggle.addEventListener('click', () => {
        subdivisionSound = !subdivisionSound;
        subdivisionToggle.classList.toggle('active', subdivisionSound);
    });

    volumeSlider.addEventListener('input', (e) => {
        volume = parseInt(e.target.value) / 100;
        volumeDisplay.textContent = e.target.value + '%';
    });

    offbeatVolumeSlider.addEventListener('input', (e) => {
        offbeatVolume = parseInt(e.target.value) / 100;
        offbeatVolumeDisplay.textContent = e.target.value + '%';
    });
}

// Update Tempo Display
function updateTempoDisplay() {
    tempoValue.textContent = tempo;
}

// Update Beat Dots
function updateBeatDots() {
    const pattern = patterns[currentPattern];
    beatDots.innerHTML = '';

    for (let i = 0; i < pattern.beats; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        if (pattern.notes[i] === 0) {
            dot.style.opacity = '0.3';
        }
        beatDots.appendChild(dot);
    }
}

// Toggle Play/Stop
function togglePlay() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (isPlaying) {
        stop();
    } else {
        start();
    }
}

// Start Metronome
function start() {
    isPlaying = true;
    currentBeat = 0;

    // Resume audio context if suspended (required for some browsers)
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    // Add small delay before first note to prevent audio glitch
    nextNoteTime = audioContext.currentTime + 0.1;

    playBtn.classList.add('playing');
    playBtn.querySelector('.play-icon').textContent = '⏹';
    playBtn.querySelector('.btn-text').textContent = 'ストップ';

    scheduler();
}

// Stop Metronome
function stop() {
    isPlaying = false;
    clearTimeout(schedulerTimer);

    playBtn.classList.remove('playing');
    playBtn.querySelector('.play-icon').textContent = '▶';
    playBtn.querySelector('.btn-text').textContent = 'スタート';

    // Clear active dots
    document.querySelectorAll('.beat-dots .dot').forEach(dot => {
        dot.classList.remove('active', 'first');
    });
}

// Scheduler
function scheduler() {
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
        scheduleNote(currentBeat, nextNoteTime);
        nextNote();
    }
    schedulerTimer = setTimeout(scheduler, lookahead);
}

// Schedule Note
function scheduleNote(beatNumber, time) {
    const pattern = patterns[currentPattern];

    // Calculate half beat duration for subdivision
    let halfBeatDuration;
    if (currentPattern === 'quarter') {
        halfBeatDuration = (60.0 / tempo) / 2; // Half a beat
    } else {
        halfBeatDuration = (60.0 / tempo / 3) / 2; // Half a triplet note
    }

    // Visual feedback
    setTimeout(() => {
        if (!isPlaying) return;

        const dots = document.querySelectorAll('.beat-dots .dot');
        dots.forEach((dot, i) => {
            dot.classList.remove('active', 'first');
            if (i === beatNumber) {
                dot.classList.add('active');
                if (i === 0) {
                    dot.classList.add('first');
                }
            }
        });
    }, (time - audioContext.currentTime) * 1000);

    // Check if this beat should sound
    if (pattern.notes[beatNumber] === 0) {
        return; // Silent beat
    }

    // Determine timing based on offbeat mode
    let mainClickTime, subdivisionClickTime;

    if (isOffbeat) {
        // 裏拍モード: オフビート音が先、メインクリックが後
        subdivisionClickTime = time; // オフビート音がビートの頭で鳴る
        mainClickTime = time + halfBeatDuration; // メインクリックは半拍後
    } else {
        // 表拍モード: メインクリックが先、オフビート音が後
        mainClickTime = time;
        subdivisionClickTime = time + halfBeatDuration;
    }

    // Play main click
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Use square wave for louder, punchier sound
    osc.type = 'square';

    // First beat is higher pitch, all beats same volume
    if (beatNumber === 0) {
        osc.frequency.value = 1000;
    } else {
        osc.frequency.value = 800;
    }

    // Set initial gain with volume control
    gainNode.gain.setValueAtTime(volume, mainClickTime);

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Longer sound for more presence
    osc.start(mainClickTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, mainClickTime + 0.1);
    osc.stop(mainClickTime + 0.1);

    // Play subdivision sound (offbeat click)
    if (subdivisionSound) {
        const subOsc = audioContext.createOscillator();
        const subGain = audioContext.createGain();

        // Use square wave for louder sound
        subOsc.type = 'square';
        subOsc.frequency.value = 600;

        // Set initial gain with offbeat volume control
        subGain.gain.setValueAtTime(offbeatVolume, subdivisionClickTime);

        subOsc.connect(subGain);
        subGain.connect(audioContext.destination);

        subOsc.start(subdivisionClickTime);
        subGain.gain.exponentialRampToValueAtTime(0.001, subdivisionClickTime + 0.1);
        subOsc.stop(subdivisionClickTime + 0.1);
    }
}

// Next Note
function nextNote() {
    const pattern = patterns[currentPattern];

    // Calculate note duration based on pattern
    let noteDuration;
    if (currentPattern === 'quarter') {
        // Quarter notes: seconds per beat
        noteDuration = 60.0 / tempo;
    } else {
        // Triplets: 3 notes per beat, so each note is 1/3 of a beat
        noteDuration = 60.0 / tempo / 3;
    }

    nextNoteTime += noteDuration;
    currentBeat = (currentBeat + 1) % pattern.beats;
}

// Initialize on page load
init();

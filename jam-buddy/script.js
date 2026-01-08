// IDEAS:
// Change instrument type
// Switch between melody and chord models

// --- 1. SETUP ---
const synth = new Tone.PolySynth(Tone.Synth).toDestination();
// Using MusicRNN - melody model
const model = new mm.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/melody_rnn');
const statusEl = document.getElementById('status');
const aiToggle = document.getElementById('ai-toggle');
const stageEl = document.getElementById('stage');
const aiLed = document.getElementById('ai-led');
const aiKnob = document.getElementById('ai-knob');
const aiDial = document.getElementById('ai-dial');
let aiEnabled = true;
let isAIThinking = false;
let userNotes = []; // Stores the notes you play
let lastNoteTime = 0;
const INACTIVITY_THRESHOLD = 2000; // 2 seconds of silence triggers the AI
let inactivityTimer;
let activeNotes = new Map(); // Track active notes for sustain: { midiNum: true }
let visualTimeouts = new Map(); // Track visual feedback timeouts per key

function setStatus(text) {
    statusEl.innerText = text;
}

function refreshAIDialUI() {
    if (aiLed) {
        aiLed.classList.remove('on', 'off');
        aiLed.classList.add(aiEnabled ? 'on' : 'off');
    }
    if (aiKnob) {
        aiKnob.style.transform = aiEnabled ? 'rotate(35deg)' : 'rotate(-35deg)';
    }
}

// --- 2. INITIALIZATION ---
document.getElementById('start-btn').addEventListener('click', async () => {
    await Tone.start();
    setStatus("Loading AI Model... (this takes a few seconds)");

    // Initialize the AI Model
    await model.initialize();

    setStatus(aiEnabled ? "System Ready! Play a melody then wait for the AI to respond." : "AI is OFF. Play freely—no AI replies.");
    document.getElementById('start-btn').style.display = 'none';
    if (stageEl) stageEl.style.display = 'flex';
    refreshAIDialUI();
    createKeys();
    setupKeyboardListener();
});

// AI toggle listener to enable/disable responses
aiEnabled = aiToggle ? aiToggle.checked : true;
if (aiToggle) {
    aiToggle.addEventListener('change', () => {
        aiEnabled = aiToggle.checked;
        if (!aiEnabled) {
            clearTimeout(inactivityTimer);
            setStatus(isAIThinking ? "AI will finish this reply, then stay OFF." : "AI is OFF. Play freely—no AI replies.");
            if (!isAIThinking) enableKeyboard();
        } else {
            // When turning AI ON, discard any notes played while AI was OFF
            userNotes = [];
            setStatus("AI is ON. Play a melody then wait for the AI to respond.");
            if (activeNotes.size === 0 && userNotes.length > 0) {
                clearTimeout(inactivityTimer);
                inactivityTimer = setTimeout(triggerAIResponse, INACTIVITY_THRESHOLD);
            }
        }
        refreshAIDialUI();
    });
}

// Click the dial to toggle AI
if (aiDial) {
    aiDial.addEventListener('click', () => {
        if (!stageEl || stageEl.style.display === 'none') return; // only after start
        aiToggle.checked = !aiToggle.checked;
        aiToggle.dispatchEvent(new Event('change'));
    });
}

// --- 3. PIANO LOGIC ---
const NOTES = ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5'];
const MIDI_NUMS = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77];
const KEY_MAP = { 'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5, 't': 6, 'g': 7, 'y': 8, 'h': 9, 'u': 10, 'j': 11, 'k': 12, 'o': 13, 'l': 14, 'p': 15, ';': 16, "'": 17 };
const KEY_LETTERS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', ';', "'"];
const IS_BLACK_KEY = [false, true, false, true, false, false, true, false, true, false, true, false, false, true, false, true, false, false];
const KEY_POSITIONS = [0, 40, 60, 100, 120, 180, 220, 240, 280, 300, 340, 360, 420, 460, 480, 520, 540, 600];

function createKeys() {
    const container = document.getElementById('piano-container');
    NOTES.forEach((note, index) => {
        const div = document.createElement('div');
        const isBlack = IS_BLACK_KEY[index];
        div.className = `key ${isBlack ? 'black' : 'white'}`;
        div.id = `key-${MIDI_NUMS[index]}`;
        div.innerText = KEY_LETTERS[index];
        div.onmousedown = () => playNote(index);
        div.onmouseup = () => releaseNote(index);
        div.onmouseleave = () => releaseNote(index);

        // Position keys using precise pixel positions
        if (isBlack) {
            div.style.left = `${KEY_POSITIONS[index]}px`;
        }

        container.appendChild(div);
    });
}

function setupKeyboardListener() {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
}

function playNote(index, isAI = false) {
    // Prevent human input while AI is thinking
    if (!isAI && isAIThinking) return;

    const note = NOTES[index];
    const midi = MIDI_NUMS[index];

    // If AI is playing or this is a repeated press, use triggerAttackRelease
    if (isAI) {
        synth.triggerAttackRelease(note, "8n");
    } else {
        // For human input, use triggerAttack for sustain
        if (!activeNotes.has(midi)) {
            synth.triggerAttack(note);
            activeNotes.set(midi, true);
        }
    }

    // Visual feedback
    const keyDiv = document.getElementById(`key-${midi}`);
    if (keyDiv) {
        const activeClass = isAI ? 'ai-playing' : 'active';
        keyDiv.classList.add(activeClass);
        if (isAI) {
            setTimeout(() => keyDiv.classList.remove(activeClass), 200);
        }
    }

    // If HUMAN played this, record it
    if (!isAI) {
        // Clear the inactivity timer - user is actively playing
        clearTimeout(inactivityTimer);

        // Record note for Magenta (needs pitch + quantized time steps)
        // Ideally we'd use exact timing, but for this simple MVP we just push pitches
        userNotes.push({
            pitch: midi,
            startTime: Tone.now(),
            endTime: Tone.now() + 0.5
        });
    }
}

// Play a note with a specific duration (for AI responses with rhythm)
function playNoteWithDuration(index, durationSec) {
    const note = NOTES[index];
    const midi = MIDI_NUMS[index];

    // Use triggerAttackRelease with the exact duration
    synth.triggerAttackRelease(note, durationSec);

    // Visual feedback - highlight key for the duration of the note
    const keyDiv = document.getElementById(`key-${midi}`);
    if (keyDiv) {
        // Clear any existing timeout for this key to prevent conflicts
        if (visualTimeouts.has(midi)) {
            clearTimeout(visualTimeouts.get(midi));
        }

        // Remove and re-add the class to restart the visual effect for repeated notes
        keyDiv.classList.remove('ai-playing');
        // Trigger a reflow to ensure the class removal is processed before re-adding
        void keyDiv.offsetWidth;
        keyDiv.classList.add('ai-playing');

        // Store the timeout so we can clear it if the same note plays again
        const timeoutId = setTimeout(() => {
            keyDiv.classList.remove('ai-playing');
            visualTimeouts.delete(midi);
        }, durationSec * 1000);
        visualTimeouts.set(midi, timeoutId);
    }
}

function releaseNote(index) {
    // Prevent release while AI is thinking
    if (isAIThinking) return;

    const midi = MIDI_NUMS[index];
    const note = NOTES[index];

    if (activeNotes.has(midi)) {
        synth.triggerRelease(note);
        activeNotes.delete(midi);
    }

    // Remove visual feedback
    const keyDiv = document.getElementById(`key-${midi}`);
    if (keyDiv) {
        keyDiv.classList.remove('active');
    }

    // If all notes are released, start the AI timer
    if (activeNotes.size === 0 && aiEnabled) {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(triggerAIResponse, INACTIVITY_THRESHOLD);
    }
}

function disableKeyboard() {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    document.getElementById('piano-container').classList.add('disabled');
    // Release all sustained notes
    activeNotes.forEach((_, midi) => {
        const note = NOTES[MIDI_NUMS.indexOf(midi)];
        synth.triggerRelease(note);
    });
    activeNotes.clear();
}

function enableKeyboard() {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.getElementById('piano-container').classList.remove('disabled');
}

function handleKeyDown(e) {
    if (KEY_MAP[e.key] !== undefined && !e.repeat) {
        playNote(KEY_MAP[e.key]);
    }
}

function handleKeyUp(e) {
    if (KEY_MAP[e.key] !== undefined) {
        releaseNote(KEY_MAP[e.key]);
    }
}

// --- 4. THE AI BRAIN ---
async function triggerAIResponse() {
    if (!aiEnabled || userNotes.length === 0 || isAIThinking) return;
    isAIThinking = true;
    disableKeyboard(); // Disable keyboard
    setStatus("AI is listening and jamming back...");

    // 1. Convert user notes to a NoteSequence (Magenta's format)
    const unquantizedSequence = {
        notes: userNotes.map((n, i) => ({
            pitch: n.pitch,
            startTime: i * 0.5,
            endTime: (i + 1) * 0.5,
            velocity: 80
        })),
        totalTime: userNotes.length * 0.5
    };

    try {
        // Quantize the sequence properly using Magenta's utility
        const quantizedSequence = mm.sequences.quantizeNoteSequence(unquantizedSequence, 4);

        // 2. Ask AI to continue the sequence
        const result = await model.continueSequence(quantizedSequence, 50, 1.1);

        // 3. Play back the AI's response with proper rhythm
        // Convert quantized steps to time (4 steps per quarter note at 120 BPM = ~125ms per step)
        const msPerStep = 125; // milliseconds per quantized step
        let totalDuration = 0;

        result.notes.forEach((note) => {
            // Calculate start time and duration from the quantized note
            const startTimeMs = note.quantizedStartStep * msPerStep;
            const endTimeMs = note.quantizedEndStep * msPerStep;
            const durationMs = endTimeMs - startTimeMs;

            // Convert duration to Tone.js notation for proper note length
            const durationSec = durationMs / 1000;

            setTimeout(() => {
                const closestMidi = MIDI_NUMS.reduce((prev, curr) =>
                    Math.abs(curr - note.pitch) < Math.abs(prev - note.pitch) ? curr : prev
                );
                const index = MIDI_NUMS.indexOf(closestMidi);
                if (index !== -1) playNoteWithDuration(index, durationSec);
            }, startTimeMs);

            // Track total duration for reset timing
            if (endTimeMs > totalDuration) {
                totalDuration = endTimeMs;
            }
        });

        // Reset after playing (add buffer for last note to finish)
        setTimeout(() => {
            userNotes = [];
            isAIThinking = false;
            enableKeyboard(); // Enable keyboard
            setStatus(aiEnabled ? "Your turn! Play something." : "AI is OFF. Play freely—no AI replies.");
        }, totalDuration + 500);

    } catch (e) {
        console.error("AI Error:", e);
        isAIThinking = false;
        userNotes = [];
        enableKeyboard(); // Enable keyboard
        setStatus("AI encountered an error. Try again!");
    }
}
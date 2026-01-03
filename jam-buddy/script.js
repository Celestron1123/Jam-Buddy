// --- 1. SETUP ---
const synth = new Tone.PolySynth(Tone.Synth).toDestination();
// Using MusicRNN - melody model
const model = new mm.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/melody_rnn');
let isAIThinking = false;
let userNotes = []; // Stores the notes you play
let lastNoteTime = 0;
const INACTIVITY_THRESHOLD = 2000; // 2 seconds of silence triggers the AI
let inactivityTimer;
let activeNotes = new Map(); // Track active notes for sustain: { midiNum: true }

// --- 2. INITIALIZATION ---
document.getElementById('start-btn').addEventListener('click', async () => {
    await Tone.start();
    document.getElementById('status').innerText = "Loading AI Model... (this takes a few seconds)";

    // Initialize the AI Model
    await model.initialize();

    document.getElementById('status').innerText = "System Ready! Play a melody then wait for the AI to respond.";
    document.getElementById('start-btn').style.display = 'none';
    document.getElementById('piano-container').style.display = 'flex';
    createKeys();
    setupKeyboardListener();
});

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
    if (activeNotes.size === 0) {
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
    if (userNotes.length === 0 || isAIThinking) return;
    isAIThinking = true;
    disableKeyboard(); // Disable keyboard
    document.getElementById('status').innerText = "AI is listening and jamming back...";

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

        // 3. Play back the AI's jazz solo
        result.notes.forEach((note, i) => {
            setTimeout(() => {
                const closestMidi = MIDI_NUMS.reduce((prev, curr) =>
                    Math.abs(curr - note.pitch) < Math.abs(prev - note.pitch) ? curr : prev
                );
                const index = MIDI_NUMS.indexOf(closestMidi);
                if (index !== -1) playNote(index, true);
            }, i * 300);
        });

        // Reset after playing
        setTimeout(() => {
            userNotes = [];
            isAIThinking = false;
            enableKeyboard(); // Enable keyboard
            document.getElementById('status').innerText = "Your turn! Play something.";
        }, result.notes.length * 300);

    } catch (e) {
        console.error("AI Error:", e);
        isAIThinking = false;
        userNotes = [];
        enableKeyboard(); // Enable keyboard
        document.getElementById('status').innerText = "AI encountered an error. Try again!";
    }
}
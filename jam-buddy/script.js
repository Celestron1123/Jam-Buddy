/*
 * JAM BUDDY
 * An interactive web app where you can play piano and have an AI
 * respond with its own melody using Magenta.js and Tone.js.
 *
 * By Elijah Potter
 * https://www.elijahpotter.com
*/

// IDEAS:
// Change instrument type
// Switch between melody and chord models
// Adjust AI creativity (temperature)

// TODO:
// Fix mouse drag bug where original key doesn't release visually
// Make sure the black keys display the right color when pressed
// Give AI the actual timing of user notes for better rhythm

// Our music and audio resources
const synth = new Tone.PolySynth(Tone.Synth).toDestination();
// Using MusicRNN - melody model
const model = new mm.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/melody_rnn');

// Main text element
const statusEl = document.getElementById('status');
// Main toggle that enables/disables AI responses
const aiToggle = document.getElementById('ai-toggle');
// Stage element that holds the piano and AI dial
const stageEl = document.getElementById('stage');
// LED for AI toggle status
const aiLed = document.getElementById('ai-led');
// Visual knob for AI status
const aiKnob = document.getElementById('ai-knob');
// Interactive dial to toggle AI
const aiDial = document.getElementById('ai-dial');
// Determines if AI responses are enabled
let aiEnabled = true;
// Tracks if AI is currently generating a response
let isAIPlaying = false;
// Array of notes played by the user
let userNotes = [];
// Timestamp of the last note played by the user
let lastNoteTime = 0;
// Time (in ms) of inactivity before triggering AI response
const INACTIVITY_THRESHOLD = 2000; // 2 seconds
// Timer for inactivity
let inactivityTimer;
// Tracks active notes for sustain: { midiNum: true }
let activeNotes = new Map();
// Tracks visual feedback timeouts per key
let visualTimeouts = new Map();
// Tracks the last key pressed
let lastKeyPressed = null;

// Changes the status text to whatever is passed in
function setStatus(text) {
    statusEl.innerText = text;
}

// Updates the AI dial UI based on aiEnabled state
function refreshAIDialUI() {
    // Reset aiLed and set based on aiEnabled
    aiLed.classList.remove('on', 'off');
    aiLed.classList.add(aiEnabled ? 'on' : 'off');

    // Rotate knob based on aiEnabled
    aiKnob.style.transform = aiEnabled ? 'rotate(35deg)' : 'rotate(-35deg)';

}

// Initial setup when Start button is clicked
document.getElementById('start-btn').addEventListener('click', async () => {
    // Start the Tone.js audio context
    await Tone.start();
    setStatus("Loading AI Model... (this takes a few seconds)");

    // Initialize the AI Model
    await model.initialize();

    // Update status and hide start button
    setStatus("System Ready! Play a melody then wait for the AI to respond.");
    document.getElementById('start-btn').style.display = 'none';

    // Show the stage
    if (stageEl) stageEl.style.display = 'flex';

    // Setup the rest of the UI
    refreshAIDialUI();
    createKeys();
    setupKeyboardListener();
});

// AI toggle listener to enable/disable responses
aiToggle.addEventListener('change', () => {
    aiEnabled = aiToggle.checked;
    // if disabling AI, clear timers and update status
    if (!aiEnabled) {
        clearTimeout(inactivityTimer);
        // Display correct status based on whether AI is working
        setStatus(isAIPlaying ? "AI will finish this reply, then stay OFF." : "AI is OFF. Play freely");
    } else {
        // If enabling AI, reset user notes and status
        userNotes = [];
        setStatus("AI is ON. Play a melody then wait for the AI to respond.");
        // If no active notes, start inactivity timer
        if (activeNotes.size === 0 && userNotes.length > 0) {
            // First, clear any existing timer
            clearTimeout(inactivityTimer);
            // This will trigger AI after threshold
            inactivityTimer = setTimeout(triggerAIResponse, INACTIVITY_THRESHOLD);
        }
    }
    // Refresh the dial UI
    refreshAIDialUI();
});

// Click the dial to toggle AI
aiDial.addEventListener('click', () => {
    if (stageEl.style.display === 'none') return; // only after start
    aiToggle.checked = !aiToggle.checked;
    aiToggle.dispatchEvent(new Event('change'));
});


// Main keyboard and note handling logic
const NOTES = ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5'];
const MIDI_NUMS = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77];
const KEY_MAP = { 'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5, 't': 6, 'g': 7, 'y': 8, 'h': 9, 'u': 10, 'j': 11, 'k': 12, 'o': 13, 'l': 14, 'p': 15, ';': 16, "'": 17 };
const KEY_LETTERS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', ';', "'"];
const IS_BLACK_KEY = [false, true, false, true, false, false, true, false, true, false, true, false, false, true, false, true, false, false];
const KEY_POSITIONS = [0, 40, 60, 100, 120, 180, 220, 240, 280, 300, 340, 360, 420, 460, 480, 520, 540, 600];

// Create piano keys in the DOM
function createKeys() {
    const container = document.getElementById('piano-container');
    // Iterate through notes to create keys
    NOTES.forEach((note, index) => {
        // Creating a div for each key. Automatically assigns class and id
        const div = document.createElement('div');
        const isBlack = IS_BLACK_KEY[index];
        div.className = `key ${isBlack ? 'black' : 'white'}`;
        div.id = `key-${MIDI_NUMS[index]}`;
        div.innerText = KEY_LETTERS[index];

        // When a key is pressed, play the note and track lastKeyPressed
        div.onpointerdown = (e) => {
            lastKeyPressed = index;
            playNote(index);
        };

        // When pointer enters a key while pressed, play that note and release lastKeyPressed
        div.onpointerenter = (e) => {
            // Only trigger if a button is pressed
            if (!e.buttons) return;
            releaseNote(lastKeyPressed);
            lastKeyPressed = index;
            playNote(index);
        };

        // When pointer is released, release the note
        div.onpointerup = (e) => {
            releaseNote(index);
            lastKeyPressed = null;
        };

        // Position keys using precise pixel positions
        if (isBlack) {
            div.style.left = `${KEY_POSITIONS[index]}px`;
        }

        // Append the key to the container
        container.appendChild(div);
    });
}

// Global pointerup listener to handle releases outside keys
window.addEventListener('pointerup', () => {
    if (lastKeyPressed !== null) {
        releaseNote(lastKeyPressed);
        lastKeyPressed = null;
    }
});

// Setup keyboard event listeners for playing notes
function setupKeyboardListener() {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
}

// Handle playing a note
function playNote(index, isAI = false) {
    // Prevent human input while AI is thinking
    if (!isAI && isAIPlaying) return;

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
        // If AI, remove the class after a short delay
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

// Handle releasing a note
function releaseNote(index) {
    // Prevent release while AI is thinking
    if (isAIPlaying) return;

    const midi = MIDI_NUMS[index];
    const note = NOTES[index];

    // Only release if the note is active
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

// Disable keyboard input (used during AI playback)
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

// Enable keyboard input
function enableKeyboard() {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.getElementById('piano-container').classList.remove('disabled');
}

// Keyboard event handlers
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

// Trigger the AI to respond based on user notes
async function triggerAIResponse() {
    if (!aiEnabled || userNotes.length === 0 || isAIPlaying) return;
    isAIPlaying = true;
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
            isAIPlaying = false;
            enableKeyboard(); // Enable keyboard
            setStatus(aiEnabled ? "Your turn! Play something." : "AI is OFF. Play freely—no AI replies.");
        }, totalDuration + 500);

    } catch (e) {
        console.error("AI Error:", e);
        isAIPlaying = false;
        userNotes = [];
        enableKeyboard(); // Enable keyboard
        setStatus("AI encountered an error. Try again!");
    }
}
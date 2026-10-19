# Jam Buddy

Jam Buddy is a browser-based AI accompanist that listens to a short melody played on an on-screen piano and responds with a generated musical phrase. It is designed as an interactive musical sketching tool: play notes with the mouse or computer keyboard, pause, and let the AI continue the idea.

## Scope and purpose

Jam Buddy focuses on a lightweight, client-side musical interaction loop rather than a full digital audio workstation. It provides:

- A two-octave virtual piano covering C4 through F5.
- Mouse, pointer, and computer-keyboard input for playing notes.
- Real-time synthesized sound using Tone.js.
- An optional AI response mode controlled by the **AI Jam Buddy** dial.
- Visual feedback for both user notes and AI-generated notes.
- Automatic response triggering after two seconds of inactivity.

The current implementation is an MVP. It generates a melodic continuation from pitch input, but it does not yet preserve the exact timing or expressive performance details of the player.

## How it works

1. The user clicks **Start Audio Engine**. This starts the browser's audio context and initializes Magenta's pre-trained `MusicRNN` melody model.
2. The application dynamically creates the piano keys defined in `script.js`.
3. Notes can be played with pointer input or mapped keyboard keys. Human notes are sustained until released and are stored in `userNotes`.
4. When all keys are released, a two-second inactivity timer begins. If AI mode is enabled and notes have been recorded, the timer calls `triggerAIResponse()`.
5. The recorded pitches are converted into a Magenta `NoteSequence`. For the current MVP, notes are assigned evenly spaced half-second intervals rather than using their actual performance timing.
6. The sequence is quantized to four steps per quarter note with `mm.sequences.quantizeNoteSequence()`.
7. Magenta's `MusicRNN.continueSequence()` generates up to 50 continuation steps using a temperature of `1.1`, allowing some variation in the response.
8. The generated notes are converted from quantized steps into millisecond offsets at an assumed 120 BPM, then scheduled with `setTimeout()` and played through Tone.js.
9. While the AI is responding, keyboard input is disabled, sustained human notes are released, and generated notes receive separate visual highlighting. Input is restored after the response finishes.

## Algorithms and musical behavior

### Melody continuation

The AI uses Magenta's pre-trained `melody_rnn` checkpoint through `MusicRNN`. The user's input is treated as the beginning of a melody, and `continueSequence()` predicts a continuation rather than generating an unrelated phrase from scratch.

The current call uses:

- **Input:** a quantized monophonic-style sequence built from the user's recorded pitches.
- **Steps:** `50` continuation steps.
- **Temperature:** `1.1`, controlling output randomness and variation.
- **Quantization:** four steps per quarter note.

### Timing conversion

The application currently records `Tone.now()` timestamps, but the response pipeline intentionally rebuilds the input with evenly spaced timing:

- Each input note is assigned a half-second duration.
- The total sequence duration is based on the number of notes.
- AI output steps are played at `125 ms` per quantized step, equivalent to approximately 120 BPM with four steps per quarter note.
- Each generated note's quantized start and end steps determine its playback delay and duration.

This makes the MVP predictable, but preserving the player's actual rhythm is a planned improvement.

### Pitch mapping

The UI exposes 18 pitches from MIDI 60 through MIDI 77. If Magenta generates a pitch outside that range, the playback code maps it to the closest available MIDI pitch so every generated note can be represented on the on-screen piano.

### Input and state management

The interaction loop uses a small state machine built from JavaScript variables:

- `aiEnabled` controls whether responses are allowed.
- `isAIPlaying` prevents human input during generation and playback.
- `activeNotes` tracks sustained human notes.
- `userNotes` stores the current phrase-in-progress.
- `inactivityTimer` starts the response after the player stops.
- `visualTimeouts` prevents overlapping visual timers from leaving AI highlights stuck.

## Tech stack

- **HTML5** for the application structure and controls.
- **CSS3** for the dark interface, virtual piano layout, key states, AI dial, LED, and responsive visual feedback.
- **Vanilla JavaScript** for input handling, state management, note scheduling, and application orchestration.
- **Tone.js 14.8.49** for browser audio initialization and polyphonic synthesis.
- **Magenta.js 1.23.1** for `MusicRNN`, note-sequence quantization, and melody continuation.
- **Pre-trained Magenta MusicRNN checkpoint** loaded from Google's Magenta model storage.

There is no bundler, package manager, backend, database, or server-side API in the current repository. The application loads its JavaScript dependencies directly from CDNs and runs entirely in the browser.

## Project structure

```text
.
├── README.md              Project overview and usage notes
├── LICENSE                MIT license
└── jam-buddy/
    ├── index.html         Page structure and CDN dependency imports
    ├── script.js          Piano creation, audio, input, AI, and playback logic
    └── styles.css         Interface styling and piano-key animations

```

## Running locally

Because this is a static browser application, no build step is required.

1. Clone the repository.
2. Start a local static file server from the repository root. For example:

```bash
python3 -m http.server 8000

```

3. Open the application at:

```text
http://localhost:8000/jam-buddy/

```

4. Click **Start Audio Engine**, wait for the model to initialize, and play a melody.

A local server is recommended instead of opening `index.html` directly so browser security policies and CDN-loaded resources behave consistently. An internet connection is required to load Tone.js, Magenta.js, and the MusicRNN checkpoint.

## Controls

| Control | Behavior |
| --- | --- |
| Mouse or pointer | Press and drag across piano keys to play notes |
| Computer keyboard | Use `A W S E D F T G Y H U J K O L P ; '` for the 18 piano keys |
| AI Jam Buddy dial | Enable or disable automatic AI responses |
| Start Audio Engine | Start the audio context and load the AI model |

When AI mode is enabled, stop playing for approximately two seconds to trigger a response. The piano is temporarily disabled while the generated phrase plays.

## Current limitations and future work

The repository already identifies several natural next steps:

* Preserve the exact timing of user notes so generated rhythm reflects the player's performance.
* Improve pointer-drag release behavior when moving between keys.
* Ensure black-key pressed-state styling is consistent across pointer and keyboard input.
* Support selectable instruments instead of a single `Tone.Synth` sound.
* Add chord-generation or accompaniment models alongside the current melody model.
* Expose creativity/temperature controls to let the player influence AI variation.
* Consider more robust scheduling and cancellation for generated playback.

## License

Jam Buddy is released under the GNU GPLv3 License.

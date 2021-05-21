/**
 * @template T
 * @param {HTMLElement} parent 
 * @param {string} tag
 * @param {T[]} data
 * @param {(element: HTMLElement, datum: T) => void} update 
 */
function updateElements(parent, tag, data, update) {
    const elements = parent.children;
    const oldLength = elements.length;
    const newLength = data.length;
    for (let index = oldLength; index < newLength; ++index) {
        parent.appendChild(document.createElement(tag));
    }
    for (let index = oldLength - 1; index >= newLength; --index) {
        parent.removeChild(elements[index]);
    }

    const newElements = parent.children;
    for (let index = 0; index < newLength; ++index) {
        update(newElements[index], data[index]);
    }
}

/**
 * 
 * @param {HTMLElement} element
 * @param {(value: string) => void} listener
 */
function initButtonGroup(element, listener) {
    function onChange() {
        for (const button of element.children) {
            button.classList.toggle(
                'selected',
                button.dataset.value === element.dataset.value,
            );
        }
    }

    for (const button of element.children) {
        button.addEventListener('click', e => {
            e.preventDefault();

            const value = e.target.dataset.value
            element.dataset.value = value;
            onChange();

            listener(value);
        });
    }
    if (!('value' in element.dataset) && element.firstElementChild != null) {
        element.dataset.value = element.firstElementChild.dataset.value;
    }
    onChange();
}

window.addEventListener('load', e => {
    const app = document.getElementById('app');
    const melodyPanel = document.getElementById('melody-panel');
    const midiFileDrop = document.getElementById('midi-file-drop');
    const fileNameLabel = document.getElementById('file-name-label');
    const playButton = document.getElementById('play-button');
    const changeCircleModeButtonGroup = document.getElementById('change-circle-mode-button-group');

    let midi = null;
    let tracks = [];
    let state = {
        mode: '12 semitones',
    };

    function loadFile(file) {
        file.arrayBuffer().then(buffer => {
            fileNameLabel.textContent = `${file.name} (Please drop your MIDI file into the window.)`;
            midi = new Midi(buffer);

            Tone.Transport.stop();
            Tone.Transport.cancel();

            tracks.forEach(track => {
                track.volume.disconnect();
                track.synth.disconnect();
            });
            tracks = [];

            midi.tracks.forEach(track => {
                const div = document.createElement('div');

                const volume = new Tone.Volume(-12).toDestination();
                const synth = new Tone.PolySynth({
                    // maxPolyphony: 100,
                    voice: Tone.Synth,
                    options: {
                        envelope: {
                            attack: 0.02,
                            decay: 0.1,
                            sustain: 0.3,
                            release: 0.8,
                        },
                    },
                }).connect(volume);

                const part = new Tone.Part((time, note) => {
                    synth.triggerAttackRelease(
                        note.name,
                        note.duration,
                        time,
                        note.velocity,
                    );
                }, track.notes);
                part.start(0);

                tracks.push({
                    channel: track.channel,
                    volume: volume,
                    synth: synth,
                    part: part,
                    notes: track.notes,
                });
                melodyPanel.appendChild(div);
            });

            // Infinite Loop
            function replay() {
                Tone.Transport.seconds = 0.0;
            }
            Tone.Transport.schedule(replay, midi.duration);
        });
    }

    app.addEventListener('dragover', e => {
        e.preventDefault();
    });
    app.addEventListener('drop', e => {
        e.preventDefault();

        const files = e.dataTransfer.files;
        if (files.length == 0) return;

        const file = files[0];
        loadFile(file);
    });
    midiFileDrop.addEventListener('change', e => {
        const files = e.target.files;
        if (files.length == 0) return;

        const file = files[0];
        loadFile(file);
    });
    playButton.addEventListener('click', e => {
        Tone.Transport.stop();
        Tone.Transport.start();
    });

    initButtonGroup(changeCircleModeButtonGroup, value => {
        state.mode = value;
    });

    requestAnimationFrame(function animationLoop() {
        const currentTime = Tone.Transport.seconds;
        const scale = 200;
        let circleFactor;
        switch (state.mode) {
            case '12 semitones':
                circleFactor = 1;
                break;
            case '24 semitones':
                circleFactor = 0.5;
                break;
            case '48 semitones':
                circleFactor = 0.25;
                break;
            case '96 semitones':
                circleFactor = 0.125;
                break;
            case 'circle of fifths':
                circleFactor = 7;
                break;
        }

        updateElements(melodyPanel, 'div', tracks, (element, track) => {
            const notes = track.notes.filter(note => {
                const offset = currentTime - note.time;
                return -3 <= offset && offset <= note.duration;
            });

            updateElements(element, 'div', notes, (element, note) => {
                const offset = currentTime - note.time;
                const theta = 2 * Math.PI * note.midi * circleFactor / 12;
                const x = scale * (-offset + 0.5 * note.duration) * Math.cos(theta);
                const y = scale * (-offset + 0.5 * note.duration) * -Math.sin(theta);

                element.style.width = `${scale * note.duration}px`;
                element.style.height = `${scale * note.duration}px`;
                element.style.margin = `${-0.5 * scale * note.duration}px`;
                element.style.transform = `translate(${x}px, ${y}px)`;
                element.classList.toggle(
                    'activated',
                    0 <= offset && offset < note.duration,
                );
            });
        });

        requestAnimationFrame(animationLoop);
    });
});

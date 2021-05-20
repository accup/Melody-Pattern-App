function createOption(optionValue) {
    const option = document.createElement('option');
    option.value = optionValue;
    return option;
}

window.addEventListener('load', e => {
    const app = document.getElementById('app');
    const melodyPanel = document.getElementById('melody-panel');
    const midiFileDrop = document.getElementById('midi-file-drop');
    const playButton = document.getElementById('play-button');

    let midi = null;
    let tracks = [];

    app.addEventListener('dragover', e => {
        e.preventDefault();
    });
    app.addEventListener('drop', e => {
        e.preventDefault();

        const files = e.dataTransfer.files;
        if (files.length == 0) return;

        const file = files[0];
        file.arrayBuffer().then(buffer => {
            midiFileDrop.textContent = `${file.name} (Please drop your MIDI file into the window.)`;
            midi = new Midi(buffer);

            while (melodyPanel.lastChild) {
                melodyPanel.removeChild(melodyPanel.lastChild);
            }

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
                    maxPolyphony: 100,
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

                const nodes = [];
                track.notes.forEach(note => {
                    const scale = 200.0;
                    const element = document.createElement('div');
                    element.style.width = `${scale * note.duration}px`;
                    element.style.height = `${scale * note.duration}px`;
                    element.style.margin = `${-0.5 * scale * note.duration}px`;

                    div.appendChild(element);
                    nodes.push({
                        note: note,
                        element: element,
                    });
                });

                tracks.push({
                    volume: volume,
                    synth: synth,
                    part: part,
                    nodes: nodes,
                });
                melodyPanel.appendChild(div);
            });

            // Infinite Loop
            function replay() {
                Tone.Transport.seconds = 0.0;
            }
            Tone.Transport.schedule(replay, midi.duration);
        });
    });
    midiFileDrop.addEventListener('mouseup', e => {
        Tone.Transport.start();
    });
    playButton.addEventListener('click', e => {
        Tone.Transport.stop();
        Tone.Transport.start();
    });

    requestAnimationFrame(function animationLoop() {
        if (tracks !== null) {
            const scale = 200.0;
            const currentTime = Tone.Transport.seconds;

            tracks.forEach(track => {
                track.nodes.forEach(node => {
                    const distance = node.note.time - currentTime;
                    if (-node.note.duration > distance || 5.0 <= distance) {
                        node.element.style.display = 'none';
                        return;
                    }

                    node.element.style.removeProperty('display');
                    const theta = -Math.PI * 2.0 * node.note.midi / 12.0;
                    const x = scale * (distance + 0.5 * node.note.duration) * Math.cos(theta);
                    const y = scale * (distance + 0.5 * node.note.duration) * Math.sin(theta);
                    node.element.style.transform = `translate(${x}px, ${y}px)`;
                    node.element.classList.toggle('activated', 0 <= (currentTime - node.note.time));// && (currentTime - node.note.time) < node.note.duration);
                });
            });
        }
        requestAnimationFrame(animationLoop);
    });
});

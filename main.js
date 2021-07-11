import { initButtonGroup } from './modules/component.js';
import { scoreFromFile, Vocal } from './modules/tune.js';
import { MelodyPatternRenderer } from './modules/melodyPattern.js';


window.addEventListener('load', e => {
    const app = document.getElementById('app');
    const melodyPanel = document.getElementById('melody-panel');
    /** @type {HTMLCanvasElement} */
    const melodyPanelCanvas = document.getElementById('melody-panel-canvas');
    const midiFileDrop = document.getElementById('midi-file-drop');
    const fileNameDiv = document.getElementById('file-name-div');
    const homeButton = document.getElementById('home-button');
    const playButton = document.getElementById('play-button');
    const keyDiv = document.getElementById('key-div');
    const upKeyButton = document.getElementById('up-key-button');
    const downKeyButton = document.getElementById('down-key-button');
    const magnificationDiv = document.getElementById('magnification-div');
    const upMagnificationButton = document.getElementById('up-magnification-button');
    const downMagnificationButton = document.getElementById('down-magnification-button');
    const changeCircleModeButtonGroup = document.getElementById('change-circle-mode-button-group');
    const changeRenderingModeButtonGroup = document.getElementById('change-rendering-mode-button-group');

    const vocal = new Vocal();
    try {
        const renderer = new MelodyPatternRenderer(vocal, melodyPanelCanvas);

        function updateNoteAppearingTime() {
            switch (renderer.noteDirection) {
                case 'inward':
                    renderer.noteAppearingTime = -600 / Math.max(1.0, renderer.noteMagnification);
                    break;
                case 'outward':
                    renderer.noteAppearingTime = -350 / Math.max(1.0, renderer.noteMagnification);
                    break;
            }
        }

        function updateKey() {
            const key = vocal.key;
            if (key > 0) {
                keyDiv.textContent = '+' + key;
            } else if (key == 0) {
                keyDiv.textContent = '±' + key;
            } else if (key < 0) {
                keyDiv.textContent = '' + key;
            }
        }
        function updateToneMagnification() {
            magnificationDiv.textContent = renderer.noteMagnification + '%';
        }

        async function loadFile(file) {
            const score = await scoreFromFile(file);
            fileNameDiv.textContent = score.name;

            vocal.apply(score);
            renderer.apply(score);

            updateKey();
            playButton.classList.toggle('playing', false);
        }

        app.addEventListener('dragover', e => {
            e.preventDefault();
        });
        app.addEventListener('drop', async e => {
            e.preventDefault();

            const files = e.dataTransfer.files;
            if (files.length == 0) return;

            const file = files[0];
            await loadFile(file);
        });
        midiFileDrop.addEventListener('change', async e => {
            const files = e.target.files;
            if (files.length == 0) return;

            const file = files[0];
            await loadFile(file);
        });
        homeButton.addEventListener('click', async e => {
            await vocal.returnToTop();
        });
        playButton.addEventListener('click', async e => {
            await vocal.togglePlaying();
            playButton.classList.toggle('playing');
        });

        downKeyButton.addEventListener('click', e => {
            --vocal.key;
            updateKey();
        });
        upKeyButton.addEventListener('click', e => {
            ++vocal.key;
            updateKey();
        });
        updateKey();

        melodyPanelCanvas.addEventListener('wheel', e => {
            e.preventDefault();

            if (e.deltaY > 0) {
                if (renderer.noteMagnification > 37) {
                    renderer.noteMagnification -= 25;
                }
            } else if (e.deltaY < 0) {
                renderer.noteMagnification += 25;
            }
            updateToneMagnification();
            updateNoteAppearingTime();
        }, { passive: false });
        downMagnificationButton.addEventListener('click', e => {
            if (renderer.noteMagnification > 37) {
                renderer.noteMagnification -= 25;
            }
            updateToneMagnification();
            updateNoteAppearingTime();
        });
        upMagnificationButton.addEventListener('click', e => {
            renderer.noteMagnification += 25;
            updateToneMagnification();
            updateNoteAppearingTime();
        });
        updateToneMagnification();
        updateNoteAppearingTime();

        initButtonGroup(changeCircleModeButtonGroup, value => {
            switch (value) {
                case '12 semitones':
                    renderer.circleNumerator = 1;
                    renderer.circleDenominator = 12;
                    break;
                case '24 semitones':
                    renderer.circleNumerator = 1;
                    renderer.circleDenominator = 24;
                    break;
                case '48 semitones':
                    renderer.circleNumerator = 1;
                    renderer.circleDenominator = 48;
                    break;
                case '96 semitones':
                    renderer.circleNumerator = 1;
                    renderer.circleDenominator = 96;
                    break;
                case '192 semitones':
                    renderer.circleNumerator = 1;
                    renderer.circleDenominator = 192;
                    break;
                case 'circle of fifths':
                    renderer.circleNumerator = 7;
                    renderer.circleDenominator = 12;
                    break;
            }
        });
        initButtonGroup(changeRenderingModeButtonGroup, value => {
            renderer.noteDirection = value;
            updateNoteAppearingTime();
        });

        requestAnimationFrame(function renderingLoop() {
            renderer.render();
            requestAnimationFrame(renderingLoop);
        });
    } catch (e) {
        melodyPanel.textContent = "WebGLがサポートされていません。";
        throw e;
    }
});

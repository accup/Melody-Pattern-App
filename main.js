// 頂点シェーダ（頂点）
const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aVertexTextureCoord;

    uniform mat4 uMatrix;
    uniform vec4 uColor;

    varying lowp vec4 vColor;
    varying lowp vec2 vTextureCoord;

    void main() {
        gl_Position = uMatrix * aVertexPosition;
        vColor = uColor;
        vTextureCoord = aVertexTextureCoord;
    }
`;

// フラグメントシェーダ（色）
const fsSource = `
    varying lowp vec4 vColor;
    varying lowp vec2 vTextureCoord;

    void main() {
        if (distance(vTextureCoord, vec2(0.5, 0.5)) <= 0.5) {
            gl_FragColor = vColor;
        } else {
            discard;
        }
    }
`;

function orthoTranslateScaleMatrix(sx, sy, sz, dx, dy, dz, vw, vh) {
    const matrix = new Float32Array(16);
    matrix[0] = 2 * sx / vw; // 11
    matrix[5] = 2 * sy / vh; // 22
    matrix[10] = -sz;        // 33
    matrix[12] = 2 * dx / vw; // 14
    matrix[13] = 2 * dy / vh; // 24
    matrix[14] = -dz;        // 34
    matrix[15] = 1;          // 44
    return matrix;
}

/**
 * 
 * @param {WebGLRenderingContext} gl
 * @param {number} type
 * @param {string} source
 * @returns {WebGLShader?}
 */
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);

    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}


/**
 * @param {WebGLRenderingContext} gl
 * @param {string} vsSource
 * @param {string} fsSource
 * @returns {WebGLProgram?}
 */
function initShaderProgram(gl, vsSource, fsSource) {
    // 頂点シェーダ
    const vShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    if (vShader === null) {
        return null;
    }
    // フラグメントシェーダ
    const fShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (fShader === null) {
        gl.deleteShader(fShader);
        return null;
    }

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vShader);
    gl.attachShader(shaderProgram, fShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        gl.deleteShader(vShader);
        gl.deleteShader(fShader);
        return null;
    }

    return shaderProgram;
}


/**
 * 実装依存なWebGLの初期処理
 * @param {HTMLCanvasElement} canvas
 * @returns {{gl: WebGLRenderingContext, shader: WebGLProgram}?}
 */
function initWebGL(canvas) {
    const gl = canvas.getContext('webgl');
    if (gl === null) {
        return null;
    }

    // シェーダを構築
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    if (shaderProgram === null) {
        gl.d
        return null;
    }

    return {
        gl: gl,
        shader: shaderProgram,
    };
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


const deactivatedColor = [0.5, 0.5, 0.5, 0.1];
const trackColors = [
    [0.5, 1.0, 0.5, 0.2],
    [0.5, 0.5, 1.0, 0.2],
    [1.0, 0.5, 0.5, 0.2],
    [0.5, 1.0, 1.0, 0.2],
    [0.8, 0.5, 0.5, 0.2],
    [1.0, 0.5, 1.0, 0.2],
    [1.0, 1.0, 0.5, 0.2],
];


window.addEventListener('load', e => {
    const app = document.getElementById('app');
    const melodyPanel = document.getElementById('melody-panel');
    /** @type {HTMLCanvasElement} */
    const melodyPanelCanvas = document.getElementById('melody-panel-canvas');
    const midiFileDrop = document.getElementById('midi-file-drop');
    const fileNameLabel = document.getElementById('file-name-label');
    const playButton = document.getElementById('play-button');
    const changeCircleModeButtonGroup = document.getElementById('change-circle-mode-button-group');

    let midi = null;
    let duration = 1.0;
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

                const notes = Array.from(track.notes);
                notes.sort((a, b) => a.time - b.time);

                tracks.push({
                    channel: track.channel,
                    volume: volume,
                    synth: synth,
                    part: part,
                    notes: notes,
                    offsets: {
                        off: 0,
                        on: 0,
                        active: 0,
                    },
                });
            });

            duration = Math.max(1.0, midi.duration);

            // Initialization
            function init() {
                tracks.forEach(track => {
                    track.offsets.off = 0;
                    track.offsets.on = 0;
                });
            }
            Tone.Transport.schedule(init, 0);
            // Infinite Loop
            function replay() {
                Tone.Transport.seconds = 0.0;
            }
            Tone.Transport.schedule(replay, duration);
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
    playButton.addEventListener('click', async e => {
        await Tone.start();
        if (Tone.Transport.state !== 'stopped') {
            Tone.Transport.stop();
        }
        Tone.Transport.start();
    });

    initButtonGroup(changeCircleModeButtonGroup, value => {
        state.mode = value;
    });

    const glinfo = initWebGL(melodyPanelCanvas);
    if (glinfo === null) {
        melodyPanel.textContent = "WebGLがサポートされていません。";
    } else {
        const gl = glinfo.gl;

        function resizeCanvas() {
            gl.canvas.width = gl.canvas.clientWidth;
            gl.canvas.height = gl.canvas.clientHeight;
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        }
        resizeCanvas();

        // ウィンドウサイズに合わせたキャンバスのリサイズ
        let resizeTimerId = null;
        window.addEventListener('resize', e => {
            if (resizeTimerId !== null) {
                clearTimeout(resizeTimerId);
            }
            resizeTimerId = setTimeout(() => {
                resizeCanvas();
                resizeTimerId = null;
            }, 50);
        });

        // アルファブレンドを有効化
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        // 塗りつぶし色を黒に設定
        gl.clearColor(0.0, 0.0, 0.0, 1.0);

        const matrixUniform = gl.getUniformLocation(glinfo.shader, 'uMatrix');
        const colorUniform = gl.getUniformLocation(glinfo.shader, 'uColor');
        const vertexPositionAttribute = gl.getAttribLocation(glinfo.shader, 'aVertexPosition');
        const vertexTextureCoordAttribute = gl.getAttribLocation(glinfo.shader, 'aVertexTextureCoord');

        // 頂点位置バッファの設定
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                -0.5, 0.5, 0.0, 1.0,
                0.5, 0.5, 0.0, 1.0,
                -0.5, -0.5, 0.0, 1.0,
                0.5, -0.5, 0.0, 1.0,
            ]),
            gl.STATIC_DRAW,
        );
        gl.vertexAttribPointer(
            vertexPositionAttribute,
            4, // a number of float values per vertex position
            gl.FLOAT, false, 0, 0)
        gl.enableVertexAttribArray(vertexPositionAttribute);

        // 頂点テクスチャ位置の設定
        const textureCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                0.0, 1.0,
                1.0, 1.0,
                0.0, 0.0,
                1.0, 0.0,
            ]),
            gl.STATIC_DRAW,
        );
        gl.vertexAttribPointer(
            vertexTextureCoordAttribute,
            2, // a number of float values per vertex texture coord
            gl.FLOAT, false, 0, 0)
        gl.enableVertexAttribArray(vertexTextureCoordAttribute);

        // シェーダの設定
        gl.useProgram(glinfo.shader);

        // アニメーションループ
        requestAnimationFrame(function animationLoop() {
            const width = gl.canvas.width;
            const height = gl.canvas.height;

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

            // 画面を黒に塗りつぶし
            gl.clear(gl.COLOR_BUFFER_BIT);

            // 必要なノートの描画
            const trackLength = tracks.length;
            for (let trackIndex = 0; trackIndex < trackLength; ++trackIndex) {
                const track = tracks[trackIndex];
                const noteLength = track.notes.length;
                for (; track.offsets.off < noteLength; ++track.offsets.off) {
                    const note = track.notes[track.offsets.off];
                    if (currentTime < note.time + note.duration) break;
                }
                track.offsets.active = track.offsets.off;
                for (; track.offsets.active < noteLength; ++track.offsets.active) {
                    const note = track.notes[track.offsets.active];
                    if (currentTime < note.time) break;
                }
                track.offsets.on = track.offsets.active;
                for (; track.offsets.on < noteLength; ++track.offsets.on) {
                    const note = track.notes[track.offsets.on];
                    if (currentTime < note.time - 3) break;
                }

                // 色の設定（非アクティブ）
                gl.uniform4fv(
                    colorUniform,
                    deactivatedColor,
                );
                for (let noteIndex = track.offsets.active; noteIndex < track.offsets.on; ++noteIndex) {
                    const note = track.notes[noteIndex];
                    const offset = currentTime - note.time;
                    const theta = 2 * Math.PI * note.midi * circleFactor / 12;
                    const dx = scale * (-offset + 0.5 * note.duration) * Math.cos(theta);
                    const dy = scale * (-offset + 0.5 * note.duration) * -Math.sin(theta);
                    const sw = scale * note.duration;
                    const sh = scale * note.duration;

                    if (offset < note.duration) {
                        // ワールド兼射影行列の設定
                        gl.uniformMatrix4fv(
                            matrixUniform, false,
                            orthoTranslateScaleMatrix(
                                sw, sh, 1,
                                dx, dy, 0,
                                width, height,
                            ),
                        );
                        gl.drawArrays(
                            gl.TRIANGLE_STRIP,
                            0,  // vertex offset
                            4,  // a number of vertices
                        );
                    }
                }

                // 色の設定（アクティブ）
                gl.uniform4fv(
                    colorUniform,
                    trackColors[trackIndex % trackColors.length],
                );
                for (let noteIndex = track.offsets.active - 1; noteIndex >= track.offsets.off; --noteIndex) {
                    const note = track.notes[noteIndex];
                    const offset = currentTime - note.time;
                    const theta = 2 * Math.PI * note.midi * circleFactor / 12;
                    const dx = scale * (-offset + 0.5 * note.duration) * Math.cos(theta);
                    const dy = scale * (-offset + 0.5 * note.duration) * -Math.sin(theta);
                    const sw = scale * note.duration;
                    const sh = scale * note.duration;

                    if (offset < note.duration) {
                        // ワールド兼射影行列の設定
                        gl.uniformMatrix4fv(
                            matrixUniform, false,
                            orthoTranslateScaleMatrix(
                                sw, sh, 1,
                                dx, dy, 0,
                                width, height,
                            ),
                        );
                        gl.drawArrays(
                            gl.TRIANGLE_STRIP,
                            0,  // vertex offset
                            4,  // a number of vertices
                        );
                    }
                }
            }

            requestAnimationFrame(animationLoop);
        });
    }
});

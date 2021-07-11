import { Score, Vocal } from './tune.js';

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
        gl_FragColor = vColor * step(distance(vTextureCoord, vec2(0.5, 0.5)), 0.5);
    }
`;


const orthoMatrix = new Float32Array(16);

function orthoTranslateScaleMatrix(sx, sy, sz, dx, dy, dz, vw, vh) {
    orthoMatrix[0] = 2 * sx / vw;  // 11
    orthoMatrix[5] = 2 * sy / vh;  // 22
    orthoMatrix[10] = -sz;         // 33
    orthoMatrix[12] = 2 * dx / vw; // 14
    orthoMatrix[13] = 2 * dy / vh; // 24
    orthoMatrix[14] = -dz;         // 34
    orthoMatrix[15] = 1;           // 44
    return orthoMatrix;
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


export class MelodyPatternRenderer {
    /**
     * @param {Vocal} vocal 
     * @param {HTMLCanvasElement} canvas 
     */
    constructor(vocal, canvas) {
        this._vocal = vocal;
        this._score = null;

        /**
         * 位相係数分子
         */
        this.circleNumerator = 7;
        /**
         * 位相係数分母
         */
        this.circleDenominator = 12;
        /**
         * ノート拡大率（パーセント）
         */
        this.noteMagnification = 100;
        // /**
        //  * ノート発音相対発生時刻
        //  */
        // this.noteAppearingTime = -3.0;
        /**
         * パーカッション拡大率（発音時・パーセント）
         */
        this.percussionAttackingMagnification = 50;
        /**
         * パーカッション拡大率（発生時・パーセント）
         */
        this.percussionAppearingMagnification = 20;
        /**
         * パーカッション発音相対発生時刻
         */
        this.percussionAppearingTime = -0.8;
        /**
         * パーカッション発音相対消滅時刻
         */
        this.percussionReleasingTime = 0.0625;
        /**
         * ノート方向
         */
        this.noteDirection = 'inward';
        /**
         * 上部マージン
         */
        this.marginTop = 0;
        /**
         * 下部マージン
         */
        this.marginBottom = 0;

        /**
         * ノート・パーカッションの色（発生時）
         */
        this.appearingColor = new Float32Array([0.7, 0.7, 0.7, 0.15]);
        /**
         * ノート・パーカッションの色配列（発音時）
         */
        this.attackingColors = [
            new Float32Array([0.3, 0.9, 0.3, 0.6]),
            new Float32Array([0.3, 0.3, 0.9, 0.6]),
            new Float32Array([0.9, 0.3, 0.3, 0.6]),
            new Float32Array([0.3, 0.9, 0.9, 0.6]),
            new Float32Array([0.9, 0.3, 0.0, 0.6]),
            new Float32Array([0.9, 0.3, 0.9, 0.6]),
            new Float32Array([0.9, 0.9, 0.3, 0.6]),
        ];

        /**
         * ノート描画オフセット
         */
        this._noteOffsets = {
            released: 0,
            attacked: 0,
            appeared: 0,
        };
        this._lastNoteTime = 0;
        /**
         * パーカッション描画オフセット
         */
        this._percussionOffsets = {
            released: 0,
            attacked: 0,
            appeared: 0,
        };
        this._lastPercussionTime = 0;

        this._initGL(canvas);
    }

    /**
     * 
     * @param {HTMLCanvasElement} canvas 
     */
    _initGL(canvas) {
        const glinfo = initWebGL(canvas);
        if (glinfo === null) {
            throw new Error("Browser does not support WebGL.");
        }

        const gl = glinfo.gl;
        const shader = glinfo.shader;

        // アルファブレンドを有効化
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        // 塗りつぶし色を設定
        gl.clearColor(0.0, 0.0, 0.0, 1.0);

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
            gl.FLOAT, false, 0, 0);
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
            gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vertexTextureCoordAttribute);

        gl.useProgram(shader);

        this._gl = gl;
        this._matrixUniform = gl.getUniformLocation(glinfo.shader, 'uMatrix');
        this._colorUniform = gl.getUniformLocation(glinfo.shader, 'uColor');
        this.resizeCanvas();

        // ウィンドウサイズに合わせたキャンバスのリサイズ
        this.resizeTimerId = null;
        window.addEventListener('resize', e => {
            if (this.resizeTimerId !== null) {
                clearTimeout(this.resizeTimerId);
            }
            this.resizeTimerId = setTimeout(() => {
                this.resizeCanvas();
                this.resizeTimerId = null;
            }, 50);
        });
    }

    resizeCanvas() {
        this._gl.canvas.width = this._gl.canvas.clientWidth;
        this._gl.canvas.height = this._gl.canvas.clientHeight;
        this._gl.viewport(0, 0, this._gl.canvas.width, this._gl.canvas.height);
    }

    /**
     * 演奏情報を適用する
     * @param {Score} score 
     */
    apply(score) {
        this._score = score;

        this.resetOffsets();
    }

    resetOffsets() {
        this.resetNoteOffsets();
        this.resetPercussionOffsets();
    }

    resetNoteOffsets() {
        this._noteOffsets.released = 0;
        this._noteOffsets.attacked = 0;
        this._noteOffsets.appeared = 0;
        this._lastNoteTime = 0;
    }

    resetPercussionOffsets() {
        this._percussionOffsets.released = 0;
        this._percussionOffsets.attacked = 0;
        this._percussionOffsets.appeared = 0;
        this._lastPercussionTime = 0;
    }

    /**
     * 
     * @param {number} currentTime
     * @param {number} appearingTime 
     */
    updateNoteOffsets(currentTime, appearingTime) {
        const offsets = this._noteOffsets;
        const events = this._score.notes;
        const length = events.length;

        if (currentTime < this._lastNoteTime) {
            this.resetNoteOffsets();
        }

        for (; offsets.released < length; ++offsets.released) {
            const event = events[offsets.released];
            if (currentTime < event.time + event.duration) break;
        }

        offsets.attacked = Math.max(offsets.attacked, offsets.released);
        for (; offsets.attacked < length; ++offsets.attacked) {
            const event = events[offsets.attacked];
            if (currentTime < event.time) break;
        }

        offsets.appeared = Math.max(offsets.appeared, offsets.attacked);
        for (; offsets.appeared < length; ++offsets.appeared) {
            const event = events[offsets.appeared];
            if (currentTime < event.time + appearingTime) break;
        }

        this._lastNoteTime = currentTime;
    }

    /**
     * 
     * @param {number} currentTime 
     * @param {number} appearingTime 
     */
    updatePercussionOffsets(currentTime, appearingTime) {
        const offsets = this._percussionOffsets;
        const events = this._score.percussions;
        const length = events.length;
        const releasingTime = this.percussionReleasingTime;

        if (currentTime < this._lastPercussionTime) {
            this.resetPercussionOffsets();
        }

        for (; offsets.released < length; ++offsets.released) {
            const event = events[offsets.released];
            if (currentTime < event.time + releasingTime) break;
        }

        offsets.attacked = Math.max(offsets.attacked, offsets.released);
        for (; offsets.attacked < length; ++offsets.attacked) {
            const event = events[offsets.attacked];
            if (currentTime < event.time) break;
        }

        offsets.appeared = Math.max(offsets.appeared, offsets.attacked);
        for (; offsets.appeared < length; ++offsets.appeared) {
            const event = events[offsets.appeared];
            if (currentTime < event.time + appearingTime) break;
        }

        this._lastPercussionTime = currentTime;
    }

    /**
     * 
     * @param {number} currentTime 
     * @param {number} time 
     * @param {number} duration 
     */
    _calculateInwardViewOffset(currentTime, time, duration) {
        return (time - currentTime) + 0.5 * duration;
    }

    /**
     * 
     * @param {number} currentTime 
     * @param {number} appearingTime 
     * @param {number} time 
     * @param {number} duration 
     */
    _calculateOutwardViewOffset(currentTime, appearingTime, time, duration) {
        return -((time + appearingTime - currentTime) + 0.5 * duration);
    }

    /**
     * 位相を計算する
     * @param {number} midi 
     */
    _calculateTheta(midi) {
        return 2 * Math.PI * (midi + this._vocal.key - 72) * this.circleNumerator / this.circleDenominator;
    }

    render() {
        if (this._gl == null) {
            return;
        }
        if (this._score == null) {
            return;
        }

        const gl = this._gl;
        const colorUniform = this._colorUniform;
        const matrixUniform = this._matrixUniform;
        const appearingColor = this.appearingColor;
        const attackingColors = this.attackingColors;

        const noteOffsets = this._noteOffsets;
        const percussionOffsets = this._percussionOffsets;
        const score = this._score;

        const width = gl.canvas.width;
        const height = gl.canvas.height;
        const reservedHeight = height - this.marginTop - this.marginBottom;
        const offsetY = 0.5 * (this.marginBottom - this.marginTop);

        const currentTime = this._vocal.currentTime;
        const currentMeasures = this._score.ticksToFixedMeasures(this._score.secondsToTicks(currentTime));

        const noteMagnification = this.noteMagnification;
        const percussionX = 0.05 * width;
        const percussionY = 0.45 * reservedHeight;
        const percussionW = 0.4 * width;
        const percussionAppearingMagnification = this.percussionAppearingMagnification;
        const percussionAttackingMagnification = this.percussionAttackingMagnification;
        const percussionReleasingTime = this.percussionReleasingTime;

        const circleTime = 3.0 / Math.max(0.01, noteMagnification / 100);
        const unitSize = 0.8 * Math.min(width, reservedHeight) / circleTime;
        let noteAppearingTime;
        switch (this.noteDirection) {
            case 'inward':
                noteAppearingTime = -circleTime * 6 / 7;
                break;
            case 'outward':
                noteAppearingTime = -circleTime * 0.5;
                break;
        }
        this.updateNoteOffsets(currentTime, noteAppearingTime);
        this.updatePercussionOffsets(currentTime, this.percussionAppearingTime);

        let calculateViewOffset;
        switch (this.noteDirection) {
            case 'inward':
                calculateViewOffset = this._calculateInwardViewOffset.bind(this, currentTime);
                break;
            case 'outward':
                calculateViewOffset = this._calculateOutwardViewOffset.bind(this, currentTime, noteAppearingTime);
                break;
        }

        // 画面を塗りつぶし
        gl.clear(gl.COLOR_BUFFER_BIT);

        // 発生時ノートの描画
        // 色の設定（発生時）
        gl.uniform4fv(colorUniform, appearingColor);
        for (let noteIndex = noteOffsets.attacked; noteIndex < noteOffsets.appeared; ++noteIndex) {
            const note = score.notes[noteIndex];
            const offset = currentTime - note.time;
            const viewOffset = calculateViewOffset(note.time, note.duration)
            const theta = this._calculateTheta(note.midi);
            const dx = unitSize * viewOffset * Math.cos(theta);
            const dy = unitSize * viewOffset * Math.sin(theta);
            const sw = unitSize * note.duration;
            const sh = unitSize * note.duration;

            if (offset < note.duration) {
                // ワールド兼射影行列の設定
                gl.uniformMatrix4fv(
                    matrixUniform, false,
                    orthoTranslateScaleMatrix(
                        sw, sh, 1,
                        dx, offsetY + dy, 0,
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
        // 発音時ノートの描画
        for (let noteIndex = noteOffsets.released; noteIndex < noteOffsets.attacked; ++noteIndex) {
            const note = score.notes[noteIndex];
            const offset = currentTime - note.time;
            const viewOffset = calculateViewOffset(note.time, note.duration)
            const theta = this._calculateTheta(note.midi);
            const dx = unitSize * viewOffset * Math.cos(theta);
            const dy = unitSize * viewOffset * Math.sin(theta);
            const sw = unitSize * note.duration;
            const sh = unitSize * note.duration;

            if (offset < note.duration) {
                // 色の設定（発音時）
                gl.uniform4fv(colorUniform, attackingColors[note.trackIndex % attackingColors.length]);
                // ワールド兼射影行列の設定
                gl.uniformMatrix4fv(
                    matrixUniform, false,
                    orthoTranslateScaleMatrix(
                        sw, sh, 1,
                        dx, offsetY + dy, 0,
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

        // パーカッションの現在位置の描画
        gl.uniform4fv(colorUniform, appearingColor);
        {

            const theta = currentMeasures % 1.0;
            const dx = percussionX + percussionW * theta;
            const dy = percussionY;
            const sw = percussionAppearingMagnification;
            const sh = percussionAppearingMagnification;

            // ワールド兼射影行列の設定
            gl.uniformMatrix4fv(
                matrixUniform, false,
                orthoTranslateScaleMatrix(
                    sw, sh, 1,
                    dx, offsetY + dy, 0,
                    width, height,
                ),
            );
            gl.drawArrays(
                gl.TRIANGLE_STRIP,
                0,  // vertex offset
                4,  // a number of vertices
            );
        }

        // 発生時パーカッションの描画
        for (let percussionIndex = percussionOffsets.appeared - 1; percussionIndex >= percussionOffsets.attacked; --percussionIndex) {
            const percussion = score.percussions[percussionIndex];
            const offset = currentMeasures - percussion.measures;
            // 現在の時刻位置に描画
            const theta = percussion.measures % 1.0;
            const dx = percussionX + percussionW * theta;
            const dy = percussionY;
            const sw = percussionAppearingMagnification;
            const sh = percussionAppearingMagnification;

            if (offset < percussionReleasingTime) {
                // ワールド兼射影行列の設定
                gl.uniformMatrix4fv(
                    matrixUniform, false,
                    orthoTranslateScaleMatrix(
                        sw, sh, 1,
                        dx, offsetY + dy, 0,
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
        // 発音時パーカッションの描画
        for (let percussionIndex = percussionOffsets.attacked - 1; percussionIndex >= percussionOffsets.released; --percussionIndex) {
            const percussion = score.percussions[percussionIndex];
            const offset = currentMeasures - percussion.measures;
            // 現在の時刻位置に描画
            const theta = percussion.measures % 1.0;
            const dx = percussionX + percussionW * theta;
            const dy = percussionY;
            const sw = percussionAttackingMagnification * percussion.velocity;
            const sh = percussionAttackingMagnification * percussion.velocity;

            if (offset < percussionReleasingTime) {
                // 色の設定（発音時）
                gl.uniform4fv(colorUniform, attackingColors[percussion.trackIndex % attackingColors.length]);
                // ワールド兼射影行列の設定
                gl.uniformMatrix4fv(
                    matrixUniform, false,
                    orthoTranslateScaleMatrix(
                        sw, sh, 1,
                        dx, offsetY + dy, 0,
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
};
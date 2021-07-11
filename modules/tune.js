import { binarySearch } from "./binarySearch.js";

/**
 * @typedef Header
 * @property {string} name
 * @property {TempoEvent[]} tempos
 * @property {TimeSignatureEvent[]} timeSignatures
 * @property {number} PPQ
 */

/**
 * @typedef Note
 * @property {number} midi
 * @property {number} time
 * @property {number} ticks
 * @property {string} name
 * @property {string} pitch
 * @property {number} octave
 * @property {number} velocity
 * @property {number} duration
 */

/**
 * @typedef ControlChange
 * @property {number} number
 * @property {number} ticks
 * @property {number} time
 * @property {number} value
 */

/**
 * @typedef Instrument
 * @property {number} number
 * @property {string} family
 * @property {string} name
 * @property {boolean} percussion
 */

/**
 * @typedef Track
 * @property {string} name
 * @property {number} channel
 * @property {Note[]} notes
 * @property {Object.<string, ControlChange>} controlChanges
 * @property {Instrument} instrument
 */

/**
 * @typedef Midi
 * @property {Header} header
 * @property {number} duration
 * @property {Track[]} tracks
 */


/**
 * 演奏情報を保持するクラス
 */
export class Score {
    /**
     * @param {string} name 
     * @param {Midi} midi 
     */
    constructor(name, midi) {
        this.name = name;

        this.header = midi.header;
        this.duration = midi.duration;
        this.tracks = midi.tracks.map((track, trackIndex) => {
            const newTrack = {
                name: track.name,
                instrument: track.instrument,
                channel: track.channel,
                notes: track.notes.map(note => ({
                    trackIndex: trackIndex,
                    midi: note.midi,
                    time: note.time,
                    ticks: note.ticks,
                    name: note.name,
                    pitch: note.pitch,
                    octave: note.octave,
                    velocity: note.velocity,
                    duration: note.duration,
                    measures: this.ticksToFixedMeasures(note.ticks),
                })),
            };
            if (newTrack.instrument.percussion) {
                newTrack.notes.forEach(note => {
                    note.duration = 0.1;
                });
            }
            return newTrack;
        });

        this.notes = this.tracks.filter(track => !track.instrument.percussion).flatMap(track => track.notes);
        this.percussions = this.tracks.filter(track => track.instrument.percussion).flatMap(track => track.notes);

        this.notes.sort((a, b) => (a.time === b.time) ? (b.duration - a.duration) : (a.time - b.time));
        this.percussions.sort((a, b) => (a.time === b.time) ? (b.duration - a.duration) : (a.time - b.time));
    }

    /**
     * 
     * @param {number} seconds 
     * @returns {number}
     */
    secondsToTicks(seconds) {
        return this.header.secondsToTicks(seconds);
    }

    /**
     * 拍子記号を基点として不足分の小節位置を繰り上げる
     * @param {number} ticks
     * @returns {number}
     */
    ticksToFixedMeasures(ticks) {
        const measures = this.header.ticksToMeasures(ticks);
        if (this.header.timeSignatures.length === 0) return measures;

        let index = binarySearch(this.header.timeSignatures, ticks, event => event.ticks);
        const event = this.header.timeSignatures[index];
        const lackedMeasures = 1.0 - event.measures % 1.0;

        return measures + lackedMeasures;
    }
};


/**
 * 
 * @param {File} file 
 */
export async function scoreFromFile(file) {
    const buffer = await file.arrayBuffer();
    return new Score(file.name, new Midi(buffer))
}


/**
 * 演奏を制御するクラス
 */
export class Vocal {
    constructor() {
        this._toneVolume = new Tone.Volume(-12).toDestination();
        this._percussionVolume = new Tone.Volume(-6).toDestination();

        this._toneOutput = this._toneVolume;
        this._percussionOutput = this._percussionVolume;

        this._noteSynths = [];
        this._percussionSynths = [];
        this._activeNoteSynthCount = 0;
        this._activePercussionSynthCount = 0;

        this._tracks = [];
        this.key = 0.0;
    }

    /**
     * キーの変化量（セミトーン単位）
     */
    get key() {
        return this._key;
    }
    /**
     * @param {number} value
     */
    set key(value) {
        this._key = value;

        this._updateKey();
    }

    _updateKey() {
        this._tracks.forEach(track => {
            track.synth.set({ detune: this.key * 100 });
        });
    }

    _deactivateAllSynths() {
        this._activeNoteSynthCount = 0;
        this._activePercussionSynthCount = 0;
    }

    _activateNoteSynth() {
        const synthIndex = this._activeNoteSynthCount;
        ++this._activeNoteSynthCount;

        if (synthIndex < this._noteSynths.length) {
            return this._noteSynths[synthIndex];
        } else {
            const synth = new Tone.PolySynth({
                maxPolyphony: 80,
                voice: Tone.Synth,
                options: {
                    envelope: {
                        attack: 0.02,
                        decay: 0.1,
                        sustain: 0.3,
                        release: 0.8,
                    },
                },
            });
            synth.connect(this._toneVolume);

            this._noteSynths.push(synth);
            return synth;
        }
    }

    _activatePercussionSynth() {
        const synthIndex = this._activePercussionSynthCount;
        ++this._activePercussionSynthCount;

        if (synthIndex < this._percussionSynths.length) {
            return this._percussionSynths[synthIndex];
        } else {
            const synth = new Tone.PolySynth({
                maxPolyphony: 30,
                voice: Tone.Synth,
                options: {
                    envelope: {
                        attack: 0.01,
                        decay: 0.07,
                        sustain: 0.3,
                        release: 0.3,
                    },
                },
            });
            synth.connect(this._percussionVolume);

            this._percussionSynths.push(synth);
            return synth;
        }
    }

    /**
     * 演奏情報を適用する
     * 
     * @param {Score} score 演奏情報
     */
    async apply(score) {
        await Tone.start();

        Tone.Transport.stop();
        Tone.Transport.cancel();

        this._tracks.forEach(track => {
            track.part.stop();
            track.part.cancel();
            track.part.dispose();
        });

        this._deactivateAllSynths();

        this._tracks = score.tracks.map(track => {
            let synth;
            if (track.instrument.percussion) {
                synth = this._activatePercussionSynth();
            } else {
                synth = this._activateNoteSynth();
            }

            const part = new Tone.Part((time, note) => {
                synth.triggerAttackRelease(
                    note.name,
                    note.duration,
                    time,
                    note.velocity,
                );
            }, track.notes);
            part.start(0);

            return {
                synth: synth,
                part: part,
            };
        });


        const duration = Math.max(1.0, score.duration);
        // Infinite Loop
        Tone.Transport.schedule(() => {
            Tone.Transport.seconds = 0;
        }, duration);

        this._updateKey();
    }

    get playing() {
        return Tone.Transport.state === 'started';
    }

    async togglePlaying() {
        await Tone.start();

        if (this.playing) {
            Tone.Transport.pause();
        } else {
            Tone.Transport.start();
        }
    }

    async returnToTop() {
        await Tone.start();

        if (this.playing) {
            Tone.Transport.stop();
            Tone.Transport.start();
        } else {
            Tone.Transport.stop();
        }
    }

    /**
     * @returns {number}
     */
    get currentTime() {
        return Tone.Transport.seconds;
    }
};

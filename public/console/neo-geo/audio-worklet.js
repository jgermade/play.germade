// AudioWorklet: runs on the audio render thread. Receives interleaved stereo
// float samples from the main thread via postMessage and drains them to the
// output. Since we don't use SharedArrayBuffer, the main thread ships samples
// in chunks; the worklet maintains its own ring buffer here.

class FWPlayer extends AudioWorkletProcessor {
    constructor() {
        super();
        this.size = 1 << 17;          // 131072 floats, ~1.5s stereo
        this.ring = new Float32Array(this.size);
        this.mask = this.size - 1;
        this.write = 0;
        this.read = 0;
        this.port.onmessage = (e) => {
            const d = e.data;
            if (d instanceof Float32Array) {
                for (let i = 0; i < d.length; i++) {
                    this.ring[this.write] = d[i];
                    this.write = (this.write + 1) & this.mask;
                }
            }
        };
    }

    process(inputs, outputs) {
        const out = outputs[0];
        const L = out[0];
        const R = out[1];
        const mask = this.mask;
        let r = this.read;
        const w = this.write;
        for (let i = 0; i < L.length; i++) {
            if (((w - r) & mask) >= 2) {
                L[i] = this.ring[r];
                R[i] = this.ring[(r + 1) & mask];
                r = (r + 2) & mask;
            } else {
                L[i] = 0; R[i] = 0;
            }
        }
        this.read = r;
        // Report fill back to main thread for HUD/pacing
        this.port.postMessage({ fill: (w - r) & mask });
        return true;
    }
}

registerProcessor('fw-player', FWPlayer);

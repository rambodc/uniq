export const SAMPLE_RATE = 24000;
export const VOICE_SOCKET = "wss://api.x.ai/v1/realtime?model=grok-voice-latest";

export const VOICE_INSTRUCTIONS = "You are a friendly assistant for UniqEnergy staff. Speak in short, natural sentences. You only talk. You cannot open pages, look up records, or change anything in the app.";

/** Session settings for a live voice conversation. No tools and no app actions. */
export function sessionUpdate() {
  return {
    type: "session.update",
    session: {
      voice: "eve",
      instructions: VOICE_INSTRUCTIONS,
      reasoning: { effort: "none" },
      turn_detection: { type: "server_vad" },
      audio: {
        input: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
        output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
      },
    },
  };
}

export function floatToPcm16(input: Float32Array) {
  const pcm = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] || 0));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

export function pcm16ToFloat(pcm: Int16Array) {
  const floats = new Float32Array(pcm.length);
  for (let index = 0; index < pcm.length; index += 1) floats[index] = (pcm[index] || 0) / 0x8000;
  return floats;
}

export function downsample(input: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const fraction = position - left;
    const start = input[left] || 0;
    const end = input[Math.min(left + 1, input.length - 1)] || start;
    out[index] = start + (end - start) * fraction;
  }
  return out;
}

export function rmsLevel(pcm: Int16Array) {
  if (!pcm.length) return 0;
  let sum = 0;
  for (let index = 0; index < pcm.length; index += 1) {
    const sample = (pcm[index] || 0) / 0x8000;
    sum += sample * sample;
  }
  return Math.max(0, Math.min(1, Math.sqrt(sum / pcm.length) * 4));
}

export function pcm16ToBase64(pcm: Int16Array) {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index] || 0);
  return btoa(binary);
}

export function base64ToPcm16(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Int16Array(bytes.buffer);
}

export function audioDelta(message: { delta?: unknown; audio?: unknown }) {
  if (typeof message.delta === "string") return message.delta;
  if (typeof message.audio === "string") return message.audio;
  return "";
}

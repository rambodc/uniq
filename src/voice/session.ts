import { voiceChatToken } from "../core/api";
import { SAMPLE_RATE, VOICE_SOCKET, audioDelta, base64ToPcm16, downsample, floatToPcm16, pcm16ToBase64, pcm16ToFloat, rmsLevel, sessionUpdate } from "./pcm";

export const MIC_MESSAGE = "Microphone access was blocked. Allow the microphone and try again.";
export const CONNECT_MESSAGE = "Voice chat could not connect. Try again in a moment.";

export type VoicePhase = "connecting" | "listening" | "speaking";

type Handlers = {
  onPhase: (phase: VoicePhase) => void;
  onLevel: (level: number) => void;
  onError: (message: string) => void;
};

export type VoiceSession = { stop: () => void; setMuted: (muted: boolean) => void };

const WORKLET = `
class UniqVoiceCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("uniq-voice-capture", UniqVoiceCapture);
`;

function micFailed(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  return name === "NotAllowedError" || name === "NotFoundError" || name === "SecurityError" || name === "NotReadableError";
}

export async function connectVoice(handlers: Handlers): Promise<VoiceSession> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (error) {
    throw new Error(micFailed(error) ? MIC_MESSAGE : CONNECT_MESSAGE);
  }

  let token: string;
  try {
    token = (await voiceChatToken()).token;
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error(CONNECT_MESSAGE);
  }

  const context = new AudioContext();
  await context.resume();
  const player = createPlayer(context, handlers);
  let muted = false;
  let closed = false;
  let captureStop = () => {};
  const socket = new WebSocket(VOICE_SOCKET, [`xai-client-secret.${token}`]);

  const stop = () => {
    if (closed) return;
    closed = true;
    captureStop();
    player.stop();
    stream.getTracks().forEach((track) => track.stop());
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    void context.close();
  };

  const sendAudio = (pcm: Int16Array) => {
    if (muted || closed || socket.readyState !== WebSocket.OPEN || pcm.length === 0) return;
    socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio: pcm16ToBase64(pcm) }));
  };

  socket.addEventListener("open", () => {
    if (closed) return;
    socket.send(JSON.stringify(sessionUpdate()));
    startCapture(context, stream, sendAudio).then((stopCapture) => { captureStop = stopCapture; }).catch(() => {
      if (closed) return;
      stop();
      handlers.onError(CONNECT_MESSAGE);
    });
    handlers.onPhase("listening");
  });

  socket.addEventListener("message", (event) => {
    if (closed || typeof event.data !== "string") return;
    let message: { type?: string; delta?: unknown; audio?: unknown };
    try { message = JSON.parse(event.data) as typeof message; } catch { return; }
    const type = message.type || "";
    if (type === "input_audio_buffer.speech_started") {
      player.stop();
      handlers.onPhase("listening");
      return;
    }
    if (type === "response.created" || type === "response.output_audio.delta" || type === "response.audio.delta") {
      handlers.onPhase("speaking");
      const delta = audioDelta(message);
      if (delta) player.play(base64ToPcm16(delta));
      return;
    }
    if (type === "response.done" || type === "response.audio.done" || type === "response.output_audio.done") player.finish();
    if (type === "error") {
      stop();
      handlers.onError(CONNECT_MESSAGE);
    }
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(CONNECT_MESSAGE)), 8000);
      socket.addEventListener("open", () => { window.clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { window.clearTimeout(timer); reject(new Error(CONNECT_MESSAGE)); }, { once: true });
    });
  } catch (error) {
    stop();
    throw error instanceof Error ? error : new Error(CONNECT_MESSAGE);
  }
  socket.addEventListener("close", () => {
    if (closed) return;
    stop();
    handlers.onError(CONNECT_MESSAGE);
  });

  return { stop, setMuted: (value) => { muted = value; } };
}

function createPlayer(context: AudioContext, handlers: Handlers) {
  let sources: AudioBufferSourceNode[] = [];
  let nextTime = 0;
  let responding = false;
  const play = (pcm: Int16Array) => {
    responding = true;
    const buffer = context.createBuffer(1, pcm.length, SAMPLE_RATE);
    buffer.copyToChannel(pcm16ToFloat(pcm), 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const start = Math.max(context.currentTime, nextTime);
    source.start(start);
    nextTime = start + buffer.duration;
    sources.push(source);
    handlers.onLevel(rmsLevel(pcm));
    source.onended = () => {
      sources = sources.filter((item) => item !== source);
      if (!responding && sources.length === 0) handlers.onPhase("listening");
    };
  };
  return {
    play,
    finish() {
      responding = false;
      if (sources.length === 0) handlers.onPhase("listening");
    },
    stop() {
      responding = false;
      for (const source of sources) {
        source.onended = null;
        try { source.stop(); } catch { /* already ended */ }
      }
      sources = [];
      nextTime = 0;
      handlers.onLevel(0);
    },
  };
}

async function startCapture(context: AudioContext, stream: MediaStream, onPcm: (pcm: Int16Array) => void) {
  const source = context.createMediaStreamSource(stream);
  const silent = context.createGain();
  silent.gain.value = 0;
  silent.connect(context.destination);
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(context, "uniq-voice-capture");
    node.port.onmessage = (event: MessageEvent<Float32Array>) => onPcm(floatToPcm16(downsample(event.data, context.sampleRate, SAMPLE_RATE)));
    source.connect(node);
    node.connect(silent);
    return () => { source.disconnect(); node.disconnect(); silent.disconnect(); };
  } catch {
    const processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => onPcm(floatToPcm16(downsample(event.inputBuffer.getChannelData(0), context.sampleRate, SAMPLE_RATE)));
    source.connect(processor);
    processor.connect(silent);
    return () => { source.disconnect(); processor.disconnect(); silent.disconnect(); };
  }
}

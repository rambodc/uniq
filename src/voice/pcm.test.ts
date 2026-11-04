import { describe, expect, it } from "vitest";
import { audioDelta, base64ToPcm16, downsample, floatToPcm16, pcm16ToBase64, pcm16ToFloat, rmsLevel, sessionUpdate } from "./pcm";

describe("voice audio", () => {
  it("keeps the session as speech with no tools", () => {
    const message = sessionUpdate();
    expect(message.session.audio.input.format).toEqual({ type: "audio/pcm", rate: 24000 });
    expect(message.session.audio.output.format).toEqual({ type: "audio/pcm", rate: 24000 });
    expect(message.session.turn_detection.type).toBe("server_vad");
    expect(JSON.stringify(message)).not.toContain("tools");
    expect(message.session.instructions).toMatch(/UniqEnergy staff/);
  });

  it("round-trips 24 kHz PCM through base64", () => {
    const pcm = floatToPcm16(new Float32Array([0, 0.5, -0.5, 1, -1]));
    const decoded = base64ToPcm16(pcm16ToBase64(pcm));
    expect(Array.from(decoded)).toEqual(Array.from(pcm));
    expect(pcm16ToFloat(pcm)[1]).toBeGreaterThan(0.4);
    expect(rmsLevel(pcm)).toBeGreaterThan(0);
    expect(rmsLevel(new Int16Array())).toBe(0);
  });

  it("downsamples microphone audio to 24 kHz", () => {
    const input = new Float32Array(480);
    input[0] = 1;
    expect(downsample(input, 48000, 24000)).toHaveLength(240);
    expect(downsample(input, 24000, 24000)).toBe(input);
  });

  it("reads audio from either realtime delta field", () => {
    expect(audioDelta({ delta: "abc" })).toBe("abc");
    expect(audioDelta({ audio: "xyz" })).toBe("xyz");
    expect(audioDelta({})).toBe("");
  });
});

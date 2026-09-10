export class IdleRotation {
  private lastActivity: number;
  constructor(now: number) {
    this.lastActivity = now;
  }
  pause(now: number) {
    this.lastActivity = now;
  }
  angle(now: number, delta: number, paused: boolean) {
    if (paused) {
      this.pause(now);
      return 0;
    }
    const elapsed = now - this.lastActivity - 5000;
    if (elapsed <= 0) return 0;
    const ramp = Math.min(elapsed / 1000, 1);
    return (
      (Math.PI / 60) *
      Math.min(Math.max(delta, 0), 0.1) *
      ramp *
      ramp *
      (3 - 2 * ramp)
    );
  }
}

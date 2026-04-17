/**
 * Timer and cost tracking utilities.
 */

export class Timer {
  readonly name: string;
  readonly startTime: number;
  private endTime: number | null = null;

  constructor(name: string) {
    this.name = name;
    this.startTime = Date.now();
  }

  stop(): number {
    this.endTime = Date.now();
    return this.endTime - this.startTime;
  }

  get elapsed(): number {
    return (this.endTime ?? Date.now()) - this.startTime;
  }
}

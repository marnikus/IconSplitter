export interface WaitInfo {
  kind: string;
  reason: string;
  next: string;
  endsAt: number;
  attempt?: number;
  of?: number;
  skippable: boolean;
}
export interface PublicWait extends Omit<WaitInfo, "endsAt"> { remainingMs: number }
export interface WaitControl {
  begin(info: WaitInfo): void;
  act(text: string): void;
  end(): void;
  current(): { wait?: PublicWait; activity?: string } | null;
  skip(): boolean;
  takeSkip(): boolean;
}
export function createWaitControl(): WaitControl;

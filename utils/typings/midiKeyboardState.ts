export interface MidiKeyboardState {
  [midi: string]: { pressed?: boolean; pedaled?: boolean };
}

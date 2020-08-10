import * as React from "react";
import {
  getAllMidiNumbersInRange,
  getNaturalKeyWidthRatio,
  getRelativeKeyPosition
} from "@utils";
import { MidiNumbers } from "piano-utils";
import Tone from "tone";
import { ThemeContext } from "@utils/ThemeContext";
import { FunctionComponent, useState, useContext } from "react";
import cn from "@sindresorhus/class-names";
import { MidiKeyboardState } from "@utils/typings/midiKeyboardState";

interface PianoProps {
  min: number;
  max: number;
  onPlay: (midi: number) => void;
  onStop: (midi: number) => void;
  midiKeyboardState: MidiKeyboardState;
  className: string;
  activeInstrumentMidis: number[];
}

const _Piano: FunctionComponent<PianoProps> = ({
  midiKeyboardState,
  onPlay,
  onStop,
  max,
  min,
  className,
  activeInstrumentMidis
}) => {
  const [isMousePressed, setMousePressed] = useState(false);
  const { naturalColor, accidentalColor } = useContext(ThemeContext);

  const onMouseDown = (midi: number) => {
    setMousePressed(true);
    onPlay(midi);
  };

  const onMouseUp = (midi: number) => {
    setMousePressed(false);
    onStop(midi);
  };

  const range = { first: min, last: max };
  const midis = getAllMidiNumbersInRange(range);

  return (
    <div
      className={cn(
        "flex justify-center w-full h-full relative overflow-x-hidden",
        className
      )}
    >
      {midis.map(midi => {
        const { isAccidental } = MidiNumbers.getAttributes(midi);
        const naturalKeyWidth = getNaturalKeyWidthRatio(range) * 100;
        const left = getRelativeKeyPosition(midi, range) * naturalKeyWidth;

        const width = isAccidental ? 0.65 * naturalKeyWidth : naturalKeyWidth;
        const midiState = midiKeyboardState[midi];
        const isActive = !!(
          midiState &&
          (midiState.pressed || midiState.pedaled)
        );
        const style = {
          left: `${left}%`,
          width: `${width}%`,
          ...(isActive
            ? { background: isAccidental ? accidentalColor : naturalColor }
            : {})
        };

        const className = cn({
          "accidental-keys": isAccidental,
          "natural-keys": !isAccidental,
          __active__: isActive,
          bingo: activeInstrumentMidis.includes(midi) && isActive,
          "not-this": activeInstrumentMidis.includes(midi) && !isActive
        });
        return (
          <div
            data-id={midi}
            onMouseDown={() => onMouseDown(midi)}
            onMouseUp={() => onMouseUp(midi)}
            onMouseEnter={isMousePressed ? () => onPlay(midi) : undefined}
            onMouseLeave={() => onStop(midi)}
            className={className}
            key={midi}
            style={style}
          >
            {!isAccidental && (
              <div className="uppercase flex justify-center self-end w-full pb-4 select-none text-sm text-gray-700">
                {Tone.Frequency(midi, "midi").toNote()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const Piano = React.memo(_Piano);

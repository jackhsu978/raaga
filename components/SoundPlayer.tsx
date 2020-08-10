import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { getMidiRange, isWithinRange } from "@utils";
import { getPianoRangeAndShortcuts } from "@utils/keyboard";
import { Visualizer } from "@components/Visualizer";
import { Piano } from "./Piano";
import { Header } from "@components/Header";
import { getInstrumentIdByValue, instruments } from "midi-instruments";
import { VISUALIZER_MODE } from "@enums/visualizerMessages";
import webMidi from "webmidi";
import Tone from "tone";
import {
  PIANO_HEIGHT,
  DEFAULT_THEME,
  getDefaultRange,
  setDefaultRange
} from "@config/piano";
import { IMidiJSON } from "@typings/midi";
import { GlobalHeader } from "@components/GlobalHeader";
import { MidiSettings } from "@components/TrackList";
import { NoteWithIdAndEvent } from "@utils/MidiPlayer/MidiPlayer.utils";
import { Range } from "@utils/typings/Visualizer";
import { Loader } from "@components/Loader";
import { OFFSCREEN_2D_CANVAS_SUPPORT } from "@enums/offscreen2dCanvasSupport";
import { player, PlayerContext } from "@utils/PlayerContext";
import { ThemeContext } from "@utils/ThemeContext";
import { wrap } from "comlink";
import CanvasWorker from "@workers/canvas.worker";
import { controlVisualizer } from "@utils/visualizerControl";
import { MidiKeyboardState } from "@utils/typings/midiKeyboardState";

const dedupeNumbers = (numbers: number[]) => [...new Set(numbers)];

const SoundPlayer: React.FunctionComponent<{
  offScreenCanvasSupport: OFFSCREEN_2D_CANVAS_SUPPORT;
}> = ({ offScreenCanvasSupport }) => {
  const [instrument, setInstrument] = useState(instruments[0].value);
  const [loading, setLoading] = useState(false);
  const [midiKeyboardState, setMidiKeyboardState] = useState<MidiKeyboardState>(
    {}
  );
  const wasPedalingRef = useRef(false);
  const [isPedaling, setIsPedaling] = useState(false);
  const [keyboardRange, setKeyboardRange] = useState<Range>(getDefaultRange());
  const [isPlaying, setPlaying] = useState(false);
  const [mode, setMode] = useState<VISUALIZER_MODE>(VISUALIZER_MODE.WRITE);
  const [midiSettings, setMidiSettings] = useState<MidiSettings>(null);
  const [loadedMidi, setMidi] = useState<IMidiJSON>(null);
  const [midiDevice, setSelectedMidiDevice] = useState(null);
  const [activeInstrumentMidis, setActiveInstrumentMidis] = useState([]);
  const [theme, setTheme] = useState(DEFAULT_THEME);

  const canvasProxyRef = useRef<any>(
    offScreenCanvasSupport === OFFSCREEN_2D_CANVAS_SUPPORT.SUPPORTED
      ? wrap(new CanvasWorker())
      : controlVisualizer
  );

  useEffect(() => {
    player.set2dOffscreenCanvasSupport(offScreenCanvasSupport);
    player.setCanvasProxy(canvasProxyRef.current);
  }, [offScreenCanvasSupport]);

  const changeInstrument = useCallback(
    (_instrument = instrument) => {
      (async () => {
        setLoading(true);
        await player.loadInstruments({
          instrumentIds: [getInstrumentIdByValue(_instrument)]
        });
        setInstrument(_instrument);
        setLoading(false);
      })();
    },
    [player]
  );

  const setRange = useCallback(
    notes => {
      // change piano range.
      const requiredRange = getMidiRange(notes);

      if (
        !isWithinRange(requiredRange, [keyboardRange.first, keyboardRange.last])
      ) {
        const _range = getPianoRangeAndShortcuts(requiredRange).range;
        setKeyboardRange(_range);
        setPlaying(true);
        return _range;
      }

      return keyboardRange;
    },
    [keyboardRange]
  );

  const onNoteStart = useCallback(
    (midi, velocity = 1, isFromMidiDevice = false) => {
      player.playNote(midi, instrument, velocity);
      if (mode === VISUALIZER_MODE.WRITE || !isFromMidiDevice) {
        setMidiKeyboardState(_midiKeyboardState => ({
          ..._midiKeyboardState,
          [midi]: {
            pressed: true,
            pedaled: isPedaling
          }
        }));
      } else {
        setActiveInstrumentMidis(_activeMidis =>
          dedupeNumbers(_activeMidis.concat([midi]))
        );
      }
    },
    [instrument, mode, player, isPedaling]
  );

  const onNoteStop = useCallback(
    (midi, isFromMidiDevice = false) => {
      if (mode === VISUALIZER_MODE.WRITE || !isFromMidiDevice) {
        if (!isPedaling) {
          player.stopNote(midi, instrument);
        }
        setMidiKeyboardState(_midiKeyboardState => ({
          ..._midiKeyboardState,
          [midi]: {
            pressed: false,
            pedaled: isPedaling
          }
        }));
      } else {
        player.stopNote(midi, instrument);
        setActiveInstrumentMidis(_activeMidis =>
          _activeMidis.filter(x => x !== midi)
        );
      }
    },
    [player, mode, instrument, isPedaling]
  );

  useEffect(() => {
    if (
      wasPedalingRef.current !== isPedaling &&
      mode === VISUALIZER_MODE.WRITE
    ) {
      if (isPedaling) {
        // pedal down
        setMidiKeyboardState(_state =>
          Object.keys(_state).reduce(
            (newState, midi) => ({
              ...newState,
              [midi]: _state[midi].pressed
                ? { pressed: true, pedaled: true }
                : _state[midi]
            }),
            {}
          )
        );
      } else {
        // pedal up
        Object.keys(midiKeyboardState)
          .filter(midi => {
            const { pedaled, pressed } = midiKeyboardState[midi];
            return pedaled && !pressed;
          })
          .forEach(midi => {
            player.stopNote(parseInt(midi, 10), instrument);
          });

        setMidiKeyboardState(_state =>
          Object.keys(_state).reduce(
            (newState, midi) => ({
              ...newState,
              [midi]: { ..._state[midi], pedaled: false }
            }),
            {}
          )
        );
      }
      wasPedalingRef.current = isPedaling;
    }
  }, [isPedaling, midiKeyboardState, instrument]);

  // useEffect(() => {
  //   const handleKeyDown = (event: KeyboardEvent) => {
  //     setIsPedaling(true);
  //   };
  //   const handleKeyUp = (event: KeyboardEvent) => {
  //     setIsPedaling(false);
  //   };
  //   document.addEventListener("keydown", handleKeyDown);
  //   document.addEventListener("keyup", handleKeyUp);
  //   return () => {
  //     document.removeEventListener("keydown", handleKeyDown);
  //     document.removeEventListener("keyup", handleKeyUp);
  //   };
  // }, []);

  useEffect(() => {
    if (loadedMidi && midiSettings) {
      const _range = setRange(
        loadedMidi.tracks[midiSettings.selectedTrackIndex].notes
      );
      player.setRange(_range);
      setKeyboardRange(_range);
    }
  }, [loadedMidi, midiSettings, setRange]);

  const onMidiAndTrackSelect = useCallback(
    (midi: IMidiJSON, _midiSettings: MidiSettings) => {
      (async () => {
        setLoading(true);
        await player.clear();
        setMidiKeyboardState({});
        setActiveInstrumentMidis([]);
        setIsPedaling(false);
        setPlaying(true);
        setMidi(midi);
        setMidiSettings(_midiSettings);
        setMode(VISUALIZER_MODE.READ);

        player.setMidi(midi);

        await player.loadInstruments();
        setLoading(false);

        await player.scheduleAndPlay(
          _midiSettings,
          (
            notes: NoteWithIdAndEvent[],
            trackIndex: number,
            isComplete?: boolean
          ) => {
            if (trackIndex === _midiSettings.selectedTrackIndex) {
              if (isComplete) {
                player.clear();
                setPlaying(false);
                setMidiKeyboardState({});
                return;
              }

              setMidiKeyboardState(
                notes
                  .map(note => note.midi)
                  .reduce(midi => ({ [`${midi}`]: { pressed: true } }), {})
              );
            }
          }
        );
      })();
    },
    [player]
  );

  const onTogglePlay = useCallback(() => {
    if (Tone.Transport.state === "stopped") {
      onMidiAndTrackSelect(loadedMidi, midiSettings);
    } else {
      player.togglePlay();
    }

    setPlaying(!isPlaying);
  }, [isPlaying]);

  useLayoutEffect(() => {
    setMidiKeyboardState({});
    setActiveInstrumentMidis([]);
    setIsPedaling(false);
  }, [mode]);

  useEffect(() => {
    player.clear();
    player.setMode(mode);
  }, [mode]);

  useEffect(changeInstrument, []);

  useEffect(() => player.setRange(keyboardRange), [keyboardRange]);

  useEffect(() => {
    const _onNoteStart = e => {
      onNoteStart(e.note.number, e.velocity, true);
    };

    const _onNoteStop = e => {
      onNoteStop(e.note.number, true);
    };

    const _onControlChange = e => {
      if (e.controller.name === "holdpedal") {
        setIsPedaling(e.value > 127 / 2);
      }
    };

    if (!webMidi.supported) return;

    const input = webMidi.getInputById(midiDevice);

    if (input) {
      input.addListener("noteon", "all", _onNoteStart);
      input.addListener("noteoff", "all", _onNoteStop);
      input.addListener("controlchange", "all", _onControlChange);
    }
    return () => {
      if (input) {
        input.removeListener("noteon", "all", _onNoteStart);
        input.removeListener("noteoff", "all", _onNoteStop);
        input.removeListener("controlchange", "all", _onControlChange);
      }
    };
  }, [midiDevice, onNoteStart, onNoteStop]);

  const handleRangeChange = useCallback(
    _range => {
      const { range } = getPianoRangeAndShortcuts(_range, false);
      setDefaultRange(range);
      player.setRange(range);
      setKeyboardRange(range);
    },
    [player]
  );

  return (
    <PlayerContext.Provider value={player}>
      <ThemeContext.Provider value={theme}>
        <div className="flex flex-1 relative flex-col overflow-hidden">
          <GlobalHeader
            midiSettings={midiSettings}
            mode={mode}
            onToggleMode={setMode}
            onMidiAndTrackSelect={onMidiAndTrackSelect}
          />

          <Header
            onTogglePlay={onTogglePlay}
            instrument={instrument}
            mode={mode}
            onInstrumentChange={changeInstrument}
            midiDeviceId={midiDevice}
            isPlaying={isPlaying}
            midi={loadedMidi}
            range={keyboardRange}
            onRangeChange={handleRangeChange}
            onToggleBackground={setMidiSettings}
            midiSettings={midiSettings}
            onMidiDeviceChange={setSelectedMidiDevice}
            onThemeChange={setTheme}
            isLoading={loading}
          />

          <Visualizer
            range={keyboardRange}
            mode={mode}
            canvasProxy={canvasProxyRef.current}
            offScreenCanvasSupport={offScreenCanvasSupport}
          />
        </div>
        <div className="piano-wrapper" style={{ height: PIANO_HEIGHT }}>
          {loading && <Loader className="absolute z-10 h-4" />}
          <Piano
            midiKeyboardState={midiKeyboardState}
            onPlay={onNoteStart}
            onStop={onNoteStop}
            min={keyboardRange.first}
            max={keyboardRange.last}
            className={loading ? "opacity-25" : undefined}
            activeInstrumentMidis={activeInstrumentMidis}
          />
        </div>
      </ThemeContext.Provider>
    </PlayerContext.Provider>
  );
};

export default memo(SoundPlayer);

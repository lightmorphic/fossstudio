// What a recording can be written as.
//
// Every one of these is a format the browser writes itself. There is no
// encoder on this server and never will be, so this list is not our
// choice of what is good - it is the list of what browsers can hand us,
// and the studio's settings only say which of them to ask for.
//
// The server owns the list and tells each browser the exact strings to
// try, so there is one catalog rather than two that drift apart. A
// browser that cannot write one of them simply does not, and the
// finished recording says whose browser it was.

// Audio is limited to these two on purpose. A person who joins late or
// drops out has recorded less than the take is long, and their track is
// padded with silence so it lines up with everybody else's - done by
// copying bytes, because there is nothing here that can encode silence.
// That trick works on uncompressed samples and on Opus packets and on
// nothing else. Offering AAC would mean tracks that do not line up,
// which is the fault the padding exists to prevent.
export const AUDIO_FORMATS = [
  {
    id: "wav",
    label: "WAV",
    detail: "Uncompressed. Every sample the microphone heard.",
    size: "about 1.4 GB per person per hour",
    bytesPerHour: 1_380_000_000,
    // Recorded as raw samples in a WebM box and rewritten as a WAV here,
    // header swapped, samples untouched.
    mimes: ["audio/webm;codecs=pcm"],
    browsers: "Chrome and Edge. Firefox cannot record uncompressed audio."
  },
  {
    id: "opus",
    label: "Opus",
    detail: "Compressed, and very good for speech.",
    size: "about 58 MB per person per hour",
    bytesPerHour: 58_000_000,
    mimes: ["audio/webm;codecs=opus", "audio/webm"],
    browsers: "Chrome, Edge and Firefox."
  }
];

// Video cannot be padded the way audio can - a picture of nothing still
// has to be encoded - so each of these is simply the browser's own
// output, filed as it arrives. `mimes` is the program video, which
// carries sound; `camMimes` is one person's camera, which does not.
export const VIDEO_FORMATS = [
  {
    id: "mp4",
    ext: "mp4",
    label: "MP4, H.264",
    detail: "The file almost every editor opens without argument.",
    mimes: ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1,opus", "video/mp4;codecs=avc1"],
    camMimes: ["video/mp4;codecs=avc1", "video/mp4"],
    browsers: "Chrome and Edge. Firefox cannot write an MP4 at all."
  },
  {
    id: "vp8",
    ext: "webm",
    label: "WebM, VP8",
    detail: "The one format every browser here can write.",
    mimes: ["video/webm;codecs=vp8,opus", "video/webm"],
    camMimes: ["video/webm;codecs=vp8", "video/webm"],
    browsers: "Chrome, Edge and Firefox."
  },
  {
    id: "vp9",
    ext: "webm",
    label: "WebM, VP9",
    detail: "Smaller than VP8 for the same picture, and slower to make.",
    mimes: ["video/webm;codecs=vp9,opus"],
    camMimes: ["video/webm;codecs=vp9"],
    browsers: "Chrome and Edge."
  },
  {
    id: "av1",
    ext: "webm",
    label: "WebM, AV1",
    detail: "Smaller again, and the heaviest of these on the machine making it.",
    mimes: ["video/webm;codecs=av01,opus"],
    camMimes: ["video/webm;codecs=av01"],
    browsers: "Chrome and Edge."
  }
];

// The picture is recorded at a fixed rate, so every one of these
// formats costs the same room on disk - what changes between them is
// how good the picture looks for those bytes, and how hard the
// recording machine has to work. Both figures are the rate asked for in
// the recorder, which is a ceiling: a still room comes in well under.
export const PROGRAM_BYTES_PER_HOUR = 1_350_000_000;   // 3 Mbit/s
export const CAMERA_BYTES_PER_HOUR = 1_125_000_000;    // 2.5 Mbit/s

export const AUDIO_IDS = AUDIO_FORMATS.map((f) => f.id);
export const VIDEO_IDS = VIDEO_FORMATS.map((f) => f.id);

// What one browser is asked to try, sent with the go-ahead to record.
// Only the strings: the browser needs nothing else to start.
//
// The video of everyone is one format, not a list. It is drawn and
// encoded by the host's browser alone, and most people want one finished
// file to upload somewhere - so it is asked as a single question and the
// rest of this only exists for people who want the parts as well.
export function recipe(showId, separate, audioIds, cameraIds) {
  const show = VIDEO_FORMATS.find((f) => f.id === showId) || VIDEO_FORMATS[0];
  return {
    show: { id: show.id, mimes: show.mimes },
    audio: !separate ? [] : AUDIO_FORMATS.filter((f) => audioIds.includes(f.id))
      .map((f) => ({ id: f.id, mimes: f.mimes })),
    camera: !separate ? [] : VIDEO_FORMATS.filter((f) => cameraIds.includes(f.id))
      .map((f) => ({ id: f.id, mimes: f.camMimes }))
  };
}

// The name a person reads when a format is named in a note.
export function formatExt(id) {
  const f = VIDEO_FORMATS.find((x) => x.id === id);
  return f ? f.ext : "webm";
}

export function formatLabel(id) {
  const f = [...AUDIO_FORMATS, ...VIDEO_FORMATS].find((x) => x.id === id);
  return f ? f.label : id;
}

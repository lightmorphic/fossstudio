// Putting a person's take back together as one file, without opening
// the audio.
//
// A guest who joins five seconds late, or drops out and comes back, has
// recorded less than the take is long. Handed to an editor as it is,
// their track starts at zero alongside everybody else's and every word
// in it is in the wrong place. What is needed is one file per person,
// the full length of the take, with silence where they were not there.
//
// The server does not own an encoder and never will: no ffmpeg in the
// image, nothing decoding a sample. So the silence is manufactured and
// the recorded parts are copied through untouched, packet for packet.
// That is possible because of what is actually inside the browser's
// .webm:
//
//   Uncompressed  the samples themselves, 32-bit float. Silence is
//                 zeroes, and the file is rewritten as a WAV, which is
//                 the same samples with a 44-byte header on the front.
//   Opus          whole Opus packets. Silence is the three-byte packet
//                 the standard reserves for it, repeated, and the file
//                 is rewritten as an Ogg, which is those same packets
//                 in different envelopes.
//
// Neither road looks at a sample value or asks what the audio sounds
// like. Both come out of a format an editor opens without help -
// Audacity reads .wav and .opus on its own; it needs an extra library
// for anything in a .webm - which is the whole point of the exercise.

// ---------------------------------------------------------------
// Reading EBML, which is what a .webm is written in
// ---------------------------------------------------------------

// Element ids we care about. Everything else is stepped over.
const ID = {
  segment: 0x18538067,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  codecId: 0x86,
  codecPrivate: 0x63a2,
  audio: 0xe1,
  samplingFrequency: 0xb5,
  channels: 0x9f,
  bitDepth: 0x6264,
  cluster: 0x1f43b675,
  timecode: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1
};

const MASTERS = new Set([
  ID.segment, ID.tracks, ID.trackEntry, ID.audio, ID.cluster, ID.blockGroup
]);

// An EBML variable-length integer. `strip` clears the leading marker
// bit, which is right for a size and wrong for an id.
function readVint(buf, pos, strip) {
  const first = buf[pos];
  if (first === undefined) return null;
  let len = 1;
  for (let mask = 0x80; mask && !(first & mask); mask >>= 1) len++;
  if (len > 8 || pos + len > buf.length) return null;
  let value = strip ? first & (0xff >> len) : first;
  let allOnes = (first & (0xff >> len)) === (0xff >> len);
  for (let i = 1; i < len; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) allOnes = false;
  }
  // A size of all ones means "unknown": the writer did not know how
  // long this would be. MediaRecorder writes the Segment and every
  // Cluster that way, because it is writing as it records.
  return { value, len, unknown: strip && allOnes };
}

function readUint(buf) {
  let n = 0;
  for (const b of buf) n = n * 256 + b;
  return n;
}

function readFloat(buf) {
  if (buf.length === 4) return buf.readFloatBE(0);
  if (buf.length === 8) return buf.readDoubleBE(0);
  return 0;
}

// Walk one level of a document, calling back with each element. An
// element of unknown size runs to the end of its parent, except that a
// Cluster stops at the next Cluster - which is how a live-written file
// is read at all.
function walk(buf, start, end, onElement) {
  let pos = start;
  while (pos < end) {
    const id = readVint(buf, pos, false);
    if (!id) return;
    const size = readVint(buf, pos + id.len, true);
    if (!size) return;
    const bodyAt = pos + id.len + size.len;
    let bodyEnd;
    if (size.unknown) {
      bodyEnd = id.value === ID.cluster ? nextClusterAt(buf, bodyAt, end) : end;
    } else {
      bodyEnd = Math.min(end, bodyAt + size.value);
    }
    onElement(id.value, bodyAt, bodyEnd, pos);
    pos = bodyEnd;
  }
}

// Scan forward for the next Cluster header, so an unknown-size cluster
// knows where it stops. Clusters are the only thing MediaRecorder puts
// at that level after the first, so a plain search is enough.
function nextClusterAt(buf, from, end) {
  for (let i = from; i + 4 <= end; i++) {
    if (buf[i] === 0x1f && buf[i + 1] === 0x43 && buf[i + 2] === 0xb6 && buf[i + 3] === 0x75) return i;
  }
  return end;
}

// Everything one of these files holds that we need: what the audio is,
// and the run of blocks that carry it, in order.
export function readWebmAudio(buf) {
  const out = { codec: "", sampleRate: 48000, channels: 1, bitDepth: 0, codecPrivate: null, packets: [] };
  walk(buf, 0, buf.length, (id, bodyAt, bodyEnd) => {
    if (id !== ID.segment) return;
    walk(buf, bodyAt, bodyEnd, (sid, sAt, sEnd) => {
      if (sid === ID.tracks) readTracks(buf, sAt, sEnd, out);
      else if (sid === ID.cluster) readCluster(buf, sAt, sEnd, out);
    });
  });
  return out;
}

function readTracks(buf, at, end, out) {
  walk(buf, at, end, (id, a, e) => {
    if (id !== ID.trackEntry) return;
    walk(buf, a, e, (tid, ta, te) => {
      if (tid === ID.codecId) out.codec = buf.toString("latin1", ta, te).replace(/\0+$/, "");
      else if (tid === ID.codecPrivate) out.codecPrivate = buf.subarray(ta, te);
      else if (tid === ID.audio) {
        walk(buf, ta, te, (aid, aa, ae) => {
          if (aid === ID.samplingFrequency) out.sampleRate = Math.round(readFloat(buf.subarray(aa, ae)));
          else if (aid === ID.channels) out.channels = readUint(buf.subarray(aa, ae));
          else if (aid === ID.bitDepth) out.bitDepth = readUint(buf.subarray(aa, ae));
        });
      }
    });
  });
}

function readCluster(buf, at, end, out) {
  walk(buf, at, end, (id, a, e) => {
    if (id === ID.simpleBlock) out.packets.push(...blockPayloads(buf, a, e));
    else if (id === ID.blockGroup) {
      walk(buf, a, e, (bid, ba, be) => {
        if (bid === ID.block) out.packets.push(...blockPayloads(buf, ba, be));
      });
    }
  });
}

// A block is a track number, a two-byte time, a flags byte and then the
// payload - one frame, or several laced together. MediaRecorder does
// not lace, but a file is not ours to assume things about.
function blockPayloads(buf, at, end) {
  const track = readVint(buf, at, true);
  if (!track) return [];
  let pos = at + track.len + 3;          // + timecode (2) + flags (1)
  const flags = buf[at + track.len + 2];
  const lacing = (flags >> 1) & 3;
  if (lacing === 0) return [buf.subarray(pos, end)];
  const frames = buf[pos++] + 1;
  const sizes = [];
  if (lacing === 2) {                     // fixed-size lacing
    const each = (end - pos) / frames;
    for (let i = 0; i < frames; i++) sizes.push(each);
  } else if (lacing === 1) {              // Xiph lacing
    for (let i = 0; i < frames - 1; i++) {
      let n = 0;
      while (buf[pos] === 0xff) { n += 255; pos++; }
      n += buf[pos++];
      sizes.push(n);
    }
  } else {                                // EBML lacing
    const first = readVint(buf, pos, true);
    pos += first.len;
    sizes.push(first.value);
    let prev = first.value;
    for (let i = 1; i < frames - 1; i++) {
      const d = readVint(buf, pos, true);
      pos += d.len;
      // signed: the range is centred on zero
      const bias = (1 << (7 * d.len - 1)) - 1;
      prev += d.value - bias;
      sizes.push(prev);
    }
  }
  const out = [];
  for (const n of sizes) { out.push(buf.subarray(pos, pos + n)); pos += n; }
  out.push(buf.subarray(pos, end));       // the last frame takes the rest
  return out;
}

// ---------------------------------------------------------------
// Reading a .webm a block at a time, without holding it in memory
// ---------------------------------------------------------------

// A take at best quality is 1.4 GB an hour a person, so nothing here
// may load a file to work on it. This walks one sequentially, handing
// back each block's payload as it passes, with a window of a megabyte
// or so open at a time whatever the file's length.
export class WebmBlockReader {
  constructor(handle, { window = 1 << 20 } = {}) {
    this.handle = handle;
    this.windowSize = window;
    this.buf = Buffer.alloc(0);
    this.cursor = 0;          // read position within this.buf
    this.filePos = 0;         // where this.buf starts in the file
    this.eof = false;
    this.info = { codec: "", sampleRate: 48000, channels: 1, bitDepth: 0, codecPrivate: null };
  }

  // Make sure at least n bytes are readable from the cursor, pulling
  // more of the file in and dropping what is behind us.
  async ensure(n) {
    while (!this.eof && this.buf.length - this.cursor < n) {
      if (this.cursor > 0) {
        this.buf = this.buf.subarray(this.cursor);
        this.filePos += this.cursor;
        this.cursor = 0;
      }
      const want = Math.max(this.windowSize, n);
      const chunk = Buffer.alloc(want);
      const { bytesRead } = await this.handle.read(chunk, 0, want, this.filePos + this.buf.length);
      if (!bytesRead) { this.eof = true; break; }
      this.buf = Buffer.concat([this.buf, chunk.subarray(0, bytesRead)]);
    }
    return this.buf.length - this.cursor >= n;
  }

  async readHeaderVint(strip) {
    if (!(await this.ensure(8)) && this.buf.length - this.cursor < 1) return null;
    const v = readVint(this.buf, this.cursor, strip);
    if (!v) return null;
    this.cursor += v.len;
    return v;
  }

  // Walk the file, calling onPayload(Buffer) for every audio block in
  // order. Track metadata lands in this.info on the way past.
  async forEachBlock(onPayload) {
    for (;;) {
      if (!(await this.ensure(12)) && this.buf.length - this.cursor < 2) return;
      const startCursor = this.cursor;
      const id = await this.readHeaderVint(false);
      if (!id) return;
      const size = await this.readHeaderVint(true);
      if (!size) return;
      // Masters we step into rather than over: their children are next
      // in the file, so there is nothing to do but carry on reading.
      if (id.value === ID.segment || id.value === ID.cluster || id.value === ID.blockGroup) continue;
      if (size.unknown) { this.cursor = startCursor + 1; continue; }
      const len = size.value;
      if (id.value === ID.tracks) {
        if (await this.ensure(len)) {
          readTracks(this.buf, this.cursor, this.cursor + len, this.info);
        }
        await this.skip(len);
        continue;
      }
      if (id.value === ID.simpleBlock || id.value === ID.block) {
        if (!(await this.ensure(len))) return;
        for (const payload of blockPayloads(this.buf, this.cursor, this.cursor + len)) {
          await onPayload(payload);
        }
        this.cursor += len;
        continue;
      }
      await this.skip(len);
    }
  }

  async skip(n) {
    const have = this.buf.length - this.cursor;
    if (have >= n) { this.cursor += n; return; }
    this.filePos += this.buf.length;
    this.filePos += n - have;
    this.buf = Buffer.alloc(0);
    this.cursor = 0;
  }
}

// ---------------------------------------------------------------
// Writing a WAV, for the uncompressed setting
// ---------------------------------------------------------------

// The browser records 32-bit float samples, so that is what goes in the
// file: format 3, IEEE float. No conversion, no dither, no rounding -
// the bytes the microphone produced, in an envelope an editor opens
// without needing an extra library installed.
export function wavHeader({ sampleRate, channels, bytes }) {
  const bits = 32;
  const blockAlign = channels * (bits / 8);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(Math.min(0xffffffff, 36 + bytes), 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(3, 20);             // WAVE_FORMAT_IEEE_FLOAT
  head.writeUInt16LE(channels, 22);
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * blockAlign, 28);
  head.writeUInt16LE(blockAlign, 32);
  head.writeUInt16LE(bits, 34);
  head.write("data", 36);
  head.writeUInt32LE(Math.min(0xffffffff, bytes), 40);
  return head;
}

// ---------------------------------------------------------------
// Writing an Ogg, for the smaller-files setting
// ---------------------------------------------------------------

// Ogg's own checksum: the ordinary CRC-32 polynomial without any of the
// bit reversal the common one does, so it needs its own table.
const OGG_CRC = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    table[i] = r >>> 0;
  }
  return table;
})();

function oggCrc(buf) {
  let crc = 0;
  for (const b of buf) crc = ((crc << 8) ^ OGG_CRC[((crc >>> 24) & 0xff) ^ b]) >>> 0;
  return crc >>> 0;
}

// How long one Opus packet is, read from its first byte. The standard
// calls that byte the TOC: five bits say which mode and how long a
// frame is, two say how many frames are packed in. Nothing else in the
// packet is looked at, and none of it is decoded.
export function opusPacketSamples(packet) {
  if (!packet.length) return 0;
  const toc = packet[0];
  const config = toc >> 3;
  const code = toc & 3;
  let frameMs;
  if (config < 12) frameMs = [10, 20, 40, 60][config & 3];        // SILK
  else if (config < 16) frameMs = [10, 20][config & 1];           // hybrid
  else frameMs = [2.5, 5, 10, 20][config & 3];                    // CELT
  let frames;
  if (code === 0) frames = 1;
  else if (code < 3) frames = 2;
  else frames = packet.length > 1 ? packet[1] & 0x3f : 1;
  return Math.round(frameMs * 48 * frames);                       // samples at 48 kHz
}

// The packet Opus reserves for a frame of nothing: twenty milliseconds,
// full band, two bytes that decode to silence. One for mono, one for
// stereo - which it is comes from the file being padded, never guessed.
export function opusSilencePacket(channels) {
  return Buffer.from([channels > 1 ? 0xfc : 0xf8, 0xff, 0xfe]);
}

export const OPUS_SILENCE_MS = 20;

// An Ogg Opus file written as the packets arrive, so a long take costs
// no more memory than a short one.
export class OggOpusWriter {
  constructor(write, { channels = 2, codecPrivate = null, serial = 0x464f5353 } = {}) {
    this.write = write;
    this.serial = serial >>> 0;
    this.sequence = 0;
    this.batch = [];
    this.batchBytes = 0;
    this.head = codecPrivate?.length >= 19 ? Buffer.from(codecPrivate) : (() => {
      const h = Buffer.alloc(19);
      h.write("OpusHead", 0);
      h[8] = 1;
      h[9] = channels;
      h.writeUInt16LE(312, 10);          // pre-skip
      h.writeUInt32LE(48000, 12);
      h.writeUInt16LE(0, 16);
      h[18] = 0;
      return h;
    })();
    this.granule = this.head.readUInt16LE(10);
  }

  async begin() {
    // The identification header is the CodecPrivate straight out of the
    // .webm: it is already an OpusHead, the same bytes either container
    // carries, so nothing is invented here.
    await this.page([this.head], 0, 2);
    const vendor = Buffer.from("FOSSStudio", "utf8");
    const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
    tags.write("OpusTags", 0);
    tags.writeUInt32LE(vendor.length, 8);
    vendor.copy(tags, 12);
    tags.writeUInt32LE(0, 12 + vendor.length);
    await this.page([tags], 0, 0);
  }

  async page(packets, granule, headerType) {
    const segments = [];
    for (const p of packets) {
      let left = p.length;
      while (left >= 255) { segments.push(255); left -= 255; }
      segments.push(left);
    }
    const head = Buffer.alloc(27 + segments.length);
    head.write("OggS", 0);
    head[5] = headerType;
    head.writeUInt32LE(granule >>> 0, 6);
    head.writeUInt32LE(Math.floor(granule / 2 ** 32), 10);
    head.writeUInt32LE(this.serial, 14);
    head.writeUInt32LE(this.sequence++, 18);
    head[26] = segments.length;
    Buffer.from(segments).copy(head, 27);
    const whole = Buffer.concat([head, ...packets]);
    whole.writeUInt32LE(oggCrc(whole), 22);
    await this.write(whole);
  }

  async add(packet) {
    this.batch.push(packet);
    this.batchBytes += packet.length;
    this.granule += opusPacketSamples(packet);
    // A page carries at most 255 lacing values and is expected to stay
    // well under 64 kB; both limits are kept with room to spare.
    if (this.batch.length >= 50 || this.batchBytes > 40000) await this.flush(0);
  }

  async flush(headerType) {
    if (!this.batch.length) return;
    const packets = this.batch;
    this.batch = [];
    this.batchBytes = 0;
    await this.page(packets, this.granule, headerType);
  }

  async finish() {
    if (this.batch.length) await this.flush(4);
    else await this.page([Buffer.alloc(0)], this.granule, 4);
  }
}

// ---------------------------------------------------------------
// Putting one person's parts back together
// ---------------------------------------------------------------

// What a .webm says it holds, read from the front of it. Tracks comes
// before the first block, so a short prefix is always enough.
export async function readWebmInfo(handle) {
  const head = Buffer.alloc(1 << 16);
  const { bytesRead } = await handle.read(head, 0, head.length, 0);
  return readWebmAudio(head.subarray(0, bytesRead));
}

export function isUncompressed(codec) {
  return /PCM/i.test(codec || "");
}

// Assemble `parts` - each a recorded stretch and the millisecond of the
// take it began at - into one file the full length of the take, with
// silence in front of and between them.
//
// Returns what was made and where the silence went, so the dashboard
// can say it in words rather than leaving the host to spot it.
export async function assembleTrack(fsp, parts, outPath) {
  if (!parts.length) return null;
  const ordered = [...parts].sort((a, b) => a.offsetMs - b.offsetMs);
  const first = await fsp.open(ordered[0].file, "r");
  let info;
  try { info = await readWebmInfo(first); } finally { await first.close(); }
  const channels = Math.max(1, info.channels || 1);
  const rate = info.sampleRate || 48000;
  const pcm = isUncompressed(info.codec);
  const gaps = [];
  const out = await fsp.open(outPath, "w");
  try {
    if (pcm) await assemblePcm(fsp, ordered, out, { rate, channels }, gaps);
    else await assembleOpus(fsp, ordered, out, { channels, codecPrivate: info.codecPrivate }, gaps);
  } finally {
    await out.close();
  }
  return { format: pcm ? "wav" : "opus", channels, rate, gaps };
}

async function assemblePcm(fsp, parts, out, { rate, channels }, gaps) {
  const blockAlign = channels * 4;
  let at = 44;                         // after the header we patch later
  let frames = 0;
  await out.write(wavHeader({ sampleRate: rate, channels, bytes: 0 }), 0, 44, 0);
  const zeros = Buffer.alloc(1 << 20);
  const put = async (buf) => { await out.write(buf, 0, buf.length, at); at += buf.length; };

  for (const part of parts) {
    const want = Math.round((part.offsetMs / 1000) * rate);
    let pad = Math.max(0, want - frames);
    if (pad) gaps.push({ atMs: Math.round((frames / rate) * 1000), lengthMs: Math.round((pad / rate) * 1000) });
    frames += pad;
    while (pad > 0) {
      const n = Math.min(pad, zeros.length / blockAlign);
      await put(zeros.subarray(0, n * blockAlign));
      pad -= n;
    }
    const handle = await fsp.open(part.file, "r");
    try {
      const reader = new WebmBlockReader(handle);
      await reader.forEachBlock(async (payload) => {
        await put(payload);
        frames += payload.length / blockAlign;
      });
    } finally { await handle.close(); }
  }
  const bytes = at - 44;
  await out.write(wavHeader({ sampleRate: rate, channels, bytes }), 0, 44, 0);
}

async function assembleOpus(fsp, parts, out, { channels, codecPrivate }, gaps) {
  let at = 0;
  const writer = new OggOpusWriter(async (buf) => { await out.write(buf, 0, buf.length, at); at += buf.length; },
    { channels, codecPrivate });
  await writer.begin();
  const silence = opusSilencePacket(channels);
  const perPacket = OPUS_SILENCE_MS * 48;
  let samples = 0;

  for (const part of parts) {
    const want = Math.round((part.offsetMs / 1000) * 48000);
    if (want > samples + perPacket) {
      const packets = Math.round((want - samples) / perPacket);
      gaps.push({ atMs: Math.round(samples / 48), lengthMs: packets * OPUS_SILENCE_MS });
      for (let i = 0; i < packets; i++) { await writer.add(silence); samples += perPacket; }
    }
    const handle = await fsp.open(part.file, "r");
    try {
      const reader = new WebmBlockReader(handle);
      await reader.forEachBlock(async (payload) => {
        await writer.add(payload);
        samples += opusPacketSamples(payload);
      });
    } finally { await handle.close(); }
  }
  await writer.finish();
}

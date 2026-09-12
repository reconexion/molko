export interface AssWord {
  word: string;
  start: number;
  end: number;
}

const PLAY_RES_X = 1080;
const PLAY_RES_Y = 1920;
const BASE_COLOR = "FFFFFF"; // white, in ASS's &HBBGGRR& order
const HIGHLIGHT_COLOR = "00FFFF"; // yellow

const MAX_WORDS_PER_CHUNK = 5;
const MAX_CHUNK_DURATION_SECONDS = 3.2;

function formatAssTime(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(centiseconds / 360000);
  const m = Math.floor((centiseconds % 360000) / 6000);
  const s = Math.floor((centiseconds % 6000) / 100);
  const c = centiseconds % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

// Groups words into short on-screen chunks (a "line" the viewer reads at once),
// splitting on whichever limit hits first so lines stay readable at brainrot pace.
function chunkWords(words: AssWord[]): AssWord[][] {
  const chunks: AssWord[][] = [];
  let current: AssWord[] = [];
  let chunkStart = 0;

  for (const word of words) {
    if (current.length === 0) chunkStart = word.start;
    current.push(word);
    const duration = word.end - chunkStart;
    if (current.length >= MAX_WORDS_PER_CHUNK || duration >= MAX_CHUNK_DURATION_SECONDS) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function escapeAssText(text: string): string {
  return text.replace(/\{/g, "(").replace(/\}/g, ")");
}

// Builds one Dialogue line per word, always showing the full chunk text but
// re-coloring the currently-spoken word — the CapCut-style active word highlight.
export function buildAssSubtitles(words: AssWord[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${PLAY_RES_X}
PlayResY: ${PLAY_RES_Y}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,68,&H${BASE_COLOR},&H${BASE_COLOR},&H00101010,&H64000000,1,0,0,0,100,100,0,0,1,5,0,2,60,60,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];

  for (const chunk of chunkWords(words)) {
    const chunkEnd = chunk[chunk.length - 1].end;

    chunk.forEach((activeWord, activeIndex) => {
      const start = activeWord.start;
      const end = activeIndex + 1 < chunk.length ? chunk[activeIndex + 1].start : chunkEnd;

      const text = chunk
        .map((w, idx) => {
          const clean = escapeAssText(w.word.toUpperCase());
          return idx === activeIndex
            ? `{\\1c&H${HIGHLIGHT_COLOR}&}${clean}{\\1c&H${BASE_COLOR}&}`
            : clean;
        })
        .join(" ");

      lines.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${text}`);
    });
  }

  return header + lines.join("\n") + "\n";
}

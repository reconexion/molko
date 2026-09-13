// Auto-discovers video files dropped into src/assets/gameplays/ — no manifest
// to edit by hand, no registration step. Add a file there and it shows up as
// an option in the editor's gameplay picker on the next dev-server reload.
const modules = import.meta.glob<string>("../assets/gameplays/*.{mp4,webm,mov,m4v}", {
  eager: true,
  query: "?url",
  import: "default",
});

export interface GameplayOption {
  id: string;
  label: string;
  url: string;
}

function toLabel(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  return withoutExt
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const gameplayOptions: GameplayOption[] = Object.entries(modules)
  .map(([path, url]) => {
    const filename = path.split("/").pop()!;
    return { id: filename, label: toLabel(filename), url };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

// Wraps a picked preset as a File so it slots into the same
// assertWithinMemoryBudget / getVideoDuration / composeBrainrotVideo calls
// that a user-uploaded File goes through.
export async function loadGameplayFile(option: GameplayOption): Promise<File> {
  const res = await fetch(option.url);
  const blob = await res.blob();
  return new File([blob], option.id, { type: blob.type || "video/mp4" });
}

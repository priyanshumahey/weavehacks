import type { EpisodeOption } from "./chatApi";

interface EpisodeRewindSliderProps {
  episodes: EpisodeOption[];
  episode: string;
  disabled?: boolean;
  onEpisodeChange: (episodeId: string) => void;
}

export function EpisodeRewindSlider({
  episodes,
  episode,
  disabled = false,
  onEpisodeChange,
}: EpisodeRewindSliderProps) {
  const max = Math.max(0, episodes.length - 1);
  const idx = Math.max(
    0,
    episodes.findIndex((entry) => entry.id === episode),
  );
  const active = episodes[idx];
  const label = active?.id.toUpperCase() ?? episode.toUpperCase();

  return (
    <div className="character-chat__rewind">
      <span className="character-chat__rewind-label">
        as of <strong>{label}</strong>
      </span>
      <input
        type="range"
        className="character-chat__range"
        min={0}
        max={max}
        step={1}
        value={episodes.length === 0 ? 0 : idx}
        disabled={disabled || episodes.length === 0}
        aria-label="Rewind episode"
        onChange={(e) => {
          const next = episodes[Number(e.target.value)];
          if (next) {
            onEpisodeChange(next.id);
          }
        }}
      />
    </div>
  );
}

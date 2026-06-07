import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CopilotKit, useAgent } from "@copilotkit/react-core/v2";
import { buildChatSessionId } from "../replay/sceneContext";
import {
  fetchCharacters,
  fetchEpisodes,
  type CharacterOption,
  type EpisodeOption,
} from "./chatApi";
import { EpisodeRewindSlider } from "./EpisodeRewindSlider";

interface ChatMessage {
  id: string;
  role: string;
  content?: string;
}

export interface CharacterChatPanelProps {
  characterKey: string;
  characterName: string;
  portraitUrl: string | null;
  episode: string;
  onClose: () => void;
}

function newMessageId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg-${Math.random().toString(36).slice(2, 11)}`;
}

export function CharacterChatPanel({
  characterKey,
  characterName,
  portraitUrl,
  episode: initialEpisode,
  onClose,
}: CharacterChatPanelProps) {
  const [episode, setEpisode] = useState(initialEpisode);
  const [playAs, setPlayAs] = useState("");
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeOption[]>([]);

  useEffect(() => {
    setEpisode(initialEpisode);
    setPlayAs("");
  }, [characterKey, initialEpisode]);

  useEffect(() => {
    void fetchCharacters()
      .then(setCharacters)
      .catch((error) => {
        console.error("[chat] failed to load characters", error);
      });
    void fetchEpisodes().then(setEpisodes).catch(console.error);
  }, []);

  const sessionId = useMemo(
    () => buildChatSessionId(characterKey, episode),
    [characterKey, episode],
  );

  const properties = useMemo(
    () => ({
      character: characterKey,
      episode,
      sessionId,
      playAs: playAs || null,
    }),
    [characterKey, episode, sessionId, playAs],
  );

  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      showDevConsole={false}
      enableInspector={false}
      properties={properties}
    >
      <ChatSurface
        characterKey={characterKey}
        characterName={characterName}
        portraitUrl={portraitUrl}
        episode={episode}
        playAs={playAs}
        sessionId={sessionId}
        characters={characters}
        episodes={episodes}
        onEpisodeChange={setEpisode}
        onPlayAsChange={setPlayAs}
        onClose={onClose}
      />
    </CopilotKit>
  );
}

interface ChatSurfaceProps {
  characterKey: string;
  characterName: string;
  portraitUrl: string | null;
  episode: string;
  playAs: string;
  sessionId: string;
  characters: CharacterOption[];
  episodes: EpisodeOption[];
  onEpisodeChange: (episode: string) => void;
  onPlayAsChange: (key: string) => void;
  onClose: () => void;
}

function ChatSurface({
  characterKey,
  characterName,
  portraitUrl,
  episode,
  playAs,
  sessionId,
  characters,
  episodes,
  onEpisodeChange,
  onPlayAsChange,
  onClose,
}: ChatSurfaceProps) {
  const { agent } = useAgent();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    agent.setMessages([]);
    setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterKey, episode]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [characterKey]);

  useEffect(() => {
    setMessages([...(agent.messages as ChatMessage[])]);
    const sub = agent.subscribe({
      onMessagesChanged: ({ messages: ms }) =>
        setMessages([...(ms as ChatMessage[])]),
      onRunFinalized: () => setRunning(false),
      onRunFailed: () => setRunning(false),
    });
    return () => sub.unsubscribe();
  }, [agent]);

  const visible = messages.filter(
    (m) => m.role === "user" || m.role === "assistant",
  );
  const lastIsAssistant =
    visible.length > 0 && visible[visible.length - 1].role === "assistant";

  const playAsChar = characters.find((c) => c.key === playAs) ?? null;
  const episodeLabel =
    episodes.find((e) => e.id === episode)?.label ??
    episode.toUpperCase().replace("E", " · E");

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [visible.length, running]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || running) {
      return;
    }
    setDraft("");
    agent.addMessage({ id: newMessageId(), role: "user", content: text });
    setRunning(true);
    try {
      await agent.runAgent({
        forwardedProps: {
          character: characterKey,
          episode,
          sessionId,
          playAs: playAs || null,
        },
      });
    } catch (error) {
      setRunning(false);
      console.error(error);
    }
  }, [draft, running, agent, characterKey, episode, sessionId, playAs]);

  const playAsOptions = characters.filter((c) => c.key !== characterKey);

  return (
    <div className="character-chat" role="dialog" aria-label={`Chat with ${characterName}`}>
      <header className="character-chat__header">
        {portraitUrl ? (
          <img className="character-chat__avatar" src={portraitUrl} alt="" />
        ) : (
          <div className="character-chat__avatar character-chat__avatar--empty" />
        )}
        <div className="character-chat__title">
          <span className="character-chat__name">{characterName}</span>
        </div>
        <button
          type="button"
          className="character-chat__close"
          onClick={onClose}
          aria-label="Close chat"
        >
          ×
        </button>
      </header>

      <div className="character-chat__controls">
        <EpisodeRewindSlider
          episodes={episodes}
          episode={episode}
          disabled={running}
          onEpisodeChange={onEpisodeChange}
        />
        <label className="character-chat__field character-chat__field--speak-as">
          <span className="character-chat__field-label">Speak as</span>
          <select
            className="character-chat__select"
            value={playAs}
            disabled={running}
            onChange={(e) => onPlayAsChange(e.target.value)}
          >
            <option value="">Visitor</option>
            {playAsOptions.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div ref={threadRef} className="character-chat__thread">
        {visible.length === 0 && !running && (
          <p className="character-chat__hint">
            {playAsChar
              ? `Speak to ${characterName} as ${playAsChar.name}.`
              : `Ask anything ${characterName} would know by ${episodeLabel}.`}
          </p>
        )}
        {visible.map((m) => (
          <div
            key={m.id}
            className={`character-chat__bubble character-chat__bubble--${m.role === "user" ? "user" : "assistant"}`}
          >
            {m.content || "…"}
          </div>
        ))}
        {running && !lastIsAssistant && (
          <div className="character-chat__thinking">…</div>
        )}
      </div>

      <form
        className="character-chat__composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={inputRef}
          className="character-chat__input"
          value={draft}
          placeholder={
            playAsChar
              ? `As ${playAsChar.name}…`
              : `Message ${characterName}…`
          }
          onChange={(e) => setDraft(e.target.value)}
          disabled={running}
        />
        <button
          type="submit"
          className="character-chat__send"
          disabled={running || !draft.trim()}
          aria-label="Send"
        >
          ↑
        </button>
      </form>
    </div>
  );
}

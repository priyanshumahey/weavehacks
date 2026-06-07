import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CopilotKit, useAgent } from "@copilotkit/react-core/v2";
import { randomUUID } from "@ag-ui/client";
import {
  Crown,
  Loader2,
  Menu,
  PanelRight,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  fetchCharacters,
  fetchEpisodes,
  fetchInnerState,
  type Character,
  type Episode,
  type InnerState,
} from "./api";
import { Avatar } from "./components/character-avatar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Slider } from "./components/ui/slider";
import { cn } from "./lib/utils";

const SESSION = `web-${Math.random().toString(36).slice(2, 8)}`;

export function App() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [episodeIdx, setEpisodeIdx] = useState(0);
  const [playAs, setPlayAs] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCharacters()
      .then((cs) => {
        setCharacters(cs);
        if (cs.length) setActiveKey(cs[0].key);
      })
      .catch((e) => setError(String(e)));
    fetchEpisodes()
      .then(setEpisodes)
      .catch((e) => setError(String(e)));
  }, []);

  const active = useMemo(
    () => characters.find((c) => c.key === activeKey) ?? null,
    [characters, activeKey],
  );
  const episode = episodes[episodeIdx];
  const sessionId = `${SESSION}:${activeKey ?? "none"}:${episode?.id ?? "s1e1"}`;

  // Stable identity so CopilotKit doesn't tear down/reconnect every render.
  const properties = useMemo(
    () => ({
      character: activeKey ?? "",
      episode: episode?.id ?? "s1e1",
      sessionId,
      playAs: playAs || null,
    }),
    [activeKey, episode?.id, sessionId, playAs],
  );

  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      showDevConsole={false}
      enableInspector={false}
      properties={properties}
    >
      <Chamber
        characters={characters}
        episodes={episodes}
        active={active}
        activeKey={activeKey}
        setActiveKey={setActiveKey}
        episode={episode}
        episodeIdx={episodeIdx}
        setEpisodeIdx={setEpisodeIdx}
        playAs={playAs}
        setPlayAs={setPlayAs}
        sessionId={sessionId}
        error={error}
      />
    </CopilotKit>
  );
}

interface ChamberProps {
  characters: Character[];
  episodes: Episode[];
  active: Character | null;
  activeKey: string | null;
  setActiveKey: (k: string) => void;
  episode: Episode | undefined;
  episodeIdx: number;
  setEpisodeIdx: (i: number) => void;
  playAs: string;
  setPlayAs: (k: string) => void;
  sessionId: string;
  error: string | null;
}

interface ChatMessage {
  id: string;
  role: string;
  content?: string;
}

function Chamber({
  characters,
  episodes,
  active,
  activeKey,
  setActiveKey,
  episode,
  episodeIdx,
  setEpisodeIdx,
  playAs,
  setPlayAs,
  sessionId,
  error,
}: ChamberProps) {
  const { agent } = useAgent();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [inner, setInner] = useState<InnerState | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // Mirror the agent's message list into React state as it streams; refresh the
  // inner state when a turn completes.
  useEffect(() => {
    setMessages([...(agent.messages as ChatMessage[])]);
    const sub = agent.subscribe({
      onMessagesChanged: ({ messages: ms }) =>
        setMessages([...(ms as ChatMessage[])]),
      onRunFinalized: () => {
        setRunning(false);
        fetchInnerState(sessionId).then((s) => s && setInner(s));
      },
      onRunFailed: () => setRunning(false),
    });
    return () => sub.unsubscribe();
  }, [agent, sessionId]);

  // Fresh thread whenever the character or rewind point changes.
  useEffect(() => {
    agent.setMessages([]);
    setMessages([]);
    setInner(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, episodeIdx]);

  const visible = messages.filter(
    (m) => m.role === "user" || m.role === "assistant",
  );
  const lastIsAssistant =
    visible.length > 0 && visible[visible.length - 1].role === "assistant";

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [visible.length, running]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !active || !episode || running) return;
    setDraft("");
    agent.addMessage({ id: randomUUID(), role: "user", content: text });
    setRunning(true);
    try {
      await agent.runAgent({
        forwardedProps: {
          character: active.key,
          episode: episode.id,
          sessionId,
          playAs: playAs || null,
        },
      });
    } catch (e) {
      setRunning(false);
      console.error(e);
    }
  }, [draft, active, episode, running, agent, sessionId, playAs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter((c) => c.name.toLowerCase().includes(q));
  }, [characters, query]);

  const playAsChar = characters.find((c) => c.key === playAs) ?? null;

  return (
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
      {/* backdrop for mobile/tablet drawers */}
      {(rosterOpen || inspectorOpen) && (
        <div
          className="fixed inset-0 z-30 bg-black/50 xl:hidden"
          onClick={() => {
            setRosterOpen(false);
            setInspectorOpen(false);
          }}
        />
      )}

      {/* ---------- roster ---------- */}
      <aside
        className={cn(
          "flex w-[280px] shrink-0 flex-col border-r border-border bg-card md:bg-card/40",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-2xl max-md:transition-transform",
          rosterOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
          "md:static md:translate-x-0",
        )}
      >
        <div className="flex items-start justify-between px-4 pt-5 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Crown className="size-4 text-primary" />
              <span className="text-sm font-semibold tracking-tight">
                A Game of Agents
              </span>
            </div>
            <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
              Council Chamber
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 md:hidden"
            onClick={() => setRosterOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="relative px-3 pb-2">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the court…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="px-4 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          {characters.length} characters
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {filtered.map((c) => (
            <button
              key={c.key}
              onClick={() => {
                setActiveKey(c.key);
                setRosterOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                c.key === activeKey
                  ? "bg-primary/15 text-foreground"
                  : "hover:bg-accent/60",
              )}
            >
              <Avatar charset={c.charset} name={c.name} className="size-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {c.name}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {c.title}
                </span>
              </span>
            </button>
          ))}
          {!characters.length && (
            <p className="px-2 py-4 text-xs text-muted-foreground">Loading…</p>
          )}
        </div>
      </aside>

      {/* ---------- stage ---------- */}
      <main className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-6 py-4">
              <Button
                variant="ghost"
                size="icon"
                className="size-9 md:hidden"
                onClick={() => setRosterOpen(true)}
              >
                <Menu className="size-4" />
              </Button>
              <Avatar
                charset={active.charset}
                name={active.name}
                className="size-11"
              />
              <div className="min-w-[120px] flex-1">
                <h2 className="truncate text-base font-semibold tracking-tight">
                  {active.name}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {active.title}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  as of{" "}
                  <span className="font-semibold text-primary">
                    {episode?.id.toUpperCase() ?? "—"}
                  </span>
                </span>
                <Slider
                  className="w-28 sm:w-36"
                  min={0}
                  max={Math.max(0, episodes.length - 1)}
                  step={1}
                  value={[episodeIdx]}
                  onValueChange={(v) => setEpisodeIdx(v[0])}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 xl:hidden"
                  onClick={() => setInspectorOpen(true)}
                >
                  <PanelRight className="size-4" />
                </Button>
              </div>
            </header>

            {/* play-as control */}
            <div className="flex items-center gap-2 border-b border-border bg-card/30 px-6 py-2 text-xs">
              <span className="text-muted-foreground">You speak as</span>
              <select
                value={playAs}
                onChange={(e) => setPlayAs(e.target.value)}
                className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">yourself (a visitor)</option>
                {characters
                  .filter((c) => c.key !== active.key)
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
              </select>
              {playAsChar && (
                <Badge variant="muted" className="ml-1">
                  in the voice of {playAsChar.name}
                </Badge>
              )}
            </div>

            {active.persona && (
              <p className="border-b border-border px-6 py-3 text-xs leading-relaxed text-muted-foreground">
                {active.persona}
              </p>
            )}

            <div
              ref={threadRef}
              className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-6 py-6"
            >
              {visible.length === 0 && !running && (
                <p className="m-auto max-w-md text-center text-sm text-muted-foreground">
                  Speak with {active.name} as they were in{" "}
                  {episode?.id.toUpperCase()}. They answer with only what they
                  knew by then.
                </p>
              )}
              {visible.map((m) => (
                <Bubble
                  key={m.id}
                  role={m.role}
                  content={m.content ?? ""}
                  char={active}
                />
              ))}
              {running && !lastIsAssistant && (
                <div className="flex items-center gap-2.5">
                  <Avatar
                    charset={active.charset}
                    name={active.name}
                    className="size-7"
                  />
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-card px-3.5 py-2.5 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span className="text-xs">thinking…</span>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="px-6 pb-1 text-xs text-destructive">{error}</p>
            )}

            <div className="border-t border-border px-6 py-4">
              <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
                <Input
                  value={draft}
                  placeholder={
                    playAsChar
                      ? `Speak to ${active.name} as ${playAsChar.name}…`
                      : `Address ${active.name}…`
                  }
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  disabled={running}
                  className="h-10"
                />
                <Button
                  onClick={send}
                  disabled={running || !draft.trim()}
                  size="icon"
                  className="size-10 shrink-0"
                >
                  {running ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="m-auto text-sm text-muted-foreground">
            {error ?? "Loading…"}
          </p>
        )}
      </main>

      {/* ---------- inspector ---------- */}
      <aside
        className={cn(
          "flex w-[340px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-border bg-card xl:bg-card/40 px-5 py-5",
          "max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:shadow-2xl max-xl:transition-transform",
          inspectorOpen ? "max-xl:translate-x-0" : "max-xl:translate-x-full",
          "xl:static xl:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-semibold tracking-tight">
              Inner State
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 xl:hidden"
            onClick={() => setInspectorOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        {inner ? (
          <>
            <p className="text-sm italic leading-relaxed text-foreground/90">
              {inner.felt}
            </p>

            <div>
              <SectionLabel>Drives</SectionLabel>
              <div className="mt-2 space-y-2.5">
                {inner.drives.map((d) => (
                  <div key={d.name}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="capitalize text-foreground/80">
                        {d.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {Math.round(d.value)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, d.value)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <SectionLabel>
                Recalled Memories · {inner.memoryCount} held
              </SectionLabel>
              <ul className="mt-2 space-y-2">
                {inner.recalledMemories.map((m, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-background/60 p-2.5 text-xs leading-relaxed text-foreground/85"
                  >
                    {m.text}
                    {m.concepts.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.concepts.map((c) => (
                          <Badge key={c} variant="muted" className="text-[10px]">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
                {inner.recalledMemories.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    Nothing surfaced this turn.
                  </li>
                )}
              </ul>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Begin a conversation to see what stirs within.
          </p>
        )}
      </aside>
    </div>
  );
}

function Bubble({
  role,
  content,
  char,
}: {
  role: string;
  content: string;
  char: Character;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <Avatar charset={char.charset} name={char.name} className="mt-0.5 size-7" />
      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-card px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
        {content || "…"}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

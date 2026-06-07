// CopilotKit runtime — bridges CopilotKit's chat UI to the got_agents pipeline.
//
// Flow per turn:
//   browser <CopilotChat> -> Vite proxy /api/copilotkit -> this Node runtime
//   -> POST FastAPI /api/prepare (builds the story-point-grounded system prompt
//      + recalled memories + drives, and stashes the inner state) -> streamText
//   from OpenAI with that system prompt and the full message history.
//
// Multi-turn history is managed by CopilotKit client-side and arrives in
// `input.messages`. The character/episode/play-as selection arrives in
// `input.forwardedProps` (set via the <CopilotKit properties={...}> prop).

import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import {
  BuiltInAgent,
  CopilotRuntime,
  InMemoryAgentRunner,
  convertMessagesToVercelAISDKMessages,
} from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const here = path.dirname(fileURLToPath(import.meta.url));
// Load the repo-root .env (OPENAI_API_KEY etc.).
loadEnv({ path: path.resolve(here, "../../.env") });

const FASTAPI = process.env.FASTAPI_BASE ?? "http://localhost:8000";
const PORT = Number(process.env.COPILOTKIT_PORT ?? 4100);
const MODEL = process.env.GOT_CHAT_MODEL ?? "gpt-5.5";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Most recent user message text, for memory recall on the FastAPI side. */
function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user") {
      return typeof m.content === "string" ? m.content : "";
    }
  }
  return "";
}

const agent = new BuiltInAgent({
  type: "aisdk",
  factory: async ({ input, abortSignal }) => {
    const props = input.forwardedProps ?? {};
    const character = props.character ?? "cersei";
    const episode = props.episode ?? "s1e1";
    const sessionId = props.sessionId ?? "default";
    const playAs = props.playAs ?? null;
    const message = lastUserText(input.messages ?? []);

    let system = `You are ${character}. Speak strictly in character.`;
    try {
      const res = await fetch(`${FASTAPI}/api/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character,
          message,
          episode,
          session_id: sessionId,
          play_as: playAs,
        }),
        signal: abortSignal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.system) system = data.system;
      } else {
        console.error("prepare failed", res.status);
      }
    } catch (err) {
      console.error("prepare error", err?.message ?? err);
    }

    const messages = [
      { role: "system", content: system },
      ...convertMessagesToVercelAISDKMessages(input.messages ?? []),
    ];

    return streamText({ model: openai.chat(MODEL), messages, abortSignal });
  },
});

const runtime = new CopilotRuntime({
  agents: { default: agent },
  runner: new InMemoryAgentRunner(),
});

const listener = createCopilotNodeListener({
  runtime,
  basePath: "/api/copilotkit",
  // The v2 React client POSTs a single JSON envelope to the base path
  // ({ method, params, body }) rather than per-operation routes.
  mode: "single-route",
  cors: true,
});

createServer(listener).listen(PORT, () => {
  console.log(
    `CopilotKit runtime listening on :${PORT} (FastAPI ${FASTAPI}, model ${MODEL})`,
  );
});

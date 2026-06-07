import { createRoot, type Root } from "react-dom/client";
import {
  CharacterChatPanel,
  type CharacterChatPanelProps,
} from "./CharacterChatPanel";

export function mountCharacterChat(
  container: HTMLElement,
  props: CharacterChatPanelProps,
): () => void {
  const root: Root = createRoot(container);
  root.render(<CharacterChatPanel {...props} />);
  return () => root.unmount();
}

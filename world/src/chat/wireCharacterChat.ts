import type { ReplayPortraitPanel } from "../replay/ReplayPortraitPanel";
import { CharacterChatOverlay, type CharacterChatTarget } from "./CharacterChatOverlay";

export function wireCharacterChat(
  panel: ReplayPortraitPanel,
  resolveTarget: (characterKey: string) => CharacterChatTarget | null,
): CharacterChatOverlay {
  const overlay = new CharacterChatOverlay();
  overlay.setOnClose(() => panel.setChatActive(false));
  panel.setOnChat((characterKey) => {
    if (overlay.isOpen()) {
      overlay.dismiss();
      return;
    }
    const target = resolveTarget(characterKey);
    if (target) {
      void overlay.open(target);
      panel.setChatActive(true);
      return;
    }
    console.warn(`[chat] no target for character key ${JSON.stringify(characterKey)}`);
  });
  return overlay;
}

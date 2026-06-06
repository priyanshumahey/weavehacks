const CHARACTER_PORTRAIT_MODULES = import.meta.glob("../../sprites/Characters/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

function normalizePortraitName(modulePath: string): string {
  const fileName = modulePath.split("/").pop() ?? modulePath;
  return fileName.replace(/\.png$/i, "").toLowerCase();
}

const portraitUrlByName = new Map<string, string>();

for (const [modulePath, url] of Object.entries(CHARACTER_PORTRAIT_MODULES)) {
  portraitUrlByName.set(normalizePortraitName(modulePath), url);
}

export function getCharacterPortraitUrl(characterName: string): string | null {
  return portraitUrlByName.get(characterName.trim().toLowerCase()) ?? null;
}

export function resolvePortraitNameFromFrameSourcePath(
  frameSourcePath: string | undefined,
): string | null {
  if (!frameSourcePath) {
    return null;
  }

  const match = /^charsets\/sprites\/(.+)$/i.exec(frameSourcePath.trim());

  return match?.[1]?.trim() ?? null;
}

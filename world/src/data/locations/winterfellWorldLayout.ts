import {
  LOCATION_IDS,
  type LocationDefinition,
  type WorldLayoutDefinition,
} from "../../types/location";
import { MAP_TEXTURE_SOURCE_PATHS } from "../../types/terrain";
import { createMapBackground } from "./createMapBackground";

const throneRoomMap = createMapBackground(
  MAP_TEXTURE_SOURCE_PATHS.throneRoom,
  1024,
  1536,
);

const winterfellMap = createMapBackground(
  MAP_TEXTURE_SOURCE_PATHS.winterfell,
  1254,
  1254,
);

const wallMap = createMapBackground(MAP_TEXTURE_SOURCE_PATHS.wall, 1536, 1024);

const vaesDothrakMap = createMapBackground(
  MAP_TEXTURE_SOURCE_PATHS.vaesDothrak,
  1536,
  1024,
);

const dragonstoneMap = createMapBackground(
  MAP_TEXTURE_SOURCE_PATHS.dragonstone,
  1254,
  1254,
);

const vaesDothrakOffsetX =
  throneRoomMap.width + winterfellMap.width + wallMap.width;

const dragonstoneOffsetX = vaesDothrakOffsetX + vaesDothrakMap.width;

/** Westeros and Essos locations in one horizontal scrollable world. */
export const winterfellWorldLayout: WorldLayoutDefinition = {
  defaultLocationId: LOCATION_IDS.throneRoom,
  locations: [
    {
      id: LOCATION_IDS.throneRoom,
      label: "Throne Room",
      map: throneRoomMap,
      offset: { x: 0, y: 0 },
    },
    {
      id: LOCATION_IDS.winterfell,
      label: "Winterfell Courtyard",
      map: winterfellMap,
      offset: { x: throneRoomMap.width, y: 0 },
    },
    {
      id: LOCATION_IDS.wall,
      label: "The Wall",
      map: wallMap,
      offset: { x: throneRoomMap.width + winterfellMap.width, y: 0 },
    },
    {
      id: LOCATION_IDS.vaesDothrak,
      label: "Vaes Dothrak",
      map: vaesDothrakMap,
      offset: { x: vaesDothrakOffsetX, y: 0 },
    },
    {
      id: LOCATION_IDS.dragonstone,
      label: "Dragonstone",
      map: dragonstoneMap,
      offset: { x: dragonstoneOffsetX, y: 0 },
    },
  ],
};

export function getLocationById(
  locationId: string,
  layout: WorldLayoutDefinition = winterfellWorldLayout,
): LocationDefinition | undefined {
  return layout.locations.find((location) => location.id === locationId);
}

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

/** Throne room left, Winterfell courtyard to its right — one scrollable world. */
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
  ],
};

export function getLocationById(
  locationId: string,
  layout: WorldLayoutDefinition = winterfellWorldLayout,
): LocationDefinition | undefined {
  return layout.locations.find((location) => location.id === locationId);
}

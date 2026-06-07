import type { MapBackgroundDefinition } from "./terrain";

export const LOCATION_IDS = {
  throneRoom: "throne-room",
  winterfell: "winterfell",
  wall: "wall",
  vaesDothrak: "vaes-dothrak",
  dragonstone: "dragonstone",
} as const;

export type LocationId = (typeof LOCATION_IDS)[keyof typeof LOCATION_IDS];

export interface LocationDefinition {
  id: LocationId;
  label: string;
  map: MapBackgroundDefinition;
  offset: { x: number; y: number };
}

export interface WorldLayoutDefinition {
  locations: LocationDefinition[];
  defaultLocationId: LocationId;
}

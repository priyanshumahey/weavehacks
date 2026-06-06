export interface PropSpriteOrigin {
  x: number;
  y: number;
}

export interface PropSpriteMetadata {
  textureKey: string;
  scale: number;
  origin: PropSpriteOrigin;
  collisionRadius: number;
}

export interface PropSpriteDefinition {
  textureKey?: string;
  textureSourcePath?: string;
  scale?: number;
  origin?: {
    x?: number;
    y?: number;
  };
  collisionRadius?: number;
}

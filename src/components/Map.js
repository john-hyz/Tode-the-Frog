import * as THREE from 'three';

export const MAP_TILE_SIZE = 20;
export const MAP_TILES_PER_SIDE = 40;
export const MAP_HALF_SIZE = (MAP_TILE_SIZE * MAP_TILES_PER_SIDE) / 2;

export function isInsideMap(position, radius = 0) {
  if (!position) return false;
  const limit = MAP_HALF_SIZE - radius;
  return Math.abs(position.x) <= limit && Math.abs(position.y) <= limit;
}

export function createMap() {
  const map = new THREE.Group();
  map.name = 'Map';

  const darkGreen = new THREE.MeshBasicMaterial({ color: 0x228b22 });
  const lightGreen = new THREE.MeshBasicMaterial({ color: 0x90ee90 });
  const offset = (MAP_TILES_PER_SIDE * MAP_TILE_SIZE) / 2 - MAP_TILE_SIZE / 2;

  for (let row = 0; row < MAP_TILES_PER_SIDE; row++) {
    for (let column = 0; column < MAP_TILES_PER_SIDE; column++) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(MAP_TILE_SIZE, MAP_TILE_SIZE, 0.2),
        (row + column) % 2 === 0 ? darkGreen : lightGreen,
      );
      tile.position.set(
        column * MAP_TILE_SIZE - offset,
        row * MAP_TILE_SIZE - offset,
        -0.1,
      );
      map.add(tile);
    }
  }

  return map;
}

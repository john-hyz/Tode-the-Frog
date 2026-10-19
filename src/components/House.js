import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const HOUSE_COUNT = 8;
export const HOUSE_SCALE = 65;
export const HOUSE_MIN_DISTANCE = 180;
const DEFAULT_HOUSE_HALF_SIZE = 45;
export const houses = [];

const loader = new GLTFLoader();
let houseTemplate = null;
const pendingHouses = [];
const housePositions = [];

loader.load('/models/small_house.glb', (gltf) => {
  houseTemplate = gltf.scene;
  for (const house of pendingHouses) {
    addHouseModel(house);
  }
  pendingHouses.length = 0;
});

function getHousePosition(index) {
  while (housePositions.length <= index) {
    const candidate = {
      x: THREE.MathUtils.randFloat(-300, 300),
      y: THREE.MathUtils.randFloat(-300, 300),
    };
    if (
      Math.hypot(candidate.x, candidate.y) < HOUSE_MIN_DISTANCE / 2 ||
      housePositions.some((position) => Math.hypot(candidate.x - position.x, candidate.y - position.y) < HOUSE_MIN_DISTANCE)
    ) {
      continue;
    }
    housePositions.push(candidate);
  }
  return housePositions[index];
}

function addHouseModel(house) {
  const model = houseTemplate.clone(true);
  model.rotation.x = Math.PI / 2;
  model.rotation.y = THREE.MathUtils.randInt(0, 3) * (Math.PI / 2);
  model.scale.setScalar(HOUSE_SCALE);
  model.updateMatrixWorld(true);

  const initialBounds = new THREE.Box3().setFromObject(model);
  model.position.z = -initialBounds.min.z;
  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  house.collisionBounds = {
    halfX: size.x / 2,
    halfY: size.y / 2,
  };
  house.add(model);
  house.model = model;
}

export function createHouses(map, count = HOUSE_COUNT) {
  houses.length = 0;
  housePositions.length = 0;
  for (let index = 0; index < count; index++) {
    const house = new THREE.Group();
    const position = getHousePosition(index);
    house.name = `House-${index + 1}`;
    house.position.set(position.x, position.y, 0);
    house.collisionBounds = {
      halfX: DEFAULT_HOUSE_HALF_SIZE,
      halfY: DEFAULT_HOUSE_HALF_SIZE,
    };
    map.add(house);
    houses.push(house);

    if (houseTemplate) {
      addHouseModel(house);
    } else {
      pendingHouses.push(house);
    }
  }
  return houses;
}

export function collidesWithHouses(position, radius = 0) {
  if (!position) return false;
  return houses.some((house) => {
    if (!house.collisionBounds) return false;
    const offsetX = Math.max(
      Math.abs(position.x - house.position.x) - house.collisionBounds.halfX,
      0,
    );
    const offsetY = Math.max(
      Math.abs(position.y - house.position.y) - house.collisionBounds.halfY,
      0,
    );
    return Math.hypot(offsetX, offsetY) <= radius;
  });
}

export function getHouseTangentDirections(position, distance = 0) {
  if (!position) return [];
  const directions = [];

  for (const house of houses) {
    if (!house.collisionBounds) continue;
    const halfX = house.collisionBounds.halfX + distance;
    const halfY = house.collisionBounds.halfY + distance;
    const offsetX = position.x - house.position.x;
    const offsetY = position.y - house.position.y;

    if (Math.abs(offsetX) > halfX || Math.abs(offsetY) > halfY) {
      continue;
    }

    if (Math.abs(offsetX) / halfX > Math.abs(offsetY) / halfY) {
      directions.push({ x: 0, y: offsetX >= 0 ? 1 : -1 });
      directions.push({ x: 0, y: offsetX >= 0 ? -1 : 1 });
    } else {
      directions.push({ x: offsetY >= 0 ? 1 : -1, y: 0 });
      directions.push({ x: offsetY >= 0 ? -1 : 1, y: 0 });
    }
  }

  return directions;
}

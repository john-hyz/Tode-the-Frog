import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { collidesWithHouses, getHouseTangentDirections, houses } from './House.js';
import { isInsideMap, MAP_HALF_SIZE } from './Map.js';

export const ENEMY_SPEED = 60;
export const ENEMY_FORMATION_SPACING = 20;
export const ENEMY_MIN_SPAWN_RADIUS = 150;
export const ENEMY_MAX_SPAWN_RADIUS = 160;
export const COLLISION_DISTANCE = 15;
export const ENEMY_COLLISION_DISTANCE = COLLISION_DISTANCE;
export const SPAWN_DELAY = 5000; // milliseconds between spawns
export const INITIAL_ENEMY_COUNT = 4;
export const MAX_ENEMY_COUNT = 20;
export const MAP_CORNER_SPAWN_LOCATIONS = [
  { x: -150, y: -150 },
  { x: 150, y: -150 },
  { x: 150, y: 150 },
  { x: -150, y: 150 },
];

export const SPAWN_LOCATIONS = [];

export const enemies = [];
let enemySpeed = ENEMY_SPEED;
let enemyAudioUnlocked = false;
let enemyAudioEnabled = true;

window.addEventListener('keydown', () => {
  enemyAudioUnlocked = true;
  for (const enemy of enemies) {
    startEnemySound(enemy);
  }
});

const loader = new GLTFLoader();
let enemyModelTemplate = null;
let enemyZOffset = 0;
const pendingEnemyGroups = [];

loader.load('/models/enemy.glb', (gltf) => {
  enemyModelTemplate = gltf.scene;
  enemyModelTemplate.rotation.x = Math.PI / 2;
  enemyModelTemplate.scale.setScalar(5);
  enemyModelTemplate.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(enemyModelTemplate);
  const modelHeight = box.max.z - box.min.z;
  enemyZOffset = modelHeight - box.max.z;
  enemyModelTemplate.position.z = Math.max(0, enemyZOffset);

  for (const group of pendingEnemyGroups) {
    const model = SkeletonUtils.clone(enemyModelTemplate);
    group.add(model);
    group.model = model;
    model.rotation.y = group.facingRotation || 0;
  }
  pendingEnemyGroups.length = 0;
});

export function createEnemy(position = SPAWN_LOCATIONS[0]) {
  const enemyGroup = new THREE.Group();
  enemyGroup.position.set(position.x, position.y, 0);
  enemyGroup.enemyAudio = new Audio('/audio/bee.mp3');
  enemyGroup.enemyAudio.loop = true;
  enemyGroup.enemyAudio.preload = 'auto';
  enemyGroup.enemyAudio.volume = 0;
  enemyGroup.enemyAudioEnabled = true;

  if (enemyModelTemplate) {
    const model = SkeletonUtils.clone(enemyModelTemplate);
    enemyGroup.add(model);
    enemyGroup.model = model;
    model.rotation.y = enemyGroup.facingRotation || 0;
  } else {
    pendingEnemyGroups.push(enemyGroup);
  }

  return enemyGroup;
}

function startEnemySound(enemy) {
  if (!enemy?.enemyAudio || !enemyAudioUnlocked || !enemyAudioEnabled || !enemy.enemyAudioEnabled) return;
  const playPromise = enemy.enemyAudio.play();
  if (playPromise) {
    playPromise.catch(() => {});
  }
}

export function stopEnemySound(enemy) {
  if (!enemy?.enemyAudio) return;
  enemy.enemyAudioEnabled = false;
  enemy.enemyAudio.pause();
  enemy.enemyAudio.currentTime = 0;
}

export function stopAllEnemySounds() {
  enemyAudioEnabled = false;
  for (const enemy of enemies) {
    stopEnemySound(enemy);
  }
}

export function pauseAllEnemySounds() {
  for (const enemy of enemies) {
    if (enemy.enemyAudio) {
      enemy.enemyAudio.pause();
    }
  }
}

export function resumeAllEnemySounds() {
  enemyAudioEnabled = true;
  for (const enemy of enemies) {
    startEnemySound(enemy);
  }
}

export function enableEnemySounds() {
  enemyAudioEnabled = true;
}

function updateEnemySound(enemy, player) {
  if (!enemy?.enemyAudio || !player) return;
  const distance = enemy.position.distanceTo(player.position);
  const maxDistance = MAP_HALF_SIZE * 1.5;
  const proximity = THREE.MathUtils.clamp(1 - distance / maxDistance, 0, 1);
  enemy.enemyAudio.volume = proximity * 0.35;
  startEnemySound(enemy);
}

let lastSpawnTime = -SPAWN_DELAY;
let initialSpawned = false;

function generateSpawnLocations(player = null, useMapCorners = false) {
  SPAWN_LOCATIONS.length = 0;
  if (useMapCorners) {
    const limit = MAP_HALF_SIZE - COLLISION_DISTANCE;
    for (const location of MAP_CORNER_SPAWN_LOCATIONS) {
      const candidate = {
        x: THREE.MathUtils.clamp(location.x, -limit, limit),
        y: THREE.MathUtils.clamp(location.y, -limit, limit),
      };
      if (
        !collidesWithHouses(candidate, COLLISION_DISTANCE) &&
        SPAWN_LOCATIONS.every(
          (spawnLocation) =>
            Math.hypot(candidate.x - spawnLocation.x, candidate.y - spawnLocation.y) >=
            ENEMY_FORMATION_SPACING,
        )
      ) {
        SPAWN_LOCATIONS.push(candidate);
      }
    }
  }

  const playerX = player?.position?.x ?? 0;
  const playerY = player?.position?.y ?? 0;
  const mapLimit = MAP_HALF_SIZE - COLLISION_DISTANCE;
  let attempts = 0;

  while (SPAWN_LOCATIONS.length < 4 && attempts < 100) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(
      Math.random() *
        (ENEMY_MAX_SPAWN_RADIUS ** 2 - ENEMY_MIN_SPAWN_RADIUS ** 2) +
        ENEMY_MIN_SPAWN_RADIUS ** 2,
    );
    const candidate = {
      x: THREE.MathUtils.clamp(playerX + Math.cos(angle) * radius, -mapLimit, mapLimit),
      y: THREE.MathUtils.clamp(playerY + Math.sin(angle) * radius, -mapLimit, mapLimit),
    };

    const isSeparated = SPAWN_LOCATIONS.every((location) => {
      const dx = candidate.x - location.x;
      const dy = candidate.y - location.y;
      return Math.hypot(dx, dy) >= ENEMY_FORMATION_SPACING;
    });

    if (isSeparated && !collidesWithHouses(candidate, COLLISION_DISTANCE)) {
      SPAWN_LOCATIONS.push(candidate);
    }
  }

  while (SPAWN_LOCATIONS.length < 4) {
    const candidate = {
      x: THREE.MathUtils.randFloat(-mapLimit, mapLimit),
      y: THREE.MathUtils.randFloat(-mapLimit, mapLimit),
    };
    if (
      isInsideMap(candidate, COLLISION_DISTANCE) &&
      !collidesWithHouses(candidate, COLLISION_DISTANCE) &&
      SPAWN_LOCATIONS.every(
        (location) =>
          Math.hypot(candidate.x - location.x, candidate.y - location.y) >=
          ENEMY_FORMATION_SPACING,
      )
    ) {
      SPAWN_LOCATIONS.push(candidate);
    }
  }
}

export function spawnEnemyManager(
  scene,
  currentTime = performance.now(),
  player = null,
  allowRecurring = true,
  useMapCorners = false,
) {
  const canSpawnInitial = !initialSpawned;
  const canSpawnRecurring =
    allowRecurring &&
    enemies.length < MAX_ENEMY_COUNT &&
    currentTime - lastSpawnTime >= SPAWN_DELAY;

  if (canSpawnInitial || canSpawnRecurring) {
    const isInitialSpawn = !initialSpawned;
    lastSpawnTime = currentTime;
    initialSpawned = true;
    generateSpawnLocations(player, useMapCorners);
    const spawnCount = isInitialSpawn ? INITIAL_ENEMY_COUNT : 1;
    for (let i = 0; i < spawnCount; i++) {
      const spawnPos = SPAWN_LOCATIONS[i];
      const enemy = createEnemy(spawnPos);
      const targetX = player?.position.x || 0;
      const targetY = player?.position.y || 0;
      enemy.facingRotation = Math.atan2(targetX - spawnPos.x, -(targetY - spawnPos.y));
      if (enemy.model) {
        enemy.model.rotation.y = enemy.facingRotation;
      }
      scene.add(enemy);
      enemies.push(enemy);
      startEnemySound(enemy);
    }
  }

}

export function spawnEnemy(scene, player = null, useMapCorners = false) {
  generateSpawnLocations(player, useMapCorners);
  const spawnPos = SPAWN_LOCATIONS[0];
  const enemy = createEnemy(spawnPos);
  const targetX = player?.position.x || 0;
  const targetY = player?.position.y || 0;
  enemy.facingRotation = Math.atan2(targetX - spawnPos.x, -(targetY - spawnPos.y));
  if (enemy.model) {
    enemy.model.rotation.y = enemy.facingRotation;
  }
  scene.add(enemy);
  enemies.push(enemy);
  startEnemySound(enemy);
}

export function setEnemySpeed(speed) {
  enemySpeed = Math.max(0, speed);
}

export function startRecurringSpawns(currentTime = performance.now()) {
  lastSpawnTime = currentTime;
}

export function resetEnemies(scene) {
  enableEnemySounds();
  for (const enemy of enemies) {
    stopEnemySound(enemy);
    scene.remove(enemy);
  }
  enemies.length = 0;
  lastSpawnTime = -SPAWN_DELAY;
  initialSpawned = false;
}

export function removeEnemy(scene, enemy) {
  const index = enemies.indexOf(enemy);
  if (index !== -1) {
    enemies.splice(index, 1);
  }
  if (enemy?.parent) {
    enemy.parent.remove(enemy);
  } else if (scene) {
    scene.remove(enemy);
  }
  stopEnemySound(enemy);
}

export function checkCollision(pos1, pos2, minDistance = COLLISION_DISTANCE) {
  if (!pos1 || !pos2) return false;
  const x1 = pos1.x ?? 0;
  const y1 = pos1.y ?? 0;
  const x2 = pos2.x ?? 0;
  const y2 = pos2.y ?? 0;
  return Math.hypot(x1 - x2, y1 - y2) < minDistance;
}

export function updateEnemies(player, deltaSeconds = 1 / 60) {
  if (!player) return;

  const movementStep = enemySpeed * Math.min(Math.max(deltaSeconds, 0), 0.1);

  for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex++) {
    const enemy = enemies[enemyIndex];
    const dx = player.position.x - enemy.position.x;
    const dy = player.position.y - enemy.position.y;
    const distSq = dx * dx + dy * dy;
    updateEnemySound(enemy, player);

    if (distSq === 0) continue;

    const dist = Math.sqrt(distSq);
    let dirX = dx / dist;
    let dirY = dy / dist;

    let separationX = 0;
    let separationY = 0;

    for (const other of enemies) {
      if (other === enemy) continue;
      const awayX = enemy.position.x - other.position.x;
      const awayY = enemy.position.y - other.position.y;
      const otherDistance = Math.hypot(awayX, awayY);
      if (otherDistance > 0 && otherDistance < COLLISION_DISTANCE * 2) {
        const strength = (COLLISION_DISTANCE * 2 - otherDistance) / otherDistance;
        separationX += awayX * strength;
        separationY += awayY * strength;
      }
    }

    const separationLength = Math.hypot(separationX, separationY);
    if (separationLength > 0) {
      const pursuitWeight = 0.85;
      const separationWeight = 0.15;
      dirX = dirX * pursuitWeight + (separationX / separationLength) * separationWeight;
      dirY = dirY * pursuitWeight + (separationY / separationLength) * separationWeight;
      const directionLength = Math.hypot(dirX, dirY);
      dirX /= directionLength;
      dirY /= directionLength;
    }

    if (enemy.model) {
      enemy.model.rotation.y = Math.atan2(dirX, -dirY);
    }

    const movementDirection = findEnemyMovementDirection(
      enemy,
      player,
      dirX,
      dirY,
      movementStep,
    );
    if (movementDirection) {
      enemy.position.x += movementDirection.x * movementDirection.distance;
      enemy.position.y += movementDirection.y * movementDirection.distance;
    }
  }
}

function findEnemyMovementDirection(enemy, player, dirX, dirY, movementStep) {
  const angles = [
    0,
    Math.PI / 8,
    -Math.PI / 8,
    Math.PI / 4,
    -Math.PI / 4,
    (3 * Math.PI) / 8,
    (-3 * Math.PI) / 8,
    Math.PI / 2,
    -Math.PI / 2,
    (5 * Math.PI) / 8,
    (-5 * Math.PI) / 8,
    (3 * Math.PI) / 4,
    (-3 * Math.PI) / 4,
    Math.PI,
  ];

  let bestDirection = null;
  let bestDistanceToPlayer = Infinity;
  let bestStep = 0;
  const tangentDirections = getHouseTangentDirections(enemy.position, COLLISION_DISTANCE);
  const depenetrationDirection = getHouseDepenetrationDirection(enemy.position);

  if (depenetrationDirection) {
    for (const distanceScale of [0.25, 0.5, 1, 1.5, 2, 3, 4]) {
      const candidateStep = movementStep * distanceScale;
      const candidatePosition = {
        x: enemy.position.x + depenetrationDirection.x * candidateStep,
        y: enemy.position.y + depenetrationDirection.y * candidateStep,
      };
      if (
        isInsideMap(candidatePosition, COLLISION_DISTANCE * 0.5) &&
        !collidesWithHouses(candidatePosition, COLLISION_DISTANCE)
      ) {
        return { ...depenetrationDirection, distance: candidateStep };
      }
    }
  }

  for (const stepScale of [1, 0.75, 0.5, 0.25]) {
    for (const tangentDirection of tangentDirections) {
      const candidateStep = movementStep * stepScale;
      const candidatePosition = {
        x: enemy.position.x + tangentDirection.x * candidateStep,
        y: enemy.position.y + tangentDirection.y * candidateStep,
      };
      if (
        isInsideMap(candidatePosition, COLLISION_DISTANCE) &&
        !collidesWithHouses(candidatePosition, COLLISION_DISTANCE)
      ) {
        return { ...tangentDirection, distance: candidateStep };
      }
    }

    for (const angle of angles) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const candidateDirection = {
        x: dirX * cos - dirY * sin,
        y: dirX * sin + dirY * cos,
      };
      const candidateStep = movementStep * stepScale;
      const candidatePosition = {
        x: enemy.position.x + candidateDirection.x * candidateStep,
        y: enemy.position.y + candidateDirection.y * candidateStep,
      };

      if (
        !isInsideMap(candidatePosition, COLLISION_DISTANCE) ||
        collidesWithHouses(candidatePosition, COLLISION_DISTANCE)
      ) {
        continue;
      }

      const distanceToPlayer = Math.hypot(
        candidatePosition.x - player.position.x,
        candidatePosition.y - player.position.y,
      );
      if (
        distanceToPlayer < bestDistanceToPlayer ||
        (distanceToPlayer === bestDistanceToPlayer && candidateStep > bestStep)
      ) {
        bestDistanceToPlayer = distanceToPlayer;
        bestDirection = candidateDirection;
        bestStep = candidateStep;
      }
    }
  }

  if (bestDirection) {
    return { ...bestDirection, distance: bestStep };
  }

  const escapeDirections = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  for (const house of houses) {
    const awayX = enemy.position.x - house.position.x;
    const awayY = enemy.position.y - house.position.y;
    const awayLength = Math.hypot(awayX, awayY);
    if (awayLength > COLLISION_DISTANCE * 3) continue;
    if (awayLength > 0) {
      escapeDirections.unshift({
        x: awayX / awayLength,
        y: awayY / awayLength,
      });
    }
  }

  for (const direction of escapeDirections) {
    for (const distanceScale of [0.25, 0.5, 1, 1.5, 2, 3, 4]) {
      const escapeDistance = movementStep * distanceScale;
      const escapePosition = {
        x: enemy.position.x + direction.x * escapeDistance,
        y: enemy.position.y + direction.y * escapeDistance,
      };
      if (
        isInsideMap(escapePosition, COLLISION_DISTANCE * 0.5) &&
        !collidesWithHouses(escapePosition, COLLISION_DISTANCE * 0.5)
      ) {
        return { ...direction, distance: escapeDistance };
      }
    }
  }

  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    for (const distanceScale of [1, 2, 3, 4]) {
      const escapeDistance = movementStep * distanceScale;
      const escapePosition = {
        x: enemy.position.x + direction.x * escapeDistance,
        y: enemy.position.y + direction.y * escapeDistance,
      };
      if (
        isInsideMap(escapePosition, COLLISION_DISTANCE * 0.5) &&
        !collidesWithHouses(escapePosition, COLLISION_DISTANCE * 0.5)
      ) {
        return { ...direction, distance: escapeDistance };
      }
    }
  }

  return null;
}

function getHouseDepenetrationDirection(position) {
  let bestDirection = null;
  let smallestClearance = Infinity;

  for (const house of houses) {
    if (!house.collisionBounds) continue;

    const halfX = house.collisionBounds.halfX + COLLISION_DISTANCE;
    const halfY = house.collisionBounds.halfY + COLLISION_DISTANCE;
    const offsetX = position.x - house.position.x;
    const offsetY = position.y - house.position.y;

    if (Math.abs(offsetX) > halfX || Math.abs(offsetY) > halfY) continue;

    const distanceToLeft = offsetX + halfX;
    const distanceToRight = halfX - offsetX;
    const distanceToBottom = offsetY + halfY;
    const distanceToTop = halfY - offsetY;
    const nearestDistance = Math.min(
      distanceToLeft,
      distanceToRight,
      distanceToBottom,
      distanceToTop,
    );

    if (nearestDistance !== smallestClearance) {
      smallestClearance = nearestDistance;
      if (nearestDistance === distanceToLeft) {
        bestDirection = { x: -1, y: 0 };
      } else if (nearestDistance === distanceToRight) {
        bestDirection = { x: 1, y: 0 };
      } else if (nearestDistance === distanceToBottom) {
        bestDirection = { x: 0, y: -1 };
      } else {
        bestDirection = { x: 0, y: 1 };
      }
    }
  }

  return bestDirection;
}

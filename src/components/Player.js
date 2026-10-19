import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COLLISION_DISTANCE, checkCollision, enemies, stopEnemySound } from './Enemy.js';
import { collidesWithHouses } from './House.js';
import { isInsideMap } from './Map.js';

export const MOVEMENT_SPEED = 0.08;
export const JUMP_HEIGHT = 15;
export const JUMP_DISTANCE = 20;

export const ATTACK_COOLDOWN = 1;
export const ATTACK_RADIUS = 30;
export const ATTACK_DURATION = 0.3;
const PLAYER_HOUSE_COLLISION_RADIUS = 5;

export const inputQueue = [];
const heldDirections = new Set();
let controlsEnabled = true;
export let attackCooldown = 0;
export const activeAttacks = [];
let currentPlayer = null;
let onEnemyDefeatedCallback = null;
let movementSpeed = MOVEMENT_SPEED;
let attackCooldownDuration = ATTACK_COOLDOWN;
let attackRadius = ATTACK_RADIUS;
let attackEnabled = false;
const moveSound = new Audio('/audio/step.mp3');
moveSound.preload = 'auto';
moveSound.volume = 0.6;
const attackSound = new Audio('/audio/fog.mp3');
attackSound.preload = 'auto';
attackSound.volume = 0.5;

export function setOnEnemyDefeated(callback) {
  onEnemyDefeatedCallback = callback;
}

export function setDifficultyParameters({ movement, cooldown, radius }) {
  movementSpeed = Math.max(0, movement);
  attackCooldownDuration = Math.max(0, cooldown);
  attackRadius = Math.max(1, radius);
}

export function getAttackCooldownState() {
  return {
    remaining: attackCooldown,
    duration: attackCooldownDuration,
  };
}

function playMoveSound() {
  moveSound.currentTime = 0;
  const playPromise = moveSound.play();
  if (playPromise) {
    playPromise.catch((error) => {
      console.warn('Unable to play movement sound:', error);
    });
  }
}

function stopMoveSound() {
  moveSound.pause();
  moveSound.currentTime = 0;
}

const KEY_MAP = {
  ArrowUp: 'ArrowUp',
  KeyW: 'ArrowUp',
  w: 'ArrowUp',
  W: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  KeyS: 'ArrowDown',
  s: 'ArrowDown',
  S: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  KeyA: 'ArrowLeft',
  a: 'ArrowLeft',
  A: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  KeyD: 'ArrowRight',
  d: 'ArrowRight',
  D: 'ArrowRight',
};

window.addEventListener('keydown', (event) => {
  if (!controlsEnabled) return;

  if (event.code === 'KeyK' || event.key === 'k' || event.key === 'K') {
    event.preventDefault();
    performAttack(currentPlayer, currentPlayer?.parent, enemies);
    return;
  }

  const dir = KEY_MAP[event.key] || KEY_MAP[event.code];
  if (dir) {
    event.preventDefault();
    window.dispatchEvent(new Event('player-movement-input'));
    heldDirections.add(dir);
    if (!event.repeat && !inputQueue.includes(dir)) {
      inputQueue.push(dir);
    }
  }
});

window.addEventListener('keyup', (event) => {
  const dir = KEY_MAP[event.key] || KEY_MAP[event.code];
  if (dir) {
    heldDirections.delete(dir);
    for (let i = inputQueue.length - 1; i >= 0; i--) {
      if (inputQueue[i] === dir) {
        inputQueue.splice(i, 1);
      }
    }
  }
});

const DIRECTIONS = {
  ArrowUp: { dx: 0, dy: JUMP_DISTANCE, rotation: Math.PI },
  ArrowDown: { dx: 0, dy: -JUMP_DISTANCE, rotation: 0 },
  ArrowLeft: { dx: -JUMP_DISTANCE, dy: 0, rotation: -Math.PI / 2 },
  ArrowRight: { dx: JUMP_DISTANCE, dy: 0, rotation: Math.PI / 2 },
};

export const moveState = {
  isMoving: false,
  isComplete: true,
  direction: null,
  progress: 0,
  startX: 0,
  startY: 0,
  targetX: 0,
  targetY: 0,
};

export function createPlayer() {
  const player = new THREE.Group();
  player.position.set(0, 0, 0);
  currentPlayer = player;

  const loader = new GLTFLoader();
  loader.load('/models/tode.glb', (gltf) => {
    const model = gltf.scene;

    model.rotation.x = Math.PI / 2;
    model.scale.setScalar(20);

    const box = new THREE.Box3().setFromObject(model);
    const zOffset = -box.min.z;
    model.position.z = zOffset;

    player.add(model);
    player.model = model;
    player.baseZOffset = zOffset;

    if (moveState.direction && DIRECTIONS[moveState.direction]) {
      model.rotation.y = DIRECTIONS[moveState.direction].rotation;
    }
  });

  return player;
}

export function performAttack(player = currentPlayer, scene = null, enemyList = enemies) {
  if (!controlsEnabled || !attackEnabled) return false;
  if (attackCooldown > 0) return false;

  const targetPlayer = player || currentPlayer;
  if (!targetPlayer) return false;

  const targetScene = scene || targetPlayer.parent;

  attackCooldown = attackCooldownDuration;
  attackSound.currentTime = 0;
  const playPromise = attackSound.play();
  if (playPromise) {
    playPromise.catch((error) => {
      console.warn('Unable to play attack sound:', error);
    });
  }

  // Visual feedback: yellow circle around the player on ground plane (z = 0.25)
  const circleGeometry = new THREE.CircleGeometry(attackRadius, 32);
  const circleMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const attackCircle = new THREE.Mesh(circleGeometry, circleMaterial);
  attackCircle.renderOrder = 1;

  if (targetScene) {
    attackCircle.position.set(targetPlayer.position.x, targetPlayer.position.y, 0.25);
    targetScene.add(attackCircle);
  } else {
    attackCircle.position.set(0, 0, 0.25);
    targetPlayer.add(attackCircle);
  }

  activeAttacks.push({
    mesh: attackCircle,
    duration: ATTACK_DURATION,
    remaining: ATTACK_DURATION,
    scene: targetScene || targetPlayer,
    enemyList: enemyList || enemies,
    radius: attackRadius,
  });

  removeEnemiesInsideAttack(attackCircle, enemyList || enemies, targetScene, attackRadius);

  return true;
}

export const attack = performAttack;
export const triggerAttack = performAttack;

function removeEnemiesInsideAttack(attackCircle, enemyList, scene, radius) {
  if (!enemyList) return;

  for (let i = enemyList.length - 1; i >= 0; i--) {
    const enemy = enemyList[i];
    const enemyPos = enemy.position || enemy;
    const dist = Math.hypot(attackCircle.position.x - enemyPos.x, attackCircle.position.y - enemyPos.y);

    if (dist <= radius) {
      if (enemy.parent) {
        enemy.parent.remove(enemy);
      } else if (scene) {
        scene.remove(enemy);
      }
      stopEnemySound(enemy);
      enemyList.splice(i, 1);
      window.dispatchEvent(new CustomEvent('enemy-defeated'));
    }
  }
}

export function updateAttack(deltaSeconds = 1 / 60, scene = null) {
  const safeDelta = Math.min(Math.max(deltaSeconds, 0), 0.1);

  if (attackCooldown > 0) {
    attackCooldown = Math.max(0, attackCooldown - safeDelta);
  }

  for (let i = activeAttacks.length - 1; i >= 0; i--) {
    const attackObj = activeAttacks[i];
    removeEnemiesInsideAttack(attackObj.mesh, attackObj.enemyList, attackObj.scene || scene, attackObj.radius);
    attackObj.remaining -= safeDelta;
    if (attackObj.remaining <= 0) {
      const parent = attackObj.mesh.parent || attackObj.scene || scene;
      if (parent) {
        parent.remove(attackObj.mesh);
      }
      if (attackObj.mesh.geometry) {
        attackObj.mesh.geometry.dispose();
      }
      if (attackObj.mesh.material) {
        attackObj.mesh.material.dispose();
      }
      activeAttacks.splice(i, 1);
    } else {
      const progress = attackObj.remaining / attackObj.duration;
      if (attackObj.mesh.material) {
        attackObj.mesh.material.opacity = Math.max(0, Math.min(1, progress));
      }
    }
  }
}

export function updatePlayer(player, enemyList = enemies, deltaSeconds = 1 / 60, scene = null) {
  if (typeof enemyList === 'number') {
    scene = typeof deltaSeconds === 'object' ? deltaSeconds : null;
    deltaSeconds = enemyList;
    enemyList = enemies;
  }

  updateAttack(deltaSeconds, scene || player?.parent);

  if (!controlsEnabled) return;

  if (!moveState.isMoving) {
    if (inputQueue.length === 0 && heldDirections.size > 0) {
      const heldDirectionList = [...heldDirections];
      inputQueue.push(heldDirectionList[heldDirectionList.length - 1]);
    }
    if (inputQueue.length > 0) {
      const nextDir = inputQueue.shift();
      const dirConfig = DIRECTIONS[nextDir];
      if (dirConfig) {
        if (player.model) {
          player.model.rotation.y = dirConfig.rotation;
        }

        const targetX = player.position.x + dirConfig.dx;
        const targetY = player.position.y + dirConfig.dy;
        const targetPosition = { x: targetX, y: targetY };

        let collidesWithEnemy =
          !isInsideMap(targetPosition, COLLISION_DISTANCE) ||
          collidesWithHouses(targetPosition, PLAYER_HOUSE_COLLISION_RADIUS);
        const activeEnemies = enemyList || enemies;
        if (activeEnemies) {
          for (const enemy of activeEnemies) {
            if (checkCollision(targetPosition, enemy.position, COLLISION_DISTANCE)) {
              collidesWithEnemy = true;
              break;
            }
          }
        }

        if (!collidesWithEnemy) {
          playMoveSound();
          moveState.isMoving = true;
          moveState.isComplete = false;
          moveState.direction = nextDir;
          moveState.progress = 0;
          moveState.startX = player.position.x;
          moveState.startY = player.position.y;
          moveState.targetX = targetX;
          moveState.targetY = targetY;
        }
      }

    }
  }

  if (moveState.isMoving) {
    moveState.progress += movementSpeed;

    const baseZ = player.baseZOffset || 0;

    if (moveState.progress >= 1) {
      moveState.progress = 1;
      moveState.isMoving = false;
      moveState.isComplete = true;
      stopMoveSound();
      player.position.x = moveState.targetX;
      player.position.y = moveState.targetY;
      if (player.model) {
        player.model.position.z = baseZ;
      }
    } else {
      player.position.x = moveState.startX + (moveState.targetX - moveState.startX) * moveState.progress;
      player.position.y = moveState.startY + (moveState.targetY - moveState.startY) * moveState.progress;
      if (player.model) {
        player.model.position.z = baseZ + Math.sin(moveState.progress * Math.PI) * JUMP_HEIGHT;
      }
    }

  }
}

export function setPlayerControlsEnabled(enabled) {
  controlsEnabled = enabled;
  if (!enabled) {
    stopMoveSound();
    inputQueue.length = 0;
    heldDirections.clear();
  }
}

export function setAttackEnabled(enabled) {
  attackEnabled = Boolean(enabled);
}

export function resetPlayer(player) {
  stopMoveSound();
  inputQueue.length = 0;
  heldDirections.clear();
  moveState.isMoving = false;
  moveState.isComplete = true;
  moveState.direction = null;
  moveState.progress = 0;
  attackCooldown = 0;
  attackEnabled = false;
  for (const attackObj of activeAttacks) {
    const parent = attackObj.mesh.parent || attackObj.scene;
    if (parent) {
      parent.remove(attackObj.mesh);
    }
    if (attackObj.mesh.geometry) {
      attackObj.mesh.geometry.dispose();
    }
    if (attackObj.mesh.material) {
      attackObj.mesh.material.dispose();
    }
  }
  activeAttacks.length = 0;
  player.position.set(0, 0, 0);
  if (player.model) {
    player.model.position.z = player.baseZOffset || 0;
  }
}

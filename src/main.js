import * as THREE from 'three';
import './style.css';
import {
  ATTACK_COOLDOWN,
  ATTACK_RADIUS,
  MOVEMENT_SPEED,
  createPlayer,
  getAttackCooldownState,
  moveState,
  performAttack,
  resetPlayer,
  setDifficultyParameters,
  setAttackEnabled,
  setPlayerControlsEnabled,
  updatePlayer,
} from './components/Player.js';
import { createCamera } from './components/Camera.js';
import { createRenderer } from './components/Renderer.js';
import { createMap } from './components/Map.js';
import { createHouses } from './components/House.js';
import {
  ENEMY_COLLISION_DISTANCE,
  ENEMY_SPEED,
  SPAWN_DELAY,
  enemies,
  resetEnemies,
  startRecurringSpawns,
  setEnemySpeed,
  spawnEnemy,
  spawnEnemyManager,
  pauseAllEnemySounds,
  resumeAllEnemySounds,
  stopAllEnemySounds,
  updateEnemies,
} from './components/Enemy.js';

export { ATTACK_COOLDOWN, ATTACK_RADIUS, performAttack };

export const SCORE_PER_SECOND = 0.1;
export const SCORE_PER_KILL = 10;
export const COMPLEXITY_GROWTH_RATE = 0.005;
export const MAX_ATTACK_COOLDOWN = 4;
const ENEMIES_ENABLED = true;

const scene = new THREE.Scene();
const map = createMap();
scene.add(map);
createHouses(map);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(-100, -100, 200);
scene.add(dirLight);

const player = createPlayer();
scene.add(player);

const camera = createCamera();
player.add(camera);

const renderer = createRenderer();
const scoreClock = new THREE.Clock();
const largeStars = [...document.querySelectorAll('.large-stars span')];
const backgroundMusic = new Audio('/audio/farm.mp3');
backgroundMusic.loop = true;
backgroundMusic.preload = 'auto';
backgroundMusic.volume = 0.25;
const gameOverSound = new Audio('/audio/sad.mp3');
gameOverSound.preload = 'auto';
gameOverSound.volume = 0.5;
let previousTime = null;
let gameOver = false;
let isPaused = false;
let enemiesActive = false;
let score = 0;
let enemySpawnTimer = 0;
let backgroundMusicStarted = false;
let backgroundMusicMuted = false;

function startBackgroundMusic() {
  if (backgroundMusicMuted) return;
  backgroundMusicStarted = true;
  const playPromise = backgroundMusic.play();
  if (playPromise) {
    playPromise.catch((error) => {
      console.warn('Unable to play background music:', error);
    });
  }
}

function pauseBackgroundMusic() {
  backgroundMusic.pause();
}

function restartBackgroundMusic() {
  backgroundMusic.currentTime = 0;
  if (!backgroundMusicMuted) {
    startBackgroundMusic();
  }
}

function toggleBackgroundMusic() {
  if (backgroundMusic.paused) {
    backgroundMusicMuted = false;
    startBackgroundMusic();
  } else {
    backgroundMusicMuted = true;
    pauseBackgroundMusic();
  }
}

window.addEventListener('player-movement-input', () => {
  if (!gameOver && !isPaused) {
    startBackgroundMusic();
  }
});

startBackgroundMusic();

function updateLargeStars(time) {
  const elapsed = time / 1000;
  largeStars.forEach((star, index) => {
    const pulse = (Math.sin(elapsed * 0.8 + index * 1.7) + 1) / 2;
    const opacity = 0.15 + pulse * 0.85;
    const scale = 0.55 + pulse * 0.9;
    const glowSize = 1 + pulse * 9;
    const glowSpread = pulse * 4;
    star.style.opacity = opacity.toFixed(3);
    star.style.transform = `scale(${scale.toFixed(3)})`;
    star.style.boxShadow = `0 0 ${glowSize.toFixed(1)}px ${glowSpread.toFixed(1)}px rgba(180, 220, 255, ${opacity.toFixed(3)})`;
  });
}

if (ENEMIES_ENABLED) {
  spawnEnemyManager(scene, performance.now(), player, false);
}

const scoreElement = document.querySelector('.score') || document.createElement('div');
if (!scoreElement.parentElement) {
  scoreElement.className = 'score';
  document.body.append(scoreElement);
}

const attackCooldownElement = document.querySelector('.attack-cooldown') || document.createElement('div');
if (!attackCooldownElement.parentElement) {
  attackCooldownElement.className = 'attack-cooldown';
  attackCooldownElement.innerHTML = `
    <span class="attack-cooldown-label">Attack</span>
    <div class="attack-cooldown-track">
      <div class="attack-cooldown-fill"></div>
    </div>
  `;
  document.body.append(attackCooldownElement);
}
const attackCooldownFill = attackCooldownElement.querySelector('.attack-cooldown-fill');

function updateAttackCooldownUI() {
  const { remaining, duration } = getAttackCooldownState();
  const progress = duration > 0 ? Math.max(0, Math.min(1, 1 - remaining / duration)) : 1;
  attackCooldownFill.style.width = `${progress * 100}%`;
  attackCooldownElement.classList.toggle('ready', remaining <= 0);
}

function updateScoreUI() {
  scoreElement.innerHTML = `<span class="score-label">Score:</span> <span class="score-value">${Math.floor(score)}</span>`;
}

function resetScore() {
  score = 0;
  scoreClock.start();
  updateScoreUI();
}

function addScoreForDefeats(defeatedCount) {
  if (!enemiesActive || isPaused || gameOver) return;
  score += defeatedCount * SCORE_PER_KILL;
  updateScoreUI();
}

function updateDifficulty() {
  const difficultyFactor = score * COMPLEXITY_GROWTH_RATE;
  const enemyFactor = 1 + difficultyFactor * 1.15;
  const playerFactor = 1 + difficultyFactor * 0.65;

  setEnemySpeed(ENEMY_SPEED * enemyFactor);
  setDifficultyParameters({
    movement: MOVEMENT_SPEED * playerFactor,
    cooldown: Math.min(
      MAX_ATTACK_COOLDOWN,
      ATTACK_COOLDOWN * (1 + difficultyFactor * 0.65),
    ),
    radius: ATTACK_RADIUS * (1 + difficultyFactor * 0.4),
  });

  return Math.max(1000, SPAWN_DELAY * Math.max(0.25, 1 - difficultyFactor * 1.15));
}

window.addEventListener('enemy-defeated', () => {
  addScoreForDefeats(1);
});

updateScoreUI();

const gameOverOverlay = document.createElement('div');
gameOverOverlay.className = 'game-over';
gameOverOverlay.innerHTML = '<strong>Game Over</strong><span>Press P key to try again</span>';
document.body.append(gameOverOverlay);

const pauseOverlay = document.createElement('div');
pauseOverlay.className = 'game-paused';
pauseOverlay.innerHTML = '<strong>Paused</strong><span>Press P to resume</span>';
document.body.append(pauseOverlay);

const startOverlay = document.createElement('div');
startOverlay.className = 'game-start visible';
startOverlay.innerHTML = '<strong>Ready</strong><span>Use the arrow keys or WASD to start</span>';
document.body.append(startOverlay);

export function updatePauseButtonUI() {
  if (typeof document === 'undefined') return;
  const pauseBtn = document.querySelector('#pause-btn, #pause-button, #pause-toggle, .pause-btn, .pause-toggle');
  if (pauseBtn) {
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    pauseBtn.setAttribute('aria-label', isPaused ? 'Resume game' : 'Pause game');
    pauseBtn.classList.toggle('paused', isPaused);
  }
}

export function setPaused(paused) {
  if (gameOver || !enemiesActive) return;
  isPaused = Boolean(paused);
  if (isPaused) {
    pauseBackgroundMusic();
    pauseAllEnemySounds();
    setPlayerControlsEnabled(false);
    pauseOverlay.classList.add('visible');
  } else {
    if (backgroundMusicStarted) {
      startBackgroundMusic();
    }
    resumeAllEnemySounds();
    setPlayerControlsEnabled(true);
    previousTime = null;
    pauseOverlay.classList.remove('visible');
    if (enemiesActive) {
      startRecurringSpawns(performance.now());
    }
  }
  updatePauseButtonUI();
}

export function togglePause() {
  setPaused(!isPaused);
  return isPaused;
}

export { isPaused };

function ensureInstructionsPanel() {
  if (typeof document === 'undefined') return null;
  let panel = document.querySelector('.instructions-panel, #instructions, .instructions');
  if (!panel && document.body) {
    panel = document.createElement('div');
    panel.id = 'instructions';
    panel.className = 'instructions-panel instructions';
    panel.innerHTML = `
      <div class="instructions-header">
        <span class="instructions-title">Instructions</span>
        <div class="instructions-actions">
          <button id="instructions-toggle" class="instructions-toggle hide-btn" type="button" aria-label="Toggle instructions">Hide</button>
        </div>
      </div>
      <div id="instructions-content" class="instructions-content">
        <ul class="instructions-list">
          <li><span class="key">K key</span> - <span class="desc">Attack</span></li>
          <li><span class="key">Arrow keys / WASD</span> - <span class="desc">Move</span></li>
          <li><span class="key">P key</span> - <span class="desc">Pause</span></li>
          <li><span class="key">M key</span> - <span class="desc">Toggle music</span></li>
        </ul>
      </div>
    `;
    document.body.append(panel);
  }

  if (panel) {
    const toggleBtn = panel.querySelector('#instructions-toggle, .hide-btn, .instructions-toggle:not(.pause-btn):not(.pause-toggle)');
    const content = panel.querySelector('.instructions-content, .instructions-list');
    if (toggleBtn && !toggleBtn.dataset.listenerAttached) {
      toggleBtn.dataset.listenerAttached = 'true';
      toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isCollapsed = panel.classList.toggle('collapsed');
        toggleBtn.textContent = isCollapsed ? 'Show' : 'Hide';
        toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
        if (content) {
          content.style.display = isCollapsed ? 'none' : '';
        }
        toggleBtn.blur();
      });
    }

    const pauseBtn = panel.querySelector('#pause-btn, #pause-button, #pause-toggle, .pause-btn, .pause-toggle');
    if (pauseBtn && !pauseBtn.dataset.listenerAttached) {
      pauseBtn.dataset.listenerAttached = 'true';
      pauseBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        togglePause();
        pauseBtn.blur();
      });
    }
  }

  updatePauseButtonUI();

  return panel;
}

ensureInstructionsPanel();

function startGameOver() {
  if (gameOver) return;
  gameOver = true;
  isPaused = false;
  stopAllEnemySounds();
  pauseBackgroundMusic();
  gameOverSound.currentTime = 0;
  const playPromise = gameOverSound.play();
  if (playPromise) {
    playPromise.catch((error) => {
      console.warn('Unable to play Game Over sound:', error);
    });
  }
  player.visible = false;
  setPlayerControlsEnabled(false);
  gameOverOverlay.classList.add('visible');
}

function hasPlayerEnemyCollision() {
  return enemies.some(
    (enemy) => enemy.position.distanceTo(player.position) <= ENEMY_COLLISION_DISTANCE,
  );
}

function resetGame() {
  gameOver = false;
  isPaused = false;
  previousTime = null;
  resetScore();
  enemySpawnTimer = 0;
  updatePauseButtonUI();
  resetEnemies(scene);
  resetPlayer(player);
  enemiesActive = false;
  player.visible = true;
  setPlayerControlsEnabled(true);
  gameOverOverlay.classList.remove('visible');
  startOverlay.classList.add('visible');
  if (backgroundMusicStarted) {
    restartBackgroundMusic();
  }
  if (ENEMIES_ENABLED) {
    spawnEnemyManager(scene, performance.now(), player, false, true);
  }
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM' || event.key === 'm' || event.key === 'M') {
    event.preventDefault();
    if (!gameOver) toggleBackgroundMusic();
    return;
  }

  const isResetKey = event.code === 'KeyP' || event.key === 'p' || event.key === 'P';
  if (isResetKey && gameOver) {
    event.preventDefault();
    resetGame();
    return;
  }
  if (
    (event.code === 'KeyP' || event.key === 'p' || event.key === 'P') &&
    !gameOver &&
    enemiesActive
  ) {
    event.preventDefault();
    togglePause();
  }
});

renderer.setAnimationLoop((time) => {
  updateLargeStars(time);
  updateAttackCooldownUI();
  const elapsedSeconds = scoreClock.getDelta();

  if (isPaused) {
    previousTime = null;
    renderer.render(scene, camera);
    return;
  }

  const deltaSeconds = previousTime === null ? 1 / 60 : Math.min((time - previousTime) / 1000, 0.1);
  previousTime = time;

  if (!gameOver) {
    if (hasPlayerEnemyCollision()) {
      startGameOver();
      renderer.render(scene, camera);
      return;
    }

    const spawnDelay = updateDifficulty();
    updatePlayer(player, enemies, deltaSeconds, scene);
    if (!enemiesActive && (moveState.isMoving || moveState.progress > 0)) {
      enemiesActive = true;
      setAttackEnabled(true);
      startOverlay.classList.remove('visible');
      if (ENEMIES_ENABLED) {
        startRecurringSpawns(performance.now());
      }
    }
    if (enemiesActive) {
      score += elapsedSeconds * SCORE_PER_SECOND;
      updateScoreUI();
    }
    if (ENEMIES_ENABLED && enemiesActive) {
      enemySpawnTimer += elapsedSeconds * 1000;
      if (enemySpawnTimer >= spawnDelay && enemies.length < 12) {
        spawnEnemy(scene, player);
        enemySpawnTimer = 0;
      }
      updateEnemies(player, deltaSeconds);
    }

    if (hasPlayerEnemyCollision()) {
      startGameOver();
    }
  }

  renderer.render(scene, camera);
});

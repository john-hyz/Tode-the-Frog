import * as THREE from 'three';

export function createRenderer() {
  const canvas = document.querySelector('canvas.game');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer;
}

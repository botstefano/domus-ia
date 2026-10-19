import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DesignModel, Room, Wall } from '../types';

export interface ViewOptions {
  level: number;
  showAllLevels: boolean;
  showRoof: boolean;
  showFurniture: boolean;
  hideWalls: boolean;
  showLabels: boolean;
}

export const DEFAULT_VIEW: ViewOptions = {
  level: 0,
  showAllLevels: false,
  showRoof: false,
  showFurniture: true,
  hideWalls: false,
  showLabels: true,
};

const ROOM_COLORS: Record<string, number> = {
  hall: 0xf4ecd8,
  living: 0xf7e2c2,
  dining: 0xf8e7c9,
  kitchen: 0xdde9f0,
  bedroom: 0xe9e2f4,
  bathroom: 0xd6ecf0,
  garage: 0xdcdcdc,
  terrace: 0xcfe8c9,
  stairs: 0xececec,
  laundry: 0xe3eef2,
  study: 0xe6efe0,
  storage: 0xeeeeee,
};

const FURNITURE_COLORS: Record<string, number> = {
  bed_double: 0xc9b8a4,
  bed_single: 0xd3c3b0,
  wardrobe: 0xa98d6f,
  nightstand: 0xb89b7e,
  sofa: 0x8c9aa4,
  sofa_l: 0x8c9aa4,
  coffee_table: 0xb08d63,
  tv_unit: 0x4c5257,
  dining_table: 0xb98b5e,
  chair: 0x8a6a4b,
  kitchen_counter: 0xd9d5cd,
  kitchen_island: 0xcfcabf,
  fridge: 0xbfc6cc,
  stove: 0x6b7176,
  sink: 0xd7dde1,
  toilet: 0xf2f4f5,
  shower: 0xcfe3ea,
  bathtub: 0xeef3f5,
  washbasin: 0xf2f4f5,
  washing_machine: 0xdfe4e7,
  desk: 0xb08d63,
  bookshelf: 0xa98d6f,
  car: 0x5f6b76,
  plant: 0x7c9a6a,
};

/**
 * Visor 3D: construye la escena a partir del modelo arquitectónico
 * estructurado (no de imágenes) y permite navegar, seleccionar ambientes y
 * entrar en realidad virtual o aumentada cuando el dispositivo lo admite.
 */
export class HouseScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly root = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly selection: THREE.LineSegments;
  private readonly resizeObserver: ResizeObserver;

  private model: DesignModel | null = null;
  private options: ViewOptions = { ...DEFAULT_VIEW };
  private roomMeshes: THREE.Mesh[] = [];
  private pointerDown = { x: 0, y: 0 };
  private disposed = false;

  onSelect?: (roomId: string | null) => void;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xf5f6f2);
    this.camera = new THREE.PerspectiveCamera(
      48,
      (container.clientWidth || 800) / (container.clientHeight || 600),
      0.1,
      400,
    );
    this.camera.position.set(14, 16, 20);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 120;

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x9aa3a8, 1.1);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(18, 28, 14);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-16, 10, -12);
    this.scene.add(fill);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.selection = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 2 }),
    );
    this.selection.visible = false;
    this.scene.add(this.selection);

    this.scene.add(this.root);

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);

    this.renderer.setAnimationLoop(() => {
      if (this.disposed) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  setModel(model: DesignModel | null): void {
    this.model = model;
    this.rebuild();
  }

  setOptions(options: Partial<ViewOptions>): void {
    this.options = { ...this.options, ...options };
    this.rebuild();
  }

  setSelected(roomId: string | null): void {
    if (!roomId) {
      this.selection.visible = false;
      return;
    }
    const mesh = this.roomMeshes.find((candidate) => candidate.userData.roomId === roomId);
    if (!mesh || !this.model) {
      this.selection.visible = false;
      return;
    }
    const room = this.findRoom(roomId);
    if (!room) {
      this.selection.visible = false;
      return;
    }
    const base = this.levelBase(room.level);
    this.selection.position.set(0, 0, 0);
    this.selection.scale.set(room.rect.w, room.height, room.rect.h);
    this.selection.position.set(
      this.toX(room.rect.x + room.rect.w / 2),
      base + room.height / 2,
      this.toZ(room.rect.y + room.rect.h / 2),
    );
    this.selection.visible = true;
  }

  resize(): void {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  clearSelection(): void {
    this.selection.visible = false;
  }

  /** Entra en modo realidad virtual (requiere visor y WebXR compatible). */
  async enterVR(): Promise<void> {
    const xr = (navigator as unknown as { xr?: XRSystem }).xr;
    if (!xr) throw new Error('Este navegador no expone WebXR.');
    const supported = await xr.isSessionSupported('immersive-vr');
    if (!supported) throw new Error('No se detectó un visor de realidad virtual compatible.');
    this.renderer.xr.enabled = true;
    const session = await xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor'],
    });
    await this.renderer.xr.setSession(session);
    this.renderer.setAnimationLoop(() => {
      this.renderer.render(this.scene, this.camera);
    });
    session.addEventListener('end', () => {
      this.renderer.xr.enabled = false;
      this.renderer.setAnimationLoop(() => {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
      });
    });
  }

  /** Inicia una sesión de realidad aumentada si el dispositivo la soporta. */
  async enterAR(): Promise<void> {
    const xr = (navigator as unknown as { xr?: XRSystem }).xr;
    if (!xr) throw new Error('Este navegador no expone WebXR.');
    const supported = await xr.isSessionSupported('immersive-ar');
    if (!supported) throw new Error('La realidad aumentada no está disponible en este dispositivo.');
    this.renderer.xr.enabled = true;
    const session = await xr.requestSession('immersive-ar', {
      optionalFeatures: ['hit-test', 'local-floor'],
    });
    await this.renderer.xr.setSession(session);
    session.addEventListener('end', () => {
      this.renderer.xr.enabled = false;
    });
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    this.disposeGroup(this.root);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ------------------------------- Interno --------------------------------- */

  private handlePointerDown = (event: PointerEvent): void => {
    this.pointerDown = { x: event.clientX, y: event.clientY };
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const moved = Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y);
    if (moved > 5 || !this.model) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.roomMeshes, false);
    const roomId = hits[0]?.object.userData.roomId as string | undefined;
    this.onSelect?.(roomId ?? null);
  };

  private findRoom(roomId: string): Room | null {
    if (!this.model) return null;
    for (const level of this.model.building.levels) {
      const room = level.rooms.find((candidate) => candidate.id === roomId);
      if (room) return room;
    }
    return null;
  }

  private levelBase(level: number): number {
    if (!this.model) return 0;
    let base = 0;
    for (const candidate of this.model.building.levels) {
      if (candidate.index >= level) break;
      base += candidate.height;
    }
    return base;
  }

  private toX(x: number): number {
    return x - (this.model?.terrain.width ?? 0) / 2;
  }

  private toZ(y: number): number {
    return -y + (this.model?.terrain.depth ?? 0) / 2;
  }

  private disposeGroup(group: THREE.Object3D): void {
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    });
    group.clear();
  }

  private rebuild(): void {
    this.disposeGroup(this.root);
    this.roomMeshes = [];
    this.selection.visible = false;
    if (!this.model) return;

    const model = this.model;
    const terrain = model.terrain;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(terrain.width, terrain.depth),
      new THREE.MeshStandardMaterial({ color: 0xe9ece6, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    this.root.add(ground);

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(terrain.width, terrain.depth)),
      new THREE.LineBasicMaterial({ color: 0xb4bcae }),
    );
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.001;
    this.root.add(border);

    if (model.site.garden) {
      this.addSitePatch(model.site.garden, 0xdfeed4);
    }
    if (model.site.driveway) {
      this.addSitePatch(model.site.driveway, 0xdcd9d2);
    }

    const footprint = model.building.footprint;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(footprint.w, 0.12, footprint.h),
      new THREE.MeshStandardMaterial({ color: 0xcfc9bd, roughness: 0.9 }),
    );
    slab.position.set(this.toX(footprint.x + footprint.w / 2), 0.06, this.toZ(footprint.y + footprint.h / 2));
    this.root.add(slab);

    const visibleLevels = this.options.showAllLevels
      ? model.building.levels
      : model.building.levels.filter((level) => level.index === this.options.level);

    for (const level of visibleLevels) {
      const base = this.levelBase(level.index);
      for (const room of level.rooms) {
        this.addRoom(room, base);
      }
      if (!this.options.hideWalls) {
        for (const wall of level.walls) {
          this.addWall(wall, base);
        }
      }
      if (this.options.showFurniture) {
        for (const room of level.rooms) {
          if (room.type === 'stairs') continue;
          for (const item of room.furniture) {
            this.addFurniture(item, base);
          }
        }
      }
      const stairs = level.rooms.find((room) => room.type === 'stairs');
      if (stairs) this.addStairs(stairs, base);
    }

    if (this.options.showRoof) {
      const top = model.building.levels.reduce((acc, level) => acc + level.height, 0);
      const overhang = model.building.roof.overhang;
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(footprint.w + overhang * 2, 0.18, footprint.h + overhang * 2),
        new THREE.MeshStandardMaterial({
          color: 0xb9b2a6,
          roughness: 0.85,
          transparent: true,
          opacity: 0.55,
        }),
      );
      roof.position.set(
        this.toX(footprint.x + footprint.w / 2),
        top + 0.09,
        this.toZ(footprint.y + footprint.h / 2),
      );
      this.root.add(roof);
    }

    this.fitCamera();
  }

  private addSitePatch(rect: { x: number; y: number; w: number; h: number }, color: number): void {
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(rect.w, rect.h),
      new THREE.MeshStandardMaterial({ color, roughness: 1 }),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(
      this.toX(rect.x + rect.w / 2),
      0.005,
      this.toZ(rect.y + rect.h / 2),
    );
    this.root.add(patch);
  }

  private addRoom(room: Room, base: number): void {
    const color = ROOM_COLORS[room.type] ?? 0xf0f0ee;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(room.rect.w, 0.08, room.rect.h),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
    );
    floor.position.set(
      this.toX(room.rect.x + room.rect.w / 2),
      base + 0.1,
      this.toZ(room.rect.y + room.rect.h / 2),
    );
    floor.userData.roomId = room.id;
    this.root.add(floor);
    this.roomMeshes.push(floor);

    if (this.options.showLabels && room.rect.w > 1.2 && room.rect.h > 1.2) {
      const area = room.rect.w * room.rect.h;
      const label = this.makeLabel(`${room.name}\n${area.toFixed(1)} m²`);
      label.position.set(
        this.toX(room.rect.x + room.rect.w / 2),
        base + 1.9,
        this.toZ(room.rect.y + room.rect.h / 2),
      );
      this.root.add(label);
    }
  }

  private addWall(wall: Wall, base: number): void {
    const p1 = { x: this.toX(wall.from.x), z: this.toZ(wall.from.y) };
    const p2 = { x: this.toX(wall.to.x), z: this.toZ(wall.to.y) };
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) return;
    const dir = { x: dx / length, z: dz / length };
    const rotation = Math.atan2(-dir.z, dir.x);

    const external = wall.kind === 'external';
    const material = new THREE.MeshStandardMaterial({
      color: wall.kind === 'railing' ? 0x9aa5ad : external ? 0xece7dd : 0xf4f1ea,
      roughness: 0.9,
      transparent: wall.kind === 'railing',
      opacity: wall.kind === 'railing' ? 0.55 : 1,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0xa9c9d4,
      roughness: 0.15,
      transparent: true,
      opacity: 0.4,
    });

    const openings = [...wall.openings].sort((a, b) => a.offset - b.offset);
    const segments: Array<{ from: number; to: number; bottom: number; top: number }> = [];
    let cursor = 0;
    for (const opening of openings) {
      if (opening.offset > cursor) {
        segments.push({ from: cursor, to: opening.offset, bottom: 0, top: wall.height });
      }
      if (opening.sill > 0.03) {
        segments.push({ from: opening.offset, to: opening.offset + opening.width, bottom: 0, top: opening.sill });
      }
      const head = opening.sill + opening.height;
      if (head < wall.height - 0.03) {
        segments.push({ from: opening.offset, to: opening.offset + opening.width, bottom: head, top: wall.height });
      }
      cursor = Math.max(cursor, opening.offset + opening.width);
    }
    if (cursor < length) {
      segments.push({ from: cursor, to: length, bottom: 0, top: wall.height });
    }

    for (const segment of segments) {
      const segmentLength = segment.to - segment.from;
      const height = segment.top - segment.bottom;
      if (segmentLength < 0.02 || height < 0.02) continue;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(segmentLength, height, wall.thickness),
        material,
      );
      const mid = (segment.from + segment.to) / 2;
      mesh.position.set(
        p1.x + dir.x * mid,
        base + segment.bottom + height / 2,
        p1.z + dir.z * mid,
      );
      mesh.rotation.y = rotation;
      this.root.add(mesh);
    }

    for (const opening of openings) {
      if (opening.kind !== 'window') continue;
      const mid = opening.offset + opening.width / 2;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(opening.width, opening.height, 0.04),
        glass,
      );
      panel.position.set(
        p1.x + dir.x * mid,
        base + opening.sill + opening.height / 2,
        p1.z + dir.z * mid,
      );
      panel.rotation.y = rotation;
      this.root.add(panel);
    }
  }

  private addFurniture(item: { type: string; x: number; y: number; width: number; depth: number; height: number; rotation: number }, base: number): void {
    const color = FURNITURE_COLORS[item.type] ?? 0xb9b2a6;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(item.width, item.height, item.depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
    );
    mesh.position.set(this.toX(item.x), base + item.height / 2 + 0.08, this.toZ(item.y));
    mesh.rotation.y = (-item.rotation * Math.PI) / 180;
    this.root.add(mesh);
  }

  private addStairs(room: Room, base: number): void {
    const steps = 8;
    const alongX = room.rect.w >= room.rect.h;
    const runLength = alongX ? room.rect.w : room.rect.h;
    const stepDepth = runLength / steps;
    const width = alongX ? room.rect.h : room.rect.w;
    const material = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.9 });
    for (let index = 0; index < steps; index += 1) {
      const height = ((index + 1) / steps) * room.height * 0.9;
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? stepDepth : width, height, alongX ? width : stepDepth),
        material,
      );
      const offset = index * stepDepth + stepDepth / 2;
      step.position.set(
        alongX ? this.toX(room.rect.x) + offset : this.toX(room.rect.x + room.rect.w / 2),
        base + height / 2,
        alongX ? this.toZ(room.rect.y + room.rect.h / 2) : this.toZ(room.rect.y) - offset,
      );
      this.root.add(step);
    }
  }

  private makeLabel(text: string): THREE.Sprite {
    const lines = text.split('\n');
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = 'rgba(255,255,255,0.82)';
      context.roundRect(0, 0, canvas.width, canvas.height, 18);
      context.fill();
      context.fillStyle = '#2b2f33';
      context.font = 'bold 26px Inter, Arial';
      context.textAlign = 'center';
      context.fillText(lines[0] ?? '', canvas.width / 2, 38);
      context.fillStyle = '#6b7280';
      context.font = '22px Inter, Arial';
      context.fillText(lines[1] ?? '', canvas.width / 2, 72);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    sprite.scale.set(2.4, 0.9, 1);
    return sprite;
  }

  private fitCamera(): void {
    if (!this.model) return;
    const footprint = this.model.building.footprint;
    const height = this.model.building.levels.reduce((acc, level) => acc + level.height, 0);
    const centerX = this.toX(footprint.x + footprint.w / 2);
    const centerZ = this.toZ(footprint.y + footprint.h / 2);
    const radius = Math.max(footprint.w, footprint.h);
    this.controls.target.set(centerX, height / 3, centerZ);
    this.camera.position.set(centerX + radius * 1.15, height + radius * 0.95, centerZ + radius * 1.35);
    this.camera.lookAt(centerX, height / 3, centerZ);
    this.controls.update();
  }
}

interface XRSystem {
  isSessionSupported: (mode: string) => Promise<boolean>;
  requestSession: (mode: string, init?: XRSessionInit) => Promise<XRSession>;
}

'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Anchor,
  ArrowLeft,
  ArrowUp,
  Axe,
  Ban,
  Bomb,
  BookOpen,
  Bot,
  Check,
  CircleHelp,
  Clover,
  Cog,
  Coins,
  Cpu,
  Crown,
  Crosshair,
  Dices,
  Drumstick,
  Eye,
  EyeOff,
  Flame,
  Footprints,
  Gauge,
  Gem,
  Globe,
  Hand,
  Hammer,
  HardHat,
  HeartPulse,
  ImagePlus,
  Images,
  Layers,
  LoaderCircle,
  Lock,
  Magnet,
  Maximize,
  Menu,
  Mic,
  MicOff,
  Minimize,
  Mountain,
  Package,
  Paintbrush,
  PawPrint,
  Pickaxe,
  Play,
  Plus,
  Power,
  Puzzle,
  Radar,
  Rocket,
  RotateCcw,
  Scissors,
  Send,
  Shield,
  ShieldOff,
  ShieldHalf,
  Shirt,
  Shovel,
  Skull,
  Snowflake,
  Sparkles,
  Sprout,
  Store,
  Sun,
  Sword,
  Target,
  Telescope,
  Trash2,
  TreePine,
  UserRound,
  Volume2,
  VolumeX,
  Wand2,
  Waves,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import * as THREE from 'three';
import { MD2Character } from 'three/examples/jsm/misc/MD2Character.js';
import {
  createTerrainChunks,
  ZONE_ATLAS_TILE,
  ZONE_SKIN_IDS,
  type TerrainChunksHandle,
  type ZoneSkinId,
} from '@/game/terrainChunks';
import { createBirdFlock, type BirdFlock } from '@/game/gpgpuSkyBirds';
import { createSkyClouds, type SkyCloudsHandle } from '@/game/skyClouds';
import { createRain, type RainHandle } from '@/game/rainSystem';
import { createIceRain, type IceRainHandle } from '@/game/iceRainSystem';
import { createSnowRain, type SnowRainHandle } from '@/game/snowRainSystem';
import {
  createFootprintSystem,
  type FootprintHandle,
} from '@/game/footprintSystem';
import {
  WINTER_ZONES,
  winterFactorWorld,
  iceFactorWorld,
} from '@/game/winterBiomes';
import {
  DESERT_ZONES,
  desertFactorWorld,
} from '@/game/desertBiomes';
import {
  redFactorWorld,
  mesaFactorWorld,
  volcanoFactorWorld,
} from '@/game/extraBiomes';
import {
  cherryFactorWorld,
  shroomFactorWorld,
  crimsonFactorWorld,
  goldenFactorWorld,
} from '@/game/wildBiomes';
import {
  nearestVolcanoWorld,
  handVolcanoInfo,
} from '@/game/volcanoTerrain';
import {
  createLavaFlowSystem,
  type LavaFlowHandle,
} from '@/game/lavaFlow';
import { createPalmTrees, type PalmTreesHandle } from '@/game/palmTrees';
import { createGrassTufts, type GrassTuftsHandle } from '@/game/grassTufts';
import { createTallGrass, type TallGrassHandle } from '@/game/tallGrass';
import {
  createSugarPlant,
  type SugarPlantHandle,
} from '@/game/sugarPlant';
import {
  createPumpkinPlant,
  createMelonPlant,
  createFruitCollisions,
  createFruitContext,
  createFruitBranches,
  type PumpkinPlantHandle,
  type MelonPlantHandle,
  type FruitContext,
} from '@/game/melonPumpkin';
import {
  createPalmCoconuts,
  type PalmCoconutsHandle,
} from '@/game/palmCoconuts';
import {
  createCityRoadmap,
  type CityRoadmapHandle,
} from '@/game/cityRoadmap';
import {
  cityRouteGuideGroup,
  cityRouteGuideInit,
  cityRouteGuideStats,
  cityRouteGuideTick,
} from '@/game/cityRouteGuide';
import { citySurfaceLiftAt } from '@/game/cityRoadSurface';
import {
  cityColumnBlocked,
} from '@/game/cityLayout';
import { cityRouteRefreshRegion } from '@/game/cityRoute';
import { adoptServerFootpathEdits } from '@/game/cityFootpathEdit';
import { listFootpathEdits } from '@/game/cityFootpathStore';
import { fetchServerFootpathEdits } from '@/game/cityFootpathServer';
import {
  createCalderaLavaSystem,
  type CalderaLavaHandle,
} from '@/game/calderaLava';
import {
  createOasisWater,
  type OasisWaterHandle,
} from '@/game/oasisWater';
import { oasisChestBlock } from '@/game/oasisTerrain';
import {
  createVolcanoPlume,
  type VolcanoPlumeHandle,
} from '@/game/volcanoPlume';
import { createSkyText, type SkyTextHandle } from '@/game/skyText';
import { createEmbers, type EmbersHandle } from '@/game/embers';
import { createBulletSystem } from '@/game/bulletSystem';
import { createJumpRings } from '@/game/jumpRing';
import { createJeepProp } from '@/game/jeepProp';
import { createNascarCar, type NascarCarHandle } from '@/game/nascarCar';
import { setFootpathSparkCamera } from '@/game/vehicleFootpath';
import { setVehicleSmokeCamera } from '@/game/vehicleSmoke';
import { createPetDrone, type PetDroneOrdnance, type PetRocketTracker } from '@/game/petDrone';
import { createDroneAi, type DroneAiTargetView } from '@/game/droneAi';
import { createRobotPet, type RobotPet } from '@/game/robotPet';
import { createSpotPet, type SpotPet } from '@/game/spotPet';
import { createSpiderPet, type SpiderPet } from '@/game/spiderPet';
import { createCrimsonMobs, type CrimsonMobs } from '@/game/crimsonMob';
import {
  buildWebSphere,
  createCherrySpiders,
  makeWebGlowTexture,
  type CherrySpiders,
} from '@/game/cherrySpider';
import { createSpiderWeb } from '@/game/spiderWeb';
import {
  createCreeperMobs,
  type Creepers,
} from '@/game/creeper';
import {
  createSkeletonMobs,
  type Skeletons,
} from '@/game/skeleton';
import { createDodos, type Dodos } from '@/game/dodo';
import {
  createPlaneDrone,
  type PlaneDrone,
  type PlanePilotTelemetry,
} from '@/game/planeDrone';
import {
  createVoiceControl,
  type VoiceCommand,
} from '@/game/voiceControl';
import {
  createGroundWater,
  type GroundWaterHandle,
} from '@/game/groundWater';
import {
  createLootChests,
  type LootChestsHandle,
} from '@/game/lootChests';
import {
  createAtmosphereVfx,
  type AtmosphereVfxHandle,
} from '@/game/atmosphereVfx';
import HealthBar, { type HealthBarHandle } from '@/components/game/HealthBar';
import Minimap, {
  type MinimapBridge,
  type MinimapHandle,
} from '@/components/game/Minimap';
import JeepGauges, {
  type JeepGaugesHandle,
} from '@/components/game/JeepGauges';
import TouchControls, {
  type TouchGameApi,
} from '@/components/game/TouchControls';
import CharacterPreview from '@/components/game/CharacterPreview';
import WeaponPreview from '@/components/game/WeaponPreview';
import DronePreview from '@/components/game/DronePreview';
import PlanePreview from '@/components/game/PlanePreview';
import RobotPreview from '@/components/game/RobotPreview';
import SpotPreview from '@/components/game/SpotPreview';
import SpiderPreview from '@/components/game/SpiderPreview';
import {
  AiCommandBox,
  AiMissionBox,
  type SargeContext,
} from '@/components/ai/LobbyAi';
import { getGameAudio, type GameAudioHandle } from '@/game/audio';
import { setGameSuspended } from '@/game/muteState';
import {
  startLobbyMusic,
  stopLobbyMusic,
} from '@/game/lobbyMusic';
import {
  CRAFT_ITEMS,
  CRAFT_RECIPES,
  RECIPE_CATEGORIES,
  expandIngredient,
  findGridMatch,
  gridMatchesRecipe,
  itemImg as craftItemImg,
  itemLabel as craftItemLabel,
  maxCraftable,
  missingIngredients,
  recipeBlueprintCells,
  recipeIngredientLabels,
  recipeNeeds,
  type CraftRecipe,
  type RecipeCategory,
} from '@/game/crafting';

/** Mesh augmented by MD2Character at runtime with the active animation action. */
interface ActionMesh extends THREE.Mesh {
  activeAction?: THREE.AnimationAction;
}

/** GitHub brand mark (octicon "mark-github" path) for the export button. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Server export stage → friendly label (progress % appended while uploading). */
function ghStageLabel(stage: string, progress: number | null): string {
  switch (stage) {
    case 'token':
      return 'Authenticating…';
    case 'repo':
      return 'Creating repository…';
    case 'collect':
      return 'Collecting source files…';
    case 'commit':
      return 'Building commit…';
    case 'push':
      return typeof progress === 'number'
        ? `Uploading — ${Math.floor(progress)}%`
        : 'Uploading source…';
    default:
      return 'Working…';
  }
}

/** Debug handle exposed on window for tooling/verification (renders nothing). */
interface PlayerDebugInfo {
  loaded: boolean;
  animation: string;
  moving: boolean;
  airborne: boolean;
  x: number;
  y: number;
  z: number;
  charMinY: number;
  charMaxY: number;
  timeOfDay: number;
  stamina: number;
  exhausted: boolean;
  sprint: boolean;
  touchMove: boolean;
  phase: GamePhase;
  /** True while the cherry-spider silk snare holds the hero. */
  webbed: boolean;
  /** True while a charged creeper blast has the hero's legs buzzing. */
  shocked: boolean;
  /** Jeep dash telemetry for the gauge cluster (live while driving). */
  drivingJeep: boolean;
  jeepFuel: number;
  jeepTemp: number;
}

/** Loadout mirror pushed to React so the LOBBY pickers can highlight the
 *  currently equipped skin/weapon. The in-game view itself is UI-free. */
interface LoadoutState {
  skinIndex: number;
  weaponIndex: number;
}

/** A costume forged in the CHARACTER panel's AI workshop. The texture PNG
 *  lives on disk (public/…/skins/ai_*.png) and the row is persisted in
 *  SQLite, so the rack survives reloads. Rack index = SKINS.length + i. */
interface ForgedSkin {
  id: string;
  name: string;
  color: string;
  texturePath: string;
}

/** AI-forged WEAPON texture rack row (WEAPONS panel forge). weaponIndex is
 *  the base rack slot (0=Blade .. WEAPONS.length-2) the repaint belongs to. */
interface ForgedWeaponSkin extends ForgedSkin {
  weaponIndex: number;
}

/** Chronos — the first RATFIRE mod (MODS panel). It controls the in-game
 *  clock (/time-set style jumps + pause/speed) and can force the weather. */
interface ChronosSettings {
  enabled: boolean;
  hour: number;
  cycleSpeed: number;
  weather: 'natural' | 'clear' | 'storm';
}

const CHRONOS_DEFAULT: ChronosSettings = {
  enabled: false,
  hour: 12,
  cycleSpeed: 1,
  weather: 'natural',
};

/** Mod configuration the React MODS panel pushes into the game loop. */
interface ModOptionsPayload {
  enabled?: boolean;
  hour?: number;
  cycleSpeed?: number;
  weather?: 'natural' | 'clear' | 'storm';
}

/** Direct pet-drone orders the PET panel issues (same brain as voice). */
type DroneOrderKind = 'COME' | 'PATROL' | 'GUARD' | 'HOLD' | 'CEASEFIRE';

/** Pet rack ids the deploy toggles drive (PET panel → game loop). */
type PetToggleId = 'buzz' | 'dart' | 'robot' | 'spot' | 'spider';
/** Which pets are currently deployed (spawned in-world with the player).
 *  BUZZ starts deployed (the game's founding companion), DART + SPARK +
 *  SPOT + WIDOW wait on standby until their toggles are switched on. */
const PET_DEPLOY_DEFAULT: Record<PetToggleId, boolean> = {
  buzz: true,
  dart: false,
  robot: false,
  spot: false,
  spider: false,
};

/** Commands the React dashboard can send into the game loop. */
interface GameApi {
  setSkin(index: number): void;
  /** Registers a runtime-forged AI costume texture and returns its rack
   *  index — the pixels stream in async, the index is valid immediately. */
  addSkin(url: string): number;
  setWeapon(index: number): void;
  /** Registers a runtime-forged AI weapon texture for a base rack weapon
   *  and returns its virtual rack index (>= WEAPONS.length) — the pixels
   *  stream in async, the index is valid immediately. */
  addWeaponVariant(baseIndex: number, url: string, color?: string): number;
  /** Live-retunes gameplay mods (MODS panel) — see ModOptionsPayload. */
  setModOptions(options: ModOptionsPayload): void;
  applyDamage(amount: number): void;
  respawn(): void;
  droneDirective(kind: DroneOrderKind): void;
  /** PET PANEL DEPLOY TOGGLES: spawn/despawn a pet in-world next to the
   *  player. 'buzz' hides the quadcopter, 'dart' spawns the cruise plane,
   *  'robot' spawns SPARK (loaded on first toggle — the GLB streams in),
   *  'spot' spawns the quadruped (built instantly — pure primitives). */
  setPetDeployed(pet: PetToggleId, on: boolean): void;
}

/** Voxel blocks are 100 world units — the world itself is ENDLESS: terrain
 *  streams in as chunks around the player and unloads behind them. */
const BLOCK = 100;
/** Grid origin offset. The legacy fixed map spanned grid 0..127, i.e. world
 *  x = (gridX - 64) * BLOCK; keeping the offset keeps the spawn area's
 *  terrain pixel-identical to the old map. */
const GRID_OFFSET = 64;

/** GRASSLAND SPAWN — (user request: spawn the player, every vehicle and the
 *  pet drone in the grassland biome) the player's home patch now sits in
 *  the open grassland heartland at world (60000, 60000) / grid (664, 664):
 *  outside the city plateau rect and 40k+ clear of every hand-placed biome
 *  circle (winter ENE, the desert ring + oasis, cherry, shroom, crimson,
 *  volcano, golden) — a 13x13 sample sweep over ±3 km reads 0.0000 on
 *  every biome factor there, so pure rolling green rolls under the spawn
 *  plaza. World-gen itself stays oasis-anchored (palm ring, biome
 *  hand-zones untouched) — only the home patch rides the plains. */
const GRASS_SPAWN_X = 60000; // world units, the grassland heartland anchor
const GRASS_SPAWN_Z = 60000;
const SPAWN_JEEP_OFFSET = { x: -180, z: 440 }; // parking, ahead-left

/** Character tuning (world units / seconds). */
const CHAR_HEIGHT = 190; // ~1.9 blocks tall
const WALK_SPEED = 360;
const RUN_SPEED = 620; // mobile RUN toggle sprint speed
const BACK_SPEED = 220;
const TURN_SPEED = 2.4; // rad/s
const JUMP_SPEED = 620;
const DOUBLE_JUMP_SPEED = 560; // mid-air second jump is a touch weaker
const MAX_JUMPS = 2; // double jump: one ground jump + one mid-air jump
const GRAVITY = 1800;
/** CHERRY SPIDER WEB SNARE: while webbed, on-foot speed is mulplied by
 *  this — heavy, sticky, and exactly the window the pack needs. */
const WEB_SNARE_SLOW = 0.3;

/** CHARGED CREEPER SHOCK: a charged blast leaves your legs buzzing —
 *  on-foot speed is multiplied by this while the shock wears off. */
const CHARGE_SLOW = 0.45;

/** OASIS WATER PHYSICS — the swim model (see src/game/oasisWater.ts):
 *  deep pool water runs a buoyancy simulation (weakened gravity + lung
 *  buoyancy + stroke thrust + drag), the surface float is a soft spring
 *  bob, splashdowns kill fall damage and every stride, plunge or bullet
 *  impact punches a real travelling ripple into the GPU wave field. */
const WATER_SPEED_MULT = 0.55; // paddling is slower than dry-land running
const WATER_GRAVITY = 0.3; // underwater gravity as a fraction of GRAVITY
const WATER_DRAG = 2.6; // vertical drag (1/s) eating swim momentum
const BUOYANCY_ACCEL = 1400; // passive float-up when submerged (u/s²)
const SWIM_UP_ACCEL = 1000; // Space held — breaststroke thrust (u/s²)
const SWIM_DOWN_ACCEL = 780; // Shift held — dive thrust (u/s²)
const FLOAT_SIT_DEPTH = 26; // feet rest this far below the surface
const SURF_BAND = 46; // within this of the surface counts as "at surface"
const WADE_DEPTH = 55; // deeper than this = swimming, not wading
const SWIM_HOP_SPEED = 500; // Space hop out of the pool onto the shore

const RUN_SOUND_VOLUME = 0.35;
const SNOW_WALK_SFX = '/sounds/snow-walk-loop.mp3'; // user-provided snow crunch
const SNOW_WALK_VOLUME = 0.5; // loop volume at full snow coverage
const TIRE_SCREECH_SFX = '/sounds/tire-screech-loop.mp3'; // user-provided drift screech
const TIRE_SCREECH_VOLUME = 0.6; // loop volume while the jeep slides

/** Health tuning (stamina is unlimited — running never slows the player). */
const MAX_HEALTH = 100;
const MAX_STAMINA = 100;
const FALL_DAMAGE_MIN_SPEED = 800; // landing speed (units/s) where damage starts
const FALL_DAMAGE_SCALE = 0.06;
const HEALTH_REGEN_DELAY = 5; // seconds after damage before regen kicks in
const HEALTH_REGEN_RATE = 5; // per second
const RESPAWN_DELAY = 2.4; // seconds between death and respawn

/** Third-person camera tuning. */
const CAM_DIST = 320;
const JEEP_CAM_DIST = 430; // chase camera sits farther back while driving
const NASCAR_CAM_DIST = 640; // the stock car is longer — pull the chase back
const CAR_HW = 108; // car collision half-width (nascarCar COLLIDE_HW)
const CAR_HL = 288; // car collision half-length (nascarCar COLLIDE_HL)
const CAM_HEIGHT = 170; // default elevation, expressed as pitch via CAM_DEFAULT_PITCH
const CAM_MIN_DIST = 140;
const CAM_MAX_DIST = 900;
const CAM_DEFAULT_PITCH = Math.atan2(CAM_HEIGHT, CAM_DIST);
const CAM_MIN_PITCH = -0.85; // camera drops low, letting you look up at the sky
const CAM_MAX_PITCH = 1.25; // near top-down
const LOOK_HEIGHT = 100;
const CAM_MIN_CLEARANCE = 70;

/** Day/night cycle tuning. */
const CYCLE_SECONDS = 160; // real seconds for a full 24h cycle (~80s day / 80s night)
const DAY_START_HOUR = 9; // hour the game boots at (mid-morning)

/** The single daily rain shower, in in-game hours: clouds build 13.5->14.2,
 *  pour until 16.4, clear by 17.2 — exactly one storm per 24h cycle. */
const RAIN_WINDOW = { buildFrom: 13.5, fullAt: 14.2, clearFrom: 16.4, clearBy: 17.2 };

function rainIntensityFromHour(hour: number): number {
  const w = RAIN_WINDOW;
  if (hour < w.buildFrom || hour > w.clearBy) return 0;
  const rampUp = THREE.MathUtils.smoothstep(hour, w.buildFrom, w.fullAt);
  const rampDown = 1 - THREE.MathUtils.smoothstep(hour, w.clearFrom, w.clearBy);
  return rampUp * rampDown;
}

const SUNRISE_HOUR = 6; // hour 6 = sun on the east horizon
const SKY_DAY = new THREE.Color(0xbfd1e5);
const SKY_NIGHT = new THREE.Color(0x070b18);
const SKY_SUNSET = new THREE.Color(0xf2984f);
const STORM_SKY = new THREE.Color(0x59636e); // wet grey sky while rain pours
const WINTER_SKY = new THREE.Color(0xd7e7f2); // pale icy sky over snow biomes
const DESERT_SKY = new THREE.Color(0xa9c9e2); // hazy warm-BLUE desert vault —
const RED_SKY = new THREE.Color(0xcf9460); // dusty rust haze over the red dunes
const MESA_SKY = new THREE.Color(0xdbc4a0); // pale warm badlands vault
const VOLCANO_SKY = new THREE.Color(0x39281f); // dark smoky ash ceiling
const EMBER_GLOW_SKY = new THREE.Color(0x8a3414); // live-crater ember cast
const CHERRY_SKY = new THREE.Color(0xecc8dd); // soft pink blossom haze
const SHROOM_SKY = new THREE.Color(0xcfc3de); // pale lilac mycelium cast
// crimson fields share the plain GRASSLAND vault (user request) — the red
// stays in the ground cover, the sky keeps the default temperate look
// deserts keep a clear blue sky (per the reference screenshot); only a
// faint dusty cast separates them from the temperate grasslands
const SUNLIGHT_HIGH = new THREE.Color(0xfff3e2);
const SUNLIGHT_LOW = new THREE.Color(0xff9a55);
const MOONLIGHT = new THREE.Color(0xa7b8e0);
const AMBIENT_DAY = new THREE.Color(0xeeeeee);
const AMBIENT_NIGHT = new THREE.Color(0x46527a);
const AMBIENT_DAY_I = 3;
const AMBIENT_NIGHT_I = 1.1;
const SUN_LIGHT_MAX = 12;
const MOON_LIGHT_MAX = 2.4;
const SUN_TINT_NOON = new THREE.Color(0xffffff);
const SUN_TINT_SET = new THREE.Color(0xff8038);
const STAR_COUNT = 1300;
const STAR_BRIGHT_COUNT = 90;
const STAR_RADIUS = 8800; // inside camera.far, beyond the world edge

/** Aerial fog: FogExp2 base density; thickens a little at dawn/dusk. */
const FOG_DENSITY = 0.00011;

/** One-shot animation bindings: key code -> clip name. */
const ACTION_KEYS: Record<string, string> = {
  KeyF: 'attack',
  Digit1: 'wave',
  Digit2: 'taunt',
  Digit3: 'salute',
  Digit4: 'point',
  Digit5: 'flip',
  Numpad5: 'flip',
};

/** Body skins (order matches loadParts config) with swatch colors for the
 *  UI + the texture file name (the AI forge reads it as its source). */
const SKINS: Array<{ name: string; color: string; file: string }> = [
  { name: 'Ratamahatta', color: '#b45309', file: 'ratamahatta.png' },
  { name: 'Crimson', color: '#dc2626', file: 'skin_crimson.png' },
  { name: 'Blue CTF', color: '#60a5fa', file: 'ctf_b.png' },
  { name: 'Red CTF', color: '#f87171', file: 'ctf_r.png' },
  { name: 'Dead', color: '#a1a1aa', file: 'dead.png' },
  { name: 'Gearwhore', color: '#a3b18a', file: 'gearwhore.png' },
  { name: 'Goldlord', color: '#d4a017', file: 'skin_gold.png' },
  { name: 'Toxin', color: '#84cc16', file: 'skin_toxin.png' },
  { name: 'Shadow', color: '#3f3f46', file: 'skin_shadow.png' },
  { name: 'Frostbite', color: '#7dd3fc', file: 'skin_frost.png' },
  { name: 'Magma', color: '#ea580c', file: 'skin_magma.png' },
];

/** One-tap prompt ideas for the AI costume forge. */
const AI_PROMPT_IDEAS = [
  'Molten lava armor with glowing cracks',
  'Royal gold armor with jewels',
  'Neon cyberpunk armor',
  'Frozen ice crystal',
];

/** One-tap prompt ideas for the AI weapon forge. */
const WEAPON_AI_PROMPT_IDEAS = [
  'Toxic green circuitry skin',
  'Gold dragon engravings',
  'Neon cyberpunk glow',
  'Rusty battle-worn metal',
];

/** Weapon loadouts backed by real MD2 weapon meshes — the full 11-weapon
 *  arsenal from the three.js MD2 example (webgl_loader_md2); null model =
 *  unarmed. The last entry must stay unarmed (applyWeapon maps it to
 *  "hide all"). */
const WEAPONS: Array<{
  name: string;
  model: string | null;
  icon: LucideIcon;
}> = [
  { name: 'Blade', model: 'weapon.md2', icon: Sword },
  { name: 'Shotgun', model: 'w_shotgun.md2', icon: Target },
  { name: 'Chaingun', model: 'w_chaingun.md2', icon: Zap },
  { name: 'Railgun', model: 'w_railgun.md2', icon: Magnet },
  { name: 'BFG', model: 'w_bfg.md2', icon: Skull },
  { name: 'Blaster', model: 'w_blaster.md2', icon: Crosshair },
  { name: 'Grenade Launcher', model: 'w_glauncher.md2', icon: Bomb },
  { name: 'Hyperblaster', model: 'w_hyperblaster.md2', icon: Snowflake },
  { name: 'Machinegun', model: 'w_machinegun.md2', icon: Gauge },
  { name: 'Rocket Launcher', model: 'w_rlauncher.md2', icon: Rocket },
  { name: 'Sawn-off', model: 'w_sshotgun.md2', icon: Scissors },
  { name: 'Unarmed', model: null, icon: Ban },
];

/** Drawing any mesh weapon plays the reload cue; the Blade and Unarmed
 *  entries stay silent on switch. */
const isGunWeapon = (index: number) =>
  index >= 1 && index < WEAPONS.length - 1;

/** TRACER GLOW: signature streak color per base weapon (index-aligned with
 *  WEAPONS). Every bullet glows in its weapon's hue; AI-forged weapon skins
 *  override it with their own rack color. melee/Unarmed entries are never
 *  fired but keep a color so the table stays index-safe. */
const WEAPON_TRACER_COLORS: number[] = [
  0xffc36b, // Blade — n/a (melee)
  0xffb347, // Shotgun — warm pump orange
  0xff7043, // Chaingun — hot red-orange spray
  0x7ef9d4, // Railgun — teal energy lance
  0x9dff57, // BFG — toxic slime green
  0x66f0ff, // Blaster — icy plasma cyan
  0xffd166, // Grenade Launcher — warning amber
  0xa8e8ff, // Hyperblaster — frost spark
  0xffe08a, // Machinegun — pale gold stream
  0xff6b57, // Rocket Launcher — hot signal red
  0xffa26b, // Sawn-off — burnt flash
  0xffc36b, // Unarmed — n/a
];

/** Parse an AI-forged skin's hex color string ('#a3b18a') into a 24-bit
 *  int for the tracer material; null/invalid falls back to `fallback`. */
function forgeColorToHex(color: string | undefined, fallback: number): number {
  if (!color) return fallback;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(color.trim());
  return m ? parseInt(m[1], 16) : fallback;
}

/** Player identity shown on the lobby dashboard. */
const PLAYER_NAME = 'RATLORD_99';
const PLAYER_COINS = 160;
const PLAYER_GEMS = 0;

type GamePhase = 'lobby' | 'playing';

/** Lobby showcase camera + turntable tuning. */
const LOBBY_DIST = 430;
const LOBBY_PITCH = 0.1;
const LOBBY_TURN_SPEED = 0.45; // rad/s auto-rotation
const LOBBY_BLEND_TIME = 1.3; // s, camera sweep from lobby into gameplay

/** Lobby side menu — every entry opens its fullscreen command panel. */
const LOBBY_MENU: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: 'store', label: 'Store', icon: Store },
  { id: 'luck', label: 'Luck Royale', icon: Clover },
  { id: 'character', label: 'Character', icon: UserRound },
  { id: 'mods', label: 'Mods', icon: Puzzle },
  { id: 'vault', label: 'Vault', icon: Package },
  { id: 'pet', label: 'Pet', icon: PawPrint },
  { id: 'collection', label: 'Collection', icon: Images },
  { id: 'weapons', label: 'Weapons', icon: Sword },
];

/** One inventory entry — starter gear, a naturally-mined block, or a freshly
 *  crafted output. Every entry ships its real vanilla Minecraft texture. */
type LobbyItemEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Real vanilla Minecraft block/item texture, served from /public/blocks. */
  img: string;
  count: number;
  accent: string;
};

/** Starter gear & special items — crafting reagents, recipe-book labels and
 *  hotbar seeds. They live OFF the inventory grid by design. */
const LOBBY_GEAR_ITEMS: LobbyItemEntry[] = [
  { id: 'coins', label: 'Coin stack', icon: Coins, img: '/blocks/coins.png', count: 24, accent: 'text-amber-400' },
  { id: 'gems', label: 'Gem shard', icon: Gem, img: '/blocks/gems.png', count: 7, accent: 'text-emerald-400' },
  { id: 'loot_chest', label: 'Loot chest', icon: Package, img: '/blocks/chest.png', count: 2, accent: 'text-amber-300' },
  { id: 'blade', label: 'Blade', icon: Sword, img: '/blocks/blade.png', count: 1, accent: 'text-orange-300' },
  { id: 'rail', label: 'Railgun core', icon: Crosshair, img: '/blocks/rail.png', count: 3, accent: 'text-red-300' },
  { id: 'cell', label: 'Power cell', icon: Zap, img: '/blocks/cell.png', count: 4, accent: 'text-lime-300' },
  { id: 'medkit', label: 'Med kit', icon: HeartPulse, img: '/blocks/medkit.png', count: 5, accent: 'text-rose-300' },
  { id: 'fuel', label: 'Fuel can', icon: Flame, img: '/blocks/fuel.png', count: 3, accent: 'text-orange-400' },
  { id: 'ice', label: 'Ice charm', icon: Snowflake, img: '/blocks/ice.png', count: 2, accent: 'text-zinc-200' },
  { id: 'ore', label: 'Ore magnet', icon: Magnet, img: '/blocks/ore.png', count: 6, accent: 'text-amber-200' },
  { id: 'chip', label: 'Pet chip', icon: Cpu, img: '/blocks/chip.png', count: 3, accent: 'text-emerald-300' },
  { id: 'dust', label: 'Forge dust', icon: Sparkles, img: '/blocks/dust.png', count: 9, accent: 'text-amber-300' },
];

/** ==== MINED BLOCKS — every naturally-occurring block the player mines or
 *  breaks in vanilla Minecraft, grouped by category. Textures are the real
 *  vanilla 16x16 assets (grayscale leaves/grass tinted with the vanilla
 *  biome colormap, animation strips flattened to their first frame). ==== */
const MINED_BLOCK_GROUPS: Array<{
  key: string;
  label: string;
  icon: LucideIcon;
  accent: string;
  count: number;
  items: Array<{ id: string; label: string }>;
}> = [
  {
    key: 'stone',
    label: 'Stone & underground',
    icon: Mountain,
    accent: 'text-zinc-300',
    count: 6,
    items: [
      { id: 'stone', label: 'Stone' }, { id: 'deepslate', label: 'Deepslate' },
      { id: 'granite', label: 'Granite' }, { id: 'diorite', label: 'Diorite' },
      { id: 'andesite', label: 'Andesite' }, { id: 'tuff', label: 'Tuff' },
      { id: 'calcite', label: 'Calcite' }, { id: 'dripstone_block', label: 'Dripstone Block' },
      { id: 'cobbled_deepslate', label: 'Cobbled Deepslate' }, { id: 'cobblestone', label: 'Cobblestone' },
      { id: 'pointed_dripstone', label: 'Pointed Dripstone' }, { id: 'bedrock', label: 'Bedrock' },
    ],
  },
  {
    key: 'ores',
    label: 'Ores',
    icon: Pickaxe,
    accent: 'text-amber-300',
    count: 3,
    items: [
      { id: 'coal_ore', label: 'Coal Ore' }, { id: 'deepslate_coal_ore', label: 'Deepslate Coal Ore' },
      { id: 'iron_ore', label: 'Iron Ore' }, { id: 'deepslate_iron_ore', label: 'Deepslate Iron Ore' },
      { id: 'copper_ore', label: 'Copper Ore' }, { id: 'deepslate_copper_ore', label: 'Deepslate Copper Ore' },
      { id: 'gold_ore', label: 'Gold Ore' }, { id: 'deepslate_gold_ore', label: 'Deepslate Gold Ore' },
      { id: 'redstone_ore', label: 'Redstone Ore' }, { id: 'deepslate_redstone_ore', label: 'Deepslate Redstone Ore' },
      { id: 'lapis_ore', label: 'Lapis Lazuli Ore' }, { id: 'deepslate_lapis_ore', label: 'Deepslate Lapis Ore' },
      { id: 'diamond_ore', label: 'Diamond Ore' }, { id: 'deepslate_diamond_ore', label: 'Deepslate Diamond Ore' },
      { id: 'emerald_ore', label: 'Emerald Ore' }, { id: 'deepslate_emerald_ore', label: 'Deepslate Emerald Ore' },
      { id: 'nether_quartz_ore', label: 'Nether Quartz Ore' }, { id: 'nether_gold_ore', label: 'Nether Gold Ore' },
      { id: 'ancient_debris', label: 'Ancient Debris' },
    ],
  },
  {
    key: 'soil',
    label: 'Dirt & soil',
    icon: Shovel,
    accent: 'text-orange-300',
    count: 6,
    items: [
      { id: 'dirt', label: 'Dirt' }, { id: 'grass_block', label: 'Grass Block' },
      { id: 'coarse_dirt', label: 'Coarse Dirt' }, { id: 'rooted_dirt', label: 'Rooted Dirt' },
      { id: 'podzol', label: 'Podzol' }, { id: 'mycelium', label: 'Mycelium' },
      { id: 'mud', label: 'Mud' }, { id: 'clay', label: 'Clay' },
      { id: 'gravel', label: 'Gravel' }, { id: 'sand', label: 'Sand' },
      { id: 'red_sand', label: 'Red Sand' },
    ],
  },
  {
    key: 'deposits',
    label: 'Terrain deposits',
    icon: Layers,
    accent: 'text-zinc-200',
    count: 4,
    items: [
      { id: 'sandstone', label: 'Sandstone' }, { id: 'red_sandstone', label: 'Red Sandstone' },
      { id: 'moss_block', label: 'Moss Block' }, { id: 'snow_block', label: 'Snow Block' },
      { id: 'snow', label: 'Snow' }, { id: 'ice_block', label: 'Ice' },
      { id: 'packed_ice', label: 'Packed Ice' }, { id: 'blue_ice', label: 'Blue Ice' },
      { id: 'obsidian', label: 'Obsidian' }, { id: 'crying_obsidian', label: 'Crying Obsidian' },
    ],
  },
  {
    key: 'wood',
    label: 'Wood & logs',
    icon: TreePine,
    accent: 'text-amber-200',
    count: 4,
    items: [
      { id: 'oak_log', label: 'Oak Log' }, { id: 'spruce_log', label: 'Spruce Log' },
      { id: 'birch_log', label: 'Birch Log' }, { id: 'jungle_log', label: 'Jungle Log' },
      { id: 'acacia_log', label: 'Acacia Log' }, { id: 'dark_oak_log', label: 'Dark Oak Log' },
      { id: 'mangrove_log', label: 'Mangrove Log' }, { id: 'cherry_log', label: 'Cherry Log' },
      { id: 'pale_oak_log', label: 'Pale Oak Log' },
    ],
  },
  {
    key: 'nether',
    label: 'Nether terrain',
    icon: Flame,
    accent: 'text-red-300',
    count: 4,
    items: [
      { id: 'netherrack', label: 'Netherrack' }, { id: 'basalt', label: 'Basalt' },
      { id: 'smooth_basalt', label: 'Smooth Basalt' }, { id: 'blackstone', label: 'Blackstone' },
      { id: 'soul_sand', label: 'Soul Sand' }, { id: 'soul_soil', label: 'Soul Soil' },
      { id: 'nether_wart_block', label: 'Nether Wart Block' }, { id: 'warped_wart_block', label: 'Warped Wart Block' },
      { id: 'crimson_nylium', label: 'Crimson Nylium' }, { id: 'warped_nylium', label: 'Warped Nylium' },
      { id: 'nether_bricks', label: 'Nether Bricks' }, { id: 'glowstone', label: 'Glowstone' },
    ],
  },
  {
    key: 'end',
    label: 'The End',
    icon: Globe,
    accent: 'text-yellow-300',
    count: 2,
    items: [
      { id: 'end_stone', label: 'End Stone' },
      { id: 'chorus_plant', label: 'Chorus Plant' }, { id: 'chorus_flower', label: 'Chorus Flower' },
    ],
  },
  {
    key: 'plants',
    label: 'Plants & flora',
    icon: Sprout,
    accent: 'text-emerald-300',
    count: 3,
    items: [
      { id: 'oak_leaves', label: 'Oak Leaves' }, { id: 'spruce_leaves', label: 'Spruce Leaves' },
      { id: 'birch_leaves', label: 'Birch Leaves' }, { id: 'jungle_leaves', label: 'Jungle Leaves' },
      { id: 'acacia_leaves', label: 'Acacia Leaves' }, { id: 'dark_oak_leaves', label: 'Dark Oak Leaves' },
      { id: 'mangrove_leaves', label: 'Mangrove Leaves' }, { id: 'cherry_leaves', label: 'Cherry Leaves' },
      { id: 'azalea_leaves', label: 'Azalea Leaves' }, { id: 'flowering_azalea_leaves', label: 'Flowering Azalea Leaves' },
      { id: 'pale_oak_leaves', label: 'Pale Oak Leaves' },
      { id: 'vines', label: 'Vines' }, { id: 'cave_vines', label: 'Cave Vines' },
      { id: 'kelp', label: 'Kelp' }, { id: 'seagrass', label: 'Seagrass' },
      { id: 'tall_grass', label: 'Tall Grass' }, { id: 'short_grass', label: 'Short Grass' },
      { id: 'fern', label: 'Fern' }, { id: 'large_fern', label: 'Large Fern' },
      { id: 'dead_bush', label: 'Dead Bush' }, { id: 'cactus', label: 'Cactus' },
      { id: 'sugar_cane', label: 'Sugar Cane' }, { id: 'bamboo', label: 'Bamboo' },
      { id: 'red_mushroom', label: 'Red Mushroom' }, { id: 'brown_mushroom', label: 'Brown Mushroom' },
      { id: 'dandelion', label: 'Dandelion' }, { id: 'poppy', label: 'Poppy' },
      { id: 'cornflower', label: 'Cornflower' }, { id: 'blue_orchid', label: 'Blue Orchid' },
      { id: 'crimson_roots', label: 'Crimson Roots' }, { id: 'warped_roots', label: 'Warped Roots' },
      { id: 'nether_wart', label: 'Nether Wart' },
    ],
  },
  {
    key: 'ocean',
    label: 'Ocean resources',
    icon: Waves,
    accent: 'text-teal-300',
    count: 2,
    items: [
      { id: 'sea_pickle', label: 'Sea Pickle' },
      { id: 'tube_coral', label: 'Tube Coral' }, { id: 'brain_coral', label: 'Brain Coral' },
      { id: 'bubble_coral', label: 'Bubble Coral' }, { id: 'fire_coral', label: 'Fire Coral' },
      { id: 'horn_coral', label: 'Horn Coral' },
      { id: 'tube_coral_block', label: 'Tube Coral Block' }, { id: 'brain_coral_block', label: 'Brain Coral Block' },
      { id: 'bubble_coral_block', label: 'Bubble Coral Block' }, { id: 'fire_coral_block', label: 'Fire Coral Block' },
      { id: 'horn_coral_block', label: 'Horn Coral Block' },
      { id: 'tube_coral_fan', label: 'Tube Coral Fan' }, { id: 'brain_coral_fan', label: 'Brain Coral Fan' },
      { id: 'bubble_coral_fan', label: 'Bubble Coral Fan' }, { id: 'fire_coral_fan', label: 'Fire Coral Fan' },
      { id: 'horn_coral_fan', label: 'Horn Coral Fan' },
      { id: 'sponge', label: 'Sponge' }, { id: 'wet_sponge', label: 'Wet Sponge' },
    ],
  },
];

/** ==== VANILLA BLOCK STATS — real Java Edition values (minecraft.wiki) for
 *  the item-details panel. Group defaults + per-block overrides. ==== */
type MinedBlockStats = {
  /** Blocks to break; -1 = unbreakable, 0 = instant. */
  hardness: number;
  /** Blast resistance. */
  blast: number;
  /** Best harvesting tool (display string). */
  tool: string;
  /** Where the block naturally generates. */
  where: string;
};

const MINED_GROUP_STATS: Record<string, MinedBlockStats> = {
  stone: { hardness: 1.5, blast: 6, tool: 'Pickaxe', where: 'Overworld underground' },
  ores: { hardness: 3, blast: 3, tool: 'Pickaxe', where: 'Overworld ore veins' },
  soil: { hardness: 0.5, blast: 0.5, tool: 'Shovel', where: 'Overworld surface' },
  deposits: { hardness: 0.8, blast: 0.8, tool: 'Pickaxe', where: 'Overworld deposits' },
  wood: { hardness: 2, blast: 2, tool: 'Axe', where: 'Overworld forests' },
  nether: { hardness: 0.4, blast: 0.4, tool: 'Pickaxe', where: 'The Nether' },
  end: { hardness: 3, blast: 9, tool: 'Pickaxe', where: 'The End' },
  plants: { hardness: 0, blast: 0, tool: 'Any tool', where: 'Overworld flora' },
  ocean: { hardness: 0, blast: 0, tool: 'Pickaxe (Silk Touch)', where: 'Warm ocean reefs' },
};

const MINED_STAT_OVERRIDES: Record<string, Partial<MinedBlockStats>> = {
  // stone & underground
  deepslate: { hardness: 3, where: 'Deep underground (below Y 0)' },
  cobbled_deepslate: { hardness: 3.5, where: 'Dropped by mined deepslate' },
  cobblestone: { hardness: 2, where: 'Dropped by mined stone' },
  calcite: { hardness: 0.75, blast: 0.75, where: 'Amethyst geodes & stony peaks' },
  dripstone_block: { where: 'Dripstone caves' },
  pointed_dripstone: { blast: 3, where: 'Dripstone caves' },
  tuff: { where: 'Deep underground blobs' },
  bedrock: { hardness: -1, blast: 3600000, tool: 'None', where: 'Bottom of the Overworld & Nether roof' },
  // ores
  deepslate_coal_ore: { hardness: 4.5, where: 'Deep underground coal veins' },
  iron_ore: { tool: 'Stone Pickaxe+', where: 'Underground & mountainsides' },
  deepslate_iron_ore: { hardness: 4.5, tool: 'Stone Pickaxe+', where: 'Deep underground iron veins' },
  copper_ore: { tool: 'Stone Pickaxe+', where: 'Underground, richest in dripstone caves' },
  deepslate_copper_ore: { hardness: 4.5, tool: 'Stone Pickaxe+', where: 'Deep underground copper veins' },
  gold_ore: { tool: 'Iron Pickaxe+', where: 'Badlands & underground (Y −64…32)' },
  deepslate_gold_ore: { hardness: 4.5, tool: 'Iron Pickaxe+', where: 'Deep underground gold veins' },
  redstone_ore: { tool: 'Iron Pickaxe+', where: 'Deep underground' },
  deepslate_redstone_ore: { hardness: 4.5, tool: 'Iron Pickaxe+', where: 'Deep underground' },
  lapis_ore: { tool: 'Stone Pickaxe+', where: 'Underground, common near Y 0' },
  deepslate_lapis_ore: { hardness: 4.5, tool: 'Stone Pickaxe+', where: 'Deep underground, common near Y 0' },
  diamond_ore: { tool: 'Iron Pickaxe+', where: 'Deep underground, best near Y −59' },
  deepslate_diamond_ore: { hardness: 4.5, tool: 'Iron Pickaxe+', where: 'Deep underground, best near Y −59' },
  emerald_ore: { tool: 'Iron Pickaxe+', where: 'Windswept hills & mountains' },
  deepslate_emerald_ore: { hardness: 4.5, tool: 'Iron Pickaxe+', where: 'Deep underground in mountains' },
  nether_quartz_ore: { hardness: 1.5, blast: 0.6, tool: 'Pickaxe', where: 'The Nether' },
  nether_gold_ore: { tool: 'Pickaxe', where: 'Nether wastes & basalt deltas' },
  ancient_debris: { hardness: 10, blast: 1200, tool: 'Diamond Pickaxe+', where: 'The Nether, hidden at Y 8–22' },
  // soil
  grass_block: { hardness: 0.6, where: 'Grasslands (needs Silk Touch)' },
  coarse_dirt: { where: 'Windswept hills & old taiga' },
  rooted_dirt: { where: 'Lush caves & azalea roots' },
  podzol: { where: 'Old growth taiga (needs Silk Touch)' },
  mycelium: { hardness: 0.6, where: 'Mushroom fields (needs Silk Touch)' },
  mud: { where: 'Mangrove swamps' },
  clay: { hardness: 0.6, where: 'Shallow water & riverbeds' },
  gravel: { hardness: 0.6, where: 'Beaches, underwater & underground' },
  sand: { where: 'Beaches, deserts & riverbeds' },
  red_sand: { where: 'Badlands' },
  // deposits
  sandstone: { where: 'Beneath desert sand' },
  red_sandstone: { where: 'Beneath badlands red sand' },
  moss_block: { hardness: 0.1, blast: 0.1, tool: 'Hoe', where: 'Lush caves' },
  snow_block: { hardness: 0.2, blast: 0.2, tool: 'Shovel', where: 'Snowy slopes & peaks' },
  snow: { hardness: 0.1, blast: 0.1, tool: 'Shovel', where: 'Snowy biomes (top layer)' },
  ice_block: { tool: 'Pickaxe (Silk Touch)', where: 'Frozen ocean surface' },
  packed_ice: { tool: 'Pickaxe (Silk Touch)', where: 'Icebergs & frozen peaks' },
  blue_ice: { hardness: 2.8, blast: 2.8, tool: 'Pickaxe (Silk Touch)', where: 'Beneath icebergs' },
  obsidian: { hardness: 50, blast: 1200, tool: 'Diamond Pickaxe+', where: 'Where lava meets water' },
  crying_obsidian: { hardness: 50, blast: 1200, tool: 'Diamond Pickaxe+', where: 'Bastion remnants & ruined portals' },
  // wood
  oak_log: { where: 'Forests & plains' },
  spruce_log: { where: 'Taiga & old growth pines' },
  birch_log: { where: 'Birch forests' },
  jungle_log: { where: 'Jungles' },
  acacia_log: { where: 'Savannas' },
  dark_oak_log: { where: 'Dark forests' },
  mangrove_log: { where: 'Mangrove swamps' },
  cherry_log: { where: 'Cherry groves' },
  pale_oak_log: { where: 'Pale gardens' },
  // nether
  basalt: { hardness: 1.25, blast: 4.2, where: 'Basalt deltas & soul sand valleys' },
  smooth_basalt: { hardness: 1.25, blast: 4.2, where: 'Amethyst geode outer layer' },
  blackstone: { hardness: 1.5, blast: 6, where: 'Basalt deltas & bastions' },
  soul_sand: { hardness: 0.5, blast: 0.5, tool: 'Shovel', where: 'Soul sand valleys & nether fossils' },
  soul_soil: { hardness: 0.5, blast: 0.5, tool: 'Shovel', where: 'Soul sand valleys' },
  nether_wart_block: { hardness: 1, blast: 1, tool: 'Hoe', where: 'Crimson forests' },
  warped_wart_block: { hardness: 1, blast: 1, tool: 'Hoe', where: 'Warped forests' },
  crimson_nylium: { tool: 'Pickaxe (Silk Touch)', where: 'Crimson forest floor' },
  warped_nylium: { tool: 'Pickaxe (Silk Touch)', where: 'Warped forest floor' },
  nether_bricks: { hardness: 2, blast: 6, where: 'Nether fortresses' },
  glowstone: { hardness: 0.3, blast: 0.3, tool: 'Any tool', where: 'Nether ceiling' },
  // end
  chorus_plant: { hardness: 0.4, blast: 0.4, tool: 'Axe', where: 'End outer islands' },
  chorus_flower: { hardness: 0.4, blast: 0.4, tool: 'Axe', where: 'Growing on chorus plants' },
  // plants
  oak_leaves: { hardness: 0.2, tool: 'Hoe / Shears', where: 'Oak & dark oak trees' },
  spruce_leaves: { hardness: 0.2, tool: 'Hoe / Shears', where: 'Spruce trees' },
  birch_leaves: { hardness: 0.2, tool: 'Hoe / Shears', where: 'Birch trees' },
  jungle_leaves: { hardness: 0.2, tool: 'Hoe / Shears', where: 'Jungle trees' },
  acacia_leaves: { hardness: 0.2, tool: 'Hoe / Shears', where: 'Acacia trees' },
  dark_oak_leaves: { hardness: 0.2, tool: 'Hoe / Shears', where: 'Dark oak trees' },
  mangrove_leaves: { hardness: 0.2, tool: 'Hoe / Shears', where: 'Mangrove trees' },
  cherry_leaves: { hardness: 0.2, tool: 'Hoe / Shears', where: 'Cherry trees' },
  azalea_leaves: { hardness: 0.2, tool: 'Hoe / Shears', where: 'Lush caves & azalea trees' },
  flowering_azalea_leaves: { hardness: 0.2, tool: 'Hoe / Shears', where: 'Lush caves & azalea trees' },
  pale_oak_leaves: { hardness: 0.2, tool: 'Hoe / Shears', where: 'Pale oak trees' },
  vines: { hardness: 0.2, tool: 'Shears / Axe', where: 'Jungles & swamps' },
  cave_vines: { tool: 'Any tool', where: 'Lush caves (drops glow berries)' },
  kelp: { tool: 'Any tool', where: 'Most oceans' },
  seagrass: { tool: 'Shears', where: 'Oceans & rivers' },
  tall_grass: { tool: 'Shears', where: 'Grasslands & forests' },
  short_grass: { tool: 'Shears', where: 'Grasslands' },
  fern: { tool: 'Shears', where: 'Taiga & jungle floors' },
  large_fern: { tool: 'Shears', where: 'Old growth taiga' },
  dead_bush: { tool: 'Any tool', where: 'Deserts & badlands' },
  cactus: { hardness: 0.4, tool: 'Any tool', where: 'Deserts & badlands' },
  sugar_cane: { tool: 'Any tool', where: 'Beside water' },
  bamboo: { hardness: 1, blast: 1, tool: 'Axe', where: 'Jungles' },
  red_mushroom: { tool: 'Any tool', where: 'Dark forests, caves & mushroom fields' },
  brown_mushroom: { tool: 'Any tool', where: 'Dark forests, caves & swamps' },
  dandelion: { tool: 'Any tool', where: 'Plains & forests' },
  poppy: { tool: 'Any tool', where: 'Plains & forests' },
  cornflower: { tool: 'Any tool', where: 'Plains & flower forests' },
  blue_orchid: { tool: 'Any tool', where: 'Swamps' },
  crimson_roots: { tool: 'Any tool', where: 'Crimson forests' },
  warped_roots: { tool: 'Any tool', where: 'Warped forests' },
  nether_wart: { tool: 'Any tool', where: 'Nether fortress soul sand beds' },
  // ocean
  sea_pickle: { tool: 'Any tool', where: 'Coral reefs' },
  tube_coral_block: { hardness: 1.5, blast: 6, where: 'Coral reef structures' },
  brain_coral_block: { hardness: 1.5, blast: 6, where: 'Coral reef structures' },
  bubble_coral_block: { hardness: 1.5, blast: 6, where: 'Coral reef structures' },
  fire_coral_block: { hardness: 1.5, blast: 6, where: 'Coral reef structures' },
  horn_coral_block: { hardness: 1.5, blast: 6, where: 'Coral reef structures' },
  sponge: { hardness: 0.6, blast: 0.6, tool: 'Hoe', where: 'Ocean monuments' },
  wet_sponge: { hardness: 0.6, blast: 0.6, tool: 'Hoe', where: 'Ocean monument elder rooms' },
};

/** Hardness display: ∞ for unbreakable, bare number otherwise. */
const fmtHardness = (h: number) => (h < 0 ? '∞' : String(h));
/** Blast display: compact millions (bedrock's 3,600,000 → 3.6M). */
const fmtBlast = (b: number) => (b >= 1000000 ? '3.6M' : String(b));
/** Mini-bar fills — sqrt scale so stone-family bars stay readable next to
 *  obsidian (hardness /50, blast /1200). */
const hardnessPct = (h: number) =>
  h < 0 ? 1 : Math.min(Math.sqrt(Math.max(h, 0)) / Math.sqrt(50), 1);
const blastPct = (b: number) =>
  Math.min(Math.sqrt(Math.max(b, 0)) / Math.sqrt(1200), 1);
/** Lucide glyph for a tool string (order matters — 'pickaxe' contains 'axe'). */
function toolIcon(tool: string): LucideIcon {
  const t = tool.toLowerCase();
  if (t.includes('pickaxe')) return Pickaxe;
  if (t.includes('shovel')) return Shovel;
  if (t.includes('axe')) return Axe;
  if (t.includes('hoe') || t.includes('shears')) return Scissors;
  if (t.includes('none')) return Ban;
  return Hand;
}

/** Full starting inventory — ONLY the naturally-mined blocks, one section
 *  per category. Gear & tools are not inventory slots anymore. */
const LOBBY_INV_ITEMS: LobbyItemEntry[] = [
  ...MINED_BLOCK_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      id: item.id,
      label: item.label,
      icon: group.icon,
      img: `/blocks/${item.id}.png`,
      count: group.count,
      accent: group.accent,
    }))
  ),
];

/** Inventory sections (one per mined-block category) — static boundaries
 *  over LOBBY_INV_ITEMS used to render the grouped grid. */
const LOBBY_INV_SECTIONS: Array<{
  key: string;
  label: string;
  icon: LucideIcon;
  start: number;
  end: number;
}> = (() => {
  const sections: Array<{
    key: string;
    label: string;
    icon: LucideIcon;
    start: number;
    end: number;
  }> = [];
  let cursor = 0;
  for (const group of MINED_BLOCK_GROUPS) {
    sections.push({
      key: group.key,
      label: group.label,
      icon: group.icon,
      start: cursor,
      end: cursor + group.items.length,
    });
    cursor += group.items.length;
  }
  // Crafted & processed — freshly forged outputs land here (planks, ingots,
  // tools, smelted materials…), so they are always visible in the grid.
  sections.push({
    key: 'crafted',
    label: 'Crafted & processed',
    icon: Hammer,
    start: cursor,
    end: cursor + 24,
  });
  cursor += 24;
  return sections;
})();

/** Inventory grid size — mined blocks plus 24 crafted-output slots. */
const LOBBY_INV_SLOTS = LOBBY_INV_ITEMS.length + 24;

/** Craft-item definitions from the crafting engine (wiki icons). */
const CRAFT_ITEM_DEFS = new Map(Object.entries(CRAFT_ITEMS));

/** AI-forged custom item registry — recipe-forge outputs ("Lava Sword")
 *  mapped to their display label + generated icon path, so the lobby
 *  inventory, the craft grid, the hotbar and craft toasts render them like
 *  any vanilla item. Populated on load (GET /api/recipes/custom) and every
 *  time the AI Recipe Forge invents a new item. */
const AI_ITEM_DEFS = new Map<string, { label: string; img: string }>();

/** Build a lobby inventory entry for ANY craftable item id — prefers the
 *  game-shipped inventory definitions, falls back to the wiki icon. */
function lobbyEntryForId(id: string): LobbyItemEntry {
  const ai = AI_ITEM_DEFS.get(id);
  if (ai) {
    return {
      id,
      label: ai.label,
      icon: Package,
      img: ai.img,
      count: 1,
      accent: 'text-fuchsia-300',
    };
  }
  const known = LOBBY_INV_DEF.get(id);
  if (known) return { ...known, count: 1 };
  const crafted = CRAFT_ITEM_DEFS.get(id);
  return {
    id,
    label: crafted?.label ?? id.replaceAll('_', ' '),
    icon: Package,
    img: crafted?.img ?? '',
    count: 1,
    accent: 'text-zinc-200',
  };
}

/** Total count of an id across lobby inventory slots. */
function lobbyCountSlots(
  slots: Array<LobbyItemEntry | null>,
  id: string
): number {
  let total = 0;
  for (const slot of slots) if (slot?.id === id) total += slot.count;
  return total;
}

/** Take ONE item of id out of the slots (decrement / clear). Returns the next
 *  slots array, or null when the id is not available. */
function lobbyTakeSlots(
  slots: Array<LobbyItemEntry | null>,
  id: string
): Array<LobbyItemEntry | null> | null {
  const index = slots.findIndex((slot) => slot?.id === id && slot.count > 0);
  if (index === -1) return null;
  const next = [...slots];
  const slot = next[index]!;
  next[index] = slot.count > 1 ? { ...slot, count: slot.count - 1 } : null;
  return next;
}

/** Add an entry (stacking by id, else first empty slot). Returns the next
 *  slots array, or null when the inventory is full. */
function lobbyGiveSlots(
  slots: Array<LobbyItemEntry | null>,
  entry: LobbyItemEntry,
  count: number
): Array<LobbyItemEntry | null> | null {
  const stackIndex = slots.findIndex((slot) => slot?.id === entry.id);
  const next = [...slots];
  if (stackIndex !== -1) {
    const slot = next[stackIndex]!;
    next[stackIndex] = { ...slot, count: slot.count + count };
    return next;
  }
  const emptyIndex = slots.findIndex((slot) => slot === null);
  if (emptyIndex === -1) return null;
  next[emptyIndex] = { ...entry, count };
  return next;
}

/** Renders an item's real vanilla Minecraft texture as a crisp pixel sprite
 *  (nearest-neighbour upscale via [image-rendering:pixelated]). Falls back to
 *  the Lucide icon when a texture is missing. Purely decorative — the label
 *  lives on the parent control. */
function ItemSprite({
  img,
  fallbackIcon: Fallback,
  className,
}: {
  img?: string;
  fallbackIcon?: LucideIcon | null;
  className?: string;
}) {
  if (img) {
    return (
      <img
        src={img}
        alt=""
        aria-hidden
        draggable={false}
        className={`pointer-events-none max-h-full max-w-full select-none [image-rendering:pixelated] ${className ?? ''}`}
      />
    );
  }
  if (Fallback) {
    return <Fallback className={className} aria-hidden />;
  }
  return null;
}

/** Tiny name tag revealed in a slot's inner bottom-right corner on hover
 *  (the parent must carry the `group` class). Decorative — the real name
 *  lives in the parent's aria-label/title for screen readers. */
function HoverName({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 hidden truncate bg-zinc-950/85 px-1 text-right text-[8px] font-black uppercase tracking-wide text-amber-200 group-hover:block"
    >
      {label}
    </span>
  );
}

/** One vanilla-stat row in the block-details panel — icon + label + value,
 *  with an optional mini bar (0-1 fill) for numeric stats. */
function DetailStatRow({
  icon: RowIcon,
  label,
  value,
  bar,
  barClass,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** 0-1 fill for the mini bar (omit for text-only rows). */
  bar?: number;
  barClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-950/50 px-2.5 py-1.5">
      <RowIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
      <span className="w-24 shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </span>
      {bar === undefined ? (
        <span className="min-w-0 flex-1 text-right text-[10px] font-black uppercase tracking-wide text-zinc-200">
          {value}
        </span>
      ) : (
        <>
          <span className="w-12 shrink-0 text-right text-[10px] font-black tabular-nums text-zinc-200">
            {value}
          </span>
          <span
            className="relative h-1 min-w-0 flex-1 overflow-hidden bg-zinc-800"
            aria-hidden
          >
            <span
              className={`absolute inset-y-0 left-0 ${
                barClass ?? 'bg-amber-400'
              }`}
              style={{ width: `${Math.max(2, Math.round(bar * 100))}%` }}
            />
          </span>
        </>
      )}
    </div>
  );
}

/** Static item definitions — mined inventory slots PLUS the off-inventory
 *  gear reagents (craft-grid seeding, recipe-book labels, hotbar seed). */
const LOBBY_INV_DEF = new Map(
  [...LOBBY_GEAR_ITEMS, ...LOBBY_INV_ITEMS].map((item) => [item.id, item])
);

/** Wire payload for lobby drag & drop (carried in dataTransfer). */
type LobbyDragPayload = {
  from: 'inv' | 'craftcell';
  /** inv → inventory slot index; craftcell → crafting grid cell index. */
  index: number;
  id: string;
};

function parseLobbyDrag(text: string | null): LobbyDragPayload | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as LobbyDragPayload;
    if (
      parsed &&
      (parsed.from === 'inv' || parsed.from === 'craftcell') &&
      typeof parsed.id === 'string' &&
      typeof parsed.index === 'number'
    ) {
      return parsed;
    }
  } catch {
    /* not a lobby drag payload */
  }
  return null;
}

const LOBBY_ARMOR: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: 'helmet', label: 'Helmet', icon: HardHat },
  { id: 'chest', label: 'Chestplate', icon: Shirt },
  { id: 'legs', label: 'Leggings', icon: Layers },
  { id: 'boots', label: 'Boots', icon: Footprints },
];

const LOBBY_STATS: Array<{
  id: string;
  label: string;
  icon: LucideIcon;
  value: number;
  max: number;
  display: string;
  bar: string;
}> = [
  { id: 'health', label: 'Health', icon: HeartPulse, value: 100, max: 100, display: '100', bar: 'from-emerald-500 to-emerald-300' },
  { id: 'armor', label: 'Armor', icon: Shield, value: 45, max: 100, display: '45', bar: 'from-amber-500 to-amber-300' },
  { id: 'damage', label: 'Attack damage', icon: Sword, value: 67, max: 100, display: '67', bar: 'from-orange-500 to-orange-300' },
  { id: 'hunger', label: 'Hunger', icon: Drumstick, value: 82, max: 100, display: '82', bar: 'from-lime-500 to-lime-300' },
  { id: 'durability', label: 'Durability', icon: Wrench, value: 90, max: 100, display: '90', bar: 'from-zinc-400 to-zinc-200' },
  { id: 'toughness', label: 'Toughness', icon: ShieldHalf, value: 70, max: 100, display: '70', bar: 'from-emerald-500 to-teal-300' },
  { id: 'speed', label: 'Attack speed', icon: Zap, value: 65, max: 100, display: '1.6/s', bar: 'from-amber-400 to-yellow-300' },
];

/** UI-only placeholder community mods (MODS panel layout verification).
 *  Pure decoration — none of these are wired to gameplay or persistence. */
const MOD_PLACEHOLDERS: Array<{
  id: string;
  name: string;
  blurb: string;
  icon: LucideIcon;
  accent: string;
  soon?: boolean;
}> = [
  {
    id: 'meteor',
    name: 'Meteor Showers',
    blurb: 'Random meteor events drop rare-ore craters',
    icon: Flame,
    accent: 'text-orange-400',
  },
  {
    id: 'frost',
    name: 'Frozen Wastes',
    blurb: 'Deep-winter pass with snow drifts & ice lakes',
    icon: Snowflake,
    accent: 'text-zinc-200',
  },
  {
    id: 'magnorail',
    name: 'Magno Rail',
    blurb: 'Magnetic rails launch the jeep across gaps',
    icon: Magnet,
    accent: 'text-amber-300',
  },
  {
    id: 'skylands',
    name: 'Sky Islands',
    blurb: 'Floating archipelago above the cloud line',
    icon: Telescope,
    accent: 'text-emerald-300',
    soon: true,
  },
  {
    id: 'fathom',
    name: 'Deep Fathom',
    blurb: 'Ocean trench update with sunken vaults',
    icon: Anchor,
    accent: 'text-lime-300',
    soon: true,
  },
];

/** Fullscreen lobby panels — every side-menu entry owns one. */
type LobbyPanelId =
  | 'store'
  | 'luck'
  | 'character'
  | 'mods'
  | 'vault'
  | 'pet'
  | 'collection'
  | 'weapons';

const LOADOUT_DEFAULT: LoadoutState = { skinIndex: 0, weaponIndex: 0 };

/** Shared chrome for the seven fullscreen panels. */
const PANEL_META: Record<
  LobbyPanelId,
  { title: string; tagline: string; icon: LucideIcon }
> = {
  store: { title: 'Store', tagline: 'Spend coins · power up', icon: Store },
  luck: {
    title: 'Luck Royale',
    tagline: 'Spin for coins, gems & skins',
    icon: Clover,
  },
  character: {
    title: 'Character',
    tagline: 'Dressing room · live preview',
    icon: UserRound,
  },
  vault: { title: 'Vault', tagline: 'Balances · owned gear', icon: Package },
  pet: {
    title: 'Pet',
    tagline: 'Pet rack · Buzz + Dart + Spark + Spot + Widow · deploy toggles',
    icon: PawPrint,
  },
  collection: {
    title: 'Collection',
    tagline: 'World atlas · systems online',
    icon: Images,
  },
  weapons: {
    title: 'Weapons',
    tagline: 'Gun smithy · AI forge · live preview',
    icon: Sword,
  },
  mods: {
    title: 'Mods',
    tagline: 'Mod loader · gameplay modifications',
    icon: Puzzle,
  },
};

/** Which economy source unlocks each exclusive skin (indices >= 6 — the
 *  six base skins 0-5 are always unlocked, Crimson included). */
const SKIN_SOURCES: Record<
  number,
  { id: string; source: 'store' | 'luck' }
> = {
  6: { id: 'goldlord', source: 'store' },
  7: { id: 'toxin', source: 'luck' },
  8: { id: 'shadow', source: 'luck' },
  9: { id: 'frostbite', source: 'luck' },
  10: { id: 'magma', source: 'store' },
};

/** Store catalogue: coin-priced items. Skins auto-equip on purchase; gear
 *  entries are consumables (Gem Pouch is repeatable by design). */
const STORE_ITEMS: Array<{
  id: string;
  name: string;
  blurb: string;
  price: number;
  icon: LucideIcon;
  accent: string;
  kind: 'skin' | 'gear';
  skinIndex?: number;
}> = [
  {
    id: 'goldlord',
    name: 'Goldlord Skin',
    blurb: 'Solid-gold bragging rights',
    price: 120,
    icon: Crown,
    accent: 'text-amber-300',
    kind: 'skin',
    skinIndex: 6,
  },
  {
    id: 'magma',
    name: 'Magma Skin',
    blurb: 'Lava-forged surface plating',
    price: 90,
    icon: Flame,
    accent: 'text-orange-400',
    kind: 'skin',
    skinIndex: 10,
  },
  {
    id: 'gems',
    name: 'Gem Pouch',
    blurb: '+10 gems banked instantly',
    price: 60,
    icon: Gem,
    accent: 'text-emerald-300',
    kind: 'gear',
  },
  {
    id: 'patch',
    name: 'Hull Patch',
    blurb: 'Restores BUZZ to mint condition',
    price: 40,
    icon: Wrench,
    accent: 'text-sky-300',
    kind: 'gear',
  },
  {
    id: 'medkit',
    name: 'Field Medkit',
    blurb: 'Patches you up on pickup',
    price: 30,
    icon: HeartPulse,
    accent: 'text-rose-300',
    kind: 'gear',
  },
];

/** Luck Royale wheel: 8 wedges, weighted random payouts (skins included). */
const LUCK_SEGMENTS: Array<{
  id: string;
  label: string;
  color: string;
  fg: 'dark' | 'light';
  weight: number;
  payout: {
    coins?: number;
    gems?: number;
    skinId?: string;
    skinIndex?: number;
    jackpot?: boolean;
  };
}> = [
  { id: 'c30', label: '30 Coins', color: '#ca8a04', fg: 'dark', weight: 24, payout: { coins: 30 } },
  { id: 'g5', label: '5 Gems', color: '#0f766e', fg: 'light', weight: 20, payout: { gems: 5 } },
  { id: 'c80', label: '80 Coins', color: '#ea580c', fg: 'dark', weight: 16, payout: { coins: 80 } },
  { id: 'toxin', label: 'Toxin', color: '#65a30d', fg: 'dark', weight: 10, payout: { skinId: 'toxin', skinIndex: 7 } },
  { id: 'g10', label: '10 Gems', color: '#059669', fg: 'light', weight: 12, payout: { gems: 10 } },
  { id: 'c120', label: '120 Coins', color: '#b45309', fg: 'dark', weight: 8, payout: { coins: 120 } },
  { id: 'shadow', label: 'Shadow', color: '#27272a', fg: 'light', weight: 6, payout: { skinId: 'shadow', skinIndex: 8 } },
  { id: 'jackpot', label: 'Jackpot', color: '#f59e0b', fg: 'dark', weight: 4, payout: { coins: 250, skinId: 'frostbite', skinIndex: 9, jackpot: true } },
];

const LUCK_COST = { coins: 50, gems: 10 } as const;

/** Role tag per WEAPONS entry (same order). */
const WEAPON_ROLES = [
  'Melee',
  'Close range',
  'Sustained',
  'Marksman',
  'Super weapon',
  'Sidearm',
  'Arcing',
  'Rapid beam',
  'Bullet hose',
  'Siege',
  'Point blank',
  'Bare hands',
];

/* ============================ weapon stats =============================
 * Six combat stats per weapon. They drive the smithy preview's stat panel
 * AND the real gunplay: fire cadence + attack-clip tempo (FIRE RATE),
 * bullet flight time (RANGE), aim spread (ACCURACY), how much running
 * blooms the spread (CONTROL), mag size with auto-reload (CAPACITY) and
 * air-hit sting damage (DAMAGE). Forged variants inherit their base gun
 * and gain a deterministic bonus from the texture's name. */
interface WeaponStatSet {
  damage: number;
  range: number;
  accuracy: number;
  fireRate: number;
  control: number;
  capacity: number;
}

/** Stat panel row metadata — icon + label + bar full-scale per stat. */
const WEAPON_STAT_META: Array<{
  key: keyof WeaponStatSet;
  label: string;
  icon: LucideIcon;
  max: number;
}> = [
  { key: 'damage', label: 'Damage', icon: Cog, max: 50 },
  { key: 'range', label: 'Range', icon: Telescope, max: 100 },
  { key: 'accuracy', label: 'Accuracy', icon: Crosshair, max: 50 },
  { key: 'fireRate', label: 'Fire rate', icon: Gauge, max: 500 },
  { key: 'control', label: 'Control', icon: Hand, max: 100 },
  { key: 'capacity', label: 'Capacity', icon: Layers, max: 60 },
];

const ZERO_STATS: WeaponStatSet = {
  damage: 0,
  range: 0,
  accuracy: 0,
  fireRate: 0,
  control: 0,
  capacity: 0,
};

/** Per-weapon stat table — keys are the MD2 model files (null = Unarmed). */
const WEAPON_STATS: Record<string, WeaponStatSet> = {
  'weapon.md2': { damage: 45, range: 4, accuracy: 30, fireRate: 160, control: 70, capacity: 0 },
  'w_shotgun.md2': { damage: 32, range: 12, accuracy: 6, fireRate: 120, control: 30, capacity: 8 },
  'w_chaingun.md2': { damage: 14, range: 55, accuracy: 20, fireRate: 470, control: 45, capacity: 60 },
  'w_railgun.md2': { damage: 48, range: 92, accuracy: 42, fireRate: 55, control: 32, capacity: 6 },
  'w_bfg.md2': { damage: 50, range: 75, accuracy: 24, fireRate: 40, control: 15, capacity: 4 },
  'w_blaster.md2': { damage: 16, range: 48, accuracy: 36, fireRate: 260, control: 58, capacity: 24 },
  'w_glauncher.md2': { damage: 44, range: 52, accuracy: 12, fireRate: 65, control: 20, capacity: 10 },
  'w_hyperblaster.md2': { damage: 20, range: 62, accuracy: 30, fireRate: 380, control: 52, capacity: 50 },
  'w_machinegun.md2': { damage: 15, range: 68, accuracy: 24, fireRate: 420, control: 40, capacity: 60 },
  'w_rlauncher.md2': { damage: 46, range: 85, accuracy: 28, fireRate: 32, control: 18, capacity: 4 },
  'w_sshotgun.md2': { damage: 38, range: 7, accuracy: 4, fireRate: 150, control: 38, capacity: 12 },
};

/** Deterministic 0..1 hash of a forged texture name — the SAME bonus on
 *  every reload, so the rack panel and the game bridge always agree. */
function forgeSeedRoll(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

/** Stats for a rack entry: base table row, or the forged variant with its
 *  deterministic AI-forge bonus (up to +10% damage / +12% fire rate / etc). */
function resolveWeaponStats(
  model: string | null,
  forgeSeed?: string | null
): WeaponStatSet {
  const base = (model !== null && WEAPON_STATS[model]) || ZERO_STATS;
  if (!forgeSeed) return base;
  const roll = forgeSeedRoll(forgeSeed);
  const pct = (bonus: number) => 1 + roll * bonus;
  return {
    damage: Math.round(base.damage * pct(0.1)),
    range: Math.round(base.range * pct(0.06)),
    accuracy: Math.round(base.accuracy * pct(0.1)),
    fireRate: Math.round(base.fireRate * pct(0.12)),
    control: Math.round(base.control * pct(0.08)),
    capacity: Math.round(base.capacity * pct(0.1)),
  };
}

/** Direct orders the PET panel can issue to BUZZ's combat brain. */
const PET_ORDERS: Array<{
  kind: DroneOrderKind;
  label: string;
  call: string;
  icon: LucideIcon;
}> = [
  { kind: 'COME', label: 'Come', call: 'On my way', icon: Hand },
  { kind: 'PATROL', label: 'Patrol', call: 'Patrolling', icon: Radar },
  { kind: 'GUARD', label: 'Guard', call: 'Guarding you', icon: Shield },
  { kind: 'HOLD', label: 'Hold', call: 'Holding position', icon: Anchor },
  { kind: 'CEASEFIRE', label: 'Ceasefire', call: 'Guns cold', icon: ShieldOff },
];

/** Pet rack: every roster slot — each unlocked pet carries a DEPLOY TOGGLE
 *  in the panel; on = spawns in-world with the player, off = standby.
 *  BUZZ is RATFIRE's quadcopter pet, DART the fixed-wing strike plane,
 *  SPARK the expressive ground robot (RobotExpressive.glb rig: idle,
 *  walk, run, jump, punch, death) wearing the MAGMA VANGUARD suit, and
 *  SPOT the yellow quadruped (procedural rig: trot, idle, arm trick,
 *  hop). `kind` picks the live 3D preview; `blurb` is the toast. */
const PETS: Array<{
  id: PetToggleId;
  name: string;
  color: string;
  unlocked: boolean;
  kind: 'quad' | 'plane' | 'robot' | 'spot' | 'spider';
  blurb: string;
}> = [
  {
    id: 'buzz',
    name: 'BUZZ',
    color: '#34d399',
    unlocked: true,
    kind: 'quad',
    blurb: 'BUZZ — quadcopter gunship on station',
  },
  {
    id: 'dart',
    name: 'DART',
    color: '#fbbf24',
    unlocked: true,
    kind: 'plane',
    blurb: 'DART — strike plane · deploy, then press B to fly it',
  },
  {
    id: 'robot',
    name: 'SPARK',
    color: '#f97316',
    unlocked: true,
    kind: 'robot',
    blurb: 'SPARK — MAGMA VANGUARD combat robot at your heel',
  },
  {
    id: 'spot',
    name: 'SPOT',
    color: '#f2b40a',
    unlocked: true,
    kind: 'spot',
    blurb: 'SPOT — RATFIRE quadruped · four legs, zero fear',
  },
  {
    id: 'spider',
    name: 'WIDOW',
    color: '#ef4444',
    unlocked: true,
    kind: 'spider',
    blurb: 'WIDOW — eight-legged hunter · knee-up IK crawl rig',
  },
];

/** Collection atlas: every biome the endless world streams through. */
const WORLD_BIOMES: Array<{
  name: string;
  tag: string;
  gradient: string;
}> = [
  { name: 'Grasslands', tag: 'Rolling grass seas', gradient: 'from-lime-500 to-emerald-700' },
  { name: 'Winter Reach', tag: 'Snow · frozen lakes', gradient: 'from-sky-200 to-sky-500' },
  { name: 'Dune Sea', tag: 'Desert · home oasis', gradient: 'from-amber-300 to-orange-600' },
  { name: 'Red Dunes', tag: 'Rust canyon trails', gradient: 'from-orange-700 to-red-900' },
  { name: 'Mesa Flats', tag: 'Badlands plateaus', gradient: 'from-yellow-600 to-amber-800' },
  { name: 'Volcano Core', tag: 'Ash · live crater', gradient: 'from-zinc-700 to-orange-950' },
];

/** Collection systems-online cards. */
const SYSTEM_CARDS: Array<{ name: string; note: string; icon: LucideIcon }> = [
  { name: 'Terrain Engine', note: 'Endless streaming chunks', icon: Cpu },
  { name: 'Drone AI', note: 'BUZZ combat brain', icon: Radar },
  { name: 'Voice Link', note: 'ASR + LLM radio', icon: Mic },
  { name: 'Day / Night', note: '24h cycle + storms', icon: Sun },
];

// ==================== mobile MAXIMIZE (fullscreen) helpers ====================
// On phones the game must own the WHOLE screen: the browser top bar, tab
// strip and address bar are dropped via the Fullscreen API (requested from
// the first tap and from the START tap — both are valid user gestures).
// iOS Safari has no element fullscreen in-browser, so there the same
// result comes from the standalone meta tags + the web app manifest
// (Add to Home Screen -> launches with zero browser chrome).

interface FsDebug {
  attempts: number;
  entered: boolean;
  lastError: string | null;
}

/** Debug/verification surface on window.__fsDebug. */
function fsDbg(): FsDebug {
  const w = window as unknown as { __fsDebug?: FsDebug };
  if (!w.__fsDebug) w.__fsDebug = { attempts: 0, entered: false, lastError: null };
  return w.__fsDebug;
}

/** True while a fullscreen request is in flight — a document can only have
 *  ONE pending request; a second concurrent one gets rejected with
 *  "Permissions check failed", so concurrent callers (first-tap listener +
 *  START handler fire on the same tap) must be deduped. */
let fsPending = false;

/** True when the game already runs without browser chrome (installed /
 *  Add-to-Home-Screen mode) — no fullscreen request needed there. */
function runningStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    nav.standalone === true
  );
}

// ==================== quality tier (mobile performance) ====================
// Phones were HANGING: full devicePixelRatio (3x) fill rate + MSAA + a
// 2048² shadow pass over the whole voxel terrain + 120,000 rain streaks
// + heavy FBM clouds at 60fps is far beyond a mobile GPU. LOW_SPEC cuts
// that workload roughly in half across the board on touch-first devices
// (?hi=1 opts back into the full-fat desktop look).

/** Same detection philosophy as the touch HUD: mobile user agent, or a
 *  coarse (touch-first) pointer with touch support. `?hi=1` overrides. */
function detectLowSpecDevice(): boolean {
  if (new URLSearchParams(window.location.search).get('hi') === '1') {
    return false;
  }
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
  const mobileUa =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
      navigator.userAgent
    );
  return mobileUa || (coarse && hasTouch);
}

/** Mobile render-scale cap — above ~1.5 the extra pixels are invisible at
 *  arm's length but cost a phone GPU multiples of its frame budget. */
const LOW_DPR_CAP = 1.5;
/** Desktop still gets the crisp look, just not unbounded DPR. */
const HIGH_DPR_CAP = 2;
/** Mobile frame cap (~30fps): every skipped beat is CPU AND GPU time the
 *  phone gets back; the timer bridges the gap so game time stays exact. */
const LOW_FRAME_INTERVAL_MS = 1000 / 30 - 2;

/**
 * The three.js minecraft terrain demo (webgl_geometry_minecraft) combined with
 * the ratamahatta MD2 character (webgl_loader_md2), driven by keyboard + touch
 * controls:
 *
 *   W / S or Up / Down ... walk forward / backward  -> run animation
 *   A / D or Left / Right ............ turn         -> idle animation when still
 *   Space ............................ jump — press AGAIN mid-air for a
 *                                      double jump (one extra launch per
 *                                      landing, a touch weaker than the first)
 *   Shift + W / Up ................... sprint: forward speed jumps from
 *                                      WALK_SPEED to RUN_SPEED while held
 *   F ................................ attack (shot + reload per swing); a
 *                                      textured FMJ bullet leaves the gun
 *                                      nozzle with muzzle fire, sparks and
 *                                      smoke (guns only — not Blade/Unarmed)
 *   1 / 2 / 3 / 4 / 5 ................ wave / taunt / salute / point / flip
 *                                      (5's roar is trimmed to end with it)
 *   Q / E ............................ previous / next skin
 *   X ................................ cycle weapon loadout
 *   Esc .............................. back to the lobby
 *
 *   Mouse drag ....................... orbit the camera around the character
 *   Mouse wheel ...................... zoom in / out
 *
 *   Touch (mobile ONLY) .............. virtual joystick walks + turns, icon
 *                                      buttons FIRE (hold) / JUMP / ROAR /
 *                                      RUN toggle / WEAPON / SKIN / LOBBY;
 *                                      drag orbits the camera, pinch zooms.
 *                                      The whole touch HUD is hidden on
 *                                      desktop (?touch=1 force-overrides).
 *
 *   Mobile MAXIMIZE .................. the first tap on a phone (and the
 *                                      START tap) requests fullscreen so
 *                                      the browser top bar + tabs vanish
 *                                      and the game fills the whole
 *                                      screen; the expand button top-right
 *                                      toggles it anytime, and Add to
 *                                      Home Screen launches it with zero
 *                                      browser chrome (manifest +
 *                                      standalone meta tags).
 *
 *   Running NEVER drains stamina or slows down (unlimited sprint), falls
 *   hurt, health regens after a grace period, and death respawns you at
 *   the map origin — all simulated invisibly: the in-game view is pure 3D
 *   with zero HUD, panels or overlays of any kind.
 *
 *   LOOT CHESTS: rare wooden/gold crates are scattered across the endless
 *   terrain (deterministic per region — see src/game/lootChests.ts) and
 *   pop open automatically when you walk into them, bursting coins (rare
 *   chests also drop gems) that are banked into the HUD balance — lobby
 *   header AND the in-game pill — while the chest sinks into the ground.
 *   Opened chests stay looted for the whole session.
 *
 *   MINIMAP: a north-up top-down map of the streamed world (top-left,
 *   CIRCULAR dial, see src/components/game/Minimap.tsx) scrolls smoothly
 *   with the player, painting the same height field the terrain meshes
 *   use, with gold dots marking live, unopened chests and an amber arrow
 *   for your heading; the dragon health bar hangs directly beneath it.
 *
 *   ATMOSPHERE VFX: the drama layer on top of the storm + night + dawn
 *   systems (see src/game/atmosphereVfx.ts) — forked LIGHTNING bolts
 *   strike around you during heavy rain (camera-facing quad chains, a
 *   point-light pop, a whole-screen white flash and a distance-delayed
 *   synthesized thunder rumble) while SHEET LIGHTNING flickers INSIDE
 *   the cloud deck between strikes — every flash blooms the storm cell
 *   through the cloud shapes from within (skyClouds.applyFlash) — and
 *   SHOOTING STARS streak across the night sky (rare ones leave a
 *   sparkling tail), low MORNING MIST banks settle into valley floors at
 *   dawn and burn off as the sun climbs, soft GOD RAYS fan out of the
 *   sun disc at dawn/dusk, and running/landing kicks up FOOTSTEP DUST
 *   scaled to the impact of the landing.
 *
 *   A real-time day/night cycle plays in the background (a full 24h cycle
 *   every CYCLE_SECONDS real seconds): the sun arcs overhead and sets in
 *   orange, then a cratered moon rises among a field of stars while cool
 *   moonlight takes over the shadows until dawn breaks again.
 *
 * Flow: the page boots into a Free-Fire-style LOBBY dashboard (character
 * showcase + menu chrome). Dragging spins the character, the CHARACTER /
 * WEAPONS menu entries open live loadout pickers, and START sweeps the
 * camera around the character into third-person gameplay. Esc returns to
 * the lobby. Enter also works as START.
 */
export default function MinecraftGamePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GameApi | null>(null);
  /** Imperative per-frame push into the dragon health bar HUD. */
  const healthBarRef = useRef<HealthBarHandle | null>(null);
  // driving HUD (jeep): written directly from the game loop every frame so
  // the enter hint never triggers a React re-render
  const driveHudRef = useRef<HTMLDivElement | null>(null);
  const driveHudModeRef = useRef<HTMLSpanElement | null>(null);
  // jeep dash gauges (gauge-ui cluster): the game loop pushes telemetry
  // through this imperative handle — the cluster itself flushes to React at
  // ~12 Hz and spring-animates the needles, so nothing re-renders per frame
  const jeepGaugesRef = useRef<JeepGaugesHandle | null>(null);
  // flight HUD (DART): same direct-DOM pattern — airspeed/altitude gauges
  // plus the B-to-board hint, all written from the game loop
  const flightHudRef = useRef<HTMLDivElement | null>(null);
  const flightSpeedRef = useRef<HTMLSpanElement | null>(null);
  const flightAltRef = useRef<HTMLSpanElement | null>(null);
  const flightHudModeRef = useRef<HTMLSpanElement | null>(null);
  /** BUZZ combat chip: AI state + hull — written from the game loop
   *  straight into the DOM (zero React re-renders, like the health bar). */
  const droneHudRef = useRef<HTMLSpanElement | null>(null);
  /** BUZZ voice-link chip lines: link state, last heard text, BUZZ's
   *  reply — written straight from callbacks/loop (zero re-renders). */
  const voiceHudStateRef = useRef<HTMLSpanElement | null>(null);
  const voiceHudHeardRef = useRef<HTMLSpanElement | null>(null);
  const voiceHudReplyRef = useRef<HTMLSpanElement | null>(null);
  /** Live mic-level bar inside the voice chip (transform-only writes). */
  const voiceMeterRef = useRef<HTMLDivElement | null>(null);
  /** Mic toggle handle the button + V key press through (the control
   *  itself lives inside the game effect where the drone objects are). */
  const voiceToggleRef = useRef<(() => void) | null>(null);
  /** Typed-chat handle + input — the always-open channel to BUZZ: typed
   *  text rides the SAME LLM brain as the mic, so the player can reach him
   *  even while the speech (ASR) channel is rate-limited. */
  const voiceInjectRef = useRef<((text: string) => void) | null>(null);
  const voiceTextRef = useRef<HTMLInputElement | null>(null);
  /** Mirrors the link state for the mic button icon (changes rarely). */
  const [voiceOn, setVoiceOn] = useState(false);
  const hudBridgeRef = useRef<{
    publish?: (state: LoadoutState) => void;
    enterLobby?: () => void;
    lootToast?: (message: string) => void;
  }>({});
  /** Live balance mirrors: loot chests bank coins/gems into these. */
  const [coins, setCoins] = useState(PLAYER_COINS);
  const [gems, setGems] = useState(PLAYER_GEMS);
  /** Imperative per-frame push into the exploration minimap HUD. */
  const minimapRef = useRef<MinimapHandle | null>(null);
  /** Game-side data providers for the minimap (terrain + chest markers). */
  const mapBridgeRef = useRef<MinimapBridge>({});
  const [loadout, setLoadout] = useState<LoadoutState>(LOADOUT_DEFAULT);
  const [phase, setPhase] = useState<GamePhase>('lobby');
  /** Mirrors phase into the render loop (the loop reads refs, not state). */
  const phaseRef = useRef<GamePhase>('lobby');
  /** Imperative bridge the mobile touch HUD drives the game loop through. */
  const touchApiRef = useRef<TouchGameApi | null>(null);
  /** Live terrain handle — the ZONE STUDIO panel drives terrain.applyZoneSkin
   *  / getZoneAtlas through it (the handle lives inside the game effect). */
  const terrainHandleRef = useRef<TerrainChunksHandle | null>(null);
  /** Flips true once the terrain (and its zone materials) exist — gates the
   *  boot-time restore of persisted zone skins. */
  const [terrainReady, setTerrainReady] = useState(false);
  /** Touch controls render ONLY on touch devices (or ?touch=1 override). */
  const [isTouch, setIsTouch] = useState(false);
  const [lobbyPanel, setLobbyPanel] = useState<LobbyPanelId | null>(null);
  /** Top-right LOBBY button -> full-screen command deck (both phases). */
  const [lobbyScreenOpen, setLobbyScreenOpen] = useState(false);
  /** ZONE STUDIO side panel (playing phase) — colour-code skins for every
   *  zone's block top/side tiles. */
  const [zoneStudioOpen, setZoneStudioOpen] = useState(false);
  /** Persisted/live zone skins: zone id -> the colour code that forged it
   *  (a zone missing from the map still wears its original texture). */
  const [appliedSkins, setAppliedSkins] = useState<Record<string, string>>({});
  /** Economy: items bought in the Store / won in Luck Royale. */
  const [owned, setOwned] = useState<Record<string, boolean>>({});
  /** Luck Royale wheel state (rotation persists between spins). */
  const [luckSpinning, setLuckSpinning] = useState(false);
  const [luckRotation, setLuckRotation] = useState(0);
  const [luckResult, setLuckResult] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);

  // AI costume forge (CHARACTER panel): forged rack rows + workshop state.
  const [forgedSkins, setForgedSkins] = useState<ForgedSkin[]>([]);
  /** Rack index picked for AI editing (null = workshop drawer closed). */
  const [aiSource, setAiSource] = useState<number | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  /** AI-forged weapon textures (WEAPONS panel rack rows, in DB order —
   *  the game bridge's virtual rack indices mirror this exact order). */
  const [forgedWeapons, setForgedWeapons] = useState<ForgedWeaponSkin[]>([]);
  const [wAiSource, setWAiSource] = useState<number | null>(null);
  const [wAiPrompt, setWAiPrompt] = useState('');
  const [wAiGenerating, setWAiGenerating] = useState(false);
  /** Pet command drawer (PET panel): open = direct orders under the rack. */
  const [petOrdersOpen, setPetOrdersOpen] = useState(false);
  /** Pet rack row picked for the live display room (BUZZ by default —
      the deployed pet; DART previews its plane on standby). */
  const [selectedPetIndex, setSelectedPetIndex] = useState(0);
  /** PET DEPLOY TOGGLES (PET panel): which pets are spawned in-world with
   *  the player. Single source of truth is `petDeployedRef` (read by the
   *  game effect at boot + mutated by apiRef.setPetDeployed at runtime);
   *  this state mirrors it for the switch UI. BUZZ starts deployed. */
  const [petDeployed, setPetDeployed] =
    useState<Record<PetToggleId, boolean>>(PET_DEPLOY_DEFAULT);
  const petDeployedRef = useRef<Record<PetToggleId, boolean>>({
    ...PET_DEPLOY_DEFAULT,
  });
  /** Flip a pet's deploy switch: mirrors the ref for the UI and pushes
   *  the change into the running game (spawn/despawn in-world). */
  const setPetDeployToggle = (pet: PetToggleId, on: boolean) => {
    petDeployedRef.current[pet] = on;
    setPetDeployed((prev) => ({ ...prev, [pet]: on }));
    apiRef.current?.setPetDeployed(pet, on);
  };

  // MODS panel: Chronos (time & weather) configuration.
  const [chronos, setChronos] = useState<ChronosSettings>(CHRONOS_DEFAULT);

  // ==== costume DATABASE plumbing (wardrobe that survives reloads) ====
  /** Forged texture URLs already registered in the game bridge — guards
   *  double registration when hydration re-runs after a failed attempt. */
  const registeredSkinUrlsRef = useRef<Set<string>>(new Set());
  const registeredWeaponUrlsRef = useRef<Set<string>>(new Set());
  /** Latest hydrated rows (the equipment restore reads these without
   *  depending on render timing). Kept in lockstep with the state arrays. */
  const forgedSkinsRef = useRef<ForgedSkin[]>([]);
  const forgedWeaponsRef = useRef<ForgedWeaponSkin[]>([]);
  /** Hydration settled flags — the equipment restore waits for BOTH racks. */
  const [costumesHydrated, setCostumesHydrated] = useState(false);
  const [weaponsHydrated, setWeaponsHydrated] = useState(false);
  /** Last-attempt-failed flags — opening the panel retries automatically. */
  const costumeLoadFailedRef = useRef(false);
  const weaponLoadFailedRef = useRef(false);
  /** Persistence gate: loadout PUTs start only AFTER the saved equipment
   *  has been restored (or failed to), so the boot default can never
   *  overwrite what the player was wearing. */
  const equipSyncReadyRef = useRef(false);
  const equipPersistTimerRef = useRef<number | null>(null);

  // ==== mods DATABASE plumbing (survives reloads, like the wardrobe) ====
  /** Persistence gate: mods PUTs start only AFTER the saved settings have
   *  been restored (or failed), so boot defaults never overwrite the DB. */
  const modsHydratedRef = useRef(false);
  const modsPersistTimerRef = useRef<number | null>(null);

  // ============ game audio (Web Audio singleton, see src/game/audio.ts) ============
  const soundRef = useRef<GameAudioHandle | null>(null);
  const [muted, setMuted] = useState(false);

  // GitHub export panel ("push the whole game source to a GitHub repo")
  const [ghOpen, setGhOpen] = useState(false);
  const [ghToken, setGhToken] = useState('');
  const [ghRepo, setGhRepo] = useState('');
  const [ghShowToken, setGhShowToken] = useState(false);
  const [ghStatus, setGhStatus] = useState<
    'idle' | 'working' | 'success' | 'error'
  >('idle');
  const [ghStep, setGhStep] = useState('');
  const [ghError, setGhError] = useState('');
  const [ghUrl, setGhUrl] = useState('');
  const [ghFiles, setGhFiles] = useState(0);

  /** True while the game fills the whole screen (browser bars hidden). */
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Mirrors isTouch into callbacks that must never re-bind per render. */
  const isTouchRef = useRef(false);
  /** Guards the one-shot automatic fullscreen attempt on first touch. */
  const immersiveTriedRef = useRef(false);

  /** Request fullscreen on the document (mobile browsers hide their whole
   *  top bar + tab UI). Must be called from a user gesture; silently gives
   *  up where unsupported (iOS Safari in-browser) — standalone meta tags
   *  cover that case instead. */
  const enterImmersive = useCallback(() => {
    if (fsPending || document.fullscreenElement || runningStandalone()) return;
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const dbg = fsDbg();
    dbg.attempts += 1;
    try {
      const request =
        root.requestFullscreen?.bind(root) ??
        root.webkitRequestFullscreen?.bind(root);
      if (!request) {
        dbg.lastError = 'unsupported';
        return;
      }
      fsPending = true;
      void Promise.resolve(request({ navigationUI: 'hide' }))
        .then(() => {
          dbg.entered = true;
          dbg.lastError = null;
        })
        .catch((err: unknown) => {
          dbg.lastError = err instanceof Error ? err.message : String(err);
        })
        .finally(() => {
          fsPending = false;
        });
    } catch (err) {
      fsPending = false;
      dbg.lastError = err instanceof Error ? err.message : String(err);
    }
  }, []);

  const exitImmersive = useCallback(() => {
    const doc = document as Document & { webkitExitFullscreen?: () => void };
    if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => {});
    else doc.webkitExitFullscreen?.();
  }, []);

  /** The visible top-right button — toggles fullscreen on any device. */
  const toggleImmersive = useCallback(() => {
    if (document.fullscreenElement) exitImmersive();
    else enterImmersive();
  }, [enterImmersive, exitImmersive]);

  /** One-shot automatic attempt: the FIRST tap on a phone (lobby included)
   *  maximizes the game even before START is pressed. */
  const attemptImmersiveOnce = useCallback(() => {
    if (immersiveTriedRef.current || document.fullscreenElement) return;
    immersiveTriedRef.current = true;
    enterImmersive();
  }, [enterImmersive]);

  /** START: leave the lobby and sweep the camera into third-person gameplay. */
  const enterGame = useCallback(() => {
    phaseRef.current = 'playing';
    setPhase('playing');
    setLobbyPanel(null);
    setGhOpen(false);
    // mobile MAXIMIZE: the START tap doubles as the fullscreen gesture —
    // drop the browser top bar/tabs so the game owns the whole screen
    if (isTouchRef.current) enterImmersive();
    // user gesture: wake the (otherwise suspended) AudioContext here
    void getGameAudio().then((sfx) => {
      soundRef.current = sfx;
      sfx.resume();
    });
  }, [enterImmersive]);

  /** Back to the lobby showcase (Esc key). */
  const enterLobby = useCallback(() => {
    phaseRef.current = 'lobby';
    setPhase('lobby');
  }, []);

  /** Mute/unmute every sound (speaker button + the M key). */
  const toggleMute = useCallback(() => {
    void getGameAudio().then((sfx) => {
      soundRef.current = sfx;
      sfx.resume(); // this click is also a valid gesture
      const next = !sfx.isMuted();
      sfx.setMuted(next);
      setMuted(next);
    });
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // ==== ZONE STUDIO boot restore — persisted zone skins repaint the world
  // as soon as the terrain materials exist (survives reloads; a DB outage
  // just means the vanilla textures stay, exactly like the wardrobe does)
  useEffect(() => {
    if (!terrainReady) return;
    const terrain = terrainHandleRef.current;
    if (!terrain) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/terrain/ai-texture');
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          skins?: Array<{ zone: string; prompt: string; atlasData: string }>;
        };
        if (cancelled || !Array.isArray(data.skins)) return;
        for (const skin of data.skins) {
          if (cancelled) return;
          if (!(ZONE_SKIN_IDS as string[]).includes(skin.zone)) continue;
          // Colour skins are REBUILT from their hex code over the zone's
          // vanilla atlas (grass-block composite: big-pixel top cap + side
          // fringe) — this also upgrades skins saved by older builds that
          // painted the whole side face. Non-hex rows fall back to the
          // stored atlas pixels.
          let source: string | HTMLCanvasElement = skin.atlasData;
          const hex = (skin.prompt ?? '').trim();
          if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
            const scratch = document.createElement('canvas');
            const base = terrain.getZoneBaseAtlas(
              skin.zone as ZoneSkinId,
              scratch
            )
              ? scratch
              : null;
            source = buildColorAtlasDataUrl(normalizeHex(hex), base);
          }
          const applied = await terrain.applyZoneSkin(
            skin.zone as ZoneSkinId,
            source
          );
          if (applied) {
            setAppliedSkins((prev) => ({ ...prev, [skin.zone]: skin.prompt }));
          }
        }
      } catch {
        // offline DB / network hiccup — the vanilla world simply stays
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [terrainReady]);

  /** A skin is usable when it is one of the base six or has been unlocked
   *  through the Store / Luck Royale. Forged AI costumes carry no source —
   *  they are always unlocked. */
  const skinUnlocked = useCallback(
    (index: number) => {
      const source = SKIN_SOURCES[index];
      return !source || !!owned[source.id];
    },
    [owned]
  );

  /** Combined costume rack: the base skins + the forged AI costumes. Forged
   *  rack index = SKINS.length + position — mirrors the game's skinsBody,
   *  which the boot effect and the forge handler fill in the same order. */
  const ALL_SKINS = useMemo(
    () => [
      ...SKINS.map((skin) => ({
        name: skin.name,
        color: skin.color,
        file: skin.file,
        forged: false,
      })),
      ...forgedSkins.map((skin) => ({
        name: skin.name,
        color: skin.color,
        /** BARE file name (ai_xxx.png) — the AI forge POSTs this as
         *  sourceFile and the server whitelist only accepts file names,
         *  never paths. skinTextureUrl re-adds the public prefix. */
        file: skin.texturePath.split('/').pop() ?? skin.texturePath,
        forged: true,
      })),
    ],
    [forgedSkins]
  );

  /** Rack texture URL — base skins need the MD2 skins/ prefix, forged rows
   *  already store a public URL. */
  const skinTextureUrl = (file: string) =>
    file.startsWith('/') ? file : `/models/md2/ratamahatta/skins/${file}`;

  /** Combined WEAPON rack: the base weapons + AI-forged weapon textures as
   *  NEW rack rows (same pattern as ALL_SKINS). Forged rack index =
   *  WEAPONS.length + position — mirrors the game bridge's virtual variant
   *  indices exactly. */
  const ALL_WEAPONS = useMemo(
    () => [
      ...WEAPONS.map((weapon, index) => ({
        name: weapon.name,
        icon: weapon.icon,
        role: WEAPON_ROLES[index] ?? 'Gear',
        baseIndex: index,
        /** BARE texture file for the rack thumbnail (null = Unarmed). */
        textureFile: weapon.model
          ? (weapon.model.replace(/\.md2$/, '.png') as string)
          : null,
        forged: false,
        texturePath: null as string | null,
      })),
      ...forgedWeapons.map((row) => ({
        name: row.name,
        icon: WEAPONS[row.weaponIndex]?.icon ?? WEAPONS[0].icon,
        role: WEAPON_ROLES[row.weaponIndex] ?? 'AI forged',
        baseIndex: row.weaponIndex,
        textureFile: row.texturePath.split('/').pop() ?? '',
        forged: true,
        texturePath: row.texturePath,
      })),
    ],
    [forgedWeapons]
  );

  /** Weapon rack index → WeaponPreview props (base mesh + forged texture). */
  const weaponPreview = (rackIndex: number) => {
    if (rackIndex >= WEAPONS.length) {
      const row = forgedWeapons[rackIndex - WEAPONS.length];
      if (row) return { base: row.weaponIndex, url: row.texturePath };
    }
    return {
      base: rackIndex < WEAPONS.length - 1 ? rackIndex : -1,
      url: null as string | null,
    };
  };

  /** CharacterPreview prop: forged variant indices clamp to their base mesh
   *  (the hero wears the weapon too small to read a custom texture there —
   *  the dedicated WEAPONS panel preview shows the repaint full-size). */
  const heroPreviewWeaponIndex =
    loadout.weaponIndex >= WEAPONS.length
      ? (forgedWeapons[loadout.weaponIndex - WEAPONS.length]?.weaponIndex ??
        WEAPONS.length - 1)
      : loadout.weaponIndex;

  /** Wait until the game loop publishes its API bridge (forged textures
   *  register through it). Resolves null after ~15 s so a stuck boot can
   *  never hang the wardrobe hydration. */
  const waitForGameApi = useCallback(async () => {
    for (let i = 0; i < 150 && !apiRef.current; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return apiRef.current;
  }, []);

  /** Hydrate the COSTUME rack from the costume database: fetch every forged
   *  costume, register any not yet in the game bridge (DB order — rack
   *  indices must match the game's skinsBody exactly) and merge the rows.
   *  Runs on boot and re-runs when the CHARACTER panel opens after a failed
   *  attempt, so a transient DB outage can never leave the wardrobe
   *  silently empty. */
  const hydrateCostumes = useCallback(
    async (announceFailure: boolean) => {
      let rows: ForgedSkin[] = [];
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
        try {
          const res = await fetch('/api/costume/ai-edit', {
            cache: 'no-store',
          });
          const data = await res.json();
          if (data?.ok && Array.isArray(data.skins)) {
            rows = data.skins;
            ok = true;
          }
        } catch {
          // network hiccup — retry below
        }
        if (!ok && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      }
      if (!ok) {
        costumeLoadFailedRef.current = true;
        setCostumesHydrated(true); // settled — unblock the equipment restore
        if (announceFailure) {
          showToast('Saved costumes could not be loaded — reopen to retry');
        }
        return;
      }
      costumeLoadFailedRef.current = false;
      // merge: rows already known client-side (e.g. forged mid-retry) keep
      // their registered order first, fresh DB rows append behind them —
      // this keeps the rack order identical to the game bridge's list.
      const known = new Set(
        forgedSkinsRef.current.map((row) => row.texturePath)
      );
      const merged = [
        ...forgedSkinsRef.current,
        ...rows.filter((row) => !known.has(row.texturePath)),
      ];
      forgedSkinsRef.current = merged;
      setForgedSkins(merged);
      const api = await waitForGameApi();
      if (api) {
        for (const skin of merged) {
          if (registeredSkinUrlsRef.current.has(skin.texturePath)) continue;
          registeredSkinUrlsRef.current.add(skin.texturePath);
          api.addSkin(skin.texturePath);
        }
      }
      setCostumesHydrated(true);
    },
    [showToast, waitForGameApi]
  );

  /** Hydrate the WEAPON rack from the costume database — weapon twin of
   *  hydrateCostumes. Virtual variant indices register in rack order so the
   *  game bridge and the forgedWeapons array stay in lockstep. */
  const hydrateWeapons = useCallback(
    async (announceFailure: boolean) => {
      let rows: ForgedWeaponSkin[] = [];
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
        try {
          const res = await fetch('/api/weapon/ai-edit', {
            cache: 'no-store',
          });
          const data = await res.json();
          if (data?.ok && Array.isArray(data.weapons)) {
            rows = data.weapons;
            ok = true;
          }
        } catch {
          // network hiccup — retry below
        }
        if (!ok && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      }
      if (!ok) {
        weaponLoadFailedRef.current = true;
        setWeaponsHydrated(true); // settled — unblock the equipment restore
        if (announceFailure) {
          showToast(
            'Saved weapon skins could not be loaded — reopen to retry'
          );
        }
        return;
      }
      weaponLoadFailedRef.current = false;
      const known = new Set(
        forgedWeaponsRef.current.map((row) => row.texturePath)
      );
      const merged = [
        ...forgedWeaponsRef.current,
        ...rows.filter((row) => !known.has(row.texturePath)),
      ];
      forgedWeaponsRef.current = merged;
      setForgedWeapons(merged);
      const api = await waitForGameApi();
      if (api) {
        for (const row of merged) {
          if (registeredWeaponUrlsRef.current.has(row.texturePath)) continue;
          registeredWeaponUrlsRef.current.add(row.texturePath);
          api.addWeaponVariant(row.weaponIndex, row.texturePath, row.color);
        }
      }
      setWeaponsHydrated(true);
    },
    [showToast, waitForGameApi]
  );

  // Boot hydration (once per page load — the racks fill from the DB).
  useEffect(() => {
    void hydrateCostumes(false);
  }, [hydrateCostumes]);
  useEffect(() => {
    void hydrateWeapons(false);
  }, [hydrateWeapons]);

  // A failed hydration retries the moment the player opens the panel again.
  useEffect(() => {
    if (lobbyPanel === 'character' && costumeLoadFailedRef.current) {
      void hydrateCostumes(true);
    }
    if (lobbyPanel === 'weapons' && weaponLoadFailedRef.current) {
      void hydrateWeapons(true);
    }
  }, [lobbyPanel, hydrateCostumes, hydrateWeapons]);

  /** EQUIPMENT RESTORE — once both racks are hydrated, read the saved
   *  loadout and re-equip it: forged entries match by texturePath (stable
   *  even if rack order shifts), base entries by rack index. Persistence
   *  enables only after this runs, so the boot default can never overwrite
   *  what the player was actually wearing. */
  useEffect(() => {
    if (!costumesHydrated || !weaponsHydrated) return;
    let cancelled = false;
    (async () => {
      const api = await waitForGameApi();
      if (cancelled) return;
      if (!api) {
        equipSyncReadyRef.current = true;
        return;
      }
      try {
        const res = await fetch('/api/player/equipment', {
          cache: 'no-store',
        });
        const data = await res.json();
        if (cancelled || !data?.ok || !data.equipment) return;
        const { skin, weapon } = data.equipment;
        if (
          skin?.kind === 'forged' &&
          typeof skin.texturePath === 'string'
        ) {
          const pos = forgedSkinsRef.current.findIndex(
            (row) => row.texturePath === skin.texturePath
          );
          if (pos >= 0) api.setSkin(SKINS.length + pos);
        } else if (skin?.kind === 'base' && Number.isInteger(skin.index)) {
          api.setSkin(skin.index as number);
        }
        if (
          weapon?.kind === 'forged' &&
          typeof weapon.texturePath === 'string'
        ) {
          const pos = forgedWeaponsRef.current.findIndex(
            (row) => row.texturePath === weapon.texturePath
          );
          if (pos >= 0) api.setWeapon(WEAPONS.length + pos);
        } else if (
          weapon?.kind === 'base' &&
          Number.isInteger(weapon.index)
        ) {
          api.setWeapon(weapon.index as number);
        }
      } catch {
        // offline — defaults stay; persistence still enables below
      } finally {
        if (!cancelled) equipSyncReadyRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [costumesHydrated, weaponsHydrated, waitForGameApi]);

  /** EQUIPMENT PERSISTENCE — every equip flows through the loadout mirror
   *  (rack clicks, forge auto-equip, in-game cycling, store unlocks);
   *  debounce-write it to the DB so the loadout survives reloads. */
  useEffect(() => {
    if (!equipSyncReadyRef.current) return;
    if (equipPersistTimerRef.current !== null) {
      window.clearTimeout(equipPersistTimerRef.current);
    }
    equipPersistTimerRef.current = window.setTimeout(() => {
      equipPersistTimerRef.current = null;
      const skinRow = ALL_SKINS[loadout.skinIndex];
      const weaponRow = ALL_WEAPONS[loadout.weaponIndex];
      const skin = !skinRow
        ? null
        : skinRow.forged
          ? {
              kind: 'forged' as const,
              texturePath: `/models/md2/ratamahatta/skins/${skinRow.file}`,
            }
          : { kind: 'base' as const, index: loadout.skinIndex };
      const weapon = !weaponRow
        ? null
        : weaponRow.forged && weaponRow.texturePath
          ? {
              kind: 'forged' as const,
              texturePath: weaponRow.texturePath,
            }
          : { kind: 'base' as const, index: loadout.weaponIndex };
      void fetch('/api/player/equipment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skin, weapon }),
      }).catch(() => {
        // offline — the next equip retries
      });
    }, 600);
    return () => {
      if (equipPersistTimerRef.current !== null) {
        window.clearTimeout(equipPersistTimerRef.current);
        equipPersistTimerRef.current = null;
      }
    };
  }, [loadout, ALL_SKINS, ALL_WEAPONS]);

  // ================= mods settings (MODS panel) =================

  /** Clamp an hour value into the slider's quantised range. */
  const clampChronosHour = (value: unknown) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 12;
    return Math.min(23.75, Math.max(0, Math.round(n * 4) / 4));
  };

  /** MODS RESTORE — read the saved Chronos configuration once on boot and
   *  mirror it into the panel + game. Persistence enables only after this
   *  settles, so boot defaults can never overwrite the saved mods. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
        try {
          const res = await fetch('/api/player/mods', {
            cache: 'no-store',
          });
          const data = await res.json();
          if (data?.ok && data.mods) saved = data.mods;
        } catch {
          // offline — retry below
        }
        if (!saved && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      }
      if (cancelled) return;
      if (saved) {
        setChronos({
          enabled: saved.chronosOn === true,
          hour: clampChronosHour(saved.chronosHour),
          cycleSpeed: [0, 1, 8, 30].includes(Number(saved.chronosSpeed))
            ? Number(saved.chronosSpeed)
            : 1,
          weather:
            saved.chronosWeather === 'clear' || saved.chronosWeather === 'storm'
              ? saved.chronosWeather
              : 'natural',
        });
      }
      modsHydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** MODS PERSISTENCE — every panel change debounce-writes the singleton
   *  row so the mod configuration survives reloads (Chronos). */
  useEffect(() => {
    if (!modsHydratedRef.current) return;
    if (modsPersistTimerRef.current !== null) {
      window.clearTimeout(modsPersistTimerRef.current);
    }
    modsPersistTimerRef.current = window.setTimeout(() => {
      modsPersistTimerRef.current = null;
      void fetch('/api/player/mods', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chronos,
        }),
      }).catch(() => {
        // offline — the next change retries
      });
    }, 600);
    return () => {
      if (modsPersistTimerRef.current !== null) {
        window.clearTimeout(modsPersistTimerRef.current);
        modsPersistTimerRef.current = null;
      }
    };
  }, [chronos]);

  /** MODS -> GAME — mirror the panel state into the game loop through the
   *  api bridge on every change (toggle, time jump, speed, weather). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const api = await waitForGameApi();
      if (cancelled || !api) return;
      api.setModOptions({
        enabled: chronos.enabled,
        hour: chronos.hour,
        cycleSpeed: chronos.cycleSpeed,
        weather: chronos.weather,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [chronos, waitForGameApi]);

  /** AI COSTUME FORGE: repaint the selected costume through the image-edit
   *  model and drop the result into the rack as a NEW costume (auto-equipped
   *  live in both the game and the dressing-room preview). */
  const forgeAiSkin = useCallback(async () => {
    if (aiSource === null || aiGenerating) return;
    const source = ALL_SKINS[aiSource];
    const prompt = aiPrompt.trim();
    if (!source || prompt.length < 2) return;
    setAiGenerating(true);
    try {
      const res = await fetch('/api/costume/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceFile: source.file, prompt }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        showToast(data?.error ?? 'AI forge failed — try again');
        return;
      }
      const skin: ForgedSkin = data.skin;
      const rackIndex = apiRef.current?.addSkin(skin.texturePath) ?? -1;
      // keep the DB-plumbing refs in lockstep: the URL guard prevents a
      // double registration if hydration re-runs, the ref array keeps the
      // in-session row visible to later merges.
      registeredSkinUrlsRef.current.add(skin.texturePath);
      forgedSkinsRef.current = [...forgedSkinsRef.current, skin];
      setForgedSkins((prev) => [...prev, skin]);
      if (rackIndex >= 0) apiRef.current?.setSkin(rackIndex);
      setAiSource(null);
      setAiPrompt('');
      showToast(`${skin.name} forged & equipped!`);
    } catch {
      showToast('AI forge failed — check your connection');
    } finally {
      setAiGenerating(false);
    }
  }, [aiSource, aiGenerating, aiPrompt, ALL_SKINS, showToast]);

  /** AI WEAPON FORGE: repaint the selected weapon's texture through the
   *  image-edit model and drop the result into the rack as a NEW weapon
   *  (auto-equipped live in both the game and the smithy preview). */
  const forgeAiWeapon = useCallback(async () => {
    if (wAiSource === null || wAiGenerating) return;
    const source = ALL_WEAPONS[wAiSource];
    const prompt = wAiPrompt.trim();
    // Unarmed has no texture to repaint — never forgeable.
    if (
      !source ||
      source.textureFile === null ||
      source.baseIndex < 0 ||
      source.baseIndex >= WEAPONS.length - 1 ||
      prompt.length < 2
    ) {
      return;
    }
    setWAiGenerating(true);
    try {
      const res = await fetch('/api/weapon/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceFile: source.textureFile,
          prompt,
          weaponIndex: source.baseIndex,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        showToast(data?.error ?? 'AI forge failed — try again');
        return;
      }
      const weapon: ForgedWeaponSkin = data.weapon;
      const virtualIndex =
        apiRef.current?.addWeaponVariant(
          weapon.weaponIndex,
          weapon.texturePath,
          weapon.color
        ) ?? -1;
      // keep the DB-plumbing refs in lockstep (same contract as costumes)
      registeredWeaponUrlsRef.current.add(weapon.texturePath);
      forgedWeaponsRef.current = [...forgedWeaponsRef.current, weapon];
      setForgedWeapons((prev) => [...prev, weapon]);
      if (virtualIndex >= 0) apiRef.current?.setWeapon(virtualIndex);
      setWAiSource(null);
      setWAiPrompt('');
      showToast(`${weapon.name} forged & equipped!`);
    } catch {
      showToast('AI forge failed — check your connection');
    } finally {
      setWAiGenerating(false);
    }
  }, [wAiSource, wAiGenerating, wAiPrompt, ALL_WEAPONS, showToast]);

  /** Buy a Store item: deduct coins, grant the skin (auto-equip) or consumable. */
  const buyStoreItem = useCallback(
    (itemId: string) => {
      const item = STORE_ITEMS.find((entry) => entry.id === itemId);
      if (!item) return;
      if (item.kind === 'skin' && owned[item.id]) {
        showToast('Already owned');
        return;
      }
      if (coins < item.price) {
        showToast('Not enough coins');
        return;
      }
      setCoins((value) => value - item.price);
      if (item.kind === 'skin') {
        setOwned((value) => ({ ...value, [item.id]: true }));
        if (typeof item.skinIndex === 'number') {
          apiRef.current?.setSkin(item.skinIndex);
        }
        showToast(`${item.name} unlocked`);
      } else if (item.id === 'gems') {
        setGems((value) => value + 10);
        showToast('+10 gems banked');
      } else {
        showToast(`${item.name} purchased`);
      }
    },
    [coins, owned, showToast]
  );

  /** Luck Royale: pay the entry cost, pick a weighted random wedge, spin the
 *  wheel so the pointer lands exactly on it, then bank the payout. */
  const spinLuck = useCallback(
    (mode: 'coins' | 'gems') => {
      if (luckSpinning) return;
      if (mode === 'coins' ? coins < LUCK_COST.coins : gems < LUCK_COST.gems) {
        showToast(mode === 'coins' ? 'Not enough coins' : 'Not enough gems');
        return;
      }
      if (mode === 'coins') setCoins((value) => value - LUCK_COST.coins);
      else setGems((value) => value - LUCK_COST.gems);

      const totalWeight = LUCK_SEGMENTS.reduce(
        (sum, segment) => sum + segment.weight,
        0
      );
      let roll = Math.random() * totalWeight;
      let picked = LUCK_SEGMENTS[LUCK_SEGMENTS.length - 1];
      for (const segment of LUCK_SEGMENTS) {
        roll -= segment.weight;
        if (roll <= 0) {
          picked = segment;
          break;
        }
      }

      const segAngle = 360 / LUCK_SEGMENTS.length;
      const mid =
        LUCK_SEGMENTS.indexOf(picked) * segAngle + segAngle / 2;
      setLuckResult('');
      setLuckSpinning(true);
      setLuckRotation((current) => {
        const currentMod = ((current % 360) + 360) % 360;
        const target = (360 - mid) % 360;
        const delta = ((target - currentMod + 360) % 360) + 360 * 5;
        return current + delta;
      });

      const payout = picked.payout;
      const winCoins = payout.coins ?? 0;
      const winGems = payout.gems ?? 0;
      const winSkinId = payout.skinId;
      const winSkinIndex = payout.skinIndex ?? 0;
      const jackpot = !!payout.jackpot;
      window.setTimeout(() => {
        if (winCoins) setCoins((value) => value + winCoins);
        if (winGems) setGems((value) => value + winGems);
        if (winSkinId) setOwned((value) => ({ ...value, [winSkinId]: true }));
        setLuckResult(
          jackpot
            ? `JACKPOT — ${winCoins} coins + ${SKINS[winSkinIndex].name} skin!`
            : winSkinId
              ? `${SKINS[winSkinIndex].name} skin unlocked!`
              : winCoins
                ? `+${winCoins} coins`
                : `+${winGems} gems`
        );
        setLuckSpinning(false);
      }, 4300);
    },
    [coins, gems, luckSpinning, showToast]
  );

  // Create the Web Audio graph up front (context stays suspended until the
  // first user gesture — the START click resumes it) and mirror the persisted
  // mute preference onto the speaker button. Also surfaced as window.__sfx.
  useEffect(() => {
    let cancelled = false;
    void getGameAudio().then((sfx) => {
      if (cancelled) return;
      soundRef.current = sfx;
      setMuted(sfx.isMuted());
      (window as unknown as { __sfx?: GameAudioHandle }).__sfx = sfx;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ============ touch device detection (mobile controls visibility) ============
  // The virtual joystick + icon buttons exist only where a touchscreen is
  // the primary pointer: mobile user agents, or a coarse (touch-first)
  // pointer that also reports touch support. `?touch=1` force-overrides so
  // desktop tooling can verify the HUD.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('touch') === '1') {
      setIsTouch(true);
      return;
    }
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const hasTouch =
      'ontouchstart' in window ||
      (navigator.maxTouchPoints ?? 0) > 0 ||
      ((navigator as Navigator & { msMaxTouchPoints?: number })
        .msMaxTouchPoints ?? 0) > 0;
    const mobileUa =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
        navigator.userAgent
      );
    setIsTouch(mobileUa || (coarse && hasTouch));
  }, []);

  // Auto-MAXIMIZE on the first touch of a mobile session: ANY tap (lobby
  // buttons included) counts as the user gesture the Fullscreen API needs.
  // The isTouchRef mirrors the flag for gesture callbacks above.
  useEffect(() => {
    if (!isTouch) return;
    isTouchRef.current = true;
    const onFirstTap = () => attemptImmersiveOnce();
    window.addEventListener('pointerdown', onFirstTap, {
      once: true,
      capture: true,
    });
    return () => {
      window.removeEventListener('pointerdown', onFirstTap, {
        capture: true,
      } as EventListenerOptions);
    };
  }, [isTouch, attemptImmersiveOnce]);

  // Mirror the real fullscreen state onto the expand button + __fsDebug.
  useEffect(() => {
    const sync = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      fsDbg().entered = active;
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    sync();
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  /** Left menu: every entry opens its fullscreen command panel (toggle). */
  const handleMenuClick = useCallback((id: string) => {
    setLobbyPanel((current) => (current === id ? null : (id as LobbyPanelId)));
  }, []);

  /** Push the entire game source to the caller's GitHub account.
   *
   * The save runs as a BACKGROUND job on the server: POST returns a jobId
   * instantly (no proxy can sever it → no more "502" on big uploads) and we
   * poll GET for live stage + upload percent until the job settles. */
  const saveToGithub = useCallback(async () => {
    const tokenValue = ghToken.trim();
    const repoValue = ghRepo.trim();
    if (!tokenValue || !repoValue || ghStatus === 'working') return;
    setGhStatus('working');
    setGhError('');
    setGhUrl('');
    setGhStep('Starting…');
    try {
      const res = await fetch('/api/github/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenValue, repo: repoValue }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        jobId?: string;
      };
      if (!res.ok || !data.ok || !data.jobId) {
        throw new Error(data.error || `GitHub request failed (${res.status}).`);
      }
      // Poll the background job until it reports a terminal state.
      const deadline = Date.now() + 10 * 60_000;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (Date.now() > deadline) {
          throw new Error(
            'Save is taking unusually long — give it a minute and check the repository on GitHub.'
          );
        }
        const poll = await fetch(
          `/api/github/save?jobId=${encodeURIComponent(data.jobId)}`,
          { cache: 'no-store' }
        );
        const job = (await poll.json().catch(() => ({}))) as {
          ok?: boolean;
          status?: 'working' | 'done' | 'error';
          stage?: string;
          progress?: number | null;
          files?: number;
          url?: string;
          error?: string;
        };
        if (!poll.ok || !job.ok) {
          throw new Error(
            job.error || 'Lost track of the save job — please try again.'
          );
        }
        if (job.stage) setGhStep(ghStageLabel(job.stage, job.progress ?? null));
        if (job.status === 'done') {
          setGhUrl(job.url || `https://github.com/${repoValue}`);
          setGhFiles(job.files ?? 0);
          setGhStatus('success');
          return;
        }
        if (job.status === 'error') {
          throw new Error(job.error || 'GitHub export failed.');
        }
      }
    } catch (error) {
      setGhError(
        error instanceof Error ? error.message : 'Unexpected network error.'
      );
      setGhStatus('error');
    }
  }, [ghToken, ghRepo, ghStatus]);

  // Esc closes the GitHub export panel
  useEffect(() => {
    if (!ghOpen) return;
    function onPanelKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setGhOpen(false);
    }
    window.addEventListener('keydown', onPanelKeyDown);
    return () => window.removeEventListener('keydown', onPanelKeyDown);
  }, [ghOpen]);

  // Esc closes the fullscreen lobby panel
  useEffect(() => {
    if (!lobbyPanel) return;
    function onPanelKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setLobbyPanel(null);
    }
    window.addEventListener('keydown', onPanelKeyDown);
    return () => window.removeEventListener('keydown', onPanelKeyDown);
  }, [lobbyPanel]);

  // Esc closes the full-screen lobby screen
  useEffect(() => {
    if (!lobbyScreenOpen) return;
    function onDrawerKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setLobbyScreenOpen(false);
    }
    window.addEventListener('keydown', onDrawerKeyDown);
    return () => window.removeEventListener('keydown', onDrawerKeyDown);
  }, [lobbyScreenOpen]);

  // wire the bridge the game loop communicates through
  useEffect(() => {
    hudBridgeRef.current.publish = setLoadout;
    hudBridgeRef.current.enterLobby = enterLobby;
    hudBridgeRef.current.lootToast = showToast;
    return () => {
      hudBridgeRef.current.publish = undefined;
      hudBridgeRef.current.enterLobby = undefined;
      hudBridgeRef.current.lootToast = undefined;
    };
  }, [enterLobby, showToast]);

  // Enter also deploys from the lobby — but never while typing in a text
  // field (e.g. the GitHub export panel inputs).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Enter' || phaseRef.current !== 'lobby') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      enterGame();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enterGame]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ================= quality tier (mobile LOW to stop the hang) ==========
    const LOW_SPEC = detectLowSpecDevice();

    // ================= camera / scene =================
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      20000
    );

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd1e5);
    // atmospheric haze; the colour is re-synced to the sky every frame
    scene.fog = new THREE.FogExp2(0xbfd1e5, FOG_DENSITY);
    // kerb-spark streaks billboard against this camera's view axis
    setFootpathSparkCamera(camera);
    // ultra-realistic smoke puffs billboard against this camera too
    setVehicleSmokeCamera(camera);

    // ============ infinite terrain (streamed voxel chunks) =============
    // Deterministic perlin height field, streamed as merged voxel chunks
    // around the player: new terrain materialises ahead of you while the
    // chunks behind you are disposed (see src/game/terrainChunks.ts). The
    // seed is drawn once per session like the old generator's z offset; the
    // loot-chest layout is salted with the same value.
    const terrainSeed = Math.random() * 100;
    // ---- SPAWN ANCHOR: the open GRASSLAND heartland ---------------------
    // (user request) The player's home patch — first spawn, every respawn,
    // the lobby turntable — sits on the natural grassland plains (see
    // GRASS_SPAWN_* above); findFlatSpot picks a level patch of the
    // rolling green per session.
    const spawnAnchorX = GRASS_SPAWN_X;
    const spawnAnchorZ = GRASS_SPAWN_Z;
    const terrain: TerrainChunksHandle = createTerrainChunks(scene, {
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      chunkBlocks: 16,
      viewRadius: LOW_SPEC ? 4 : 6,
      seedZ: terrainSeed,
      lowSpec: LOW_SPEC,
    });
    terrain.ensureAround(spawnAnchorX, spawnAnchorZ, 3, true); // spawn chunks meshed immediately
    // COCONUT PALMS: a deterministic grove ringed around the oasis's
    // grass collar — straight 1x1 log trunks (banded-bark atlas) under
    // cutout leaf crowns with see-through punched holes + coconuts
    // (see src/game/palmTrees.ts + palmTextures.ts). Every wood block
    // (base ring + trunk column) is a square solid via palms.collide.
    const palms: PalmTreesHandle = createPalmTrees(scene, terrain, {
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      lowSpec: LOW_SPEC,
    });
    (window as unknown as { __palms?: object }).__palms = {
      stats: palms.stats,
      collide: palms.collide,
      supportAt: palms.supportAt,
    };
    // ZONE STUDIO bridge: the React panel repaints zone materials through
    // this handle (AI-forged top/side atlas swaps, live previews)
    terrainHandleRef.current = terrain;
    setTerrainReady(true);
    (window as unknown as { __terrain?: object }).__terrain = {
      stats: terrain.stats,
      heightAt: terrain.surfaceYAt,
      pos: () => ({ x: pos.x, y: pos.y, z: pos.z }),
    };

    /** Surface height (top of the walkable deck) at a world position —
     *  terrain height PLUS the city road deck: inside the city plateau
     *  rect this returns the painted base quad (+CITY_QUAD_LIFT) and,
     *  where the 3D block roads / kerbed walkways / roundabout islands
     *  sit, their deck heights — so the player, the jeep, the camera
     *  and every critter ride the REAL raised roads (see
     *  src/game/cityRoadSurface.ts — O(1) rasterized twin of the deck). */
    function surfaceYAt(worldX: number, worldZ: number): number {
      const ty = terrain.surfaceYAt(worldX, worldZ);
      const lift = citySurfaceLiftAt(worldX, worldZ);
      return lift ? ty + lift : ty;
    }

    // ===== MINECRAFT-STYLE DYNAMIC LAVA FLOWS (volcano biome) =====
    // Every stratovolcano's caldera now pours real vanilla lava: rim
    // breaches run a cellular flow sim down the cone (falls reset the
    // level, flat spreads decay 2/block, pours channel to the lowest
    // ground), rendered as animated hot-soup sheets + pouring skirt
    // faces with lava-pop particles (see src/game/lavaFlow.ts).
    const lavaFlow: LavaFlowHandle = createLavaFlowSystem(scene, terrain, {
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      lowSpec: LOW_SPEC,
    });
    (window as unknown as { __lavaflow?: object }).__lavaflow = {
      stats: lavaFlow.stats,
      fastForward: lavaFlow.debugFastForward,
      spot: lavaFlow.debugSpot,
      fall: lavaFlow.debugFallSpot,
      tpSpot: () => {
        const s = lavaFlow.debugSpot();
        if (!s) return null;
        pos.set(s.x, s.y + 30, s.z);
        vy = 0;
        airborne = false;
        terrain.ensureAround(s.x, s.z, 2, true);
        return s;
      },
      tpFall: () => {
        // hover right in front of the tallest live cliff pour
        const s = lavaFlow.debugFallSpot();
        if (!s) return null;
        pos.set(s.x + 6, s.y + 2, s.z + 6);
        vy = 0;
        airborne = false;
        terrain.ensureAround(s.x, s.z, 2, true);
        return s;
      },
      /** Debug: place the camera at an arbitrary world vantage. */
      tpAt: (x: number, y: number, z: number) => {
        pos.set(x, y, z);
        vy = 0;
        airborne = false;
        terrain.ensureAround(x, z, 2, true);
        return { x, y, z };
      },
    };

    // ===== CALDERA LAVA BODY (real 3D molten lake model) =====
    // The caldera pool is no longer a flat textured quad: a smooth molten
    // dome with real silhouette, visible shoreline thickness (inset
    // skirts), vertex-shaded relief and a living breathing surface rides
    // above the old underlay sheet (see src/game/calderaLava.ts).
    const calderaLava: CalderaLavaHandle = createCalderaLavaSystem(
      scene,
      terrain,
      {
        block: BLOCK,
        gridOffset: GRID_OFFSET,
        lowSpec: LOW_SPEC,
      }
    );
    (window as unknown as { __caldera?: object }).__caldera = {
      stats: calderaLava.stats,
      spot: calderaLava.debugSpot,
      tp: () => {
        const s = calderaLava.debugSpot();
        if (!s) return null;
        pos.set(s.x, s.y + 16, s.z + 40);
        vy = 0;
        airborne = false;
        terrain.ensureAround(s.x, s.z, 2, true);
        return s;
      },
    };

    // ===== OASIS POOL WATER (turquoise heart of the desert bowl) =====
    // The oasis bowl in the due-north dune sea is FILLED TO THE BRIM
    // with one round turquoise pool: knee-deep clear aqua at the shore
    // rings deepening to rich teal over the pan, animated white
    // caustic light nets over the sand, sky fresnel and a sun glint on
    // gentle ripples (see src/game/oasisWater.ts). Its waterline rides
    // OASIS.waterLevel blocks above the pit floor that
    // terrain.oasisFloorY() exposes — half a block below the brim —
    // and the disc's rim tucks into the brim ring's inner wall so the
    // shoreline is a seamless circle.
    const oasisWater: OasisWaterHandle = createOasisWater(scene, {
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      floorY: terrain.oasisFloorY(),
      lowSpec: LOW_SPEC,
      // lazy handle — the renderer exists before the first animated tick
      getRenderer: () => renderer,
    });
    (window as unknown as { __oasiswater?: object }).__oasiswater = {
      stats: oasisWater.stats,
      spot: oasisWater.debugSpot,
      layout: oasisWater.layout,
      disturb: oasisWater.disturb,
      splash: (x: number, z: number, p = 0.8) => {
        const l = oasisWater.layout();
        oasisWater.splash(x, l.y, z, p);
      },
      tp: () => {
        const s = oasisWater.debugSpot();
        pos.set(s.x, s.y + 30, s.z + 900);
        vy = 0;
        airborne = false;
        terrain.ensureAround(s.x, s.z, 2, true);
        return s;
      },
    };

    // ===== FALLING COCONUTS (solid-body props) =====
    // Every hanging nut is an individually tracked body: bullets knock
    // nuts loose along the shot direction and nearby trees shed one
    // every so often; the nut falls under real gravity, bounces with
    // restitution + friction, rolls end-over-end until it settles on
    // the ground/stair blocks — or SPLASHES into the pool and floats,
    // bobbing on the shared swell (see src/game/palmCoconuts.ts).
    // Dropped nuts regrow on their tree after a few minutes. Every
    // free body is SOLID: the player is pushed out of its column and
    // rounds that clip it kick it rolling away.
    const coconutShells: PalmCoconutsHandle = createPalmCoconuts(
      scene,
      palms,
      {
        block: BLOCK,
        lowSpec: LOW_SPEC,
        surfaceAt: (x, z) => {
          const g = surfaceYAt(x, z);
          const w = oasisWater.probe(x, z);
          if (w && w.surfaceY > g) return { y: w.surfaceY, water: true };
          return { y: g, water: false };
        },
        water: oasisWater.layout(),
        onWaterEntry: (x, z, impactSpeed) => {
          const l = oasisWater.layout();
          oasisWater.splash(
            x,
            l.y,
            z,
            THREE.MathUtils.clamp(impactSpeed / 900, 0.08, 0.4)
          );
        },
      }
    );
    (window as unknown as { __coconuts?: object }).__coconuts = {
      stats: coconutShells.stats,
      dropNear: coconutShells.dropNear,
      hitTest: coconutShells.hitTest,
      knock: (id: number) => coconutShells.knock(id, 0, -0.2, 0),
      collide: coconutShells.collide,
      bodyHitTest: coconutShells.bodyHitTest,
      nudge: (i: number, x: number, y: number, z: number) =>
        coconutShells.nudge(i, x, y, z),
    };

    // ---- flat-spawn finder: the player AND the jeep must always start on
    // level ground. Candidate centres spiral out from (cx, cz); a candidate
    // wins when the terrain across its whole disc (centre + two sampled
    // rings) varies by no more than `tol` world units — one terrain block is
    // 100 units, so a tiny spread really is a plane. The flattest candidate
    // seen is always remembered, so the search never fails: it just walks
    // farther out when the immediate area is sloped.
    function findFlatSpot(
      cx: number,
      cz: number,
      discRadius: number,
      tol: number,
      searchRadius: number
    ): { x: number; z: number; y: number } {
      const rings: Array<[number, number]> = [
        [0, 1],
        [discRadius * 0.5, 8],
        [discRadius, 12],
      ];
      const spreadAt = (x: number, z: number) => {
        let min = Infinity;
        let max = -Infinity;
        for (const [r, n] of rings) {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const h = surfaceYAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
            if (h < min) min = h;
            if (h > max) max = h;
          }
        }
        return max - min;
      };
      let bestX = cx;
      let bestZ = cz;
      let bestSpread = Infinity;
      const step = Math.max(60, discRadius * 0.9);
      search: for (let r = 0; r <= searchRadius; r += step) {
        const n =
          r === 0 ? 1 : Math.max(8, Math.round((Math.PI * 2 * r) / step));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + r * 0.37; // twisted spiral
          const x = cx + Math.cos(a) * r;
          const z = cz + Math.sin(a) * r;
          const spread = spreadAt(x, z);
          if (spread < bestSpread) {
            bestSpread = spread;
            bestX = x;
            bestZ = z;
            if (bestSpread <= tol) break search;
          }
        }
      }
      return { x: bestX, z: bestZ, y: surfaceYAt(bestX, bestZ) };
    }

    // the player's home patch: a level patch of the open grassland plains
    // (see the SPAWN ANCHOR above). findFlatSpot scans the rolling green
    // for the flattest disc within range — found once per session; every
    // respawn and lobby re-entry returns here.
    const spawnFlat = findFlatSpot(spawnAnchorX, spawnAnchorZ, 70, 4, 2400);
    terrain.ensureAround(spawnFlat.x, spawnFlat.z, 3, true);

    // MINECRAFT-STYLE SHORT GRASS: procedurally built vanilla cross-sprites
    // (16x16 pixel canvas art, NearestFilter crisp, up-normals so they are
    // lit like the block tops). A lightly-random quincunx field — grid
    // points every 8 blocks PLUS cell centres (2x density), each nudged
    // slightly off its spot. Casts + receives real PCF shadow-map shadows
    // (blade-shaped via alpha-tested depth material) and animates under a
    // travelling wind field (see src/game/grassTufts.ts). MEMORY: the field
    // is cut into spatial cells and only cells INSIDE THE CAMERA'S VIEW
    // CONE + range are instantiated (pooled InstancedMeshes) — grass behind
    // the player is unloaded and streams back in as they walk/turn. Purely
    // decorative: no collision, no support — everything walks and drives
    // straight through.
    // shared grass-palette sampler: pulls the grass zone's top-face atlas
    // tile (32x32) so BOTH grass layers (short + tall) shade from the live
    // ground — Zone Studio re-skins recolour the whole meadow
    const sampleGrassTopColor = () => {
      const atlas = document.createElement('canvas');
      atlas.width = ZONE_ATLAS_TILE;
      atlas.height = ZONE_ATLAS_TILE * 2;
      if (!terrain.getZoneAtlas('grass', atlas)) return null;
      const tile = document.createElement('canvas');
      tile.width = ZONE_ATLAS_TILE;
      tile.height = ZONE_ATLAS_TILE;
      const ctx = tile.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(atlas, 0, 0);
      const d = ctx.getImageData(0, 0, tile.width, tile.height).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        n++;
      }
      return n ? { r: r / n / 255, g: g / n / 255, b: b / n / 255 } : null;
    };
    const grassTufts: GrassTuftsHandle = createGrassTufts(scene, {
      anchorX: spawnFlat.x,
      anchorZ: spawnFlat.z,
      block: BLOCK,
      heightAt: terrain.surfaceYAt,
      lowSpec: LOW_SPEC,
      topColor: sampleGrassTopColor,
    });
    (window as unknown as { __grassTufts?: object }).__grassTufts = {
      stats: grassTufts.stats,
      wind: grassTufts.wind,
      meshes: grassTufts.meshes,
    };

    // MINECRAFT-STYLE TALL GRASS: the double-plant sibling of the short
    // lawn — same crossed pixel-art quads, up-normals, shadows, gust wind
    // and camera-cone streaming (shared createGrassField factory), but
    // 1.25 blocks tall on a 16x32 nine-blade sprite and SPARSER (one tuft
    // per 10th-block grid point + cell centre) so tall clumps dot the
    // meadow between the short grass. Same anchor and palette sampler as
    // the short tufts; purely decorative, no collision, no support.
    const tallGrass: TallGrassHandle = createTallGrass(scene, {
      anchorX: spawnFlat.x,
      anchorZ: spawnFlat.z,
      block: BLOCK,
      heightAt: terrain.surfaceYAt,
      lowSpec: LOW_SPEC,
      topColor: sampleGrassTopColor,
    });
    (window as unknown as { __tallGrass?: object }).__tallGrass = {
      stats: tallGrass.stats,
      wind: tallGrass.wind,
      meshes: tallGrass.meshes,
    };

    // MINECRAFT-STYLE SUGAR CANE: the vanilla crossed-sprite look — two
    // crossed quads with hand-painted 16x48 pixel art (four DEAD-STRAIGHT
    // stalks, pale joint collars with leaf-sheath nubs, segment seam rings,
    // tapered bright tips), 3 blocks tall, sparse clumps dotting the
    // meadow. STATIC BY DESIGN: style.static keeps the shared wind shader
    // off this layer entirely, so the cane stands perfectly still while
    // the grass sways around it. Streams, pools, casts shadows exactly
    // like the grass layers. Purely decorative.
    const sugarPlant: SugarPlantHandle = createSugarPlant(scene, {
      anchorX: spawnFlat.x,
      anchorZ: spawnFlat.z,
      block: BLOCK,
      heightAt: terrain.surfaceYAt,
      lowSpec: LOW_SPEC,
    });
    (window as unknown as { __sugarPlant?: object }).__sugarPlant = {
      stats: sugarPlant.stats,
      wind: sugarPlant.wind,
      meshes: sugarPlant.meshes,
    };

    // MINECRAFT-STYLE PUMPKIN + MELON PLANTS: chunky SHARP voxel fruit
    // boxes (real box normals, hand-painted rib/stripe atlases) with a
    // stem on top — instanced through the SAME createGrassField factory
    // via its custom-geometry path. The main branch is a SEPARATE
    // interactive layer (see createFruitBranches below): one smooth
    // bezier sprouting at the stem tip, arcing over the shoulder and
    // rooting into the terrain, with lobed leaves, a bloom and a
    // tendril — it bends along when the player brushes it and can snap.
    // STATIC (fruit never sways) and RARE (one per 20th-block quincunx
    // point) so finding one feels like a discovery. Streams, pools and
    // casts real shadows like every other plant layer.
    const pumpkinCtx: FruitContext = createFruitContext('pumpkin', BLOCK);
    const pumpkinPlant: PumpkinPlantHandle = createPumpkinPlant(scene, {
      anchorX: spawnFlat.x,
      anchorZ: spawnFlat.z,
      block: BLOCK,
      heightAt: terrain.surfaceYAt,
      lowSpec: LOW_SPEC,
      context: pumpkinCtx,
    });
    (window as unknown as { __pumpkins?: object }).__pumpkins = {
      stats: pumpkinPlant.stats,
      wind: pumpkinPlant.wind,
      meshes: pumpkinPlant.meshes,
    };
    const melonCtx: FruitContext = createFruitContext('melon', BLOCK);
    const melonPlant: MelonPlantHandle = createMelonPlant(scene, {
      anchorX: spawnFlat.x,
      anchorZ: spawnFlat.z,
      block: BLOCK,
      heightAt: terrain.surfaceYAt,
      lowSpec: LOW_SPEC,
      context: melonCtx,
    });
    (window as unknown as { __melons?: object }).__melons = {
      stats: melonPlant.stats,
      wind: melonPlant.wind,
      meshes: melonPlant.meshes,
    };
    // FRUIT COLLISION: every pumpkin + melon body is a solid block —
    // square push-out stops the player walking through it, and its top
    // face is floor exactly like a palm base block, so a jump lands ON
    // the fruit and the player stands there (boxes ghost above their
    // own top face — mid-jump bodies stay free; see fruitSolid.supportAt
    // in the ground section below).
    const fruitSolid = createFruitCollisions(
      [
        { layer: pumpkinPlant, heightBlocks: 0.8 },
        { layer: melonPlant, heightBlocks: 0.7 },
      ],
      { block: BLOCK, heightAt: terrain.surfaceYAt }
    );
    (window as unknown as { __fruitSolid?: object }).__fruitSolid = {
      stats: fruitSolid.stats,
    };

    const timer = new THREE.Timer();
    timer.connect(document);

    let renderer: THREE.WebGLRenderer;

    const ambientLight = new THREE.AmbientLight(0xeeeeee, 3);
    scene.add(ambientLight);

    // Day/night cycle: the sun orbits the world once per CYCLE_SECONDS and
    // the moon rides the opposite side of the sky. ONE directional light
    // plays both roles — warm bright sunlight by day, dim blue moonlight by
    // night, with real shadows in both phases — crossfading through a
    // near-zero intensity at dusk/dawn so the direction swap is invisible.
    // The light travels with the player so the shadow camera only needs to
    // cover the area around the character.
    const SUN_DISTANCE = 2600;
    const sunDir = new THREE.Vector3();
    const moonDir = new THREE.Vector3();
    let timeHour = DAY_START_HOUR; // 0..24, advances in the render loop

    function sunAngleFromHour(hour: number): number {
      // 6h = sunrise (east horizon), 12h = zenith, 18h = sunset (west)
      return ((hour - SUNRISE_HOUR) / 24) * Math.PI * 2;
    }

    function updateSunMoonDirections() {
      const a = sunAngleFromHour(timeHour);
      sunDir.set(Math.cos(a), Math.sin(a), 0.35).normalize();
      // Moon rides the opposite arc but keeps the same z-tilt as the sun,
      // so it rises in front of the default camera view instead of behind it.
      moonDir.set(-Math.cos(a), -Math.sin(a), 0.35).normalize();
    }

    updateSunMoonDirections();

    const directionalLight = new THREE.DirectionalLight(0xffffff, 12);
    directionalLight.position.copy(sunDir).multiplyScalar(SUN_DISTANCE);
    directionalLight.castShadow = true;
    // mobile: 1024² shadow map — a quarter of the shadow-pass pixels, still
    // clean at the capped render scale (normalBias 3 hides the chunkier texels)
    directionalLight.shadow.mapSize.set(
      LOW_SPEC ? 1024 : 2048,
      LOW_SPEC ? 1024 : 2048
    );
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 8000;
    directionalLight.shadow.camera.left = -900;
    directionalLight.shadow.camera.right = 900;
    directionalLight.shadow.camera.top = 900;
    directionalLight.shadow.camera.bottom = -900;
    directionalLight.shadow.camera.updateProjectionMatrix();
    directionalLight.shadow.bias = -0.0004;
    directionalLight.shadow.normalBias = 3;
    scene.add(directionalLight);
    scene.add(directionalLight.target);

    // ================= sun & moon discs in the sky =================
    // The realistic circular sun keeps its runtime-generated radial-gradient
    // glow; it now rides the moving sun direction and dips below the horizon
    // at dusk, warming to deep orange as it sets. A canvas-painted moon
    // (shaded disc + craters + soft halo) rides the opposite direction and
    // rises as the sun sets. Both re-anchor to the camera every frame so
    // they read as infinitely far away.
    const SUN_VISUAL_DISTANCE = 15000; // inside camera.far (20000)

    function createSunTexture(): THREE.CanvasTexture {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas not supported');

      const gradient = ctx.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2
      );
      gradient.addColorStop(0, 'rgba(255, 255, 248, 1)'); // white-hot center
      gradient.addColorStop(0.1, 'rgba(255, 252, 235, 1)'); // bright core
      gradient.addColorStop(0.18, 'rgba(255, 240, 180, 0.95)'); // disc edge
      gradient.addColorStop(0.3, 'rgba(255, 214, 120, 0.5)'); // inner glow
      gradient.addColorStop(0.55, 'rgba(255, 196, 100, 0.16)'); // halo falloff
      gradient.addColorStop(1, 'rgba(255, 185, 90, 0)'); // fades into sky

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    const sunTexture = createSunTexture();
    const sunMaterial = new THREE.MeshBasicMaterial({
      map: sunTexture,
      transparent: true,
      depthWrite: false,
      fog: false, // the sun reads as infinitely far, beyond the haze
    });
    const sunMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4200, 4200),
      sunMaterial
    );
    sunMesh.position.copy(sunDir).multiplyScalar(SUN_VISUAL_DISTANCE);
    scene.add(sunMesh);

    // --- moon: pale shaded disc with craters, melting into a soft halo ---
    function createMoonTexture(): THREE.CanvasTexture {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas not supported');

      const r = size / 2;

      // outer glow halo + limb softening, drawn behind the solid disc
      const halo = ctx.createRadialGradient(r, r, 0, r, r, r);
      halo.addColorStop(0, 'rgba(255, 254, 244, 0.98)');
      halo.addColorStop(0.3, 'rgba(248, 243, 224, 0.95)');
      halo.addColorStop(0.42, 'rgba(232, 226, 203, 0.82)'); // disc edge
      halo.addColorStop(0.5, 'rgba(214, 216, 205, 0.35)'); // limb
      halo.addColorStop(0.6, 'rgba(190, 200, 210, 0.12)'); // inner halo
      halo.addColorStop(1, 'rgba(170, 190, 210, 0)'); // fades to sky
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);

      // disc interior: offset highlight (lit from the upper left)
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r * 0.42, 0, Math.PI * 2);
      ctx.clip();
      const body = ctx.createRadialGradient(
        r * 0.78,
        r * 0.72,
        r * 0.05,
        r,
        r,
        r * 0.48
      );
      body.addColorStop(0, 'rgba(255, 254, 246, 0.95)');
      body.addColorStop(0.6, 'rgba(242, 237, 216, 0.92)');
      body.addColorStop(1, 'rgba(203, 197, 174, 0.9)');
      ctx.fillStyle = body;
      ctx.fillRect(0, 0, size, size);

      // craters: fixed layout so the moon always looks the same
      const craters: Array<[number, number, number]> = [
        [0.4, 0.36, 0.1],
        [0.62, 0.5, 0.14],
        [0.45, 0.66, 0.09],
        [0.68, 0.7, 0.07],
        [0.3, 0.56, 0.06],
        [0.58, 0.28, 0.05],
        [0.74, 0.42, 0.075],
        [0.38, 0.48, 0.045],
        [0.52, 0.58, 0.035],
      ];
      for (const [cx, cy, cr] of craters) {
        const px = r + (cx - 0.5) * r * 0.72;
        const py = r + (cy - 0.5) * r * 0.72;
        const pr = cr * r;
        const craterGrad = ctx.createRadialGradient(
          px - pr * 0.25,
          py - pr * 0.25,
          pr * 0.1,
          px,
          py,
          pr
        );
        craterGrad.addColorStop(0, 'rgba(168, 162, 138, 0.55)');
        craterGrad.addColorStop(0.7, 'rgba(178, 172, 148, 0.4)');
        craterGrad.addColorStop(1, 'rgba(200, 195, 170, 0)');
        ctx.fillStyle = craterGrad;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    const moonTexture = createMoonTexture();
    const moonMaterial = new THREE.MeshBasicMaterial({
      map: moonTexture,
      transparent: true,
      depthWrite: false,
      fog: false, // the moon reads as infinitely far, beyond the haze
    });
    const moonMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, 2600),
      moonMaterial
    );
    moonMesh.position.copy(moonDir).multiplyScalar(SUN_VISUAL_DISTANCE);
    scene.add(moonMesh);

    // --- stars: a dim field + sparse bright stars on a camera-following
    //     sphere; additive round sprites that fade in with the night ---
    function createStarSprite(): THREE.CanvasTexture {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas not supported');

      const gradient = ctx.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.85)');
      gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.22)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    const starSprite = createStarSprite();

    /** Uniform random directions on the sphere (y > -0.2), radius STAR_RADIUS. */
    function makeStarPositions(count: number): Float32Array {
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        let x = 0;
        let y = 0;
        let z = 0;
        do {
          x = Math.random() * 2 - 1;
          y = Math.random() * 2 - 1;
          z = Math.random() * 2 - 1;
        } while (x * x + y * y + z * z > 1 || y < -0.2);
        const len = Math.sqrt(x * x + y * y + z * z) || 1;
        arr[i * 3] = (x / len) * STAR_RADIUS;
        arr[i * 3 + 1] = (y / len) * STAR_RADIUS;
        arr[i * 3 + 2] = (z / len) * STAR_RADIUS;
      }
      return arr;
    }

    /** Slightly varied star tints (warm/cool whites) with random brightness. */
    function makeStarColors(count: number): Float32Array {
      const tints = [
        [1, 1, 1],
        [1, 0.94, 0.82],
        [0.82, 0.89, 1],
        [1, 0.85, 0.68],
      ];
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const tint = tints[(Math.random() * tints.length) | 0];
        const b = 0.4 + Math.random() * 0.6;
        arr[i * 3] = tint[0] * b;
        arr[i * 3 + 1] = tint[1] * b;
        arr[i * 3 + 2] = tint[2] * b;
      }
      return arr;
    }

    function createStars(count: number, pointSize: number): THREE.Points {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(makeStarPositions(count), 3)
      );
      geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(makeStarColors(count), 3)
      );
      const material = new THREE.PointsMaterial({
        map: starSprite,
        size: pointSize,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        fog: false, // stars sit beyond the haze; don't wash them out
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false; // the sphere follows the camera; never cull
      points.renderOrder = 1; // drawn before the cloud layers composite over
      scene.add(points);
      return points;
    }

    const starsField = createStars(STAR_COUNT, 52);
    const starsBright = createStars(STAR_BRIGHT_COUNT, 120);
    starsField.add(starsBright); // share position + slow rotation

    // ================= procedural clouds (slow drift + morph) ============
    // Two world-anchored FBM layers — a low foggy cumulus deck and a high
    // cirrus veil — that drift very slowly and continuously change shape;
    // tinted by the day/night cycle and blended into the sky at the horizon.
    // Mobile LOW tier drops FBM octaves (5/4 -> 3/3): a huge fill-rate save
    // over the huge sky area, with only a subtle softening of the shapes.
    const clouds: SkyCloudsHandle = createSkyClouds(scene, {
      lowQuality: LOW_SPEC,
    });
    (window as unknown as { __clouds?: object }).__clouds = {
      layers: 2,
      setCoverage: (v: number) => clouds.setCoverage(v),
      stats: () => clouds.stats(),
    };

    // Whole-terrain rain: one uniform GPU-animated field whose 12,800-unit
    // seed box wraps around the player (so rain follows you across the
    // endless world at constant density), plus a LIGHT 440-streak bump that
    // follows the player out to a 350-unit radius so the rain around the
    // camera feels slightly fuller. page.tsx schedules exactly one shower
    // per in-game day (see rainIntensityFromHour) and updateSky dims the
    // sun/fog/sky while it pours. The shower is GREEN-LAND ONLY: the
    // winter/ice biome factors damp it to zero across the snow border, so
    // water rain never falls inside the frozen countries (they have their
    // own weather — snowfall + glacier sleet). Mobile LOW tier thins the
    // far field (170k -> 56k streaks): the shower reads identically but
    // sheds far fewer vertices + MBs of buffers.
    const rain: RainHandle = createRain(
      scene,
      LOW_SPEC ? { farDrops: 56000 } : undefined
    );
    let rainIntensity = 0; // 0..1, daily storm DAMPED to zero over snow/ice
    (window as unknown as { __rain?: object }).__rain = {
      intensity: () => rainIntensity,
      window: RAIN_WINDOW,
      counts: rain.counts,
      audioMuted: rain.audioMuted,
      audioGain: rain.audioGain,
    };

    // Winter-biome glacier sleet: pale ice streaks pour from the cloud deck
    // only over the blue glacier HEARTS (iceFactor) with their own icy audio
    // bed, fading in/out across the ice rim — independent of the once-per-day
    // water storm.
    const iceRain: IceRainHandle = createIceRain(
      scene,
      LOW_SPEC ? { farDrops: 27000 } : undefined
    );
    let iceIntensity = 0; // 0..1, the player's glacier-heart factor
    (window as unknown as { __iceRain?: object }).__iceRain = {
      intensity: () => iceIntensity,
      counts: iceRain.counts,
      audioMuted: iceRain.audioMuted,
      audioGain: iceRain.audioGain,
    };

    // Winter-biome SNOWFALL: across the snow countries the sky sheds soft
    // white FLAKES that drift down ~10x slower than any rain and sway on
    // the wind — nothing like the water storm's fast streaks or the glacier
    // hearts' harsh sleet. Fades in/out across the biome's soft border.
    // Desktop: 300k crystals; mobile LOW tier thins to 100k. flakes are
    // born at the mid of the cloud band and land ON the terrain (the real
    // surface height feeds the snow system's ground heightmap).
    const snowRain: SnowRainHandle = createSnowRain(scene, {
      farFlakes: LOW_SPEC ? 100000 : undefined,
      heightAt: surfaceYAt,
    });
    let winterIntensity = 0; // 0..1, the player's winter-biome factor
    (window as unknown as { __snowRain?: object }).__snowRain = {
      intensity: () => winterIntensity,
      counts: snowRain.counts,
      audioMuted: snowRain.audioMuted,
      audioGain: snowRain.audioGain,
    };
    // debug/exploration handle (same family as __terrain/__rain/__atmos):
    // live biome factor + a safe snap-teleport used to visit the zones
    (window as unknown as { __winter?: object }).__winter = {
      factor: () => winterIntensity,
      zones: WINTER_ZONES,
      debugTeleport(x: number, z: number) {
        pos.set(x, surfaceYAt(x, z), z);
        vy = 0;
        airborne = false;
        terrain.ensureAround(x, z, 2, true); // ground under the boots, now
      },
    };

    // DESERT-biome exploration handle — the exact __winter mirror for the
    // dune countries: live sand factor + snap-teleport so the hot zones
    // are as easy to visit as the frozen ones
    let desertIntensity = 0; // 0..1, the player's desert-biome factor
    (window as unknown as { __desert?: object }).__desert = {
      factor: () => desertIntensity,
      zones: DESERT_ZONES,
      debugTeleport(x: number, z: number) {
        pos.set(x, surfaceYAt(x, z), z);
        vy = 0;
        airborne = false;
        terrain.ensureAround(x, z, 2, true); // ground under the boots, now
      },
    };

    // RED DESERT / BADLANDS / VOLCANO — the three extra climate factors,
    // mirroring desertIntensity; each drives its own sky tint + dry
    // weather gate, and the volcano also drives the ember swarm
    let redIntensity = 0; // 0..1, the player's red-desert factor
    let mesaIntensity = 0; // 0..1, the player's badlands factor
    let volcanoIntensity = 0; // 0..1, the player's volcano factor
    // CHERRY GROVE / MUSHROOM FIELDS — the temperate wild
    // factors: each drives its own sky tint + zone sign; they damp the
    // frozen-weather FX (snowfall/ice/footprints) inside their borders
    let cherryIntensity = 0; // 0..1, the player's cherry-grove factor
    let shroomIntensity = 0; // 0..1, the player's mushroom-field factor
    let crimsonIntensity = 0; // 0..1, the player's crimson-field factor
    let goldenIntensity = 0; // 0..1, the player's golden-field factor

    // BIOME ATMOSPHERE EASE: the raw factors above ramp across only ~9
    // ground blocks (each biome module's soft BORDER), so sprinting over a
    // border used to re-tint the whole vault in under a second. These
    // display factors exponentially ease toward the raw values instead —
    // a frame-rate-independent glide (63% of the remaining shift per
    // BIOME_ATMOS_TAU seconds, ~95% settled after ~3 tau) — so crossing a
    // border now SLOWLY crossfades the sky gradient, the fog colour +
    // density and the cloud-deck tint from one biome's look to the next.
    // Weather gates, footstep crossfades and the zone-sign detector keep
    // reading the RAW factors: precipitation must still match the ground
    // under the boots exactly, and the signs still fire on settling.
    const BIOME_ATMOS_TAU = 3.5; // seconds — the glide's time constant
    let easeWinter = 0; // eased winter factor for the vault look
    let easeDesert = 0; // eased desert factor
    let easeRed = 0; // eased red-desert factor
    let easeMesa = 0; // eased badlands factor
    let easeVolcano = 0; // eased volcano factor
    let easeCherry = 0; // eased cherry-grove factor
    let easeShroom = 0; // eased mushroom-field factor
    let easeCrimson = 0; // eased crimson-field factor
    let easeGolden = 0; // eased golden-field factor

    // 3D SKY ZONE SIGN: when the player settles into a new biome, its
    // name rises into the sky as giant 3D block letters (the voxel-font
    // sign — see src/game/skyText.ts). A short stability window stops
    // the wobbled biome borders from double-triggering while straddling.
    const skyText: SkyTextHandle = createSkyText(scene);
    const ZONE_SIGNS: Record<string, { label: string; color: number }> = {
      volcano: { label: 'VOLCANO', color: 0xff6a2a },
      badlands: { label: 'BADLANDS', color: 0xd89058 },
      reddesert: { label: 'RED DESERT', color: 0xe07840 },
      desert: { label: 'DESERT ZONE', color: 0xe8c26a },
      winter: { label: 'WINTER ZONE', color: 0xcfe6ff },
      shroom: { label: 'MUSHROOM FIELDS', color: 0xc9aef0 },
      cherry: { label: 'CHERRY GROVE', color: 0xff9ecb },
      crimson: { label: 'CRIMSON FIELDS', color: 0xe05a52 },
      golden: { label: 'GOLDEN FIELDS', color: 0xf0cc4e },
      grass: { label: 'GRASSLANDS', color: 0x9fe06a },
    };
    let currentZoneId = ''; // empty -> GRASSLANDS signs itself on deploy
    let pendingZoneId = '';
    let zoneStableT = 0;
    // effect-scope mirrors of the frame loop's hot-gated winter factors
    // (the voice context reads these — the loop-locals are block-scoped)
    let winterFxVal = 0;
    let iceFxVal = 0;

    // VOLCANO EMBERS: the ash country's own weather — glowing sparks
    // rising off the ground, fading with the volcano factor
    const embers: EmbersHandle = createEmbers(scene, LOW_SPEC ? 90 : 240);
    (window as unknown as { __embers?: object }).__embers = {
      intensity: () => volcanoIntensity,
    };

    // VOLCANO ASH PLUME: the stratovolcanoes smoke — a dense ash column
    // with molten sparks anchored over the nearest crater, fading in as
    // the player closes in (see src/game/volcanoPlume.ts)
    const plume: VolcanoPlumeHandle = createVolcanoPlume(scene, {
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      heightAt: surfaceYAt,
      lowSpec: LOW_SPEC,
    });
    // live crater-glow weight (0 far, 1 on the rim) — drives the warm
    // ember cast updateSky breathes into the vault near a live volcano
    let volcanoGlow = 0;

    // zone exploration handle: live factors for the three extra biomes,
    // the current sky-sign zone, a manual announce (verification), and
    // volcano helpers (teleport to each stratovolcano's vantage point,
    // the crater rim or the caldera floor + live nearest-volcano readout)
    (window as unknown as { __zones?: object }).__zones = {
      red: () => redIntensity,
      mesa: () => mesaIntensity,
      volcano: () => volcanoIntensity,
      cherry: () => cherryIntensity,
      shroom: () => shroomIntensity,
      crimson: () => crimsonIntensity,
      golden: () => goldenIntensity,
      current: () => currentZoneId,
      announce: (id: string) => {
        const sign = ZONE_SIGNS[id];
        if (sign) skyText.show(sign.label, sign.color);
      },
      volcanoNear: () =>
        nearestVolcanoWorld(pos.x, pos.z, BLOCK, GRID_OFFSET),
      plume: () => plume.debug(),
      volcanoes: () =>
        [0, 1, 2, 3].map((i) => handVolcanoInfo(i, BLOCK, GRID_OFFSET)),
      tpVolcano: (i: number, where?: 'view' | 'rim' | 'pool') => {
        const info = handVolcanoInfo(i, BLOCK, GRID_OFFSET);
        let tx = info.viewX;
        let tz = info.viewZ;
        if (where === 'rim') {
          // standing on the crater rim, spawn-facing side
          const off = (info.craterRBlocks + 2.5) * BLOCK;
          tx = info.x - Math.sign(info.x) * off;
          tz = info.z - Math.sign(info.z) * off;
        } else if (where === 'pool') {
          // hovering over the caldera lava lake
          tx = info.x;
          tz = info.z;
        }
        pos.set(tx, surfaceYAt(tx, tz) + 40, tz);
        vy = 0;
        airborne = false;
        terrain.ensureAround(tx, tz, 3, true);
      },
    };

    // atmosphere-ease exploration handle (__biomeease): the SMOOTHED factors the vault
    // actually renders (they glide toward the raw world factors — see
    // BIOME_ATMOS_TAU) so slow biome-border crossfades are verifiable;
    // the raw factors stay on __desert/__winter/__zones
    (window as unknown as { __biomeease?: object }).__biomeease = {
      winter: () => easeWinter,
      desert: () => easeDesert,
      red: () => easeRed,
      mesa: () => easeMesa,
      volcano: () => easeVolcano,
      cherry: () => easeCherry,
      shroom: () => easeShroom,
      crimson: () => easeCrimson,
      golden: () => easeGolden,
    };

    // SNOW FOOTPRINTS: wherever the player actually WALKS across the snow
    // countries, each boot press stamps the user-provided CHROMAKEY sole
    // EMBLEM (public/textures/footprint-sole-chromakey-2.png — the
    // hexagonal circuit-board shield with an eye) in its own colours, the
    // SAME artwork day and night. Rotated to the walking direction, one
    // per footstep-sound beat, and each one still slowly fades away over
    // ~40s: walk on and the snow cleans itself up behind you.
    const footprints: FootprintHandle = createFootprintSystem(scene, {
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      heightAt: surfaceYAt,
      lowSpec: LOW_SPEC,
    });
    (window as unknown as { __footprints?: object }).__footprints = {
      stats: footprints.stats,
      clear: footprints.clear,
      fastForward: footprints.debugFastForward,
    };

    // Puddles left on the terrain after each shower: as the player explores
    // the endless world, regions are scanned for flat plateau cells and
    // seeded with lobed, feather-edged water puddles that fill while it
    // rains (rippling, sky-mirroring) and dry out slowly afterwards.
    const water: GroundWaterHandle = createGroundWater(scene, {
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      heightAt: terrain.blockHeight,
      // the city road plateau keeps its surface bone dry
      blocked: cityColumnBlocked,
    });
    (window as unknown as { __water?: object }).__water = {
      stats: water.stats,
      wet: () => water.wet(),
      splash: () => water.splash(),
      nearest: (x: number, z: number) => water.nearest(x, z),
      mesh: () => water.object,
      forceWet: (v: number) => water.forceWet(v),
    };

    // ========== atmosphere drama VFX (storm + night + dawn) ============
    // Lightning during heavy rain, shooting stars at night and
    // footstep/landing dust — one pooled module (see
    // src/game/atmosphereVfx.ts) driven by the same day/night + rain
    // state the sky renderer just consumed.
    /** Wired up when the creeper pack mounts below: a bolt that just
     *  hit the ground charges any creeper near the impact point into
     *  the lightning elite (blue aura, double blast, shock slow). */
    let creeperChargeHook: ((gx: number, gz: number) => void) | null = null;
    const atmos: AtmosphereVfxHandle = createAtmosphereVfx(scene, {
      lowSpec: LOW_SPEC,
      heightAt: surfaceYAt,
      onThunder: (delay) => {
        void getGameAudio().then((sfx) => sfx.thunder(delay));
      },
      onStrike: (gx, gz) => creeperChargeHook?.(gx, gz),
    });
    (window as unknown as { __atmos?: object }).__atmos = {
      stats: atmos.stats,
      strike: () => atmos.debugStrike(),
      strikeAt: (x: number, z: number) => atmos.strikeAt(x, z),
      meteor: () => atmos.debugMeteor(),
      sheet: () => atmos.debugSheet(),
    };

    // ========= drivable map vehicle: armored jeep (photo replica) =========
    // Hand-built replica of the reference jeep photos, parked on the oasis
    // spawn brim just ahead-left of the player. Walk up and press E to take
    // the wheel: W/S throttle, A/D steer, Space handbrake, E again to step
    // out. The exhaust smokes more the faster you go.
    const jeep = createJeepProp(scene, {
      lowSpec: LOW_SPEC,
      heightAt: (x: number, z: number) => surfaceYAt(x, z),
    });
    // park on the spawn plains ahead-left of the player (same offset the
    // oasis-brim parking used) — all four wheels rest on level terrain
    const jeepFlat = findFlatSpot(
      spawnFlat.x + SPAWN_JEEP_OFFSET.x,
      spawnFlat.z + SPAWN_JEEP_OFFSET.z,
      140,
      8,
      2000
    );
    // sit exactly on the surface under the center — wheels may tuck slightly
    // into a slope but the jeep never floats
    const jeepY = surfaceYAt(jeepFlat.x, jeepFlat.z);
    jeep.place(jeepFlat.x, jeepFlat.z, jeepY, -0.55);
    (window as unknown as { __jeep?: object }).__jeep = {
      pos: () => jeep.group.position.clone(),
      stats: jeep.stats,
      collide: jeep.collide,
      enter: enterJeep,
      exit: exitJeep,
      suspension: jeep.suspension,
      vfx: jeep.vfxStats,
      state: () => ({
        driving,
        nearRide,
        speed: Math.round(driveSpeed),
        drifting: driveDrift,
      }),
    };

    // ========= second drivable: the uploaded NASCAR stock car =========
    // The player's GLB upload ("Nascar Hyperest [Black]", Hyperest
    // Studios, CC-BY-4.0) rebuilt into ~12 draw calls by its loader and
    // driven through the SAME arcade controller as the jeep — the page
    // just picks the rig with `vehicle`. Drift spec: brake + steer at
    // speed swings the rear ~3x the front's turn rate, eased in/out.
    const nascar = createNascarCar(scene, {
      lowSpec: LOW_SPEC,
      heightAt: (x: number, z: number) => surfaceYAt(x, z),
      getRenderer: () => renderer ?? null,
    });
    // parked ahead-RIGHT of the spawn (the jeep sits ahead-left) so both
    // rides greet the player at the start
    const nascarFlat = findFlatSpot(
      spawnFlat.x + 180,
      spawnFlat.z + 440,
      140,
      8,
      2000
    );
    nascar.place(
      nascarFlat.x,
      nascarFlat.z,
      surfaceYAt(nascarFlat.x, nascarFlat.z),
      0.55
    );
    (window as unknown as { __nascar?: object }).__nascar = {
      pos: () => nascar.group.position.clone(),
      stats: nascar.stats,
      collide: nascar.collide,
      ready: nascar.ready,
      enter: () => enterCar('nascar'),
      /** Teleport the parked car (ground Y auto-probed). */
      place: (x: number, z: number, rotY = 0) => {
        nascar.place(x, z, surfaceYAt(x, z), rotY);
        return nascar.group.position.clone();
      },
      /** Drive the rig directly (test rig): one physics step. */
      drive: (dt: number, input: { throttle: number; steer: number; brake: boolean }) =>
        nascar.updateDrive(dt, input),
      /** Test rig: feed solid boxes into the drive step's bump resolver. */
      setObstacles: (
        list: { x: number; z: number; rotY: number; hw: number; hl: number }[]
      ) => nascar.setObstacles(list),
      /** Live pose + motion telemetry for drift verification. */
      tel: () => ({
        x: Math.round(nascar.group.position.x),
        z: Math.round(nascar.group.position.z),
        yaw: +nascar.group.rotation.y.toFixed(3),
      }),
      state: () => ({
        driving,
        nearRide,
        speed: Math.round(driveSpeed),
        drifting: driveDrift,
      }),
    };

    // ========= the Hot Wheels fleet: four more rides, same controls ======
    // The uploaded Acceleracers GLBs build through the SAME factory and
    // drive through the SAME arcade controller as the NASCAR (identical
    // drift physics, chase camera, gauges, smoke + skids). The generic
    // builder inside nascarCar.ts auto-orients/scales each model and
    // geometrically detects its four wheels.
    type RideKey =
      | 'jeep'
      | 'nascar'
      | 'roadrunner'
      | 'rivited'
      | 'rd09'
      | 'ratified';
    const hotWheels: { key: RideKey; label: string; car: NascarCarHandle }[] = (
      [
        {
          key: 'roadrunner',
          label: 'ROADRUNNER',
          url: '/models/hw-roadrunner.glb',
        },
        { key: 'rivited', label: 'RIVITED', url: '/models/hw-rivited.glb' },
        { key: 'rd09', label: 'RD-09', url: '/models/hw-rd09.glb' },
        {
          key: 'ratified',
          label: 'RAT-IFIED',
          url: '/models/hw-ratified.glb',
        },
      ] as const
    ).map((def, i) => {
      const car = createNascarCar(scene, {
        lowSpec: LOW_SPEC,
        heightAt: (x: number, z: number) => surfaceYAt(x, z),
        getRenderer: () => renderer ?? null,
        modelUrl: def.url,
      });
      // a showroom row continuing the NASCAR's line, a car-length apart
      const flat = findFlatSpot(
        spawnFlat.x + 840 + i * 560,
        spawnFlat.z + 440,
        140,
        8,
        2000
      );
      car.place(flat.x, flat.z, surfaceYAt(flat.x, flat.z), 0.55);
      return { key: def.key, label: def.label, car };
    });
    (window as unknown as { __hw?: object }).__hw = {
      list: () =>
        hotWheels.map((h) => ({
          key: h.key,
          ready: h.car.ready(),
          pos: {
            x: Math.round(h.car.group.position.x),
            z: Math.round(h.car.group.position.z),
          },
          stats: h.car.stats(),
        })),
      enter: (key: string) => enterCar(key as RideKey),
      state: () => ({
        vehicle,
        driving,
        nearRide,
        speed: Math.round(driveSpeed),
        drifting: driveDrift,
      }),
    };

    // ========= THE CITY ROAD MAP (the cloned reference) ==========
    // A 1536x1024-block plateau of dead-flat grassland (terrainChunks
    // blends it into the height field) carrying ONE giant baked base
    // quad plus the whole road map built from REAL 3D CUBES — asphalt
    // road decks, raised cobble footpaths, grass roundabout islands,
    // runway. Static: a
    // handful of draw calls, zero updates.
    const city: CityRoadmapHandle = createCityRoadmap(scene, {
      block: BLOCK,
      lowSpec: LOW_SPEC,
      plateauTopY: terrain.cityTopY(),
    });
    // GPS route guide (world arrows on the road decks + destination
    // beacon) — the minimap overlay plans routes into it, this feeds it
    // the walkable surface Y and owns the scene attach + per-frame pump
    cityRouteGuideInit(surfaceYAt);
    scene.add(cityRouteGuideGroup());

    (window as unknown as { __city?: object }).__city = {
      stats: city.stats,
      layout: city.layout,
      routeGuide: cityRouteGuideStats,
      roadClassAt: city.roadClassAt,
      /** Debug probe: walkable deck Y (terrain + quad + road lift). */
      groundAt: (x: number, z: number) => surfaceYAt(x, z),
      /** Aerial photo rig: hovers the player high above the city centre
       *  (re-anchored against the ground ease) and parks the orbit
       *  camera near-vertical at a huge distance — the whole road map
       *  fills one frame, north-up (yaw PI, runway at the top like the
       *  reference). Call .stop() on the returned handle afterwards. */
      aerial: (lift = 32000, dist = 64000) => {
        const lay = city.layout();
        const iv = setInterval(() => {
          pos.set(lay.x, lay.topY + lift, lay.z);
          vy = 0;
          airborne = true;
          terrain.ensureAround(lay.x, lay.z, 3, true);
        }, 120);
        yaw = Math.PI;
        camYawOffset = 0;
        camIgnoreClearance = true;
        camPitch = 1.55;
        camDist = dist;
        camDistTarget = dist;
        return { stop: () => clearInterval(iv), lay };
      },
    };

    // ========= pet drone: "BUZZ" the AUTONOMOUS AI quadcopter =========
    // Hand-built micro-detail drone (carbon/panel/hazard procedural
    // textures) that lives with the player: damped-spring formation
    // flight, velocity banking, spinning props with blur discs, aviation
    // nav/strobe lights and headlights that come on at night.
    //
    // It is also an AUTONOMOUS AI GUNSHIP (droneAi.ts — no chat, no
    // operator): BUZZ scans the threat view on its own, engages whatever
    // it finds (attack orbit, chin-gun bursts, cadence-gated HOMING
    // rockets — no lock ritual), breaks off after each kill and always
    // returns to formation on its own. With the world currently
    // hostile-free the brain rests in PATROL: pure formation flight.
    // Manual orders (G / touch STRAFE streams at the facing point, H /
    // touch MISSILE drops a rocket) still work as a direct override — the
    // AI simply stands down its trigger while you hold one. BUZZ's ammo
    // is flown by the pooled bullet system below — this box is filled in
    // right after `bullets` is created.
    const droneOrdnance: PetDroneOrdnance = {
      fireBullet: () => undefined,
      fireRocket: () => undefined,
    };
    /** Where BUZZ aims: the ground point ~430 units ahead of the facing
     *  (player yaw on foot, jeep heading while driving) — manual orders. */
    const droneAim = new THREE.Vector3();
    /** Where BUZZ's nose slews while parked on an AI target (the
     *  designated threat's chest — fed to petDrone as `combatTarget`). */
    const droneCombatAim = new THREE.Vector3();
    let lastKillAt = -10; // BUZZ holds fire briefly after each kill
    let lastDroneHud = ''; // cached chip text (skip identical DOM writes)
    /** BUZZ hull integrity 0..100 — enemy rounds chew it, formation time
     *  repairs it; below 30 the AI brain flies home on its own. */
    let buzzHull = 100;
    /** Touch STRAFE hold state (the keyboard uses the `keys` set). */
    let droneGunHeld = false;
    /** The autonomous combat brain — decides, the drone executes. */
    const droneAi = createDroneAi();
    const petDrone = createPetDrone(scene, {
      lowSpec: LOW_SPEC,
      heightAt: surfaceYAt,
      ordnance: droneOrdnance,
    });
    // BUZZ boots with you on the grassland spawn plains: the quad hovers
    // right above the home patch so the formation spring settles instantly
    // instead of swooping in from far away.
    petDrone.group.position.set(
      spawnFlat.x - 140,
      spawnFlat.y + 300,
      spawnFlat.z + 200
    );
    (window as unknown as { __petDrone?: object }).__petDrone = {
      pos: () => petDrone.group.position.clone(),
      stats: petDrone.stats,
      group: petDrone.group,
      fireGun: () => petDrone.fireGun(droneAim),
      missile: () => petDrone.launchMissile(droneAim),
      missiles: () => petDrone.missilesLoaded(),
      ai: () => droneAi.snapshot(),
      // full live API — lets automated verification freeze/inspect the
      // drone deterministically (e.g. swap update for a still close-up)
      raw: petDrone,
    };

    // ========= PET DEPLOY TOGGLES (PET panel) + DART & SPARK pets =========
    // Which pets ride with the player is a live switch set (Record<
    // PetToggleId, boolean>) owned by the React PET panel: BUZZ spawns
    // with the world, DART + SPARK are created LAZILY on their first
    // toggle-on (SPARK streams its GLB, DART builds its airframe) and
    // just show/hide afterwards. The registry mirrors the panel, the
    // apiRef.setPetDeployed bridge applies flips mid-game.
    const deployed: Record<PetToggleId, boolean> = {
      ...petDeployedRef.current,
    };
    let dartPet: PlaneDrone | null = null;
    let robotPet: RobotPet | null = null;
    let robotLoading = false;
    let spotPet: SpotPet | null = null;
    let spotLoading = false;
    let spiderPet: SpiderPet | null = null;
    let spiderLoading = false;
    /** Spawn gap: SPARK materialises this far behind the player so it
     *  never pops in overlapping the camera/character. */
    const FOLLOW_SPAWN_OFFSET = 90;
    /** DART cruises around this scratch centre: the player's ground point
     *  (terrain height + offset keeps the circle reference above hills). */
    const dartCruise = new THREE.Vector3();

    /** Build DART on first deploy — one airframe, later toggles hide it. */
    function ensureDart(): void {
      if (dartPet) return;
      dartPet = createPlaneDrone(scene, {
        lowSpec: LOW_SPEC,
        orbitRadius: 380, // wide, sky-like loiter circle around the player
        hoverHeight: 130, // cruise altitude above the follow centre
      });
      dartPet.group.visible = deployed.dart;
    }

    /** Stream SPARK's GLB on first deploy — async, the toggle flips the
     *  group visible the instant the rig lands. */
    function ensureRobot(): void {
      if (robotPet || robotLoading) return;
      robotLoading = true;
      void createRobotPet(scene, {
        lowSpec: LOW_SPEC,
        heightAt: surfaceYAt,
      })
        .then((pet) => {
          robotPet = pet;
          robotLoading = false;
          pet.group.visible = deployed.robot;
          if (deployed.robot) {
            // drop into slot right beside the player, feet on the ground
            pet.group.position.set(
              pos.x,
              surfaceYAt(pos.x, pos.z),
              pos.z + FOLLOW_SPAWN_OFFSET
            );
          }
          (window as unknown as { __robotPet?: object }).__robotPet = {
            pos: () => pet.group.position.clone(),
            stats: pet.stats,
            group: pet.group,
            state: () => pet.debug(),
            raw: pet,
          };
        })
        .catch(() => {
          robotLoading = false; // model offline — vanilla world simply stays
        });
    }

    /** Build SPOT on first deploy — pure primitives, so the build lands
     *  in a microtask (no streaming); later toggles just hide/show it. */
    function ensureSpot(): void {
      if (spotPet || spotLoading) return;
      spotLoading = true;
      void createSpotPet(scene, {
        lowSpec: LOW_SPEC,
        heightAt: surfaceYAt,
      })
        .then((pet) => {
          spotPet = pet;
          spotLoading = false;
          pet.group.visible = deployed.spot;
          if (deployed.spot) {
            // drop into slot right beside the player, feet on the ground
            pet.group.position.set(
              pos.x,
              surfaceYAt(pos.x, pos.z),
              pos.z + FOLLOW_SPAWN_OFFSET
            );
          }
          (window as unknown as { __spotPet?: object }).__spotPet = {
            pos: () => pet.group.position.clone(),
            stats: pet.stats,
            state: () => pet.debug(),
            raw: pet,
          };
        })
        .catch(() => {
          spotLoading = false; // rig failed — vanilla world simply stays
        });
    }

    /** Build WIDOW on first deploy — pure primitives + streamed texture
     *  albedos, so the rig lands in a microtask and the PBR skin swaps
     *  in the moment the images arrive; later toggles just hide/show it. */
    function ensureSpider(): void {
      if (spiderPet || spiderLoading) return;
      spiderLoading = true;
      void createSpiderPet(scene, {
        lowSpec: LOW_SPEC,
        heightAt: surfaceYAt,
      })
        .then((pet) => {
          spiderPet = pet;
          spiderLoading = false;
          pet.group.visible = deployed.spider;
          if (deployed.spider) {
            // drop into slot right beside the player, feet on the ground
            pet.group.position.set(
              pos.x,
              surfaceYAt(pos.x, pos.z),
              pos.z + FOLLOW_SPAWN_OFFSET
            );
          }
          (window as unknown as { __spiderPet?: object }).__spiderPet = {
            pos: () => pet.group.position.clone(),
            stats: pet.stats,
            state: () => pet.debug(),
            raw: pet,
          };
        })
        .catch(() => {
          spiderLoading = false; // rig failed — vanilla world simply stays
        });
    }

    /** PET PANEL BRIDGE: spawn/despawn a pet in-world. */
    function setPetDeployed(pet: PetToggleId, on: boolean): void {
      deployed[pet] = on;
      if (pet === 'buzz') {
        petDrone.group.visible = on;
      } else if (pet === 'dart') {
        if (on) ensureDart();
        if (dartPet) dartPet.group.visible = on;
      } else if (pet === 'spot') {
        if (on) ensureSpot();
        if (spotPet) spotPet.group.visible = on;
      } else if (pet === 'spider') {
        if (on) ensureSpider();
        if (spiderPet) spiderPet.group.visible = on;
      } else {
        if (on) ensureRobot();
        if (robotPet) robotPet.group.visible = on;
      }
    }

    // ============================================================
    // WIDOW'S SILK (G key): realistic flexible web strands.
    // Verlet-rope physics in spiderWeb.ts — the strand flies out of
    // the spider's mouth toward the player's crosshair, sticks to the
    // terrain with real slack (sags + swings), reels back on a miss.
    // The anchor then BLOOMS into a classic orb web — 8 radial spokes
    // + 4 sagging spiral rings woven outward on the surface plane.
    // ============================================================
    const spiderWebs = createSpiderWeb({
      scene,
      maxActive: 3,
      onStick: () => void getGameAudio().then((sfx) => sfx.webStick()),
      onBloom: () => void getGameAudio().then((sfx) => sfx.webWeave()),
      hitTest: webHitTest,
    });
    const spiderMouth = new THREE.Vector3();
    const webAimDir = new THREE.Vector3();
    const webAimFrom = new THREE.Vector3();
    const webAimTo = new THREE.Vector3();
    const webShotDir = new THREE.Vector3();
    const webProbe = new THREE.Vector3();
    let lastWebShot = -9;

    /** March the segment from→to against the terrain heightfield:
     *  coarse 16-step scan, then 6 binary refinements. Returns the
     *  surface point (a hair above ground) or null when the segment
     *  never dips below the ground. */
    function webHitTest(
      from: THREE.Vector3,
      to: THREE.Vector3,
      outNormal?: THREE.Vector3
    ): THREE.Vector3 | null {
      const fromAbove = from.y >= surfaceYAt(from.x, from.z);
      let lo = 0;
      let hi = 1;
      if (fromAbove) {
        for (let i = 1; i <= 16; i++) {
          const t = i / 16;
          webProbe.lerpVectors(from, to, t);
          if (webProbe.y < surfaceYAt(webProbe.x, webProbe.z)) {
            hi = t;
            break;
          }
          lo = t;
        }
        if (hi === 1) return null; // never dipped below the ground
      }
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) / 2;
        webProbe.lerpVectors(from, to, mid);
        if (webProbe.y < surfaceYAt(webProbe.x, webProbe.z)) hi = mid;
        else lo = mid;
      }
      const hit = new THREE.Vector3().lerpVectors(from, to, lo);
      hit.y += 1.2; // sit on the surface, not inside it
      if (outNormal) {
        // surface normal from the heightfield gradient — the orb web
        // lies flat against whatever slope the strand slammed into
        const e = 4;
        const dhx =
          (surfaceYAt(hit.x + e, hit.z) - surfaceYAt(hit.x - e, hit.z)) /
          (2 * e);
        const dhz =
          (surfaceYAt(hit.x, hit.z + e) - surfaceYAt(hit.x, hit.z - e)) /
          (2 * e);
        outNormal.set(-dhx, 1, -dhz).normalize();
      }
      return hit;
    }

    /** G = WIDOW WEB SHOT: the deployed spider fires one silk strand
     *  at the point under the player's crosshair (camera ray marched
     *  against the terrain; sky aim = a long shot that reels back). */
    function fireSpiderWeb(): void {
      if (!spiderPet || !spiderPet.group.visible) return; // deploy WIDOW first
      if (deathTimer > 0) return;
      const now = performance.now() / 1000;
      if (now - lastWebShot < 0.3) return; // silk cadence
      lastWebShot = now;
      // mouth = front of the cephalothorax (forward is +Z at yaw 0)
      const g = spiderPet.group;
      const syaw = g.rotation.y;
      spiderMouth.set(
        g.position.x + Math.sin(syaw) * 46,
        g.position.y + 62,
        g.position.z + Math.cos(syaw) * 46
      );
      // aim point: march the camera ray for a surface hit
      camera.getWorldDirection(webAimDir);
      webAimFrom.copy(camera.position).addScaledVector(webAimDir, 10);
      webAimTo.copy(camera.position).addScaledVector(webAimDir, 620);
      const aimHit = webHitTest(webAimFrom, webAimTo);
      if (aimHit) {
        webAimTo.copy(aimHit);
      } // else: sky shot — webAimTo stays the far ray point
      webShotDir.subVectors(webAimTo, spiderMouth).normalize();
      spiderWebs.shoot(spiderMouth, webShotDir);
      void getGameAudio().then((sfx) => sfx.webShot());
    }

    // debug/verification probe: fire on demand + live strand states
    (window as unknown as { __webs?: object }).__webs = {
      shoot: () => fireSpiderWeb(),
      state: () => spiderWebs.debug(),
      spider: () =>
        spiderPet
          ? {
              visible: spiderPet.group.visible,
              pos: spiderPet.group.position.clone(),
              yaw: spiderPet.group.rotation.y,
            }
          : null,
    };

    // boot state: toggles flipped in the lobby apply as the world mounts
    petDrone.group.visible = deployed.buzz;
    if (deployed.dart) ensureDart();
    if (deployed.robot) ensureRobot();
    if (deployed.spot) ensureSpot();
    if (deployed.spider) ensureSpider();

    // debug/verification probe for the flyable plane: state, telemetry,
    // and deterministic board/exit handles (board force-deploys DART so
    // automated checks don't need the PET panel round-trip)
    (window as unknown as { __plane?: object }).__plane = {
      pos: () => dartPet?.group.position.clone() ?? null,
      rot: () => {
        const r = dartPet?.group.rotation;
        return r ? { x: r.x, y: r.y, z: r.z } : null;
      },
      stats: () => dartPet?.stats ?? null,
      state: () => ({
        flying,
        deployed: deployed.dart,
        speed: planeTelemetry?.speed ?? 0,
        throttle: planeTelemetry?.throttle ?? 0,
        altitude: planeTelemetry?.altitude ?? 0,
        heading: planeTelemetry?.heading ?? 0,
      }),
      board: () => {
        if (!deployed.dart) setPetDeployed('dart', true);
        boardPlane();
        return flying;
      },
      exit: () => {
        exitPlane();
        return flying;
      },
      teleport: (x: number, z: number) => {
        // debug flight repositioning: drops the plane 260 above the spot
        if (!dartPet) return;
        dartPet.group.position.set(x, surfaceYAt(x, z) + 260, z);
      },
    };

    // --- double-jump air ring (jumpRing.ts) ---
    // The mid-air second jump detonates a flat expanding energy ring under
    // the player's feet — the "jump jet fires" read. Pool is tiny and the
    // update rides the existing frame loop next to the other VFX.
    const jumpRings = createJumpRings(scene, { lowSpec: LOW_SPEC });
    (window as unknown as { __jumpRings?: object }).__jumpRings = {
      burst: jumpRings.burst,
      stats: jumpRings.stats,
      probe: () => jumpRings.probe(),
    };

    // --- driving state (input handlers + frame loop read these) ---
    const JEEP_ENTER_RANGE = 150; // walk this close to grab the wheel
    let driving = false; // mounted and in control of a vehicle
    let nearRide: RideKey | null = null; // nearest enterable ride (E to enter)
    let vehicle: RideKey = 'jeep'; // which rig the driver sits in
    // every drivable CAR rig (the jeep keeps its own path below) + the ram
    // shove state that lets parked rides slide when RAMmed (momentum)
    const carRides: { key: RideKey; car: NascarCarHandle }[] = [
      { key: 'nascar', car: nascar },
      ...hotWheels,
    ];
    const rigOf = (k: RideKey): NascarCarHandle | typeof jeep =>
      k === 'jeep' ? jeep : carRides.find((r) => r.key === k)!.car;
    const slideVel = new Map<RideKey, { x: number; z: number }>();
    for (const r of carRides) slideVel.set(r.key, { x: 0, z: 0 });
    /** Momentum transfer: a solid RAM shoves the parked ride this way. */
    const shoveRide = (
      key: RideKey,
      dx: number,
      dz: number,
      vel: number
    ): void => {
      const s = slideVel.get(key);
      if (!s) return;
      s.x += dx * vel;
      s.z += dz * vel;
    };
    // scratch for the drive step's ride-vs-ride bump boxes (reused)
    const rideObs: {
      x: number;
      z: number;
      rotY: number;
      hw: number;
      hl: number;
      onPush?: (dirX: number, dirZ: number, vel: number) => void;
    }[] = [];
    let driveSpeed = 0; // last frame's signed jeep speed (HUD + debug)
    let driveDrift = false; // last frame's drift flag (debug surface)
    let driveHudMode: 'hidden' | 'drive' | 'enter' = 'hidden';
    const jeepInput = { throttle: 0, steer: 0, brake: false };
    // --- jeep dash telemetry: fuel burn + engine heat for the gauges ---
    const JEEP_TEMP_AMBIENT = 58; // °C cold-soaked engine
    const JEEP_TEMP_MAX = 118; // °C the engine climbs toward at full load
    const JEEP_OVERHEAT_START = 112; // °C where hood steam wisps begin
    const JEEP_FUEL_IDLE_BURN = 0.12; // %/s engine idling in gear
    const JEEP_FUEL_LOAD_BURN = 0.85; // %/s extra burn at full load
    const JEEP_FUEL_REFILL = 3.5; // %/s siphoned back while parked
    const JEEP_FUEL_LOW = 15; // % where the dash low-fuel band sits
    let jeepFuel = 100; // % tank (drains in gear, refills when parked)
    let jeepTemp = JEEP_TEMP_AMBIENT; // °C coolant (slow thermal inertia)
    let jeepFuelToasted = false; // fires the out-of-fuel toast once per tank
    let jeepBeeped = false; // fires the soft low-fuel beep once per dip
    // --- jeep horn (H while driving) + dash radio (R while driving) ---
    const JEEP_SCARE_RADIUS = 260; // horn scares spiders this far out
    const JEEP_SCARE_TIME = 3.2; // seconds they keep fleeing after it
    let jeepRadioOn = false; // dash radio toggle (mirrors the audio bus)
    let lastHornMs = -1e9; // horn debounce timestamp (performance.now)
    /** Flight HUD mode cache — skips identical DOM writes per frame. */
    let flightHudMode: 'hidden' | 'fly' | 'board' = 'hidden';

    // --- flight state (DART the flyable strike plane) ---
    // Boarding follows the jeep's pattern: one flag moves the rig from the
    // walking character into DART's cockpit, WASD flies instead of walking
    // (W/S climb+dive, A/D banked turn), Shift boosts, Space bleeds speed,
    // and the same orbit camera parks behind the airframe. Press B on foot
    // (while DART is deployed) to board; E or B hops out mid-air.
    const PLANE_CAM_DIST = 470; // chase camera sits farther back in the sky
    const PLANE_CAM_PITCH = 0.16; // near-level chase frames the horizon
    let flying = false; // mounted in DART's cockpit and at the stick
    const planeInput = { pitch: 0, steer: 0, boost: false, brake: false };
    /** Last `updatePilot` readout — feeds the flight HUD + debug probes. */
    let planeTelemetry: PlanePilotTelemetry | null = null;
    /** Resolved game-audio handle for the PER-FRAME engine-throttle update
     *  (one-shot cues can afford a promise chain; a frame tick cannot). */
    let planeSfx: GameAudioHandle | null = null;

    /** Hop in: hide the character, snap the chase camera, cough a start puff. */
    function enterJeep(): void {
      if (
        driving ||
        phaseRef.current !== 'playing' ||
        deathTimer > 0 ||
        !loaded
      ) {
        return;
      }
      driving = true;
      attackHeld = false;
      setRunSound(false);
      setSnowWalkSound(false);
      character.root.visible = false;
      camYawOffset = 0;
      camPitch = CAM_DEFAULT_PITCH;
      camDistTarget = JEEP_CAM_DIST;
      pos.set(
        jeep.group.position.x,
        jeep.group.position.y + 24,
        jeep.group.position.z
      );
      yaw = jeep.group.rotation.y;
      void getGameAudio().then((sfx) => sfx.ignition());
    }

    /** Hop into one of the cars (same rig swap as the jeep). */
    function enterCar(key: RideKey): void {
      if (
        driving ||
        phaseRef.current !== 'playing' ||
        deathTimer > 0 ||
        !loaded
      ) {
        return;
      }
      if (key === 'jeep') {
        enterJeep();
        return;
      }
      const car = rigOf(key) as NascarCarHandle;
      driving = true;
      vehicle = key;
      attackHeld = false;
      setRunSound(false);
      setSnowWalkSound(false);
      character.root.visible = false;
      camYawOffset = 0;
      camPitch = CAM_DEFAULT_PITCH;
      camDistTarget = NASCAR_CAM_DIST; // long body — chase sits farther back
      pos.set(
        car.group.position.x,
        car.group.position.y + 24,
        car.group.position.z
      );
      yaw = car.group.rotation.y;
      car.smokeBurst(LOW_SPEC ? 3 : 5); // engine cough on ignition
      void getGameAudio().then((sfx) => sfx.ignition());
    }

    /** Step out on the driver's side and put the character back. */
    function exitJeep(): void {
      if (!driving) return;
      driving = false;
      driveDrift = false; // stale drift flag must not echo into re-entries
      setScreechSound(false); // sliding stopped the moment you stepped out
      // the dash radio dies with the engine — same bus, no orphaned music
      if (jeepRadioOn) {
        jeepRadioOn = false;
        void getGameAudio().then((sfx) => sfx.setRadio(false));
        jeepGaugesRef.current?.setRadio(false);
      }
      const h = rigOf(vehicle).group.rotation.y;
      const cos = Math.cos(h);
      const sin = Math.sin(h);
      const lx = -140; // driver side (local -X), just outside the body
      const lz = -30;
      // step out beside whichever rig the driver is in
      const outRig = rigOf(vehicle);
      const outX = outRig.group.position.x + lx * cos + lz * sin;
      const outZ = outRig.group.position.z - lx * sin + lz * cos;
      pos.x = outX;
      pos.z = outZ;
      // probe the deck directly (no tunnel layer anymore)
      pos.y = surfaceYAt(pos.x, pos.z);
      yaw = h;
      vy = 0;
      airborne = false;
      character.root.visible = true;
      camYawOffset = 0;
      camDistTarget = CAM_DIST;
      // if the step-down landed inside the footprint, get pushed clear
      const push = outRig.collide(pos.x, pos.z, 22);
      if (push) {
        pos.x = push.x;
        pos.z = push.z;
      }
    }

    /** Take DART's stick: hide the character, hand the cruise brain to the
     *  pilot flight model and let the chase camera swoop up to the plane.
     *  Requires DART to be deployed from the PET panel (the airframe must
     *  exist and be flying with you). */
    function boardPlane(): void {
      if (
        flying ||
        driving ||
        phaseRef.current !== 'playing' ||
        deathTimer > 0 ||
        !loaded ||
        !deployed.dart ||
        !dartPet
      ) {
        return;
      }
      flying = true;
      attackHeld = false;
      setRunSound(false);
      setSnowWalkSound(false);
      character.root.visible = false;
      camYawOffset = 0;
      camPitch = PLANE_CAM_PITCH;
      camDistTarget = PLANE_CAM_DIST;
      planeInput.pitch = 0;
      planeInput.steer = 0;
      planeInput.boost = false;
      planeInput.brake = false;
      // seamless handover: the flight model continues from the exact
      // attitude the cruise brain left the plane in
      dartPet.beginPilot();
      // park the player rig on the plane — the camera then lerps up to it
      // (the boarding swoop) at the flight follow rate
      pos.set(
        dartPet.group.position.x,
        dartPet.group.position.y + 26,
        dartPet.group.position.z
      );
      yaw = dartPet.group.rotation.y;
      airborne = false;
      vy = 0;
    }

    /** Hop out mid-air: an arcade parachute drop — you settle on the ground
     *  beside the plane's landing point (never fall damage), DART glides
     *  back onto its cruise circle from wherever the flight ended. */
    function exitPlane(): void {
      if (!flying || !dartPet) return;
      flying = false;
      planeInput.pitch = 0;
      planeInput.steer = 0;
      planeInput.boost = false;
      planeInput.brake = false;
      planeSfx?.setPlaneEngine(false, 0);
      const h = dartPet.group.rotation.y;
      const cos = Math.cos(h);
      const sin = Math.sin(h);
      const lx = 150; // touch down on the plane's LEFT (local +X), clear of it
      pos.x = dartPet.group.position.x + cos * lx;
      pos.z = dartPet.group.position.z - sin * lx;
      terrain.ensureAround(pos.x, pos.z, 1, true); // mesh the landing spot
      pos.y = surfaceYAt(pos.x, pos.z);
      vy = 0;
      airborne = false;
      jumpsUsed = 0;
      yaw = h;
      character.root.visible = true;
      camYawOffset = 0;
      camPitch = CAM_DEFAULT_PITCH;
      camDistTarget = CAM_DIST;
      atmos.landing(pos.x, pos.y, pos.z, 300); // parachute-landing dust
      // hand the plane back to its brain — the cruise pursuit eases in
      // from the exact live position/attitude (no snap, no re-sync needed)
      dartPet.resumeCruise();
    }

    // ============== loot chests (region-seeded, click-to-open) =========
    // Rare wooden/gold crates scattered across the endless terrain by the
    // same deterministic region trick as the puddles: aim at one and click
    // / tap it — the handle flips open first, then the lid swings back —
    // and it bursts coins (rare chests also drop gems) that are banked
    // into the HUD balance. The chest then stays OPEN where it stands —
    // a permanent landmark with its heaped treasure on display — and
    // stays a solid obstacle. Opened chests stay looted for the whole
    // session.
    const chests: LootChestsHandle = createLootChests(scene, {
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      heightAt: terrain.blockHeight,
      seedZ: terrainSeed,
      lowSpec: LOW_SPEC,
      // keep loot off the oasis AND off the city road map: no chests,
      // summoning circles or coin bursts on the paved plateau
      blockedAt: (gx: number, gz: number) =>
        oasisChestBlock(gx, gz) || cityColumnBlocked(gx, gz),
      onLoot: (loot) => {
        setCoins((value) => value + loot.coins);
        if (loot.gems > 0) setGems((value) => value + loot.gems);
        hudBridgeRef.current.lootToast?.(
          loot.gems > 0
            ? `+${loot.coins} coins · +${loot.gems} ${loot.gems === 1 ? 'gem' : 'gems'}`
            : `+${loot.coins} coins`
        );
        void getGameAudio().then((sfx) => sfx.pickup());
      },
    });
    // camera-through-cursor ray used for chest hover + click/tap opening
    const chestRaycaster = new THREE.Raycaster();
    const chestPointer = new THREE.Vector2();
    mapBridgeRef.current.heightAt = terrain.blockHeight;
    mapBridgeRef.current.getMarkers = chests.mapMarkers;
    // minimap footpath editor -> live 3D deck rebuild (touched tiles only)
    mapBridgeRef.current.rebuildCityDeck = (wx0, wz0, wx1, wz1) => {
      city.rebuildDeckRegion(wx0, wz0, wx1, wz1);
    };
    // ========= CITY FOOTPATH PERMANENT SAVE: boot restore =========
    // The SAVE button commits the painted stroke list to the server —
    // BOTH the SQLite snapshot AND a baked copy in the game source tree
    // (src/game/cityFootpathSavedData.json, part of the game's own
    // files). When THIS browser has never painted (empty local store)
    // but a save exists, adopt it: the saved road map materialises in
    // the 3D deck, the physics raster, the router and both maps. A
    // browser with strokes of its own keeps them (local work wins until
    // its player presses SAVE); the Minimap paints the adopted slice
    // onto the map cache via repaintFootpathRegion.
    void (async () => {
      const srv = await fetchServerFootpathEdits();
      if (srv.strokes.length === 0) return;
      // local strokes (this browser's working copy, possibly unsaved)
      // always win — only a genuinely fresh store adopts the snapshot
      if (listFootpathEdits().length > 0) return;
      const rect = adoptServerFootpathEdits(srv.strokes);
      if (!rect) return;
      cityRouteRefreshRegion(rect.wx0, rect.wz0, rect.wx1, rect.wz1);
      city.rebuildDeckRegion(rect.wx0, rect.wz0, rect.wx1, rect.wz1);
      mapBridgeRef.current.repaintFootpathRegion?.(rect);
    })();
    (window as unknown as { __chests?: object }).__chests = {
      stats: chests.stats,
      list: chests.mapMarkers,
      nearest: (x: number, z: number) => chests.nearest(x, z),
    };

    // debug/verification teleport (window.__cheats.tp): moves the player to
    // a world position, meshes the ground under their feet, snaps camera
    // window.__cheats.yaw(v): sets the player/camera facing (radians) so
    // automated browser verification can frame shots deterministically
    // window.__cheats.pitch(v): orbit pitch (rad; -0.85 low looking up,
    // +1.25 near top-down) · window.__cheats.dist(v): orbit distance
    // window.__cheats.heightAt(x, z): terrain surface height (world Y) —
    // read-only probe for verifying biome landform profiles
    // window.__cheats.pos(): read-only player feet position (verification)
    // window.__cheats.drop(x, y, z): stage an airborne fall from (x, y, z)
    // so the landing path (terrain + palm base block support) resolves
    // live — the rig for proving the player can stand ON the palm blocks
    (window as unknown as {
      __cheats?: {
        tp(x: number, z: number): void;
        yaw(v: number): void;
        pitch(v: number): void;
        dist(v: number): void;
        heightAt(x: number, z: number): number;
        jeepAt(x: number, z: number): void;
        fuel(v: number): void;
        temp(v: number): void;
        horn(): void;
        radio(on: boolean): void;
        pos(): { x: number; y: number; z: number };
        drop(x: number, y: number, z: number): void;
      };
    }).__cheats = {
      tp: (x: number, z: number) => {
        pos.set(x, surfaceYAt(x, z), z);
        vy = 0;
        airborne = false;
        terrain.ensureAround(x, z, 1, true);
        updateCamera(true, 0);
      },
      yaw: (v: number) => {
        yaw = v;
        camYawOffset = 0; // frame the facing exactly (no orbit residue)
        updateCamera(true, 0);
      },
      pitch: (v: number) => {
        camPitch = Math.min(CAM_MAX_PITCH, Math.max(CAM_MIN_PITCH, v));
        updateCamera(true, 0);
      },
      dist: (v: number) => {
        camDistTarget = Math.min(CAM_MAX_DIST, Math.max(CAM_MIN_DIST, v));
        updateCamera(false, 0);
      },
      heightAt: (x: number, z: number) => surfaceYAt(x, z),
      // read-only feet position — landing/support verification rigs read it
      pos: () => ({ x: pos.x, y: pos.y, z: pos.z }),
      // stage a fall: place the feet at (x, y, z) already airborne so the
      // next frames run the real gravity + landing path (terrain floor OR
      // palm base block support — whichever is higher under the feet)
      drop: (x: number, y: number, z: number) => {
        pos.set(x, y, z);
        vy = 0;
        airborne = true;
        terrain.ensureAround(x, z, 1, true);
      },
      // stage the jeep anywhere (drift/steam/biome-gate rehearsals)
      jeepAt: (x: number, z: number) => {
        jeep.place(x, z, surfaceYAt(x, z), jeep.group.rotation.y);
      },
      // dash-tank overrides: force fuel/engine-temp states to rehearse the
      // low-fuel flash/beep and the overheat steam without a long drive
      fuel: (v: number) => {
        jeepFuel = THREE.MathUtils.clamp(v, 0, 100);
        jeepFuelToasted = jeepFuel <= 0;
        if (jeepFuel > JEEP_FUEL_LOW + 3) jeepBeeped = false;
      },
      temp: (v: number) => {
        jeepTemp = THREE.MathUtils.clamp(
          v,
          JEEP_TEMP_AMBIENT,
          JEEP_TEMP_MAX
        );
      },
      // the horn itself (same path as the H key minus the debounce)
      horn: () => {
        void getGameAudio().then((sfx) => sfx.horn());
        cherrySpiders?.scare(
          jeep.group.position,
          JEEP_SCARE_RADIUS,
          JEEP_SCARE_TIME
        );
      },
      radio: (on: boolean) => {
        jeepRadioOn = on;
        void getGameAudio().then((sfx) => sfx.setRadio(on));
        jeepGaugesRef.current?.setRadio(on);
      },
    };

    // ========== the world is hostile-free ==========
    // The enemy squad (and its lock-on mechanism) was removed by request:
    // BUZZ is a pure companion drone again — it follows the player through
    // the Tasks 11-13 formation flight, streams its chin gun with G /
    // touch STRAFE and drops rockets with H / touch MISSILE on demand.
    // The autonomous brain stays wired but scans an empty threat view, so
    // it rests in PATROL until targets are ever re-introduced.

    // ============== CRIMSON FIELDS wildlife: the Bup mob ==================
    // Streamed once at mount (35KB GLB); the herd only ever materialises
    // where crimsonFactorWorld says the ground is red. Bullets/rockets
    // find them through airHitTest below (declared `let` so the async
    // rig drops into place the moment the model lands).
    let crimsonMobs: CrimsonMobs | null = null;
    void createCrimsonMobs(scene, {
      lowSpec: LOW_SPEC,
      heightAt: surfaceYAt,
      block: BLOCK,
      gridOffset: GRID_OFFSET,
    })
      .then((mobs) => {
        crimsonMobs = mobs;
        (window as unknown as { __mobs?: object }).__mobs = {
          raw: mobs,
          list: () => mobs.list(),
          stats: mobs.stats,
          spawnAt: (x: number, z: number) => mobs.spawnAt(x, z),
        };
      })
      .catch(() => {
        // model offline — the red fields simply stay empty
      });

    // ============== CHERRY GROVE wildlife: the End Spider ==================
    // Streamed once at mount (79KB GLB); the pack only ever materialises
    // where cherryFactorWorld says the ground is pink. An advanced hunter:
    // vision cone + close-radius senses, chase, circle-strafe, lunge bite
    // (damage through damagePlayer below), wound-aggro, easter-egg idle
    // flavour. Bullets/rockets find them through airHitTest below.
    let cherrySpiders: CherrySpiders | null = null;
    void createCherrySpiders(scene, {
      lowSpec: LOW_SPEC,
      heightAt: surfaceYAt,
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      damagePlayer: (amount) => applyDamage(amount),
      snarePlayer: (duration) => snarePlayer(duration),
    })
      .then((spiders) => {
        cherrySpiders = spiders;
        (window as unknown as { __spiders?: object }).__spiders = {
          raw: spiders,
          list: () => spiders.list(),
          stats: spiders.stats,
          spawnAt: (x: number, z: number) => spiders.spawnAt(x, z),
        };
      })
      .catch(() => {
        // model offline — the groves simply stay empty
      });

    // ============= GRASSLAND NIGHTS: the Mossy Creeper pack =================
    // Minecraft-style creepers with a clean mossy-camo skin, glowing
    // eyes/mouth. Spawn ONLY in open grassland (every special biome
    // factor low, city excluded) and ONLY at night; at sunrise they
    // burn away. Advanced brains: Weeping-Angel stalk (freeze when
    // watched, sprint unseen), pack flanking, camouflaged ambush +
    // ballistic pounce, leap attacks, the classic fuse (hiss + swell
    // + white flash) that defuses if you escape, and chain-reaction
    // explosions with distance-falloff damage + radial knockback.
    // CHARGED: heavy storms earth REAL bolts onto the pack (the mob
    // asks the sky, the atmosphere module delivers) and a struck
    // creeper becomes the lightning elite — blue aura, faster fuse,
    // DOUBLE blast radius, harder knockback + a leg-shock slow.
    // Solid bodies, bullet/rocket targets, terrain-riding, fruit/palm
    // obstacles respected. Tooling: window.__creepers.
    let creepers: Creepers | null = null;
    creepers = createCreeperMobs(scene, {
      lowSpec: LOW_SPEC,
      heightAt: surfaceYAt,
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      damagePlayer: (amount) => applyDamage(amount),
      launchPlayer: (dirX, dirZ, vyBoost, force) => {
        // explosion knockback: horizontal shove + vertical launch
        // (skipped while driving/flying — the vehicle takes the hit)
        if (driving || flying || deathTimer > 0) return;
        kbX += dirX * force;
        kbZ += dirZ * force;
        if (!airborne) {
          airborne = true;
          vy = Math.max(vy, vyBoost);
        } else {
          vy = Math.max(vy, vyBoost * 0.7);
        }
      },
      slowPlayer: (duration) => {
        // charged-blast leg shock: a movement slow + a one-shot toast
        // (no spam — re-fires only after the previous shock wore off)
        if (shockSlowT <= 0) {
          hudBridgeRef.current.lootToast?.(
            'Charged blast! Your legs buzz and drag…'
          );
        }
        shockSlowT = Math.max(shockSlowT, duration);
      },
      onBoom: (_x, _y, _z, strength) => {
        camShake = Math.min(1.3, camShake + strength);
        void getGameAudio().then((sfx) => sfx.creeperBoom());
      },
      onHiss: () => {
        void getGameAudio().then((sfx) => sfx.creeperHiss());
      },
      obstacleAt: (x, z, radius, y) => {
        // creepers respect the same solid props the player does
        let r = fruitSolid.collide(x, z, radius, y);
        const p2 = palms.collide(r ? r.x : x, r ? r.z : z, radius, y);
        if (p2) r = p2;
        return r;
      },
    });
    // lightning strikes charge the nearest creeper to the impact point
    creeperChargeHook = (gx, gz) => {
      void creepers?.chargeNear(gx, gz, 460);
    };
    (window as unknown as { __creepers?: object }).__creepers = {
      raw: creepers,
      list: () => creepers?.list() ?? [],
      stats: () => creepers?.stats,
      spawnAt: (x: number, z: number) => creepers?.spawnAt(x, z) ?? false,
      // verification: charge(id) zaps a specific mob, charge() zaps the
      // first alive one; the NATURAL path is storm -> takeStrikeRequest
      // -> atmos.strikeAt -> onStrike -> chargeNear
      charge: (id?: number) => {
        if (!creepers) return false;
        if (id != null) {
          const m = creepers.list().find((c) => c.id === id);
          return m ? creepers.chargeNear(m.x, m.z, 1) : false;
        }
        const alive = creepers.list();
        if (alive.length === 0) return false;
        return creepers.chargeNear(alive[0].x, alive[0].z, 1e9);
      },
    };

    // ============ GRASSLAND NIGHTS: the Bone Archer pack ====================
    // Minecraft-style skeletons — skull/ribcage/stick-limb bone voxels
    // with a real bow (visible draw + pullable string) and a genuine
    // ranged-combat brain: LOS-checked vision (terrain-sampled ray), the
    // classic KEEP-DISTANCE kite (retreat below ENGAGE_MIN, advance above
    // PREFERRED_HI, hold the killing pocket), combat STRAFE with jitter
    // flips, a DRAW->LOOSE bow cycle (movement slows while aiming) that
    // fires REAL BALLISTIC ARROWS with velocity lead + spread, a
    // two-arrow flurry at knife range, PANIC rapid-fire when cornered,
    // and golden-angle pack spread. Arrows arc under gravity, stick in
    // the dirt, and land through damagePlayer + launchPlayer. Night +
    // grassland spawns; sunrise burns them away. Tooling: __skeletons.
    let skeletons: Skeletons | null = null;
    skeletons = createSkeletonMobs(scene, {
      lowSpec: LOW_SPEC,
      heightAt: surfaceYAt,
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      damagePlayer: (amount) => applyDamage(amount),
      launchPlayer: (dirX, dirZ, vyBoost, force) => {
        // arrow knockback: skipped while driving/flying like the blasts
        if (driving || flying || deathTimer > 0) return;
        kbX += dirX * force;
        kbZ += dirZ * force;
        if (!airborne) {
          airborne = true;
          vy = Math.max(vy, vyBoost);
        }
      },
      onShoot: () => {
        // the synthesized "thwip" doubles perfectly as a bow release
        void getGameAudio().then((sfx) => sfx.webShot());
      },
      onArrowHit: () => {
        // soft thud for arrow impacts (player hits + dirt buries)
        void getGameAudio().then((sfx) => sfx.webStick());
      },
      obstacleAt: (x, z, radius, y) => {
        // skeletons respect the same solid props the player does
        let r = fruitSolid.collide(x, z, radius, y);
        const p2 = palms.collide(r ? r.x : x, r ? r.z : z, radius, y);
        if (p2) r = p2;
        return r;
      },
    });
    (window as unknown as { __skeletons?: object }).__skeletons = {
      raw: skeletons,
      list: () => skeletons?.list() ?? [],
      stats: () => skeletons?.stats,
      spawnAt: (x: number, z: number) => skeletons?.spawnAt(x, z) ?? false,
    };

    // ============ ISLAND WILDLIFE: the dodo flock ============================
    // A reference-matched voxel dodo bird (huge hooked beak, cream chest,
    // folded wings, pale tail fan, three-toed ochre feet) that spawns in
    // DAY and NIGHT alike on flat open ground away from the city. Kept
    // deliberately minimal: idle/wander/peck/flee brains, a waddle gait,
    // full terrain + prop + player collision, and bullet/rocket hits via
    // hitTest/damage/blast. Tooling: __dodos.
    let dodos: Dodos | null = null;
    dodos = createDodos(scene, {
      lowSpec: LOW_SPEC,
      heightAt: surfaceYAt,
      block: BLOCK,
      gridOffset: GRID_OFFSET,
      obstacleAt: (x, z, radius, y) => {
        // dodos respect the same solid props the player does
        let r = fruitSolid.collide(x, z, radius, y);
        const p2 = palms.collide(r ? r.x : x, r ? r.z : z, radius, y);
        if (p2) r = p2;
        return r;
      },
    });
    (window as unknown as { __dodos?: object }).__dodos = {
      raw: dodos,
      list: () => dodos?.list() ?? [],
      stats: () => dodos?.stats,
      spawnAt: (x: number, z: number) => dodos?.spawnAt(x, z) ?? false,
    };

    // ============== bullets + gun VFX (fired from the weapon muzzle) =======
    // Pooled FMJ rounds with a copper/brass jacket texture, tracer streaks,
    // muzzle flash quads, spark bursts and smoke puffs. Phones run smaller
    // pools + fewer particles (LOW_SPEC). `__bullets` is a tooling surface:
    // fire() spawns a shot from the current muzzle, setSlowmo() slows the
    // round for screenshots, stats() reports pool activity.
    const bullets = createBulletSystem(scene, {
      lowSpec: LOW_SPEC,
      // the pool's waterline is solid ground for ordnance: bullets and
      // rockets die ON the surface and splash instead of vanishing
      // somewhere inside the flooded bowl
      heightAt: (x, z) => {
        const w = oasisWater.probe(x, z);
        if (!w) return surfaceYAt(x, z);
        return Math.max(w.surfaceY, surfaceYAt(x, z));
      },
      // every terrain hit routes through here — pool hits throw a real
      // splash + ripple ring (see bulletSystem's onImpact).
      onImpact: (p) => {
        const w = oasisWater.probe(p.x, p.z);
        if (w && p.y <= w.surfaceY + 40) {
          oasisWater.splash(p.x, w.surfaceY, p.z, 0.3);
        }
      },
      onBoom: () => {
        // rocket detonation — the synthesized rumble doubles as the boom
        void getGameAudio().then((sfx) => sfx.thunder(0.02));
      },
      // AIR COMBAT: rounds + rockets chew into flying combatants —
      // BUZZ's own airframe and the player's body. Damage routing happens
      // per combatant kind. HANGING COCONUTS are solid too: a round that
      // clips a nut's sphere knocks it out of the tree (kind 'coconut',
      // routed in onAirHit below). Ground critters (the crimson Bups) are
      // tested first — they stand between the muzzle and the sky combatants.
      airHitTest: (p) => {
        const mob = crimsonMobs?.hitTest(p);
        if (mob) {
          return { kind: 'crimsonbup', id: mob.id };
        }
        const spider = cherrySpiders?.hitTest(p);
        if (spider) {
          return { kind: 'cherryspider', id: spider.id };
        }
        const creeper = creepers?.hitTest(p);
        if (creeper) {
          return { kind: 'creeper', id: creeper.id };
        }
        const dodo = dodos?.hitTest(p);
        if (dodo) {
          return { kind: 'dodo', id: dodo.id };
        }
        const nutId = coconutShells.hitTest(p);
        if (nutId >= 0) {
          return { kind: 'coconut', id: nutId };
        }
        // FALLEN nuts are solid too — a round that clips a free body
        // (falling / rolling / resting / floating) kicks it away
        const bodyIdx = coconutShells.bodyHitTest(p);
        if (bodyIdx >= 0) {
          return { kind: 'coconutBody', id: bodyIdx };
        }
        if (petDrone.group.position.distanceToSquared(p) < 55 * 55) {
          return { kind: 'pet', id: 0 };
        }
        const dx = p.x - pos.x;
        const dz = p.z - pos.z;
        if (
          dx * dx + dz * dz < 30 * 30 &&
          p.y > pos.y - 12 &&
          p.y < pos.y + CHAR_HEIGHT + 12
        ) {
          return { kind: 'player', id: 0 };
        }
        return null;
      },
      onAirHit: (info, p, _kind, dmg = 1) => {
        if (info.kind === 'crimsonbup') {
          // wildlife: bullets bite for 20 per DAMAGE point — the default
          // pistol needs three hits, machineguns a short burst (150 HP)
          crimsonMobs?.damage(info.id, Math.round(20 * Math.max(1, dmg)), p);
        } else if (info.kind === 'cherryspider') {
          // grove stalker: 20 per DAMAGE point (140 HP = three pistol
          // hits) — and every wound aggros it straight back at you
          cherrySpiders?.damage(info.id, Math.round(20 * Math.max(1, dmg)), p);
        } else if (info.kind === 'creeper') {
          // mossy stalker: 20 per DAMAGE point (120 HP = six pistol hits)
          // — wounds snap it out of stealth straight onto your trail
          creepers?.damage(info.id, Math.round(20 * Math.max(1, dmg)), p);
        } else if (info.kind === 'dodo') {
          // island wildlife: 20 per DAMAGE point (90 HP) — wounds send
          // the bird into a panic waddle away from you
          dodos?.damage(info.id, Math.round(20 * Math.max(1, dmg)), p);
        } else if (info.kind === 'coconut') {
          // a round clipped a hanging coconut — punch it loose along the
          // shot's travel (approximated from the muzzle-to-nut ray); the
          // body then falls, bounces and rolls on its own physics
          const nut = palms.nuts().find((n) => n.id === info.id);
          if (nut) {
            const dx = nut.x - pos.x;
            const dy = nut.y - (pos.y + CHAR_HEIGHT * 0.8);
            const dz = nut.z - pos.z;
            const len = Math.hypot(dx, dy, dz) || 1;
            coconutShells.knock(info.id, dx / len, dy / len, dz / len);
          }
        } else if (info.kind === 'coconutBody') {
          // a round clipped a fallen coconut — kick the solid body away
          // from the muzzle; it skips off rolling on its own physics
          coconutShells.nudge(info.id, pos.x, pos.y + CHAR_HEIGHT * 0.8, pos.z);
        } else if (info.kind === 'pet') {
          buzzHull = Math.max(0, buzzHull - Math.round(4 * dmg));
        } else if (info.kind !== 'enemy') {
          // stray rounds sting — scaled by the DAMAGE stat they carry
          applyDamage(Math.round(7 * Math.max(1, dmg)));
        }
      },
      // BUZZ's hull takes blast damage when a rocket air-bursts next to him;
      // explosions also splash the crimson Bups standing nearby
      onAirBlast: (p) => {
        const d = petDrone.group.position.distanceTo(p);
        if (d < 260) buzzHull = Math.max(0, buzzHull - 55 * (1 - d / 260));
        crimsonMobs?.blast(p, 300, 65);
        cherrySpiders?.blast(p, 300, 65);
        creepers?.blast(p, 300, 65);
        dodos?.blast(p, 300, 65);
      },
    });
    (window as unknown as { __bullets?: object }).__bullets = {
      fire: () => spawnShot(),
      rocket: () => spawnRocket(),
      boom: () => bullets.detonate(),
      stats: bullets.stats,
      setSlowmo: bullets.setSlowmo,
    };
    // BUZZ's gun/missiles fly through the SAME pooled system as the
    // player's rounds (tracers, rocket trail, detonation, boom audio)
    droneOrdnance.fireBullet = (origin, dir) => bullets.fireFrom(origin, dir);
    droneOrdnance.fireRocket = (origin, dir) => bullets.fireRocket(origin, dir);
    droneOrdnance.fireHomingRocket = (origin, dir, tracker) =>
      bullets.fireHomingRocket(origin, dir, tracker);

    // ----- threat view: the world currently has no hostiles — the brain
    // scans, finds nothing, and rests in PATROL (formation flight). Feed
    // live targets in here to re-arm autonomous combat. ---
    const threats: DroneAiTargetView = {
      nearestAlive: () => null,
      isAlive: () => false,
      posOf: () => null,
    };
    /** Honest target count for the voice brain's telemetry (kept in sync
     *  by whatever feeds `threats`; zero while the world is hostile-free). */
    const threatStats = { alive: 0 };

    /**
     * Homing tracker onto one designated threat — samples the threat view
     * directly (works for ANY target source fed into `threats`; a null
     * position releases the guidance and the rocket flies straight).
     */
    const tmpTracker = new THREE.Vector3();
    function makeThreatTracker(id: number): PetRocketTracker {
      let last: { x: number; y: number; z: number } | null = null;
      let lastT = 0;
      const vel = new THREE.Vector3();
      const sample = new THREE.Vector3();
      return {
        getPos() {
          const p = threats.posOf(id);
          if (!p) return null;
          const nowS = performance.now() / 1000;
          sample.set(p.x, p.y, p.z);
          if (last) {
            const dts = Math.max(1e-3, nowS - lastT);
            vel.lerp(
              tmpTracker.set(
                (sample.x - last.x) / dts,
                (sample.y - last.y) / dts,
                (sample.z - last.z) / dts
              ),
              0.3
            );
          }
          last = { x: sample.x, y: sample.y, z: sample.z };
          lastT = nowS;
          return sample;
        },
        getVel: () => vel,
      };
    }

    // ================= MD2 character (ratamahatta + weapon) =================
    const character = new MD2Character();

    let loaded = false;
    let currentAnim = 'stand';
    let oneShot: string | null = null;
    /** True while KeyF (or the touch FIRE button) is held — keeps the attack
     *  clip looping. */
    let attackHeld = false;
    /** Mobile virtual joystick vector: x turns, y walks (analog -1..1). */
    const touchMoveVec = { x: 0, y: 0, active: false };
    /** Mobile RUN toggle — sprint speed while the joystick walks forward. */
    let sprintMode = false;
    /** Delay between the shot and its chained reload cue, derived from the
     *  REAL attack-clip duration once the MD2 model loads (0.8s clip -> 0.32s
     *  delay, so the reload clicks finish inside the shooting animation). */
    let reloadCueDelay = 0.32;
    /** How much of the monster-roar file one 5-press may play — the flip
     *  clip's real duration, measured at load (default 1.2s at 10 fps). */
    let flipCueDuration = 1.2;
    let airborne = false;
    let vy = 0;
    /** Explosion knockback (horizontal shove, world u/s) — integrated
     *  + exponentially decayed in the movement section each frame. */
    let kbX = 0;
    let kbZ = 0;
    /** Double-jump bookkeeping: jumps spent since last touching ground
     *  (0 grounded, 1 after the ground jump, 2 after the mid-air jump). */
    let jumpsUsed = 0;
    /** Vertical offset lifting the model so its feet rest exactly on the ground. */
    let footOffset = 0;
    /** Footstep cadence accumulator — running kicks up dust puffs (atmos). */
    let footAccum = 0;
    /** Alternating foot side for the dust trail: +1 right, -1 left — each
     *  step flips it so the puffs form a natural two-track footprint line. */
    let footSide = 1;
    /** OASIS SWIM STATE, refreshed every tick: swimming = deep pool water
     *  (the buoyancy model owns vertical motion), wading = shallow walk
     *  with wet-foot ripples. The speed calc reads it one tick behind —
     *  it runs before this tick's water probe. */
    let swimming = false;
    let wading = false;

    const pos = new THREE.Vector3(spawnFlat.x, spawnFlat.y, spawnFlat.z);
    // born on the east brim facing the pool (west): the first frame is the
    // postcard — water straight ahead, jeep parked ahead-left, BUZZ above
    let yaw = -Math.PI / 2;

    // INTERACTIVE FRUIT BRANCHES: the pumpkin + melon main vines bend
    // along when the player walks or runs against them (stem pinned,
    // tip swings most, springy return) and SNAP after sustained
    // over-stretching — a run through the vine snaps it (dust puff),
    // a walk only drags it. Far branches render as static instances
    // copied from the body layer's matrices; only the branch nearest
    // the player swaps to the CPU-deformable mesh.
    const fruitBranches: FruitBranchHandle = createFruitBranches(
      scene,
      [
        { layer: pumpkinPlant, ctx: pumpkinCtx },
        { layer: melonPlant, ctx: melonCtx },
      ],
      {
        heightAt: terrain.surfaceYAt,
        getPlayer: () => ({ x: pos.x, y: pos.y, z: pos.z }),
        onBreak: (bx: number, by: number, bz: number) =>
          atmos.landing(bx, by, bz, 340),
      }
    );
    (window as unknown as { __fruitBranches?: object }).__fruitBranches = {
      stats: fruitBranches.stats,
      probe: fruitBranches.probe,
    };

    // === MODS: Chronos (time & weather control, see MODS panel) — lives in
    // the game closure so the panel can retune it live through
    // apiRef.setModOptions. While disabled the world runs 100% vanilla. ===
    const modChronos = {
      enabled: false,
      speed: 1, // 0 = frozen clock, 1 = vanilla, 8/30 = accelerated
      weather: 'natural' as 'natural' | 'clear' | 'storm',
    };

    /** MODS panel → game: live mod retuning (see GameApi.setModOptions).
     *  An explicit hour jumps the clock instantly, /time set style. */
    function applyModOptions(options: ModOptionsPayload): void {
      if (typeof options.enabled === 'boolean') {
        modChronos.enabled = options.enabled;
      }
      if (
        typeof options.cycleSpeed === 'number' &&
        Number.isFinite(options.cycleSpeed)
      ) {
        modChronos.speed = Math.min(60, Math.max(0, options.cycleSpeed));
      }
      if (
        options.weather === 'natural' ||
        options.weather === 'clear' ||
        options.weather === 'storm'
      ) {
        modChronos.weather = options.weather;
      }
      if (typeof options.hour === 'number' && Number.isFinite(options.hour)) {
        timeHour = ((options.hour % 24) + 24) % 24;
      }
    }

    function playAnim(name: string, once: boolean, hold = false) {
      currentAnim = name;
      character.setAnimation(name);

      if (once) {
        oneShot = name;
        const meshes: Array<ActionMesh | null> = [
          character.meshBody as ActionMesh | null,
          character.meshWeapon as ActionMesh | null,
        ];
        for (const mesh of meshes) {
          const action = mesh?.activeAction;
          if (action) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = hold;
            // FIRE RATE stat tempo: attack clips run hot for fast guns,
            // heavy for slow ones; every other clip plays at 1x.
            action.setEffectiveTimeScale(
              name === 'attack' ? attackClipRate() : 1
            );
          }
        }
      }
    }

    function onAnimFinished() {
      oneShot = null;
      // Hold-to-fire: seamlessly restart the attack clip while F stays held.
      // Every attack animation carries the full fire cycle (shot + quick
      // reload inside its own duration), restarts included — and every
      // restart also launches a fresh bullet from the muzzle. The fire gate
      // (reload lock, dry mag, FIRE RATE cadence) throttles the cadence.
      if (
        attackHeld &&
        loaded &&
        !airborne &&
        deathTimer <= 0 &&
        gunReady()
      ) {
        consumeShot();
        playAnim('attack', true);
        soundRef.current?.shootThenReload(reloadCueDelay);
        spawnShot();
        robotPet?.playPunch(); // hold-to-fire = SPARK punch flurry
        spotPet?.playTrick(); // SPOT answers gunfire with an arm wave
        spiderPet?.playThreat(); // WIDOW rears into a threat display
      }
    }

    character.onLoadComplete = () => {
      (window as unknown as { __char?: MD2Character }).__char = character;
      const body = character.meshBody;
      if (body) {
        // Normalize the raw Quake-scale model to ~CHAR_HEIGHT world units.
        const bbox = new THREE.Box3().setFromBufferAttribute(
          body.geometry.attributes.position as THREE.BufferAttribute
        );
        const rawHeight = bbox.max.y - bbox.min.y;
        const s = CHAR_HEIGHT / rawHeight;

        body.scale.setScalar(s);
        for (const weapon of character.weapons) weapon.scale.setScalar(s);
        footOffset = -s * bbox.min.y;
        character.root.position.y = pos.y + footOffset;
        character.scale = s;
      }

      character.setAnimation('stand');
      applyWeapon(0);
      applySkin(0);
      character.mixer?.addEventListener('finished', onAnimFinished);

      // Measure the real attack clip so both gun cues (shot + reload) fit
      // inside ONE shooting animation: reload starts at 40% of the clip,
      // which leaves its ~0.41s of clicks to end right at the clip's end.
      const attackClip = (
        character.meshBody?.geometry as unknown as {
          animations?: THREE.AnimationClip[];
        }
      ).animations?.find((clip) => clip.name === 'attack');
      if (attackClip) {
        reloadCueDelay = Math.min(
          0.5,
          Math.max(0.2, attackClip.duration * 0.4)
        );
      }

      // Same measurement for the 5-key roar: the sound must start with the
      // flip animation and END with it, so it plays exactly clip-length.
      const flipClip = (
        character.meshBody?.geometry as unknown as {
          animations?: THREE.AnimationClip[];
        }
      ).animations?.find((clip) => clip.name === 'flip');
      if (flipClip) {
        flipCueDuration = flipClip.duration;
      }

      loaded = true;
    };

    character.loadParts({
      baseUrl: '/models/md2/ratamahatta/',
      body: 'ratamahatta.md2',
      skins: SKINS.map((skin) => skin.file),
      weapons: [
        ['weapon.md2', 'weapon.png'],
        ['w_shotgun.md2', 'w_shotgun.png'],
        ['w_chaingun.md2', 'w_chaingun.png'],
        ['w_railgun.md2', 'w_railgun.png'],
        ['w_bfg.md2', 'w_bfg.png'],
        ['w_blaster.md2', 'w_blaster.png'],
        ['w_glauncher.md2', 'w_glauncher.png'],
        ['w_hyperblaster.md2', 'w_hyperblaster.png'],
        ['w_machinegun.md2', 'w_machinegun.png'],
        ['w_rlauncher.md2', 'w_rlauncher.png'],
        ['w_sshotgun.md2', 'w_sshotgun.png'],
      ],
    });

    scene.add(character.root);

    // ================= vitals & loadout =================
    let skinIndex = 0;
    let weaponIndex = 0;
    /** Grows as AI-forged costumes are registered via addSkin. */
    let skinCount = SKINS.length;
    let health = MAX_HEALTH;
    let stamina = MAX_STAMINA; // unlimited sprint: pinned to max, debug only
    let lastDamageAt = -1e9;
    let elapsed = 0;
    let deathTimer = 0; // > 0 while the death sequence plays
    let publishedSkin = -1; // loadout mirror change detection
    let publishedWeapon = -1;
    const spawnPos = new THREE.Vector3(spawnFlat.x, spawnFlat.y, spawnFlat.z);

    function applySkin(index: number) {
      skinIndex = ((index % skinCount) + skinCount) % skinCount;
      character.setSkin(skinIndex);
    }

    /** Registers a runtime-forged AI costume texture. TextureLoader hands
     *  back the Texture immediately (pixels stream in async), so the rack
     *  index returned here is equip-ready the moment it is handed back. */
    function addSkin(url: string): number {
      const texture = new THREE.TextureLoader().load(url);
      texture.mapping = THREE.UVMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.name = url;
      character.skinsBody.push(texture);
      skinCount = character.skinsBody.length;
      return skinCount - 1;
    }

    /** AI-forged weapon variants: virtual rack entries (index >=
     *  WEAPONS.length) that reuse a base weapon mesh with a custom texture
     *  map. Order mirrors the client's forgedWeapons array exactly. */
    const weaponVariants: Array<{
      base: number;
      texture: THREE.Texture;
      /** Texture URL — the deterministic forge seed for the stat bonus. */
      seed: string;
      /** TRACER GLOW: forged skin's rack color as a material-ready hex int
       *  (falls back to the base weapon's signature color). */
      color: number;
    }> = [];

    /** Registers a runtime-forged AI weapon texture for a base rack weapon
     *  (0-3) and returns its virtual rack index. The base weapon's stock
     *  texture lives on in character.skinsWeapon, so equipping the stock
     *  entry later restores it (applyWeapon handles the swap-back). */
    function addWeaponVariant(
      baseIndex: number,
      url: string,
      color?: string
    ): number {
      const baseCount = WEAPONS.length - 1; // Unarmed has no mesh
      const base =
        ((baseIndex % baseCount) + baseCount) % baseCount;
      const texture = new THREE.TextureLoader().load(url);
      texture.mapping = THREE.UVMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.name = url;
      weaponVariants.push({
        base,
        texture,
        seed: url,
        color: forgeColorToHex(color, WEAPON_TRACER_COLORS[base]),
      });
      return WEAPONS.length + weaponVariants.length - 1;
    }

    /** Equips a loadout by rack index. Base entries map 1:1 onto the weapon
     *  meshes (trailing Unarmed → -1 = hide all); forged variant indices
     *  (>= WEAPONS.length) reuse their base mesh with the forged texture
     *  painted over it — switching back to any stock entry restores the
     *  stock map from character.skinsWeapon. weaponIndex stays a BASE index
     *  (muzzle/fire logic depends on it); weaponRackIndex is the published
     *  mirror that may point at a virtual variant row. */
    let weaponRackIndex = 0;
    /** TRACER GLOW: the active weapon's streak hue — set by applyWeapon
     *  (base weapon signature or AI-forged skin color), read by spawnShot
     *  and painted onto every round this weapon fires. */
    let tracerColor = WEAPON_TRACER_COLORS[0];
    /* ---- combat stats of the ACTIVE weapon (stat panel drives these) ----
     * Resolved on every applyWeapon; feeds the fire gate below, the attack
     * clip tempo, bullet range/spread and air-hit damage. Forged variants
     * carry their texture name as the deterministic forge seed. */
    let lastShotAt = -1e9;
    let shotsInMag = 0;
    let reloadingUntil = -1e9;
    /** How long the auto-reload locks the gun when a mag runs dry. */
    const RELOAD_LOCK = 1.0; // s
    let gunStats = resolveWeaponStats(WEAPONS[0].model);
    /** Mirrors the update loop's `moving` — CONTROL stat reads it. */
    let playerMoving = false;
    /** Attack-clip playback speed from the FIRE RATE stat: fast guns run
     *  the clip hot, heavy weapons churn slow. Every clip stays readable. */
    const attackClipRate = () =>
      Math.min(2.4, Math.max(0.55, gunStats.fireRate / 140));
    /** Fire gate: reload lock, mag dry (auto reload) and the FIRE RATE
     *  cadence all gate a shot here — actionFire and the hold-fire loop
     *  share it, so every input path obeys the same stats. */
    function gunReady(): boolean {
      if (reloadingUntil > elapsed) return false;
      if (gunStats.capacity > 0 && shotsInMag >= gunStats.capacity) {
        // mag dry — auto reload: lock the gun and click the reload cue
        reloadingUntil = elapsed + RELOAD_LOCK;
        shotsInMag = 0;
        soundRef.current?.reload();
        return false;
      }
      const minInterval =
        gunStats.fireRate > 0 ? 60 / gunStats.fireRate : 0;
      return elapsed - lastShotAt >= minInterval;
    }
    /** Books a fired round into the cadence + mag counters. */
    function consumeShot() {
      lastShotAt = elapsed;
      shotsInMag += 1;
    }
    function applyWeapon(index: number) {
      if (index >= WEAPONS.length) {
        const variant = weaponVariants[index - WEAPONS.length];
        if (variant) {
          weaponRackIndex = index;
          weaponIndex = variant.base;
          character.setWeapon(variant.base);
          const mesh = character.weapons[variant.base];
          const material = mesh?.material as THREE.MeshLambertMaterial;
          if (material) {
            material.map = variant.texture;
            material.needsUpdate = true;
          }
          gunStats = resolveWeaponStats(
            WEAPONS[variant.base].model,
            variant.seed
          );
          // TRACER GLOW: forged skins paint their own streak color
          tracerColor = variant.color;
          shotsInMag = 0;
          reloadingUntil = -1e9;
          if (isGunWeapon(variant.base)) soundRef.current?.reload();
          return;
        }
      }
      const meshIndex =
        ((index % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
      weaponRackIndex = meshIndex;
      weaponIndex = meshIndex;
      character.setWeapon(
        meshIndex < WEAPONS.length - 1 ? meshIndex : -1
      );
      gunStats = resolveWeaponStats(WEAPONS[meshIndex].model);
      // TRACER GLOW: every base weapon carries a signature streak hue
      tracerColor = WEAPON_TRACER_COLORS[meshIndex];
      shotsInMag = 0;
      reloadingUntil = -1e9;
      // restore the stock texture in case a forged variant repainted it
      if (meshIndex < WEAPONS.length - 1) {
        const mesh = character.weapons[meshIndex];
        const material = mesh?.material as THREE.MeshLambertMaterial;
        const stock = character.skinsWeapon[meshIndex];
        if (material && stock && material.map !== stock) {
          material.map = stock;
          material.needsUpdate = true;
        }
      }
      // drawing a gun plays the reload cue (boot-time Blade apply stays silent)
      if (isGunWeapon(meshIndex)) soundRef.current?.reload();
    }

    function applyDamage(amount: number) {
      if (deathTimer > 0) return;
      health = Math.max(0, health - amount);
      lastDamageAt = elapsed;

      if (health <= 0) {
        deathTimer = RESPAWN_DELAY;
        playAnim('death', true, true); // hold the final death pose
        keys.clear();
      } else if (!airborne) {
        playAnim('pain', true);
      }
    }

    // ============ CHERRY SPIDER WEB SNARE (the catch) =======================
    // A landed web glob cocoons the hero: heavy movement slow + a sticky
    // silk shell wrapped around the character, long enough for the spider
    // to close the gap its chase speed can't normally cover.
    let webSnareT = 0; // seconds of webbed-ness remaining
    let shockSlowT = 0; // seconds of charged-blast leg shock remaining
    let webCocoon: THREE.Group | null = null;
    let webCocoonTex: THREE.CanvasTexture | null = null;
    let webCocoonBloom = 0; // 0..1 — the wrap blooms on and melts off smooth
    const webCocoonMats: (THREE.MeshBasicMaterial | THREE.SpriteMaterial)[] =
      [];
    const webCocoonBase: number[] = [];
    /** Cocoon ball radius (u) — the catch wraps BIG: an oversized orb-web
     *  sphere around the 190-tall hero, clearly larger than the throw so
     *  the capture reads as a dramatic silk bubble (hollow — only the
     *  circular web lattice outside, nothing filled inside). */
    const WEB_COCOON_R = 135;
    function snarePlayer(duration: number) {
      if (deathTimer > 0) return;
      webSnareT = Math.max(webSnareT, duration);
      playAnim('pain', true);
      hudBridgeRef.current.lootToast?.(
        'Webbed! The cherry spider caught you!'
      );
      void getGameAudio().then((sfx) => sfx.webStick());
      // build the cocoon once — a HOLLOW spherical silk cage: fine circular
      // hoops wrap the hero as a ball-shaped wall on every side with nothing
      // inside (no core, no crossing sheets) and the ball keeps its big size
      if (!webCocoon) {
        webCocoon = new THREE.Group();
        const strandMat = new THREE.MeshBasicMaterial({
          color: 0xdde9ff,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const glowMat = new THREE.SpriteMaterial({
          map: makeWebGlowTexture(),
          color: 0xbfd8ff,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        webCocoonTex = glowMat.map as THREE.CanvasTexture;
        webCocoonMats.push(strandMat, glowMat);
        webCocoonBase.push(0.95, 0.55);
        // one spherical cage — circular wall from all sides, hollow inside
        webCocoon.add(buildWebSphere(strandMat, WEB_COCOON_R));
        // soft luminous halo (a sprite always faces the camera)
        const glow = new THREE.Sprite(glowMat);
        glow.scale.setScalar(WEB_COCOON_R * 3.0);
        webCocoon.add(glow);
        webCocoon.visible = false;
        scene.add(webCocoon);
      }
    }

    function respawn() {
      if (driving) exitJeep(); // never respawn attached to a distant jeep
      if (flying) exitPlane(); // same for the cockpit — bails before the move
      pos.copy(spawnPos);
      // respawn teleports across the endless world — mesh the ground under
      // your feet immediately so you never drop through the void
      terrain.ensureAround(spawnPos.x, spawnPos.z, 1, true);
      vy = 0;
      airborne = false;
      jumpsUsed = 0;
      yaw = 0;
      health = MAX_HEALTH;
      stamina = MAX_STAMINA;
      deathTimer = 0;
      webSnareT = 0; // a fresh spawn shakes the silk off
      shockSlowT = 0; // ...and shakes off the charged-blast buzz
      jeepFuel = 100; // a fresh spawn fills the tank and cools the engine
      jeepTemp = JEEP_TEMP_AMBIENT;
      jeepFuelToasted = false;
      jeepBeeped = false;
      camYawOffset = 0;
      playAnim('stand', false);
      updateCamera(true, 0); // snap the camera behind the respawned player
    }

    // ============ shared gameplay actions (keyboard + touch HUD) ============
    // The same gated primitives serve the physical keyboard AND the mobile
    // touch buttons, so both input paths behave identically (same animation
    // gates, same sounds, same hold-to-fire loop).
    function actionFire() {
      if (
        flying || // no personal gun while flying DART — the plane IS the gun
        phaseRef.current !== 'playing' ||
        !loaded ||
        airborne ||
        deathTimer > 0
      ) {
        return;
      }
      attackHeld = true;
      if (!gunReady()) return; // reload lock / dry mag / fire-rate cadence
      consumeShot();
      playAnim('attack', true);
      soundRef.current?.shootThenReload(reloadCueDelay);
      spawnShot();
      // SPARK mirrors your attack with its own punch flurry (rate-limited
      // inside — holding F keeps the combo going, single taps punch once)
      robotPet?.playPunch();
      spotPet?.playTrick();
      spiderPet?.playThreat();
    }

    /** F key: launch a rocket bomb from the gun nozzle (one per press). */
    function actionRocket() {
      if (
        driving ||
        flying || // the rocket rack stays on foot (same as the jeep)
        phaseRef.current !== 'playing' ||
        !loaded ||
        airborne ||
        deathTimer > 0
      ) {
        return;
      }
      playAnim('attack', true);
      soundRef.current?.shootThenReload(reloadCueDelay);
      spawnRocket();
      // SPARK mirrors the rocket launch with its own punch (rate-limited)
      robotPet?.playPunch();
      spotPet?.playTrick();
      spiderPet?.playThreat();
    }

    // ========== one shot = bullet out of the gun nozzle + muzzle VFX ========
    // Fired at the exact moment an attack clip (re)starts — the same instant
    // the shot cue plays — so the round always leaves the barrel in sync.
    // Muzzle position: the active weapon mesh's world bbox, pushed to its
    // front face along the character's facing direction (sin/cos of yaw).
    const shotBox = new THREE.Box3();
    // scratch box reused every frame for the debug character bounds —
    // allocating a Box3 here per frame was pure GC churn (same values)
    const charBox = new THREE.Box3();
    const shotForward = new THREE.Vector3();
    const shotCenter = new THREE.Vector3();
    const shotSize = new THREE.Vector3();
    const shotMuzzle = new THREE.Vector3();

    /** Nozzle world position for the active gun weapon (null when the
     *  current weapon has no muzzle — Blade / Unarmed). */
    function muzzleWorld(out: THREE.Vector3): THREE.Vector3 | null {
      if (!isGunWeapon(weaponIndex)) return null; // Blade / Unarmed: no muzzle
      const weapon = character.weapons[weaponIndex] ?? character.meshWeapon;
      if (!weapon) return null;
      weapon.updateWorldMatrix(true, false);
      shotBox.setFromObject(weapon);
      const forward = shotForward.set(Math.sin(yaw), 0, Math.cos(yaw));
      shotBox.getSize(shotSize);
      shotBox.getCenter(shotCenter);
      const halfAlongFacing =
        (Math.abs(forward.x) * shotSize.x + Math.abs(forward.z) * shotSize.z) /
        2;
      return out.copy(shotCenter).addScaledVector(forward, halfAlongFacing + 3);
    }

    function spawnShot() {
      const muzzle = muzzleWorld(shotMuzzle);
      if (!muzzle) return;
      const dir = shotForward.clone().normalize();
      // ACCURACY + CONTROL: hip spread. Tight guns hold true; running
      // blooms the pattern unless the weapon's control is high.
      const acc = Math.min(50, Math.max(1, gunStats.accuracy));
      let spread = (1 - acc / 50) * 0.05;
      if (playerMoving) spread *= 1 + (1 - gunStats.control / 100) * 1.5;
      dir.x += (Math.random() - 0.5) * 2 * spread;
      dir.y += (Math.random() - 0.5) * 2 * spread * 0.55;
      dir.z += (Math.random() - 0.5) * 2 * spread;
      bullets.fireFrom(muzzle.clone(), dir.normalize(), {
        // RANGE: flight time before range expiry (0.35s .. 2s)
        life: 0.35 + (Math.min(100, gunStats.range) / 100) * 1.65,
        // DAMAGE: how hard the round bites an air combatant
        dmg: Math.max(1, Math.round(gunStats.damage / 15)),
        // TRACER GLOW: this weapon's signature (or forged skin's) streak hue
        tracerColor,
      });
    }

    /** F key: the converted bullet — a big ROCKET BOMB. NEVER fails to fire:
     *  uses the active weapon's muzzle (gun OR the held blade's tip) and, if
     *  even that is missing (Unarmed), launches from the character's
     *  shoulder along their facing — so pressing F always shows the rocket. */
    function spawnRocket() {
      let muzzle = muzzleWorld(shotMuzzle);
      if (!muzzle) {
        // no gun: try the held weapon mesh's bbox anyway (e.g. the Blade)
        const held = character.weapons[weaponIndex] ?? character.meshWeapon;
        const forward = shotForward.set(Math.sin(yaw), 0, Math.cos(yaw));
        if (held) {
          held.updateWorldMatrix(true, false);
          shotBox.setFromObject(held);
          shotBox.getSize(shotSize);
          shotBox.getCenter(shotCenter);
          const half =
            (Math.abs(forward.x) * shotSize.x +
              Math.abs(forward.z) * shotSize.z) /
            2;
          muzzle = shotMuzzle
            .copy(shotCenter)
            .addScaledVector(forward, half + 10);
        } else {
          muzzle = shotMuzzle
            .copy(pos)
            .addScaledVector(forward, 46)
            .setY(pos.y + 90);
        }
      }
      bullets.fireRocket(muzzle.clone(), shotForward.clone().normalize());
    }

    function actionJump() {
      if (
        driving ||
        flying || // the stick is back — no jumping out of the cockpit
        phaseRef.current !== 'playing' ||
        !loaded ||
        deathTimer > 0 ||
        webSnareT > 0 // webbed boots — the silk pins your feet
      ) {
        return;
      }
      if (swimming) {
        // SWIM HOP: at the surface, Space leaps clean out of the pool
        // onto the shore (plus a splash ring); deeper down, the held-
        // Space breaststroke does the climbing instead
        const lay = oasisWater.layout();
        if (lay.y - pos.y <= SURF_BAND + 12) {
          airborne = true;
          jumpsUsed = 1;
          vy = SWIM_HOP_SPEED;
          playAnim('jump', true);
          soundRef.current?.jump();
          oasisWater.splash(pos.x, lay.y, pos.z, 0.45);
        }
        return;
      }
      if (!airborne) {
        // first jump: launch off the ground
        airborne = true;
        jumpsUsed = 1;
        vy = JUMP_SPEED;
        playAnim('jump', true);
        soundRef.current?.jump();
        robotPet?.playJump();
        spotPet?.playHop();
        spiderPet?.playHop();
      } else if (jumpsUsed < MAX_JUMPS) {
        // DOUBLE JUMP: one extra launch while airborne — resets on landing.
        // Same jump clip + SFX, a touch weaker impulse, plus a dust puff
        // kicked off at the feet and a teal energy AIR RING detonating
        // under the boots (jumpRing.ts) so the mid-air launch reads on
        // screen from any camera angle.
        jumpsUsed += 1;
        vy = DOUBLE_JUMP_SPEED;
        playAnim('jump', true);
        soundRef.current?.jump();
        atmos.footstep(pos.x, pos.y + 4, pos.z, true);
        jumpRings.burst(pos.x, pos.y + 6, pos.z);
        robotPet?.playJump();
        spotPet?.playHop();
        spiderPet?.playHop();
      }
    }

    function actionRoar() {
      if (
        flying || // emotes stay on the ground (same as driving)
        phaseRef.current !== 'playing' ||
        !loaded ||
        airborne ||
        deathTimer > 0
      ) {
        return;
      }
      playAnim('flip', true);
      soundRef.current?.roar(flipCueDuration);
    }

    apiRef.current = {
      setSkin: applySkin,
      addSkin,
      setWeapon: applyWeapon,
      addWeaponVariant,
      setModOptions: applyModOptions,
      applyDamage,
      respawn,
      setPetDeployed,
      droneDirective: (kind) => {
        const nowS = performance.now() / 1000;
        const dronePos = petDrone.group.position;
        switch (kind) {
          case 'COME':
            droneAi.setDirective({ kind: 'COME' }, nowS, pos, dronePos);
            break;
          case 'PATROL':
            droneAi.setDirective({ kind: 'PATROL' }, nowS, pos, dronePos);
            break;
          case 'GUARD':
            droneAi.setDirective({ kind: 'GUARD' }, nowS, pos, dronePos);
            break;
          case 'HOLD':
            droneAi.setDirective({ kind: 'HOLD' }, nowS, pos, dronePos);
            break;
          case 'CEASEFIRE':
            droneAi.setDirective({ kind: 'CEASEFIRE' }, nowS, pos, dronePos);
            break;
        }
      },
    };
    (window as unknown as { __gameApi?: GameApi }).__gameApi = apiRef.current;

    // Imperative handle for the mobile touch controls (rendered only on
    // touch devices). Also on window as __touchApi for tooling/verification.
    touchApiRef.current = {
      move: (x, y) => {
        if (phaseRef.current !== 'playing') return;
        touchMoveVec.x = x;
        touchMoveVec.y = y;
        touchMoveVec.active = true;
      },
      moveEnd: () => {
        touchMoveVec.x = 0;
        touchMoveVec.y = 0;
        touchMoveVec.active = false;
      },
      fireDown: () => actionFire(),
      fireUp: () => {
        attackHeld = false;
      },
      jump: () => actionJump(),
      roar: () => actionRoar(),
      setRun: (on) => {
        sprintMode = on;
      },
      cycleWeapon: () => {
        if (loaded && phaseRef.current === 'playing') {
          applyWeapon(weaponIndex + 1);
        }
      },
      cycleSkin: (dir) => {
        if (loaded && phaseRef.current === 'playing') {
          applySkin(skinIndex + dir);
        }
      },
      exitToLobby: () => {
        if (phaseRef.current === 'playing' && deathTimer <= 0) {
          hudBridgeRef.current.enterLobby?.();
        }
      },
      enterVehicle: () => {
        if (flying) {
          exitPlane(); // the Fly/Car buttons both hop out of the cockpit
        } else if (driving) {
          exitJeep();
        } else if (nearRide) {
          // touch Car button: enter the nearest ride
          if (nearRide === 'jeep') {
            enterJeep();
          } else {
            enterCar(nearRide);
          }
        }
      },
      boardPlane: () => {
        // B-key counterpart for touch: board DART on foot, hop out flying
        if (flying) {
          exitPlane();
        } else if (
          phaseRef.current === 'playing' &&
          deathTimer <= 0 &&
          loaded
        ) {
          boardPlane();
        }
      },
      droneGunDown: () => {
        droneGunHeld = true;
      },
      droneGunUp: () => {
        droneGunHeld = false;
      },
      droneMissile: () => {
        if (phaseRef.current === 'playing' && deathTimer <= 0) {
          petDrone.launchMissile(droneAim);
        }
      },
    };
    (window as unknown as { __touchApi?: TouchGameApi }).__touchApi =
      touchApiRef.current;

    // ========= BUZZ VOICE LINK — "say it, BUZZ does it" =========
    // Continuous ears: the mic streams through an adaptive energy VAD;
    // each spoken segment is WAV-encoded and posted to /api/voice/asr
    // (speech → text), the text goes to /api/voice/command (the LLM
    // understands it and answers with ONE order — or a CHAIN for
    // "come here then attack" — plus a radio reply) and
    // applyVoiceCommand() executes those orders on the drone brain.
    // BUZZ's reply is also SPOKEN OUT LOUD through /api/voice/tts with a
    // band-pass radio filter. V / the mic button toggle the ears;
    // __voice.inject(text) feeds a transcript straight into the command
    // brain (debug/testing path, no mic needed).
    let voiceState: 'off' | 'listening' | 'thinking' = 'off';
    let voiceHeard = 'Press V to talk — or type to BUZZ';
    let voiceReply = '';
    let lastVoiceState = '';
    let lastVoiceHeard = '\u0000';
    let lastVoiceReply = '\u0000';
    let lastVoiceLevel = -1; // cached meter fill (skip identical writes)
    /** Scratch for camera-direction probes (SCOUT relative orders). */
    const voiceDirTmp = new THREE.Vector3();
    /** Scratch aim for immediate FIRE orders. */
    const voiceAimTmp = new THREE.Vector3();
    /** BUZZ speed estimate for the chat brain: last sampled drone position
     *  + timestamp (telemetry is built once per spoken command). */
    const voiceVelPos = new THREE.Vector3();
    let voiceVelT = -1;
    /** Game-unit → radio-meter conversion (the HUD's convention). */
    const toM = (u: number): number => Math.round(u * 0.09);

    /** Execute one parsed voice order on the drone brain (droneAi.ts). */
    function applyVoiceCommand(cmd: VoiceCommand): void {
      const nowS = performance.now() / 1000;
      const p = cmd.params as {
        dir?: string;
        weapon?: string;
        dist?: number;
        fast?: boolean;
      };
      const playerPos = pos;
      const dronePos = petDrone.group.position;
      switch (cmd.intent) {
        case 'come':
          droneAi.setDirective({ kind: 'COME' }, nowS, playerPos, dronePos);
          break;
        case 'follow':
        case 'patrol':
          droneAi.setDirective({ kind: 'PATROL' }, nowS, playerPos, dronePos);
          break;
        case 'hold':
          droneAi.setDirective({ kind: 'HOLD' }, nowS, playerPos, dronePos);
          break;
        case 'guard':
          droneAi.setDirective({ kind: 'GUARD' }, nowS, playerPos, dronePos);
          break;
        case 'ceasefire':
          droneAi.setDirective({ kind: 'CEASEFIRE' }, nowS, playerPos, dronePos);
          break;
        case 'orbit':
          // fast rate = the "spin/dance for me" trick lap
          droneAi.setDirective(
            { kind: 'ORBIT', rate: p.fast ? 2.35 : undefined },
            nowS,
            playerPos,
            dronePos
          );
          break;
        case 'rise':
          droneAi.setDirective({ kind: 'RISE' }, nowS, playerPos, dronePos);
          break;
        case 'descend':
          droneAi.setDirective({ kind: 'DESCEND' }, nowS, playerPos, dronePos);
          break;
        case 'scout': {
          // direction is relative to the CAMERA — works on foot AND driving
          camera.getWorldDirection(voiceDirTmp);
          let dx = voiceDirTmp.x;
          let dz = voiceDirTmp.z;
          const len = Math.hypot(dx, dz) || 1;
          dx /= len;
          dz /= len;
          if (p.dir === 'left') {
            const t = dx;
            dx = dz;
            dz = -t;
          } else if (p.dir === 'right') {
            const t = dx;
            dx = -dz;
            dz = t;
          } else if (p.dir === 'back') {
            dx = -dx;
            dz = -dz;
          }
          droneAi.setDirective(
            {
              kind: 'SCOUT',
              dirX: dx,
              dirZ: dz,
              dist: typeof p.dist === 'number' ? p.dist : undefined,
            },
            nowS,
            playerPos,
            dronePos
          );
          break;
        }
        case 'attack': {
          const weapon =
            p.weapon === 'gun' || p.weapon === 'rockets' ? p.weapon : 'any';
          droneAi.setDirective(
            { kind: 'ATTACK', weapon },
            nowS,
            playerPos,
            dronePos
          );
          break;
        }
        case 'fire': {
          // immediate shot, no maneuvering: a HOMING rocket onto the
          // nearest threat when a tube is loaded, else the chin gun;
          // with no threats the rocket lands on the facing ground point
          const tgt = threats.nearestAlive(petDrone.group.position, 1300);
          if (tgt) voiceAimTmp.set(tgt.pos.x, tgt.topY, tgt.pos.z);
          if (p.weapon === 'gun') {
            petDrone.fireGun(tgt ? voiceAimTmp : droneAim);
          } else if (petDrone.missilesLoaded() > 0) {
            const launched = tgt
              ? petDrone.launchMissile(voiceAimTmp, {
                  tracker: makeThreatTracker(tgt.id),
                })
              : petDrone.launchMissile(droneAim);
            if (!launched) petDrone.fireGun(tgt ? voiceAimTmp : droneAim);
          } else {
            // tubes dry → the gun still answers
            petDrone.fireGun(tgt ? voiceAimTmp : droneAim);
          }
          break;
        }
        case 'resupply':
          petDrone.resupply(); // wing pods visibly re-arm
          break;
        case 'status':
          // the chat brain now OWNS the spoken status — its reply carries
          // the full picture from live telemetry (hull/fuel, rockets, mode,
          // position, targets), so no chip-style override here anymore
          break;
        default:
          break; // greet / chat / report / speak / unknown — the reply already
          // carries BUZZ's line
      }
    }

    // ----- BUZZ TALKS: fetch TTS for a reply line and play it through a
    // band-pass "radio" filter; silent no-op on mute or any failure (the
    // HUD chip always shows the line either way). One line at a time. ----
    let radioCtx: AudioContext | null = null;
    let radioBusy = false;
    async function speakReply(text: string): Promise<void> {
      if (!text || radioBusy) return;
      // mute OR the lobby hold (full-screen lobby open) keeps BUZZ quiet —
      // only the lobby soundtrack plays while the player is in the lobby
      if (soundRef.current?.isMuted() || soundRef.current?.isSuspended()) return;
      try {
        const res = await fetch('/api/voice/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) return;
        const raw = await res.arrayBuffer();
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AC) return;
        if (!radioCtx) radioCtx = new AC();
        if (radioCtx.state === 'suspended')
          await radioCtx.resume().catch(() => undefined);
        const decoded = await radioCtx.decodeAudioData(raw);
        radioBusy = true;
        // ECHO GUARD: this line is about to come out of the speakers —
        // shut the mic's VAD gate for the clip's duration (+0.9s tail) so
        // BUZZ never hears himself and answers his own voice in a loop
        voice.inhibit(decoded.duration + 0.9);
        const src = radioCtx.createBufferSource();
        src.buffer = decoded;
        // radio color, tuned for BUZZ's DEEP MALE voice (F0 ≈ 122 Hz):
        // keep the low body a 320 Hz highpass would strip away, center the
        // band on the low mids — still reads as comms audio, but male
        const hp = radioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 170;
        const bp = radioCtx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 950;
        bp.Q.value = 0.5;
        const gain = radioCtx.createGain();
        gain.gain.value = 0.9;
        src.connect(hp);
        hp.connect(bp);
        bp.connect(gain);
        gain.connect(radioCtx.destination);
        src.onended = () => {
          radioBusy = false;
        };
        src.start();
      } catch {
        radioBusy = false; // text chip already carries the line
      }
    }

    const voice = createVoiceControl({
      onState: (s) => {
        voiceState = s;
        setVoiceOn(s !== 'off');
      },
      onSpeechStart: () => {
        // INSTANT feedback while the audio is still being captured —
        // the player sees the ears caught the words long before ASR ends
        voiceHeard = 'Hearing you…';
      },
      onHeard: (t) => {
        voiceHeard = `You: "${t}"`;
      },
      onReply: (t, cmd) => {
        voiceReply = t;
        // LOOP BREAKER: a pure "unknown" answer (the brain could not map
        // what it heard — usually BUZZ's own echo or room noise) is shown
        // in the chip but NEVER spoken. Speaking it is what fed the old
        // endless "say again — did not copy" self-hearing loop.
        const effective =
          cmd.commands && cmd.commands.length > 0 ? cmd.commands : [cmd];
        if (!effective.every((c) => c.intent === 'unknown')) {
          void speakReply(t); // BUZZ answers out loud too
        }
      },
      onError: (m) => {
        voiceReply = m;
      },
      onCommand: (cmd) => {
        // the brain may answer with a CHAIN ("come here then attack") —
        // execute every order in order
        const chain = cmd.commands;
        if (chain && chain.length > 0) {
          for (const c of chain) applyVoiceCommand(c);
        } else {
          applyVoiceCommand(cmd);
        }
      },
      buildContext: () => {
        // FULL drone telemetry — the chat brain answers ANY question about
        // BUZZ from this ("how much fuel do you have", "where are you",
        // "how many enemies", "what zone is this"), so hand it everything:
        // identity, mode, hull/fuel, ammo, position, speed, sensors, the
        // player and the world around them.
        const st = droneAi.snapshot();
        const dronePos = petDrone.group.position;
        const nowMs = performance.now();
        let speedMps = 0;
        if (voiceVelT > 0) {
          const dtS = (nowMs - voiceVelT) / 1000;
          if (dtS > 0.05) {
            speedMps = toM(voiceVelPos.distanceTo(dronePos)) / dtS;
          }
        }
        voiceVelPos.copy(dronePos);
        voiceVelT = nowMs;
        const altAgl = Math.max(
          0,
          toM(dronePos.y - surfaceYAt(dronePos.x, dronePos.z))
        );
        const nearTgt = threats.nearestAlive(dronePos, 1500);
        const weather =
          rainIntensity > 0.15
            ? 'rain'
            : volcanoIntensity > 0.4
              ? 'volcano ash'
              : mesaIntensity > 0.4
                ? 'badlands haze'
                : redIntensity > 0.4
                  ? 'red-desert heat'
                  : desertIntensity > 0.4
                    ? 'desert'
                    : winterFxVal > 0.4
                      ? 'snow'
                      : iceFxVal > 0.4
                        ? 'ice'
                        : 'clear';
        return {
          drone: {
            callsign: 'BUZZ',
            model: 'AH-9 combat quadcopter gunship',
            role: 'autonomous escort + close air support',
            mode: st.state, // PATROL | ENGAGE | RTB
            currentOrder: st.directive ?? 'autonomous escort',
            combatPhase: st.phase, // move | fire
            queuedOrders: st.queued,
            hullPercent: Math.round(buzzHull),
            // hull IS the fuel/battery gauge on this airframe — one readout
            fuelPercent: Math.round(buzzHull),
            hullWord:
              buzzHull >= 70 ? 'green' : buzzHull >= 30 ? 'amber' : 'red',
            rocketsLoaded: petDrone.missilesLoaded(),
            gunReady: true,
            secondsToNextRocket: st.nextMissileIn,
            distanceToPlayerM: toM(dronePos.distanceTo(pos)),
            altitudeAboveGroundM: altAgl,
            speedMps: Math.round(speedMps),
            sensorRangeM: toM(1500),
            maxRangeFromPlayerM: toM(2400),
          },
          player: {
            healthPercent: Math.round((health / MAX_HEALTH) * 100),
            zone: currentZoneId,
            drivingJeep: driving,
          },
          world: {
            targetsAlive: threatStats.alive,
            nearestTargetM: nearTgt
              ? toM(nearTgt.pos.distanceTo(dronePos))
              : null,
            nearestTargetIsAir: nearTgt ? nearTgt.air : null,
            weather,
            timeOfDay: timeHour.toFixed(1),
          },
        };
      },
    });
    voiceToggleRef.current = () => {
      if (phaseRef.current === 'playing') voice.toggle();
    };
    // typed chat — same brain, no mic needed (works even with the ears off)
    voiceInjectRef.current = (t: string) => {
      if (phaseRef.current === 'playing') void voice.inject(t);
    };
    (window as unknown as { __voice?: object }).__voice = {
      toggle: () => voiceToggleRef.current?.(),
      inject: (t: string) => voice.inject(t),
      status: () => voice.status(),
      meter: () => voice.meter(),
      say: (t: string) => speakReply(t),
    };

    // ================= input =================
    const keys = new Set<string>();

    /** Normalize to a stable code; falls back to event.key when code is empty
     *  (some automation tools and non-standard keyboards send no code). */
    function resolveCode(event: KeyboardEvent): string {
      if (event.code) return event.code;
      const key = event.key.toLowerCase();
      switch (key) {
        case 'w':
          return 'KeyW';
        case 'a':
          return 'KeyA';
        case 's':
          return 'KeyS';
        case 'd':
          return 'KeyD';
        case 'arrowup':
          return 'ArrowUp';
        case 'arrowdown':
          return 'ArrowDown';
        case 'arrowleft':
          return 'ArrowLeft';
        case 'arrowright':
          return 'ArrowRight';
        case ' ':
          return 'Space';
        case 'f':
          return 'KeyF';
        case 'g':
          return 'KeyG';
        case 'h':
          return 'KeyH';
        case 'v':
          return 'KeyV';
        case 'j':
          return 'KeyJ';
        case 'q':
          return 'KeyQ';
        case 'r':
          return 'KeyR';
        case 'e':
          return 'KeyE';
        case 'x':
          return 'KeyX';
        case 'escape':
          return 'Escape';
        default:
          return /^[1-5]$/.test(key) ? 'Digit' + key : '';
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      // typing in a HUD field (typed chat to BUZZ) is NEVER gameplay —
      // "v", "wasd", space etc. while writing a message must not fire
      // game keys or toggle the mic
      const tgt = event.target as HTMLElement | null;
      if (
        tgt &&
        (tgt.tagName === 'INPUT' ||
          tgt.tagName === 'TEXTAREA' ||
          tgt.isContentEditable)
      ) {
        return;
      }
      const code = resolveCode(event);
      if (!code) return;

      if (code === 'Escape') {
        // Esc returns to the lobby (disabled during the death sequence)
        if (
          !event.repeat &&
          phaseRef.current === 'playing' &&
          deathTimer <= 0
        ) {
          hudBridgeRef.current.enterLobby?.();
        }
        return;
      }

      // all gameplay input is ignored while the lobby is showing
      if (phaseRef.current !== 'playing') return;

      if (
        code === 'Space' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight'
      ) {
        event.preventDefault();
      }

      if (code === 'KeyQ' && !event.repeat && loaded && !driving && !flying) {
        applySkin(skinIndex - 1);
      } else if (code === 'KeyB' && !event.repeat && loaded) {
        // B = DART BOARDING: board the strike plane when it's deployed
        // (press again mid-flight to hop out — E does the same in the air)
        if (flying) {
          exitPlane();
        } else {
          boardPlane();
        }
      } else if (code === 'KeyE' && !event.repeat && loaded) {
        // while flying E hops out; near the jeep it mounts it; mounted E
        // steps out; farther away it keeps cycling skins exactly as before
        if (flying) {
          exitPlane();
        } else if (driving) {
          exitJeep();
        } else if (nearRide) {
          // enter the nearest ride (both may be in range)
          if (nearRide === 'jeep') {
            enterJeep();
          } else {
            enterCar(nearRide);
          }
        } else {
          applySkin(skinIndex + 1);
        }
      } else if (
        code === 'KeyX' &&
        !event.repeat &&
        loaded &&
        !driving &&
        !flying
      ) {
        applyWeapon(weaponIndex + 1);
      } else if (code === 'Space') {
        // the uploaded jump SFX plays with every real jump (same gate as the
        // jump animation: grounded, alive, not repeated keydown). While
        // driving, Space is the handbrake; while flying it bleeds speed —
        // either way it still lands in `keys`.
        if (!event.repeat && !driving && !flying) actionJump();
      } else if (code === 'KeyF') {
        // F = ROCKET BOMB: one big finned rocket out of the nozzle per press
        // (launch flash, flame + smoke trail, huge detonation). The classic
        // gun stays on the touch HUD's fire button.
        if (!event.repeat && !driving && !flying) actionRocket();
      } else if (code === 'KeyH' && !event.repeat) {
        // H = jeep horn while driving: a dual-tone blast that scatters
        // nearby spiders off the road for a few seconds. On foot (or
        // flying) H stays the BUZZ airstrike — air support never leaves
        // you, but the wheel gets priority on the key.
        if (driving) {
          const nowMs = performance.now();
          if (nowMs - lastHornMs > 700) {
            lastHornMs = nowMs;
            void getGameAudio().then((sfx) => sfx.horn());
            cherrySpiders?.scare(
              jeep.group.position,
              JEEP_SCARE_RADIUS,
              JEEP_SCARE_TIME
            );
          }
        } else if (deathTimer <= 0) {
          petDrone.launchMissile(droneAim);
        }
      } else if (code === 'KeyR' && !event.repeat) {
        // R = dash radio: lo-fi synthwave while you sit in the jeep (a
        // three-bar equalizer animates on the gauge cluster). Stepping
        // out kills it via exitJeep, so the music never follows you.
        if (driving) {
          jeepRadioOn = !jeepRadioOn;
          void getGameAudio().then((sfx) => sfx.setRadio(jeepRadioOn));
          jeepGaugesRef.current?.setRadio(jeepRadioOn);
          hudBridgeRef.current.lootToast?.(
            jeepRadioOn ? 'Dash radio on — lo-fi wave' : 'Dash radio off'
          );
        }
      } else if (code === 'KeyV' && !event.repeat) {
        // V = BUZZ VOICE LINK: toggle the always-on ears (mic on/off);
        // what you say is understood by the LLM command brain and flown
        // by the drone (see the VOICE LINK block above)
        voiceToggleRef.current?.();
      } else if (code === 'KeyG' && !event.repeat) {
        // G = WIDOW WEB SHOT: the deployed robotic spider fires a
        // flexible silk strand at whatever the player is aiming at
        // (a G HOLD still streams BUZZ's chin gun when it's deployed —
        // the two cues share the key without stepping on each other)
        fireSpiderWeb();
      } else if (code === 'Digit5' || code === 'Numpad5') {
        // the monster roar rides WITH the flip animation and is trimmed to
        // the clip's measured length so it ends exactly when the flip does
        if (!event.repeat && !driving && !flying) actionRoar();
      } else if (
        ACTION_KEYS[code] &&
        !event.repeat &&
        loaded &&
        !airborne &&
        !driving &&
        !flying &&
        deathTimer <= 0
      ) {
        playAnim(ACTION_KEYS[code], true);
      }

      if (code === 'KeyM' && !event.repeat) toggleMute();

      keys.add(code);
    }

    function onKeyUp(event: KeyboardEvent) {
      const code = resolveCode(event);
      if (code === 'KeyF') attackHeld = false;
      if (code) keys.delete(code);
    }

    function onBlur() {
      keys.clear();
      attackHeld = false;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // ================= running sound (GRASS surface) =================
    // The grass-land half of the two-surface footstep pair: loops while the
    // character actually walks or runs on GREEN ground (moving + grounded);
    // pauses on idle, jumps, one-shot emotes, death, lobby and driving, and
    // its volume fades OUT across the snow line (mirrored by the snow-walk
    // crunch fading IN) so deep snow never mixes forest steps with crunch.
    const runSound = new Audio('/sounds/running-forest.wav');
    runSound.loop = true;
    runSound.volume = RUN_SOUND_VOLUME;
    runSound.preload = 'auto';
    let runSoundActive = false;

    function setRunSound(active: boolean) {
      if (active === runSoundActive) return;
      runSoundActive = active;

      if (active) {
        runSound.currentTime = 0;
        runSound.play().catch(() => {
          // Autoplay is rejected until the first user gesture; clear the flag
          // so the loop retries automatically on later frames.
          runSoundActive = false;
        });
      } else {
        runSound.pause();
      }
    }

    // ================= snow-walk sound =================
    // The user-provided snow crunch: loops only while the character
    // actually walks or runs OVER SNOW — the winter-biome factor under the
    // boots scales the volume (fade-in across the soft snow line), and it
    // pauses on idle, jumps, lobby, driving and death. The mute toggle
    // silences it exactly like the running loop.
    const snowWalkSound = new Audio(SNOW_WALK_SFX);
    snowWalkSound.loop = true;
    snowWalkSound.volume = 0;
    snowWalkSound.preload = 'auto';
    let snowWalkSoundActive = false;

    function setSnowWalkSound(active: boolean) {
      if (active === snowWalkSoundActive) return;
      snowWalkSoundActive = active;

      if (active) {
        // resume the loop where it left off — no jarring restart on brief
        // grass <-> snow flickers at the biome border
        snowWalkSound.play().catch(() => {
          // Autoplay is rejected until the first user gesture; clear the
          // flag so the loop retries automatically on later frames.
          snowWalkSoundActive = false;
        });
      } else {
        snowWalkSound.pause();
      }
    }

    // ================= tire-screech sound =================
    // The user-provided tyre screech: loops ONLY while the jeep is actually
    // sliding — the very same `drifting` state that draws the skid marks
    // and tire smoke (sudden turns / Space-handbrake slides above the
    // grip threshold: speed > 110 and sideways slip > 60 u/s). The mute
    // toggle silences it exactly like the running loop.
    const screechSound = new Audio(TIRE_SCREECH_SFX);
    screechSound.loop = true;
    screechSound.volume = 0;
    screechSound.preload = 'auto';
    let screechSoundActive = false;

    function setScreechSound(active: boolean) {
      if (active === screechSoundActive) return;
      screechSoundActive = active;

      if (active) {
        // resume where it left off — a long drift that briefly regains
        // grip (hysteresis) continues the same screech instead of a restart
        screechSound.play().catch(() => {
          // Autoplay is rejected until the first user gesture; clear the
          // flag so the loop retries automatically on later frames.
          screechSoundActive = false;
        });
      } else {
        screechSound.pause();
      }
    }

    // ================= debug handle (invisible) =================
    const debug: PlayerDebugInfo = {
      loaded: false,
      animation: 'stand',
      moving: false,
      airborne: false,
      x: 0,
      y: 0,
      z: 0,
      charMinY: 0,
      charMaxY: 0,
      timeOfDay: DAY_START_HOUR,
      stamina: MAX_STAMINA,
      webbed: false,
      shocked: false,
      exhausted: false,
      sprint: false,
      touchMove: false,
      phase: 'lobby',
    };
    (window as unknown as { __player?: PlayerDebugInfo }).__player = debug;
    (window as unknown as { __runSound?: HTMLAudioElement }).__runSound =
      runSound;
    (window as unknown as {
      __snowWalkSound?: HTMLAudioElement;
    }).__snowWalkSound = snowWalkSound;
    (window as unknown as {
      __tireScreech?: HTMLAudioElement;
    }).__tireScreech = screechSound;
    (window as unknown as {
      __dayNight?: {
        hour(): number;
        setHour(hour: number): void;
        sunHeight(): number;
        sunDir(): number[];
        moonDir(): number[];
        aim(dx: number, dy: number, dz: number): void;
      };
    }).__dayNight = {
      hour: () => timeHour,
      setHour: (hour: number) => {
        timeHour = ((hour % 24) + 24) % 24;
      },
      sunHeight: () => sunDir.y,
      sunDir: () => {
        updateSunMoonDirections();
        return sunDir.toArray();
      },
      moonDir: () => {
        updateSunMoonDirections();
        return moonDir.toArray();
      },
      // point the orbit camera along a world-space direction (debug/verification)
      aim: (dx: number, dy: number, dz: number) => {
        const horiz = Math.sqrt(dx * dx + dz * dz) || 1e-6;
        camYawOffset = Math.atan2(dx, dz) - yaw;
        camPitch = THREE.MathUtils.clamp(
          -Math.atan2(dy, horiz),
          CAM_MIN_PITCH,
          CAM_MAX_PITCH
        );
        camIgnoreClearance = true;
        updateCamera(true, 0);
      },
    };

    // ================= renderer =================
    // THE mobile hang fix: full devicePixelRatio (3x on phones) + MSAA is a
    // brutal fill-rate bill, so LOW_SPEC drops antialias and caps the render
    // scale at 1.5 — at arm's length the extra pixels were never visible;
    // desktop keeps the crisp 2x + MSAA look either way.
    renderer = new THREE.WebGLRenderer({
      antialias: !LOW_SPEC,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        LOW_SPEC ? LOW_DPR_CAP : HIGH_DPR_CAP
      )
    );
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    // performance surface for tooling / verification (window.__perf)
    (window as unknown as { __perf?: object }).__perf = {
      lowSpec: LOW_SPEC,
      dpr: window.devicePixelRatio,
      pixelRatio: renderer.getPixelRatio(),
      antialias: !LOW_SPEC,
      shadowMapSize: LOW_SPEC ? 1024 : 2048,
      frameCapFps: LOW_SPEC ? 30 : 0,
      farDrops: rain.counts.far,
      cloudsQuality: LOW_SPEC ? 'low' : 'high',
      triangles: () => renderer.info.render.triangles,
      drawCalls: () => renderer.info.render.calls,
    };

    // ================= GPGPU birds (three.js webgl_gpgpu_birds_gltf) =================
    // Parrot loners: rare birds on fast straight courses roaming the whole
    // 12,800-unit map at altitude 2000 (26 drawn of 1024 simulated, 2.5%).
    // Exposes window.__parrots = { ready, simulated, rendered }.
    // (The flamingo V-formation squadron was removed per request.)
    const parrots: BirdFlock = createBirdFlock(scene, renderer);

    // place camera behind the character right away
    const camDesired = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    // --- mouse-controlled orbit / zoom state ---
    let camYawOffset = 0; // orbit angle around the character (rad)
    let camPitch = LOBBY_PITCH; // starts in the lobby showcase framing
    let camDist = LOBBY_DIST;
    let camDistTarget = LOBBY_DIST;
    /** Explosion screen-shake — creeper detonations pump it, updateCamera
     *  jitters the camera by it and decays it exponentially. */
    let camShake = 0;
    /** Camera position lerp rate — the flying plane moves fast enough that
     *  the default walk-chase lag would strand it at the screen edge. */
    let camFollowRate = 6;
    let orbitDragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;

    // --- lobby <-> gameplay camera blending ---
    // 1 = lobby showcase (camera in front of the character), 0 = gameplay
    // rig (camera behind). START tweens this to 0, sweeping the camera
    // around the character instead of hard cutting.
    let lobbyBlend = 1;
    let lastPhase: GamePhase = phaseRef.current;
    /** Debug aim() bypasses the terrain-clearance clamp so the camera can
     *  look up at the sky across hills; reset on every phase change. */
    let camIgnoreClearance = false;

    /** Active pointers on the canvas — one finger orbits, two fingers
     *  pinch-zoom (the touch counterpart of the mouse wheel). */
    const activePointers = new Map<number, { x: number; y: number }>();
    let pinchLastDist = 0;
    // tap-vs-drag discrimination for chest opening (click / touch tap)
    let tapArmed = false;
    let tapPointerId = -1;
    let tapStartX = 0;
    let tapStartY = 0;
    let tapStartAt = 0;
    let hoverThrottleAt = 0;

    function onPointerDown(event: PointerEvent) {
      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (activePointers.size === 1) {
        orbitDragging = true;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        // remember the press so pointerup can tell a deliberate tap
        // (open a treasure chest) from an orbit drag
        tapArmed = true;
        tapPointerId = event.pointerId;
        tapStartX = event.clientX;
        tapStartY = event.clientY;
        tapStartAt = performance.now();
        try {
          renderer.domElement.setPointerCapture(event.pointerId);
        } catch {
          // stale/synthetic pointer ids can't be captured; orbit still works
        }
        renderer.domElement.style.cursor = 'grabbing';
      } else {
        // second finger: orbit hands over to pinch zoom (never a tap)
        tapArmed = false;
        orbitDragging = false;
        const points = [...activePointers.values()];
        pinchLastDist = Math.hypot(
          points[0].x - points[1].x,
          points[0].y - points[1].y
        );
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (!activePointers.has(event.pointerId)) return;
      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      // --- pinch zoom (two fingers) ---
      if (activePointers.size >= 2) {
        const points = [...activePointers.values()];
        const dist = Math.hypot(
          points[0].x - points[1].x,
          points[0].y - points[1].y
        );
        if (pinchLastDist > 0 && phaseRef.current === 'playing' && dist > 0) {
          camDistTarget = Math.min(
            CAM_MAX_DIST,
            Math.max(
              CAM_MIN_DIST,
              camDistTarget + (pinchLastDist - dist) * 1.4
            )
          );
        }
        pinchLastDist = dist;
        return;
      }

      // --- single-pointer orbit ---
      if (!orbitDragging) return;

      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;

      // in the lobby the drag spins the character's showcase turntable
      if (phaseRef.current === 'lobby') {
        yaw -= dx * 0.008;
        return;
      }

      camYawOffset -= dx * 0.005;
      camPitch = Math.min(
        CAM_MAX_PITCH,
        Math.max(CAM_MIN_PITCH, camPitch + dy * 0.005)
      );
    }

    function onPointerUp(event: PointerEvent) {
      // a short, still press on a treasure chest plays the unlock
      // cinematic (handle first, then the lid) via a camera ray
      const wasTap =
        tapArmed &&
        event.pointerId === tapPointerId &&
        performance.now() - tapStartAt < 450 &&
        Math.hypot(event.clientX - tapStartX, event.clientY - tapStartY) < 8;
      tapArmed = false;
      activePointers.delete(event.pointerId);
      if (activePointers.size < 2) pinchLastDist = 0;

      if (
        wasTap &&
        activePointers.size === 0 &&
        phaseRef.current === 'playing' &&
        !driving &&
        !flying &&
        deathTimer <= 0 &&
        loaded
      ) {
        const rect = renderer.domElement.getBoundingClientRect();
        chestPointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        chestRaycaster.setFromCamera(chestPointer, camera);
        const chestAction = chests.openAtRay(chestRaycaster, pos.x, pos.z);
        if (chestAction === 'opened') {
          // the uploaded chest-open sfx plays the INSTANT the unlock
          // cinematic starts — latch flip (0.38s) + lid swing (0.67s)
          // finish in ~1s, so the sound rides the whole one-second
          // opening; the coin chime stamps the loot burst after a
          // first-time open
          void getGameAudio().then((sfx) => sfx.chestOpen());
        } else if (chestAction === 'closed') {
          // closing rides the SAME sfx played BACKWARDS — the exact
          // mirror of the opening cue, matching the reversed cinematic
          // (lid shut 0.67s + lock flip 0.38s, ~1.05s like the opening)
          void getGameAudio().then((sfx) => sfx.chestClose());
        }
      }

      if (activePointers.size === 1) {
        // one finger remains after a pinch: resume orbiting from its spot
        const [remaining] = [...activePointers.values()];
        orbitDragging = true;
        lastPointerX = remaining.x;
        lastPointerY = remaining.y;
        return;
      }

      if (activePointers.size === 0) {
        orbitDragging = false;
        renderer.domElement.style.cursor = 'grab';
      }
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (phaseRef.current === 'lobby') return; // no zoom in the lobby
      camDistTarget = Math.min(
        CAM_MAX_DIST,
        Math.max(CAM_MIN_DIST, camDistTarget + event.deltaY * 0.5)
      );
    }

    /** Mouse-only hover feedback: pointer cursor when aiming at a chest. */
    function onHoverPointerMove(event: PointerEvent) {
      if (event.pointerType !== 'mouse') return; // touch has no hover
      if (orbitDragging || activePointers.size > 0) return; // busy dragging
      if (phaseRef.current !== 'playing') return;
      const now = performance.now();
      if (now - hoverThrottleAt < 70) return; // cheap raycast throttle
      hoverThrottleAt = now;
      const rect = renderer.domElement.getBoundingClientRect();
      chestPointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      chestRaycaster.setFromCamera(chestPointer, camera);
      renderer.domElement.style.cursor = chests.chestHit(
        chestRaycaster,
        pos.x,
        pos.z
      )
        ? 'pointer'
        : 'grab';
    }

    function updateCamera(immediate: boolean, dt: number) {
      // smooth zoom easing
      camDist += (camDistTarget - camDist) * Math.min(1, 10 * dt);

      // Blend the lobby framing (in front of the character, angle + PI) into
      // the gameplay rig (behind, angle + camYawOffset) with smoothstep, so
      // START sweeps the camera around the character instead of cutting.
      const blendT = 1 - lobbyBlend;
      const blendEase = blendT * blendT * (3 - 2 * blendT);
      const angleOffset = Math.PI * (1 - blendEase) + camYawOffset * blendEase;
      const pitch = LOBBY_PITCH + (camPitch - LOBBY_PITCH) * blendEase;
      const dist = LOBBY_DIST + (camDist - LOBBY_DIST) * blendEase;

      const angle = yaw + angleOffset;
      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);
      const horizontal = dist * Math.cos(pitch);
      const vertical = dist * Math.sin(pitch);

      camDesired.set(
        pos.x - sinA * horizontal,
        pos.y + LOOK_HEIGHT + vertical,
        pos.z - cosA * horizontal
      );

      if (immediate) {
        camera.position.copy(camDesired);
      } else {
        camera.position.lerp(camDesired, 1 - Math.exp(-camFollowRate * dt));
      }

      if (!camIgnoreClearance) {
        const minY =
          surfaceYAt(camera.position.x, camera.position.z) +
          CAM_MIN_CLEARANCE;
        if (camera.position.y < minY) camera.position.y = minY;
      }

      // explosion shake: jitter the camera position (lookAt re-aims below,
      // so the offset reads as a violent nudge, not a permanent drift)
      if (camShake > 0.002) {
        const s = camShake * camShake;
        camera.position.x += (Math.random() - 0.5) * 34 * s;
        camera.position.y += (Math.random() - 0.5) * 24 * s;
        camera.position.z += (Math.random() - 0.5) * 34 * s;
        camShake *= Math.exp(-3.4 * dt);
      }

      lookTarget.set(pos.x, pos.y + LOOK_HEIGHT, pos.z);
      camera.lookAt(lookTarget);
    }

    // ================= day/night sky driver =================
    // One directional light plays both sun and moon: warm bright daylight,
    // crossfaded through dusk into dim blue moonlight (real shadows in both
    // phases). The sky blends night -> day with an orange horizon band at
    // dawn/dusk; the sun/moon discs and star field re-anchor to the camera
    // every frame. The biome factors arrive PRE-EASED (the BIOME_ATMOS_TAU
    // glide in the animation loop) so the vault crossfades SLOWLY at biome
    // borders instead of snapping. Called once per frame AFTER the camera
    // update.
    const skyColor = new THREE.Color();
    const tmpColorA = new THREE.Color();
    const tmpColorB = new THREE.Color();
    scene.background = skyColor; // mutated in place each frame

    function updateSky(
      dt: number,
      stormIntensity: number,
      winterIntensity: number,
      desertIntensity: number,
      redIntensity: number,
      mesaIntensity: number,
      volcanoIntensity: number,
      volcanoGlow: number,
      cherryIntensity: number,
      shroomIntensity: number
    ) {
      updateSunMoonDirections();

      const sunUp = THREE.MathUtils.smoothstep(sunDir.y, -0.04, 0.16);
      const moonUp = THREE.MathUtils.smoothstep(moonDir.y, -0.04, 0.16);
      // 1 when the sun sits on the horizon (dawn/dusk), 0 at high day/deep night
      const horizonGlow =
        1 - THREE.MathUtils.smoothstep(Math.abs(sunDir.y), 0.02, 0.3);

      // --- directional light: sun by day, moon by night ---
      const wSun = sunUp * sunUp;
      const wMoon = moonUp;
      const wSum = wSun + wMoon;
      const lightDir = wSun >= wMoon ? sunDir : moonDir;
      directionalLight.position
        .copy(pos)
        .addScaledVector(lightDir, SUN_DISTANCE);
      directionalLight.target.position.copy(pos);
      directionalLight.intensity =
        (wSun * SUN_LIGHT_MAX + wMoon * MOON_LIGHT_MAX) *
        (1 - 0.55 * stormIntensity); // storm clouds blot out the light
      if (wSum > 1e-3) {
        tmpColorA
          .copy(SUNLIGHT_LOW)
          .lerp(SUNLIGHT_HIGH, THREE.MathUtils.clamp(sunDir.y / 0.45, 0, 1))
          .multiplyScalar(wSun);
        tmpColorB.copy(MOONLIGHT).multiplyScalar(wMoon);
        tmpColorA.add(tmpColorB).multiplyScalar(1 / wSum);
        directionalLight.color.copy(tmpColorA);
      }

      // --- ambient: dims and cools off at night ---
      ambientLight.color.copy(AMBIENT_NIGHT).lerp(AMBIENT_DAY, sunUp);
      ambientLight.intensity =
        (AMBIENT_NIGHT_I + (AMBIENT_DAY_I - AMBIENT_NIGHT_I) * sunUp) *
        (1 - 0.28 * stormIntensity);

      // --- sky: night -> day, tinted orange around the horizon crossings ---
      skyColor.copy(SKY_NIGHT).lerp(SKY_DAY, sunUp);
      skyColor.lerp(SKY_SUNSET, horizonGlow * (0.3 + 0.5 * sunUp));
      skyColor.lerp(STORM_SKY, 0.55 * stormIntensity); // wet grey ceiling
      // winter biomes bleach the vault toward a pale icy blue (mostly by
      // day — at night the snow just sits under the usual moonlight)
      skyColor.lerp(WINTER_SKY, winterIntensity * 0.5 * (0.25 + 0.75 * sunUp));
      // desert biomes keep the vault BLUE (reference desert: clear sky over
      // the dunes) — just a light dusty haze cast, day-weighted like winter
      skyColor.lerp(DESERT_SKY, desertIntensity * 0.3 * (0.25 + 0.75 * sunUp));
      // red desert: dusty rust haze; badlands: pale warm terracotta vault;
      // volcano: dark smoky ash ceiling that leans even darker at night
      // (the rising embers glow against it)
      skyColor.lerp(RED_SKY, redIntensity * 0.38 * (0.25 + 0.75 * sunUp));
      skyColor.lerp(MESA_SKY, mesaIntensity * 0.3 * (0.25 + 0.75 * sunUp));
      skyColor.lerp(
        VOLCANO_SKY,
        volcanoIntensity * (0.55 + 0.2 * (1 - sunUp))
      );
      // temperate wild biomes: cherry groves breathe a soft blossom-pink
      // haze and mushroom fields a pale lilac cast. The crimson fields
      // deliberately tint NOTHING — their sky is the plain grassland
      // vault, so the biome reads through the ground cover alone.
      skyColor.lerp(CHERRY_SKY, cherryIntensity * 0.3 * (0.25 + 0.75 * sunUp));
      skyColor.lerp(SHROOM_SKY, shroomIntensity * 0.28 * (0.25 + 0.75 * sunUp));
      // standing near a live crater: the caldera glow breathes a warm
      // ember cast into the vault — strongest at night, when the lava
      // owns the light
      skyColor.lerp(
        EMBER_GLOW_SKY,
        volcanoGlow * (0.32 + 0.4 * (1 - sunUp))
      );

      // --- sun disc: follows the real orbit, warming orange as it sets ---
      sunMesh.position
        .copy(camera.position)
        .addScaledVector(sunDir, SUN_VISUAL_DISTANCE);
      sunMesh.lookAt(camera.position);
      sunMaterial.opacity =
        THREE.MathUtils.smoothstep(sunDir.y, -0.09, 0.03) *
        (1 - 0.85 * stormIntensity);
      sunMaterial.color
        .copy(SUN_TINT_SET)
        .lerp(SUN_TINT_NOON, 1 - horizonGlow * 0.85);

      // --- moon disc: rides the opposite side of the sky ---
      moonMesh.position
        .copy(camera.position)
        .addScaledVector(moonDir, SUN_VISUAL_DISTANCE);
      moonMesh.lookAt(camera.position);
      moonMaterial.opacity =
        THREE.MathUtils.smoothstep(moonDir.y, -0.09, 0.03) *
        (1 - 0.85 * stormIntensity);

      // --- stars: fade in at night, drift very slowly ---
      starsField.position.copy(camera.position);
      starsField.rotation.y += dt * 0.005;
      (starsField.material as THREE.PointsMaterial).opacity =
        moonUp * 0.95 * (1 - stormIntensity);
      (starsBright.material as THREE.PointsMaterial).opacity =
        moonUp * 0.95 * (1 - stormIntensity);

      // --- fog: tint with the sky, thickens at dawn/dusk and in rain ---
      const fog = scene.fog as THREE.FogExp2 | null;
      if (fog) {
        fog.color.copy(skyColor);
        fog.density =
          FOG_DENSITY *
          (1 +
            0.45 * horizonGlow +
            1.15 * stormIntensity +
            0.4 * winterIntensity +
            0.1 * desertIntensity +
            0.2 * redIntensity +
            0.08 * mesaIntensity +
            0.55 * volcanoIntensity +
            0.3 * volcanoGlow +
            0.12 * cherryIntensity +
            0.1 * shroomIntensity);
      }

      // --- clouds: drift + structure morph + day/night tint ---
      clouds.update({
        dt,
        cameraPos: camera.position,
        skyColor,
        lightDir, // rim shading follows the active sun/moon light
        sunUp,
        horizonGlow,
        lightColor: directionalLight.color,
        storm: stormIntensity, // rain cells darken + thicken the deck
        winter: winterIntensity, // frozen biomes bleach the deck icy white
        hot: Math.max(
          desertIntensity,
          redIntensity,
          mesaIntensity
        ), // dusty bake
        ash: volcanoIntensity, // volcano smokes the deck dark
      });
    }

    // ========= GRASSLAND START: player + every ride + BUZZ on the plains =
    // (user request) The old CITY CENTRE START re-anchor is GONE: the base
    // spawn anchor above now sits in the open grassland heartland, so the
    // player, the death respawn, the armored jeep, the NASCAR, the Hot
    // Wheels showroom row and BUZZ all land on the natural green plains —
    // every one of them rides spawnFlat (see the placements above: jeep on
    // the ahead-left offset, NASCAR ahead-right, the fleet row continuing
    // the NASCAR's line, BUZZ booting overhead). First spawn faces the
    // game's original greeting heading over the rolling green; the city
    // road map still generates out west exactly as before — it just isn't
    // the home base any more.

    updateCamera(true, 0);
    updateSky(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    renderer.domElement.style.cursor = 'grab';
    // touch screens: the canvas owns its gestures (no browser scroll/pinch
    // interference while dragging the camera)
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('pointermove', onHoverPointerMove);

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    window.addEventListener('resize', onWindowResize);

    // ================= animation loop =================
    /** Last frame's rAF timestamp — drives the mobile ~30fps frame cap. */
    let lastRenderTime = 0;

    function animate(time?: DOMHighResTimeStamp) {
      // mobile frame cap: the loop still fires at the display rate but we
      // only render every ~33ms — every skipped beat returns CPU AND GPU
      // time to the phone. Skipped frames are NOT simulated: timer deltas
      // simply bridge the gap, so game time (day cycle, physics, tweens)
      // stays wall-clock exact. Desktop is untouched (uncapped).
      if (LOW_SPEC && time !== undefined) {
        if (lastRenderTime !== 0 && time - lastRenderTime < LOW_FRAME_INTERVAL_MS) {
          return;
        }
        lastRenderTime = time;
      }
      timer.update();
      // real wall seconds (mild cap for tab switches) — resources like
      // stamina use this so they behave identically at ANY framerate
      const wallDt = Math.min(timer.getDelta(), 2);
      // physics/animation delta, clamped so a hitch can't teleport anything
      const dt = Math.min(wallDt, 0.1);
      elapsed += dt;

      // --- lobby <-> gameplay phase transitions ---
      if (phaseRef.current !== lastPhase) {
        lastPhase = phaseRef.current;
        keys.clear();
        touchMoveVec.active = false;
        touchMoveVec.x = 0;
        touchMoveVec.y = 0;

        if (driving) exitJeep(); // leaving gameplay always drops you out
        if (flying) exitPlane(); // the cockpit bails the same way
        if (phaseRef.current === 'playing') {
          // deploy: gameplay orbit defaults; the camera sweeps via lobbyBlend
          camYawOffset = 0;
          camPitch = CAM_DEFAULT_PITCH;
          camDistTarget = CAM_DIST;
          camIgnoreClearance = false;
        } else {
          // back to the showcase: hard cut to the frontal framing
          camYawOffset = 0;
          camPitch = LOBBY_PITCH;
          camDistTarget = LOBBY_DIST;
          lobbyBlend = 1;
          setRunSound(false);
          setSnowWalkSound(false);
          oneShot = null;
          attackHeld = false;
        }
      }

      const inLobby = phaseRef.current === 'lobby';

      // lobby turntable: idle character slowly rotates for the showcase
      if (inLobby && deathTimer <= 0) yaw += LOBBY_TURN_SPEED * dt;

      // tween the camera from the lobby framing into the gameplay rig
      if (!inLobby && lobbyBlend > 0) {
        lobbyBlend = Math.max(0, lobbyBlend - dt / LOBBY_BLEND_TIME);
      }

      // --- movement input (keyboard + mobile joystick) ---
      const controlsLocked = deathTimer > 0 || inLobby;
      let moveInput = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) moveInput += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) moveInput -= 1;
      // virtual joystick: analog forward/back while the keys are idle
      if (touchMoveVec.active && moveInput === 0) {
        moveInput = THREE.MathUtils.clamp(touchMoveVec.y, -1, 1);
      }

      // SPRINT: the mobile RUN toggle, or holding Shift while moving forward
      // on the keyboard — forward speed then jumps from WALK_SPEED to
      // RUN_SPEED (backward and turning keep their own pace). Footstep dust,
      // cadence, footprints and the debug HUD all follow the same flag.
      const shiftHeld = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const sprinting = sprintMode || (shiftHeld && moveInput > 0);

      let turnInput = controlsLocked
        ? 0
        : (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) -
          (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      if (!controlsLocked && touchMoveVec.active) {
        turnInput += -touchMoveVec.x; // stick right = turn right
      }

      // night factor (moon up) — feeds BUZZ's + DART's aviation lights and
      // the plane engine mix; declared BEFORE the flight tick so the flying
      // branch can read it (it also still serves the BUZZ brain below)
      const nightF = timeHour < 6.4 || timeHour > 18.6 ? 1 : 0;

      // flying: the same WASD/joystick input flies DART instead of walking
      // — W/S pitch (climb/dive), A/D banked turn, Shift boost, Space bleed;
      // pos/yaw park onto the airframe so the shared orbit camera follows
      if (flying && dartPet) {
        if (controlsLocked) {
          exitPlane(); // death or lobby while airborne — bail out safely
        } else {
          planeInput.pitch = moveInput; // W/Up climbs, S/Down dives (+stick)
          planeInput.steer = THREE.MathUtils.clamp(turnInput, -1, 1);
          planeInput.boost =
            keys.has('ShiftLeft') || keys.has('ShiftRight') || sprintMode;
          planeInput.brake = keys.has('Space');
          planeTelemetry = dartPet.updatePilot(dt, planeInput, surfaceYAt, {
            night: nightF,
          });
          pos.set(
            dartPet.group.position.x,
            dartPet.group.position.y + 26,
            dartPet.group.position.z
          );
          yaw = planeTelemetry.heading;
          // engine note rides the throttle lever (per-frame, resolved handle)
          if (!planeSfx) {
            void getGameAudio().then((sfx) => {
              planeSfx = sfx;
            });
          }
          planeSfx?.setPlaneEngine(true, planeTelemetry.throttle);
          camFollowRate = 9; // tighter chase — the airframe moves fast
        }
      } else if (driving) {
        if (controlsLocked) {
          exitJeep(); // death or lobby while mounted — bail out safely
        } else {
          // whichever rig the driver sits in this session
          const veh = rigOf(vehicle);
          // a dry tank starves the engine — no throttle, brakes still work
          jeepInput.throttle = jeepFuel > 0 ? moveInput : 0;
          jeepInput.steer = THREE.MathUtils.clamp(turnInput, -1, 1);
          jeepInput.brake = keys.has('Space');
          // vehicle-vs-vehicle: every other ride is solid. A driven car
          // resolves bumps inside its drive step (bounce + scrub, and a
          // solid RAM SHOVES the parked ride — momentum transfer); the
          // jeep gets pushed out of each car's footprint directly.
          if (vehicle === 'jeep') {
            for (const r of carRides) {
              const vPush = r.car.collide(
                veh.group.position.x,
                veh.group.position.z,
                215
              );
              if (vPush) {
                veh.group.position.x = vPush.x;
                veh.group.position.z = vPush.z;
              }
            }
          } else {
            rideObs.length = 0;
            for (const r of carRides) {
              if (r.key === vehicle) continue;
              rideObs.push({
                x: r.car.group.position.x,
                z: r.car.group.position.z,
                rotY: r.car.group.rotation.y,
                hw: CAR_HW, // nascarCar COLLIDE_HW (the fleet shares the shell)
                hl: CAR_HL, // nascarCar COLLIDE_HL
                onPush: (dirX: number, dirZ: number, vel: number) =>
                  shoveRide(r.key, dirX, dirZ, vel),
              });
            }
            // the parked jeep is solid too
            rideObs.push({
              x: jeep.group.position.x,
              z: jeep.group.position.z,
              rotY: jeep.group.rotation.y,
              hw: 94, // jeepProp COLLIDE_HW
              hl: 268, // jeepProp COLLIDE_HL
            });
            (veh as NascarCarHandle).setObstacles(rideObs);
          }
          // oasis deep-water gate: the home brim sits right over the pool —
          // starve forward throttle and auto-brake the moment the ground
          // under the vehicle drops more than a block below the waterline.
          // Reverse stays live so you can always back out of the shallows.
          const pool = oasisWater.layout();
          const pdx = veh.group.position.x - pool.x;
          const pdz = veh.group.position.z - pool.z;
          if (
            pdx * pdx + pdz * pdz <
              (pool.radius + 80) * (pool.radius + 80) &&
            surfaceYAt(veh.group.position.x, veh.group.position.z) <
              pool.y - 100
          ) {
            // only the FORWARD push is gated — reverse stays brake-free so
            // the jeep can always back out of the shallows it stopped in
            if (jeepInput.throttle > 0) {
              jeepInput.throttle = 0;
              jeepInput.brake = true;
            }
          }
          const st = veh.updateDrive(dt, jeepInput);
          driveSpeed = st.speed;
          driveDrift = st.drifting;
          // dash telemetry: fuel burns with throttle+speed load and the
          // engine warms toward its load target with slow thermal inertia
          const load = Math.min(
            1,
            Math.abs(jeepInput.throttle) * 0.7 +
              (Math.abs(st.speed) / st.maxSpeed) * 0.5
          );
          jeepFuel = Math.max(
            0,
            jeepFuel - (JEEP_FUEL_IDLE_BURN + load * JEEP_FUEL_LOAD_BURN) * dt
          );
          const targetTemp =
            JEEP_TEMP_AMBIENT + load * (JEEP_TEMP_MAX - JEEP_TEMP_AMBIENT);
          jeepTemp += (targetTemp - jeepTemp) * Math.min(1, dt * 0.22);
          if (jeepFuel <= 0 && !jeepFuelToasted) {
            jeepFuelToasted = true;
            hudBridgeRef.current.lootToast?.(
              'Tank dry! Step out to siphon fuel back'
            );
          }
          // soft one-shot beep the moment the tank crosses into the red
          // (re-arms only after a real refill — never spams while dribbling)
          if (jeepFuel <= JEEP_FUEL_LOW && !jeepBeeped) {
            jeepBeeped = true;
            void getGameAudio().then((sfx) => sfx.lowFuel());
          } else if (jeepFuel > JEEP_FUEL_LOW + 3) {
            jeepBeeped = false;
          }
          // desert surface gates the jeep's drift dust + skid marks to the
          // dunes (the NASCAR smokes anywhere); heat past the gauge's red
          // zone starts steam off the jeep's hood
          veh.setSurface(
            desertFactorWorld(
              veh.group.position.x,
              veh.group.position.z,
              BLOCK,
              GRID_OFFSET
            ) >= 0.5
          );
          veh.setOverheat(
            THREE.MathUtils.clamp(
              (jeepTemp - JEEP_OVERHEAT_START) /
                (JEEP_TEMP_MAX - JEEP_OVERHEAT_START),
              0,
              1
            )
          );
          pos.set(
            veh.group.position.x,
            veh.group.position.y + 24,
            veh.group.position.z
          );
          yaw = st.heading;
        }
      } else {
        yaw += turnInput * TURN_SPEED * dt;
        camFollowRate = 6;
      }

      // parked (or flying): the engine cools off and fuel siphons back into
      // the tank, so stepping out for a moment tops the dash back up
      if (!driving) {
        jeepTemp += (JEEP_TEMP_AMBIENT - jeepTemp) * Math.min(1, dt * 0.15);
        jeep.setOverheat(0); // engine cooling — the steam dies with it
        if (jeepFuel < 100) {
          jeepFuel = Math.min(100, jeepFuel + JEEP_FUEL_REFILL * dt);
          if (jeepFuel >= JEEP_FUEL_LOW) jeepFuelToasted = false;
        }
      }

      const moving =
        moveInput !== 0 && !controlsLocked && !driving && !flying;
      playerMoving = moving; // CONTROL stat reads this in spawnShot

      if (moving && loaded) {
        // unlimited sprint: full speed forever, no stamina cost; the mobile
        // RUN toggle OR holding Shift with a forward key pushes past walk
        // speed (Shift + W / Up = keyboard sprint). A landed spider web
        // multiplies the whole thing down — sticky feet until it dries.
        const speed =
          (moveInput > 0 ? (sprinting ? RUN_SPEED : WALK_SPEED) : BACK_SPEED) *
          (webSnareT > 0 ? WEB_SNARE_SLOW : 1) *
          (shockSlowT > 0 ? CHARGE_SLOW : 1) *
          (swimming || wading ? WATER_SPEED_MULT : 1);
        pos.x += Math.sin(yaw) * speed * dt * moveInput;
        pos.z += Math.cos(yaw) * speed * dt * moveInput;
        // no world-edge clamp any more — the terrain streams in forever
      }

      // --- explosion knockback: integrate + decay the shove ---------------
      // (creeper detonations set kbX/kbZ through launchPlayer)
      if (kbX !== 0 || kbZ !== 0) {
        pos.x += kbX * dt;
        pos.z += kbZ * dt;
        const kbDecay = Math.exp(-3.6 * dt);
        kbX *= kbDecay;
        kbZ *= kbDecay;
        if (Math.abs(kbX) < 2) kbX = 0;
        if (Math.abs(kbZ) < 2) kbZ = 0;
      }

      // --- vehicle proximity: close enough to grab a wheel with E? ---
      if (!driving && !flying) {
        nearRide = null;
        if (phaseRef.current === 'playing' && deathTimer <= 0) {
          let best = JEEP_ENTER_RANGE * JEEP_ENTER_RANGE;
          const probe = (k: RideKey, gx: number, gz: number): void => {
            const dx = gx - pos.x;
            const dz = gz - pos.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < best) {
              best = d2;
              nearRide = k;
            }
          };
          probe('jeep', jeep.group.position.x, jeep.group.position.z);
          for (const r of carRides) {
            probe(r.key, r.car.group.position.x, r.car.group.position.z);
          }
        }
      }

      // --- static prop collision: vehicles are solid while on foot ---
      // push the player capsule out of the oriented footprint so it
      // can't be walked through (also resolves being spawned inside it)
      if (!driving && !flying) {
        const jeepPush = jeep.collide(pos.x, pos.z, 22);
        if (jeepPush) {
          pos.x = jeepPush.x;
          pos.z = jeepPush.z;
        }
        // every car is solid too
        for (const r of carRides) {
          const carPush = r.car.collide(pos.x, pos.z, 22);
          if (carPush) {
            pos.x = carPush.x;
            pos.z = carPush.z;
          }
        }
        // treasure chests are solid too — the skirt-footprint push-out
        // stops the player walking through them (until they sink away)
        const chestPush = chests.collide(pos.x, pos.z, 22, pos.y);
        if (chestPush) {
          pos.x = chestPush.x;
          pos.z = chestPush.z;
        }
        // palm wood is solid — one square block push-out per base block
        // + the trunk column of every coconut palm around the oasis
        // (a box ghosts above its own top face, so the blocks can be
        // jumped onto and stood on — see palms.supportAt in the ground
        // section — and whole trees ghost while flying above the
        // crowns, so the drone jetpack can cross the grove)
        const palmPush = palms.collide(pos.x, pos.z, 22, pos.y);
        if (palmPush) {
          pos.x = palmPush.x;
          pos.z = palmPush.z;
        }
        // pumpkin + melon fruit are solid blocks — one square push-out
        // per fruit stops the player strolling through them (a box
        // ghosts above its own top face, so they can be jumped onto and
        // stood on — see fruitSolid.supportAt in the ground section)
        const fruitPush = fruitSolid.collide(pos.x, pos.z, 22, pos.y);
        if (fruitPush) {
          pos.x = fruitPush.x;
          pos.z = fruitPush.z;
        }
        // fallen coconuts are solid props — a body-circle push-out
        // stops the player strolling through the nuts that dropped
        // around the grove (they ghost above their top face, so one
        // can be hopped over; despawning nuts stop being solid)
        const nutPush = coconutShells.collide(pos.x, pos.z, 22, pos.y);
        if (nutPush) {
          pos.x = nutPush.x;
          pos.z = nutPush.z;
        }
        // crimson Bups are solid wildlife — a body-circle push-out stops
        // the player strolling through them (dead/sinking mobs ghost)
        const mobPush = crimsonMobs?.collide(pos.x, pos.z, 22);
        if (mobPush) {
          pos.x = mobPush.x;
          pos.z = mobPush.z;
        }
        // cherry spiders are solid too (and yield to a moving player
        // exactly like the Bups do)
        const spiderPush = cherrySpiders?.collide(pos.x, pos.z, 22);
        if (spiderPush) {
          pos.x = spiderPush.x;
          pos.z = spiderPush.z;
        }
        // creepers are solid bodies — a circle push-out stops the player
        // strolling through the mossy stalkers (dying/burning ones ghost)
        const creeperPush = creepers?.collide(pos.x, pos.z, 22);
        if (creeperPush) {
          pos.x = creeperPush.x;
          pos.z = creeperPush.z;
        }
        // dodos are solid bodies — a circle push-out stops the player
        // strolling through the wandering flock (dying ones ghost)
        const dodoPush = dodos?.collide(pos.x, pos.z, 22);
        if (dodoPush) {
          pos.x = dodoPush.x;
          pos.z = dodoPush.z;
        }
      }

      // --- footstep dust (alternating left/right foot puffs behind) ---
      if (moving && !airborne && deathTimer <= 0) {
        footAccum += dt;
        if (footAccum >= (sprinting ? 0.21 : 0.28)) {
          footAccum = 0;
          footSide = -footSide; // swap feet every step
          // plant the puff at the foot: one stride back, offset across the
          // view axis to the active foot's side (right vector of yaw)
          const back = sprinting ? 46 : 38;
          const fx =
            pos.x -
            Math.sin(yaw) * back +
            Math.cos(yaw) * footSide * 14;
          const fz =
            pos.z -
            Math.cos(yaw) * back -
            Math.sin(yaw) * footSide * 14;
          if (swimming || wading) {
            // wet footsteps: no dust in the pool — each stride punches
            // its own ripple ring into the wave field instead
            oasisWater.disturb(fx, fz, wading ? 0.1 : 0.16, wading ? 85 : 120);
          } else {
            atmos.footstep(fx, surfaceYAt(fx, fz) + 6, fz, sprinting);
          }
        }
      } else {
        footAccum = 0;
      }

      // --- health regen (after a damage-free grace period) ---
      if (
        deathTimer <= 0 &&
        health < MAX_HEALTH &&
        elapsed - lastDamageAt > HEALTH_REGEN_DELAY
      ) {
        health = Math.min(MAX_HEALTH, health + HEALTH_REGEN_RATE * dt);
      }

      // stream the endless terrain around the traveller: chunks ahead of
      // the movement are meshed, terrain that fell out of sight behind the
      // player is released (both happen inside this single call)
      terrain.update(pos.x, pos.z);
      lavaFlow.update(dt, pos.x, pos.z);
      // wind-sway clock + camera-facing streaming: cells inside the view
      // cone + range load (pooled InstancedMeshes), cells behind/beyond
      // the player unload — only visible grass ever sits in memory
      grassTufts.update(dt, camera);
      // tall layer: same wind clock + cone streaming, its own field
      tallGrass.update(dt, camera);
      // sugar plants: custom 3D clumps on the same streaming machinery
      sugarPlant.update(dt, camera);
      // pumpkin + melon plants: static fruit layers on the same machinery
      pumpkinPlant.update(dt, camera);
      melonPlant.update(dt, camera);
      // interactive branches: live-matrix sync + player bend/snap physics
      fruitBranches.update(dt);
      calderaLava.update(dt, pos.x, pos.z);
      // oasis pool: caustics + sky fresnel ride the live sky/sun state
      oasisWater.update(
        dt,
        (scene.fog as THREE.FogExp2 | null)?.color ?? SKY_DAY,
        directionalLight
      );
      // falling coconuts: ambient drops, solid-body physics, regrows
      coconutShells.update(dt, pos.x, pos.z);

      // --- ground / gravity (plus the oasis swim model) ---
      const groundY = surfaceYAt(pos.x, pos.z);
      // pool probe: on foot, inside the water disc, with the terrain
      // floor below the waterline -> water physics owns the vertical
      const oLay = oasisWater.layout();
      const oDx = pos.x - oLay.x;
      const oDz = pos.z - oLay.z;
      const inPool = oDx * oDx + oDz * oDz < oLay.radius * oLay.radius;
      const poolWater = inPool && groundY < oLay.y - 2; // real water here
      const bodyDepth = oLay.y - pos.y; // feet-to-surface distance
      const waterDepth = oLay.y - groundY; // how deep the pool is here
      // swimming = water too deep to stand in OR the body fully under;
      // wading = a shallow margin where the floor stays reachable
      const swimmingNow =
        !driving &&
        !flying &&
        poolWater &&
        (waterDepth > WADE_DEPTH || bodyDepth > WADE_DEPTH);
      const wadingNow =
        !driving &&
        !flying &&
        poolWater &&
        waterDepth <= WADE_DEPTH &&
        bodyDepth > 6;
      swimming = swimmingNow;
      wading = wadingNow;

      if (driving || flying) {
        // mounted: the jeep already follows the terrain and the plane owns
        // its altitude, so there is no falling, jumping or landing while
        // either vehicle is under you
        airborne = false;
        vy = 0;
        jumpsUsed = 0;
      } else if (swimming) {
        // === BUOYANCY SWIM MODEL ===
        // real-water feel: gravity is weakened, the body's buoyancy
        // pulls it back up, stroke thrust (Space up / Shift dive) and
        // drag fight over the vertical speed, and at the surface a
        // soft spring settles the body into an idle float bob
        airborne = false;
        jumpsUsed = 0;
        const riseHeld = keys.has('Space');
        const restY = oLay.y - FLOAT_SIT_DEPTH;
        if (pos.y < restY - 8 || riseHeld || shiftHeld) {
          vy -= GRAVITY * WATER_GRAVITY * dt;
          if (!shiftHeld) vy += BUOYANCY_ACCEL * dt; // lung buoyancy
          if (riseHeld) vy += SWIM_UP_ACCEL * dt;
          if (shiftHeld) vy -= SWIM_DOWN_ACCEL * dt;
          vy *= Math.exp(-WATER_DRAG * dt);
          vy = THREE.MathUtils.clamp(vy, -430, 640);
          pos.y += vy * dt;
        } else {
          // surface float: gentle spring + damping = the idle bob
          vy += (restY - pos.y) * 13 * dt;
          vy *= Math.exp(-5.2 * dt);
          pos.y += vy * dt;
        }
        // the pan floor is still solid — you can walk out along it
        if (pos.y < groundY) {
          pos.y = groundY;
          if (vy < 0) vy = 0;
        }
      } else if (airborne) {
        vy -= GRAVITY * dt;
        pos.y += vy * dt;
        // palm base blocks are floor too: any block top this frame's
        // fall CROSSED (pre-integration feet were above it) lands the
        // player exactly like the terrain does — the crossing margin
        // (distance fallen this frame + slack) means even a fast drop
        // catches the top instead of tunneling through it. Pumpkin +
        // melon fruit tops are floor the exact same way — a jump onto
        // a fruit lands and STANDS on it.
        const palmTop = palms.supportAt(
          pos.x,
          pos.z,
          pos.y + Math.max(0, -vy) * dt + 2
        );
        const fruitTop = fruitSolid.supportAt(
          pos.x,
          pos.z,
          pos.y + Math.max(0, -vy) * dt + 2
        );
        const landY = Math.max(groundY, palmTop ?? -Infinity, fruitTop ?? -Infinity);
        if (poolWater && vy < -150 && pos.y <= oLay.y - 24) {
          // WATER ENTRY: plunge through the pool surface mid-fall —
          // the water eats the impact (no fall damage), throws splash
          // spray and a crater dip whose rebound rings the whole pool
          const impact = -vy;
          pos.y = Math.max(groundY, oLay.y - 24);
          vy *= 0.3; // the splashdown kills most of the momentum
          airborne = false;
          jumpsUsed = 0;
          oasisWater.splash(pos.x, oLay.y, pos.z, Math.min(1, impact / 950));
        } else if (pos.y <= landY) {
          pos.y = landY;
          const impact = -vy;
          vy = 0;
          airborne = false;
          jumpsUsed = 0; // grounded again — the mid-air double jump refills

          if (impact > FALL_DAMAGE_MIN_SPEED) {
            applyDamage(
              Math.min(
                MAX_HEALTH,
                (impact - FALL_DAMAGE_MIN_SPEED) * FALL_DAMAGE_SCALE
              )
            );
          }

          // dust burst on every real landing, scaled with the impact speed
          // (falls that hurt also billow more)
          if (impact > 240) {
            atmos.landing(pos.x, pos.y, pos.z, impact);
          }
        }
      } else {
        // grounded: ease toward the higher floor — the terrain, a palm
        // base block under the feet, or a pumpkin/melon fruit top
        // (standing on any of them works exactly like standing on the
        // ground; walk off the edge and the floor eases back down)
        const palmTop = palms.supportAt(pos.x, pos.z, pos.y + 2);
        const fruitTop = fruitSolid.supportAt(pos.x, pos.z, pos.y + 2);
        const floorY = Math.max(groundY, palmTop ?? -Infinity, fruitTop ?? -Infinity);
        pos.y += (floorY - pos.y) * Math.min(1, 12 * dt);
      }

      character.root.position.set(pos.x, pos.y + footOffset, pos.z);

      character.root.rotation.y = yaw;

      // advance the in-game clock (full 24h every CYCLE_SECONDS) — the
      // Chronos mod can freeze or accelerate the flow of time
      timeHour =
        (timeHour +
          (24 / CYCLE_SECONDS) *
            (modChronos.enabled ? modChronos.speed : 1) *
            dt) %
        24;

      // --- animation state machine / death sequence ---
      if (deathTimer > 0) {
        deathTimer -= dt;
        if (deathTimer <= 0) respawn();
      } else {
        // hold-to-fire safety net: resume the attack loop after a jump,
        // death or any other interrupt while F is still held
        if (attackHeld && loaded && !airborne && oneShot === null) {
          playAnim('attack', true);
        }
        const desired = oneShot ?? (airborne ? 'jump' : moving ? 'run' : 'stand');
        if (loaded && desired !== currentAnim) {
          playAnim(desired, false);
        }
      }

      character.update(dt);

      // --- camera + sky (sky re-anchors to the final camera position) ---
      updateCamera(false, dt);
      // one shower per in-game day, but WATER RAIN IS GREEN-LAND ONLY:
      // the frozen countries have their own weather (soft snow across the
      // winter biome, harsh sleet on the glacier hearts), so the storm is
      // damped to exactly zero across the biome's soft border and NEVER
      // rains onto snow or ice. The storm CLOUDS still darken the sky
      // everywhere (updateSky keeps the raw front — a grey ceiling over a
      // snowfield with gentle flakes is exactly right); only the
      // precipitation, its audio, its lightning and its puddles are gated.
      // MOD: Chronos weather override — Clear pins a cloudless sky, Storm
      // forces the front at full strength everywhere, Natural keeps the
      // vanilla one-shower-per-day schedule
      const stormIntensity =
        modChronos.enabled && modChronos.weather !== 'natural'
          ? modChronos.weather === 'storm'
            ? 1
            : 0
          : rainIntensityFromHour(timeHour);
      winterIntensity = winterFactorWorld(pos.x, pos.z, BLOCK, GRID_OFFSET);
      iceIntensity = iceFactorWorld(pos.x, pos.z, BLOCK, GRID_OFFSET);
      desertIntensity = desertFactorWorld(pos.x, pos.z, BLOCK, GRID_OFFSET);
      redIntensity = redFactorWorld(pos.x, pos.z, BLOCK, GRID_OFFSET);
      mesaIntensity = mesaFactorWorld(pos.x, pos.z, BLOCK, GRID_OFFSET);
      volcanoIntensity = volcanoFactorWorld(pos.x, pos.z, BLOCK, GRID_OFFSET);
      cherryIntensity = cherryFactorWorld(pos.x, pos.z, BLOCK, GRID_OFFSET);
      shroomIntensity = shroomFactorWorld(pos.x, pos.z, BLOCK, GRID_OFFSET);
      crimsonIntensity = crimsonFactorWorld(pos.x, pos.z, BLOCK, GRID_OFFSET);
      goldenIntensity = goldenFactorWorld(pos.x, pos.z, BLOCK, GRID_OFFSET);
      // HOT-CLIMATE FEEL GATE: natural snow countries can still roll next
      // to natural hot countries in the far ring (terrain priority keeps
      // the GROUND correct — sand/basalt beat snow) — so the snowfall,
      // icy sky tint, footprints and crunch audio all fade out across the
      // hot border and the climate FEEL always matches the ground too
      const hot = Math.max(
        desertIntensity,
        redIntensity,
        mesaIntensity,
        volcanoIntensity
      );
      const hotKill = 1 - THREE.MathUtils.smoothstep(hot, 0.3, 0.6);
      // TEMPERATE-CLIMATE FEEL GATE: the wild biomes (cherry / shroom)
      // are gentle rain-friendly countries — the frozen weather
      // (snowfall, ice sleet, snow footprints, crunch audio) fades out
      // across their soft borders so the climate FEEL always matches the
      // ground priority (snow beats them in the bucket chain, so wherever
      // real snow owns the ground the winter factor wins there instead)
      const wild = Math.max(
        cherryIntensity,
        shroomIntensity,
        crimsonIntensity,
        goldenIntensity
      );
      const wildKill = 1 - THREE.MathUtils.smoothstep(wild, 0.3, 0.6);
      const winterFx = winterIntensity * hotKill * wildKill;
      const iceFx = iceIntensity * hotKill * wildKill;
      winterFxVal = winterFx;
      iceFxVal = iceFx;
      const frozen = Math.max(winterFx, iceFx);
      // full pour on clearly-green ground, faded to exactly zero by the
      // time the ground reads as snow (factor ~0.5), glacier ice — or any
      // of the hot biomes: the dune seas, the badlands and the volcano
      // ash-fields all keep their own dry climates, so storms passing
      // overhead never rain onto them either
      rainIntensity =
        stormIntensity *
        (1 - THREE.MathUtils.smoothstep(frozen, 0.3, 0.6)) *
        (1 - THREE.MathUtils.smoothstep(desertIntensity, 0.3, 0.6)) *
        (1 - THREE.MathUtils.smoothstep(redIntensity, 0.3, 0.6)) *
        (1 - THREE.MathUtils.smoothstep(mesaIntensity, 0.3, 0.6)) *
        (1 - THREE.MathUtils.smoothstep(volcanoIntensity, 0.3, 0.6));
      rain.update(dt, pos, rainIntensity);
      // winter biomes carry their own weather: soft SNOW falls across the
      // whole frozen country (factor fades at the soft border, so the
      // snowfall swells as you cross the snow line), while the harsher ice
      // sleet pours only over the blue glacier hearts inside it
      snowRain.update(dt, pos, winterFx);
      iceRain.update(dt, pos, iceFx);
      // volcano embers + ash plume + the 3D sky zone sign: the ember
      // swarm rises wherever the ash factor says so, the stratovolcano's
      // plume smokes over the nearest crater, and when the player has
      // truly settled into a biome (0.7s stability against border
      // wobble) the sky raises its name in giant block letters
      embers.update(dt, pos, volcanoIntensity);
      plume.update(dt, pos.x, pos.z);
      const vNear = nearestVolcanoWorld(pos.x, pos.z, BLOCK, GRID_OFFSET);
      volcanoGlow = vNear.has ? vNear.glow : 0;
      const zoneId =
        volcanoIntensity > 0.5
          ? 'volcano'
          : mesaIntensity > 0.5
            ? 'badlands'
            : redIntensity > 0.5
              ? 'reddesert'
              : shroomIntensity > 0.5
                ? 'shroom'
                : crimsonIntensity > 0.5
                  ? 'crimson'
                  : goldenIntensity > 0.5
                    ? 'golden'
                    : cherryIntensity > 0.5
                      ? 'cherry'
                      : desertIntensity > 0.5
                        ? 'desert'
                        : winterIntensity > 0.5 || iceIntensity > 0.5
                          ? 'winter'
                          : 'grass';
      if (zoneId !== pendingZoneId) {
        pendingZoneId = zoneId;
        zoneStableT = 0;
      } else if (zoneId !== currentZoneId) {
        zoneStableT += dt;
        if (zoneStableT >= 0.7) {
          currentZoneId = zoneId;
          const sign = ZONE_SIGNS[zoneId];
          if (sign) skyText.show(sign.label, sign.color);
        }
      }
      skyText.update(dt, camera);
      // boot prints in the snow: only while genuinely walking on frozen
      // ground (never airborne, never while driving, never in the lobby) —
      // the system itself re-checks the snow under each individual foot
      footprints.update(
        dt,
        pos.x,
        pos.z,
        yaw,
        winterFx,
        moving && !airborne && deathTimer <= 0 && !controlsLocked,
        sprinting
      );
      // glide the atmosphere factors toward the raw world values (frame-
      // rate independent exponential ease — see BIOME_ATMOS_TAU above),
      // then let the sky/fog/clouds drink the SMOOTHED look
      const atmosEase = 1 - Math.exp(-dt / BIOME_ATMOS_TAU);
      easeWinter += (winterFx - easeWinter) * atmosEase;
      easeDesert += (desertIntensity - easeDesert) * atmosEase;
      easeRed += (redIntensity - easeRed) * atmosEase;
      easeMesa += (mesaIntensity - easeMesa) * atmosEase;
      easeVolcano += (volcanoIntensity - easeVolcano) * atmosEase;
      easeCherry += (cherryIntensity - easeCherry) * atmosEase;
      easeShroom += (shroomIntensity - easeShroom) * atmosEase;
      easeCrimson += (crimsonIntensity - easeCrimson) * atmosEase;
      easeGolden += (goldenIntensity - easeGolden) * atmosEase;
      updateSky(
        dt,
        stormIntensity,
        easeWinter,
        easeDesert,
        easeRed,
        easeMesa,
        easeVolcano,
        volcanoGlow,
        easeCherry,
        easeShroom
      );

      // atmosphere drama: lightning / meteors, driven by
      // the same sky state the renderer just used
      atmos.update(dt, {
        camera,
        playerPos: pos,
        sunDir,
        sunUp: THREE.MathUtils.smoothstep(sunDir.y, -0.04, 0.16),
        moonUp: THREE.MathUtils.smoothstep(moonDir.y, -0.04, 0.16),
        storm: rainIntensity,
      });
      // the same frame's lightning state lights the cloud deck from within
      // (strike-cell bloom + sheet flicker — see skyClouds.applyFlash)
      clouds.applyFlash(atmos.cloudFlash());

      // game audio: rain loop follows the storm, the night wind loop fades in
      // with the moon (same smoothstep as the sky driver's moonUp); the mute
      // toggle also silences the running footsteps (plain HTMLAudioElement),
      // and the LOBBY HOLD silences ALL game sound while the full-screen
      // lobby is open — only the lobby soundtrack plays there
      const sfx = soundRef.current;
      if (sfx) {
        const audioGate = sfx.isMuted() || sfx.isSuspended();
        sfx.setRain(rainIntensity);
        sfx.setNight(THREE.MathUtils.smoothstep(moonDir.y, -0.04, 0.16));
        // TWO surface footsteps, strictly one terrain each — the same
        // winter factor under the boots drives both loops in opposite
        // directions so they crossfade across the soft snow line:
        //   winterIntensity <= 0.3  ->  forest boot-loop only (grass)
        //   winterIntensity >= 0.6  ->  snow crunch only (deep snow)
        //   in between              ->  a short crossfade at the border
        // (0.3 is the same gate the footprint system uses, so steps and
        // sound always agree); the mute toggle silences both loops.
        const snowAudible = THREE.MathUtils.clamp(
          (winterFx - 0.3) / 0.3,
          0,
          1
        );
        const grassAudible = 1 - snowAudible;

        // grass footsteps: full on green ground, faded to silence by the
        // time the ground reads as snow
        const runVol = audioGate ? 0 : RUN_SOUND_VOLUME * grassAudible;
        if (runSound.volume !== runVol) runSound.volume = runVol;
        setRunSound(
          loaded &&
            moving &&
            !airborne &&
            deathTimer <= 0 &&
            !controlsLocked &&
            runVol > 0.001
        );

        // snow-walk crunch: the mirrored half — 0 at the soft border, full
        // on deep snow (below the 0.3 gate nothing plays at all)
        const snowVol = audioGate ? 0 : SNOW_WALK_VOLUME * snowAudible;
        if (snowWalkSound.volume !== snowVol) snowWalkSound.volume = snowVol;
        setSnowWalkSound(
          loaded &&
            moving &&
            !airborne &&
            deathTimer <= 0 &&
            !controlsLocked &&
            snowVol > 0.001
        );

        // tyre screech: the on/off gate follows the jeep's drift state
        // exactly (skid marks + smoke = audible screech, one source of
        // truth); the mute toggle and the lobby hold silence it too
        const screechVol = audioGate ? 0 : TIRE_SCREECH_VOLUME;
        if (screechSound.volume !== screechVol)
          screechSound.volume = screechVol;
        setScreechSound(driving && driveDrift && screechVol > 0.001);
      }
      // puddles GROW slowly while it pours and dry slowly after (sky colour
      // + sun drive their look; fog colour is re-synced inside updateSky)
      const fog = scene.fog as THREE.FogExp2 | null;
      water.update(
        dt,
        rainIntensity,
        fog ? fog.color : SKY_DAY,
        directionalLight,
        pos.x,
        pos.z
      );

      // loot chests: ambient bob everywhere; opening is click/tap-driven
      // (openAtRay) and the visuals run in every phase
      chests.update(
        dt,
        pos.x,
        pos.y,
        pos.z,
        phaseRef.current === 'playing' && deathTimer <= 0
      );

      // --- gpgpu birds: parrot loners (flight box follows the player) ---
      // PARROT CLIMATE GATE: parrots are tropical — they fly EVERYWHERE
      // except the snow biome. The same frozen feel factor that drives
      // the snowfall/ice weather (raw world factor, so the gate tracks
      // the ground under the boots) removes the flock across the soft
      // border (0.3 -> 0.6); the flock's own ~1.5s presence glide turns
      // that gate into a smooth shrink/return instead of a pop.
      parrots.setCenter(pos.x, pos.y, pos.z);
      parrots.update(dt, 1 - THREE.MathUtils.smoothstep(frozen, 0.3, 0.6));

      // --- crimson wildlife: the Bup herd thinks/walks/spawns here — the
      // manager itself gates every spawn on the crimson factor, so no mob
      // can ever exist outside the red fields
      crimsonMobs?.update(dt, pos);

      // --- cherry spider web snare: tick the cocoon shell ----------------
      // Silk daylight dimming: additive web glow reads blown-out against a
      // bright sky, so under the sun every strand/halo fades toward ~40%
      // opacity and back to full luminous light at dusk/night. Shared by
      // the thrown globs (via setWebDayLight) and the catch cocoon here.
      const webDayLight =
        1 - 0.6 * THREE.MathUtils.smoothstep(sunDir.y, -0.04, 0.16);
      cherrySpiders?.setWebDayLight(webDayLight);
      if (webSnareT > 0) webSnareT = Math.max(0, webSnareT - dt);
      if (shockSlowT > 0) shockSlowT = Math.max(0, shockSlowT - dt);
      if (webCocoon) {
        const show = webSnareT > 0 && !driving && !flying;
        // the silk wrap blooms on and melts off — same silk, same light
        if (show) webCocoonBloom = Math.min(1, webCocoonBloom + dt * 5.5);
        else webCocoonBloom = Math.max(0, webCocoonBloom - dt * 4.5);
        webCocoon.visible = webCocoonBloom > 0.001;
        if (webCocoon.visible) {
          webCocoon.position.set(pos.x, pos.y + 95, pos.z);
          webCocoon.rotation.y += dt * 0.7;
          const bloom = 1 - Math.pow(1 - webCocoonBloom, 3);
          webCocoon.scale.setScalar(0.45 + 0.55 * bloom);
          for (let i = 0; i < webCocoonMats.length; i++)
            webCocoonMats[i].opacity = webCocoonBase[i] * bloom * webDayLight;
        }
      }

      // --- cherry wildlife: the spider pack hunts here — spawns are
      // cherry-gated inside the manager, and its bites land through
      // the damagePlayer callback wired at mount
      cherrySpiders?.update(dt, pos);

      // --- grassland nights: the creeper pack — biome+night gated inside
      // the manager; explosions land damage through applyDamage, shake
      // through camShake and the boom/hiss through the synth cues.
      // stormF feeds the CHARGED hunt: after the update, the pack's
      // queued lightning request is routed into the atmosphere module so
      // a REAL bolt lands on the requester (its onStrike does the charging)
      creepers?.update(dt, pos, yaw, nightF, rainIntensity);
      const strikeReq = creepers?.takeStrikeRequest();
      if (strikeReq) atmos.strikeAt(strikeReq.x, strikeReq.z);

      // --- grassland nights: the bone archers — biome+night gated inside
      // the manager; arrows land damage through applyDamage, knockback
      // through launchPlayer and the thwip/thud through the synth cues
      skeletons?.update(dt, pos, yaw, nightF);

      // --- island wildlife: the dodo flock — spawns DAY and NIGHT inside
      // the manager; wander/peck/flee brains ride the terrain and stay
      // solid to the player through the collide() push-out
      dodos?.update(dt, pos);

      // --- bullets: fly, spark, smoke ---
      bullets.update(dt, camera);

      // BUZZ weapons: manual aim point = the ground ~430 ahead of the
      // facing (the STRAFE order G key / touch streams the chin gun onto it)
      droneAim.set(
        pos.x + Math.sin(yaw) * 430,
        0,
        pos.z + Math.cos(yaw) * 430
      );
      droneAim.y = surfaceYAt(droneAim.x, droneAim.z);
      // --- BUZZ AUTONOMOUS ENGAGEMENT (droneAi.ts) ---
      // The brain decides everything itself: it scans for the live enemy
      // squad, locks one, flies an attack orbit around it, pivots once
      // parked, bursts the chin gun with lead + spread, RUNS A LOCK and
      // drops a HOMING wing-pod rocket when its own cadence and range
      // gates say so, breaks off after every kill (or when its hull runs
      // low) and always comes home on its own. Manual orders (G held /
      // H tap) override the AI's trigger only — the AI keeps flying.
      // BUZZ only thinks/flies while its PET-panel deploy toggle is ON —
      // stood down, the airframe freezes invisible and the HUD chip flips
      // to STANDBY (the AI brain stops scanning, guns go cold).
      let aiState = 'STANDBY';
      if (deployed.buzz) {
        const aiOrder = droneAi.tick({
          dt,
          dronePos: petDrone.group.position,
          droneYaw: petDrone.group.rotation.y,
          playerPos: pos,
          nowS: performance.now() / 1000,
          lastKillAt,
          buzzHull,
          heightAt: surfaceYAt,
          dummies: threats,
        });
        aiState = aiOrder.state;
        let droneCombatTarget: THREE.Vector3 | null = null;
        if (aiOrder.pivotTo) {
          droneCombatTarget = droneCombatAim.copy(aiOrder.pivotTo);
        }
        if (deathTimer <= 0 && (keys.has('KeyG') || droneGunHeld)) {
          petDrone.fireGun(droneAim); // manual override streams at the facing
        } else if (deathTimer <= 0 && phaseRef.current === 'playing' && loaded) {
          if (aiOrder.missileAim && petDrone.missilesLoaded() > 0) {
            // the launch order carries the target id — the rocket flies
            // HOMING with a live tracker onto whatever the brain designated
            const tid = aiOrder.missileTargetId;
            const tracker = tid === null ? undefined : makeThreatTracker(tid);
            petDrone.launchMissile(
              aiOrder.missileAim,
              tracker ? { tracker } : undefined
            );
          }
          if (aiOrder.fireAim) {
            petDrone.fireGun(aiOrder.fireAim); // rate-limited inside
          }
        }

        // hull: formation time repairs BUZZ; fighting chews it (see onAirHit)
        if (aiOrder.state !== 'ENGAGE') {
          buzzHull = Math.min(100, buzzHull + 9 * dt);
        }

        // pet drone: one tick of the companion brain (spring flight,
        // banking, rotors, lights; headlights fade in with nightFactor).
        // droneCombatTarget makes a parked BUZZ pivot toward its mark and
        // aiOrder.flightOverride flies the attack orbit while engaging —
        // through the exact same spring/heading/banking/terrain-glide code
        // as the formation slot.
        petDrone.update(dt, pos, yaw, {
          night: nightF,
          combatTarget: droneCombatTarget ?? undefined,
          flightOverride:
            deathTimer <= 0 && phaseRef.current === 'playing'
              ? (aiOrder.flightOverride ?? undefined)
              : undefined,
        });
      }

      // DART (deploy toggle): a real plane's follow flight around the
      // player's ground point — the pursuit brain integrates the airframe
      // along its own nose (nose always == travel direction, no sliding),
      // banks only into actual turns, holds altitude with an own-position
      // + look-ahead terrain floor, and speeds up with the gap so it
      // chases you down when you run. While the player is at the sticks
      // this brain rests: updatePilot flies the airframe instead.
      if (deployed.dart && dartPet?.group.visible && !flying) {
        dartCruise.set(pos.x, surfaceYAt(pos.x, pos.z) + 50, pos.z);
        dartPet.update(dt, dartCruise, { night: nightF, heightAt: surfaceYAt });
      }

      // SPARK (deploy toggle): one tick of the follow brain + animation
      // mixer — walks/runs beside you, jumps and punches when you do, and
      // plays Death when you fall (reviving with your respawn).
      if (deployed.robot && robotPet?.group.visible) {
        robotPet.update(dt, pos, yaw);
        if (deathTimer > 0) robotPet.playDeath();
        else robotPet.revive();
      }

      // SPOT (deploy toggle): the quadruped trots the same formation
      // slot as SPARK — procedural gait rides its measured speed, it
      // waves its back arm when you open fire and hops when you jump.
      if (deployed.spot && spotPet?.group.visible) {
        spotPet.update(dt, pos, yaw);
      }

      // WIDOW (deploy toggle): the spider crawls the formation slot —
      // planted-foot IK gait, threat display on gunfire, hop on jump,
      // and it curls its legs when you go down (reviving with you).
      if (deployed.spider && spiderPet?.group.visible) {
        spiderPet.update(dt, pos, yaw);
        if (deathTimer > 0) spiderPet.playDeath();
        else spiderPet.revive();
      }

      // WIDOW's silk: one tick of every live web strand — the mouth end
      // follows the spider while it's deployed, otherwise strands detach
      // and fall naturally. Runs every phase so strands finish dying.
      if (deployed.spider && spiderPet?.group.visible) {
        const sw = spiderPet.group.rotation.y;
        spiderMouth.set(
          spiderPet.group.position.x + Math.sin(sw) * 46,
          spiderPet.group.position.y + 62,
          spiderPet.group.position.z + Math.cos(sw) * 46
        );
        spiderWebs.update(dt, spiderMouth);
      } else {
        spiderWebs.update(dt, null);
      }

      // jeep exhaust smoke keeps fading even while unmounted
      jeep.updateFx(dt);
      // every car's tyre smoke + skid marks keep fading too
      for (const r of carRides) r.car.updateFx(dt);

      // rammed parked rides keep sliding briefly (momentum transfer) —
      // ground-following and kept clear of the other rides while they do
      for (const r of carRides) {
        if (r.key === vehicle) continue;
        const sv = slideVel.get(r.key);
        if (!sv) continue;
        const mag = Math.hypot(sv.x, sv.z);
        if (mag < 2) continue;
        r.car.group.position.x += sv.x * dt;
        r.car.group.position.z += sv.z * dt;
        r.car.group.position.y = surfaceYAt(
          r.car.group.position.x,
          r.car.group.position.z
        );
        const blocked = jeep.collide(
          r.car.group.position.x,
          r.car.group.position.z,
          200
        );
        if (blocked) {
          r.car.group.position.x = blocked.x;
          r.car.group.position.z = blocked.z;
          sv.x = 0;
          sv.z = 0;
        }
        for (const o of carRides) {
          if (o.key === r.key) continue;
          const hit = o.car.collide(
            r.car.group.position.x,
            r.car.group.position.z,
            200
          );
          if (hit) {
            r.car.group.position.x = hit.x;
            r.car.group.position.z = hit.z;
            sv.x = 0;
            sv.z = 0;
          }
        }
        const decay = Math.exp(-2.6 * dt);
        sv.x *= decay;
        sv.z *= decay;
        if (Math.hypot(sv.x, sv.z) < 2) {
          sv.x = 0;
          sv.z = 0;
        }
      }

      // double-jump air rings expand + fade (jumpRing.ts)
      jumpRings.update(dt);

      renderer.render(scene, camera);

      // --- debug info ---
      charBox.setFromObject(character.root);
      debug.loaded = loaded;
      debug.animation = currentAnim;
      debug.moving = moving;
      debug.airborne = airborne;
      debug.x = pos.x;
      debug.y = pos.y;
      debug.z = pos.z;
      debug.charMinY = Math.round(charBox.min.y);
      debug.charMaxY = Math.round(charBox.max.y);
      debug.timeOfDay = timeHour;
      debug.webbed = webSnareT > 0;
      debug.shocked = shockSlowT > 0;
      debug.drivingJeep = driving;
      debug.jeepFuel = Math.round(jeepFuel);
      debug.jeepTemp = Math.round(jeepTemp);
      debug.stamina = Math.round(stamina);
      debug.exhausted = false; // stamina system removed: never decreases
      debug.sprint = sprinting;
      debug.touchMove = touchMoveVec.active;
      debug.phase = phaseRef.current;
      // --- driving HUD: dash gauges + enter hint (direct DOM writes, no
      // React re-render per frame — the gauge cluster flushes at ~12 Hz) ---
      if (driveHudRef.current) {
        const mode =
          driving ? 'drive' : nearRide ? 'enter' : 'hidden';
        if (mode !== driveHudMode) {
          driveHudMode = mode;
          // seated at the wheel: swap the chip for the full dash cluster
          jeepGaugesRef.current?.setVisible(mode === 'drive');
          driveHudRef.current.style.display =
            mode === 'enter' ? 'flex' : 'none';
          if (driveHudModeRef.current) {
            driveHudModeRef.current.textContent = 'PRESS E TO DRIVE';
          }
        }
        if (driving) {
          // live dash telemetry — the handle throttles React flushes
          jeepGaugesRef.current?.update(
            Math.abs(driveSpeed) * 0.09,
            jeepFuel,
            jeepTemp
          );
        }
      }

      // --- flight HUD: DART airspeed + altitude + board hint (DOM writes,
      // no React re-render per frame — same pattern as the drive HUD) ---
      if (flightHudRef.current) {
        // 'fly' = at the sticks; 'board' = playing, alive, on foot with
        // DART deployed; hidden otherwise (jeep, standby, lobby, death)
        const mode = flying
          ? 'fly'
          : deployed.dart &&
              !driving &&
              phaseRef.current === 'playing' &&
              deathTimer <= 0
            ? 'board'
            : 'hidden';
        if (mode !== flightHudMode) {
          flightHudMode = mode;
          flightHudRef.current.style.display =
            mode === 'hidden' ? 'none' : 'flex';
          const gaugeRow = flightSpeedRef.current?.parentElement;
          if (gaugeRow) {
            gaugeRow.style.display = mode === 'fly' ? 'flex' : 'none';
          }
          if (flightHudModeRef.current) {
            flightHudModeRef.current.textContent =
              mode === 'fly'
                ? 'W/S CLIMB · A/D TURN · SHIFT BOOST · SPACE SLOW · E HOP OUT'
                : 'B — FLY DART';
          }
        }
        if (flying && planeTelemetry) {
          if (flightSpeedRef.current) {
            flightSpeedRef.current.textContent = String(
              Math.round(planeTelemetry.speed * 0.09)
            );
          }
          if (flightAltRef.current) {
            flightAltRef.current.textContent = String(
              Math.round(planeTelemetry.altitude * 0.09)
            );
          }
        }
      }

      // dragon HUD: health + stamina pushed straight to the DOM every frame
      healthBarRef.current?.update(
        health,
        MAX_HEALTH,
        stamina,
        MAX_STAMINA,
        deathTimer > 0
      );

      // BUZZ AI chip: brain state + hull (or STANDBY while stood down),
      // direct DOM write with a cached string so identical frames never
      // touch the DOM
      if (droneHudRef.current) {
        const chip = deployed.buzz
          ? `AI ${aiState} · HULL ${Math.round(buzzHull)}%`
          : 'STANDBY · DEPLOY FROM PET PANEL';
        if (chip !== lastDroneHud) {
          lastDroneHud = chip;
          droneHudRef.current.textContent = chip;
        }
      }

      // BUZZ voice-link chip: link state + heard + reply, same cached-
      // string DOM-write pattern (the callbacks only flip plain lets).
      // The state line flips to HEARING YOU the instant the VAD gate
      // opens — visible feedback BEFORE the transcript exists — and the
      // little bar under it is a live mic level (transform-only write).
      if (voiceHudStateRef.current) {
        const st = voice.status();
        const label =
          voiceState === 'thinking'
            ? 'UNDERSTANDING…'
            : voiceState === 'listening' && st.speechOpen
              ? 'HEARING YOU…'
              : voiceState === 'listening'
                ? 'LISTENING · SAY A COMMAND'
                : 'VOICE OFF · PRESS V';
        if (label !== lastVoiceState) {
          lastVoiceState = label;
          voiceHudStateRef.current.textContent = label;
        }
      }
      if (voiceMeterRef.current) {
        const lvl = voice.meter();
        if (Math.abs(lvl - lastVoiceLevel) > 0.02) {
          lastVoiceLevel = lvl;
          voiceMeterRef.current.style.transform = `scaleX(${Math.max(
            0.04,
            lvl
          ).toFixed(3)})`;
        }
      }
      if (voiceHeard !== lastVoiceHeard && voiceHudHeardRef.current) {
        lastVoiceHeard = voiceHeard;
        voiceHudHeardRef.current.textContent = voiceHeard;
      }
      if (voiceReply !== lastVoiceReply && voiceHudReplyRef.current) {
        lastVoiceReply = voiceReply;
        voiceHudReplyRef.current.textContent = voiceReply;
      }

      // minimap: player-centred north-up map pushed every frame (canvas 2D,
      // zero React re-renders — same pattern as the health bar)
      minimapRef.current?.update(pos.x, pos.z, yaw);

      // world route guide: GPS chevrons on the road decks + destination
      // beacon (rebuilt when the minimap plans/re-routes a route)
      cityRouteGuideTick(elapsed, dt);

      // --- loadout mirror for the LOBBY pickers: publishes on change only.
      //     The in-game view itself is completely UI-free. weaponRackIndex
      //     may be a forged-variant row (>= WEAPONS.length). ---
      if (skinIndex !== publishedSkin || weaponRackIndex !== publishedWeapon) {
        publishedSkin = skinIndex;
        publishedWeapon = weaponRackIndex;
        hudBridgeRef.current.publish?.({
          skinIndex,
          weaponIndex: weaponRackIndex,
        });
      }
    }

    renderer.setAnimationLoop(animate);

    // ================= cleanup =================
    return () => {
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);

      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointermove', onHoverPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);

      renderer.setAnimationLoop(null);

      setRunSound(false);
      runSound.pause();
      runSound.src = '';
      delete (window as unknown as { __runSound?: HTMLAudioElement }).__runSound;
      setSnowWalkSound(false);
      snowWalkSound.pause();
      snowWalkSound.src = '';
      delete (window as unknown as {
        __snowWalkSound?: HTMLAudioElement;
      }).__snowWalkSound;
      setScreechSound(false);
      screechSound.pause();
      screechSound.src = '';
      delete (window as unknown as {
        __tireScreech?: HTMLAudioElement;
      }).__tireScreech;

      apiRef.current = null;
      delete (window as unknown as { __gameApi?: GameApi }).__gameApi;

      // pets: free the lazily-created DART airframe + SPARK robot rig
      dartPet?.dispose();
      dartPet = null;
      robotPet?.dispose();
      robotPet = null;
      spotPet?.dispose();
      spotPet = null;
      spiderPet?.dispose();
      spiderPet = null;
      crimsonMobs?.dispose();
      crimsonMobs = null;
      delete (window as unknown as { __mobs?: object }).__mobs;
      cherrySpiders?.dispose();
      cherrySpiders = null;
      delete (window as unknown as { __spiders?: object }).__spiders;
      creepers?.dispose();
      creepers = null;
      delete (window as unknown as { __creepers?: object }).__creepers;
      skeletons?.dispose();
      skeletons = null;
      delete (window as unknown as { __skeletons?: object }).__skeletons;
      dodos?.dispose();
      dodos = null;
      delete (window as unknown as { __dodos?: object }).__dodos;
      spiderWebs.dispose();
      if (webCocoon) {
        webCocoon.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.geometry.dispose();
        });
        for (const m of webCocoonMats) m.dispose();
        webCocoonTex?.dispose();
        webCocoonTex = null;
        scene.remove(webCocoon);
        webCocoon = null;
      }

      terrainHandleRef.current = null;
      setTerrainReady(false);

      touchApiRef.current = null;
      delete (window as unknown as { __touchApi?: TouchGameApi }).__touchApi;

      voice.dispose();
      voiceToggleRef.current = null;
      voiceInjectRef.current = null;
      delete (window as unknown as { __voice?: object }).__voice;
      if (radioCtx) {
        void radioCtx.close().catch(() => undefined);
        radioCtx = null;
      }

      character.mixer?.stopAllAction();
      const meshes = [character.meshBody, ...character.weapons];
      for (const mesh of meshes) {
        if (!mesh) continue;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const lambert = mat as THREE.MeshLambertMaterial;
          lambert.map?.dispose();
          lambert.dispose();
        }
      }
      for (const skin of [...character.skinsBody, ...character.skinsWeapon]) {
        skin.dispose();
      }
      scene.remove(character.root);

      petDrone.dispose();

      // free the remaining scene systems — each exposes dispose() and was
      // previously left alive on unmount (leaking geometry/materials/GPU
      // buffers on every HMR reload); behavior is unchanged because these
      // are re-created fresh on every mount
      jeep.dispose();
      for (const r of carRides) r.car.dispose();
      iceRain.dispose();
      snowRain.dispose();
      footprints.dispose();
      jumpRings.dispose();
      lavaFlow.dispose();
      calderaLava.dispose();
      oasisWater.dispose();
      coconutShells.dispose();
      city.dispose();

      terrain.dispose();
      scene.remove(sunMesh);
      sunMesh.geometry.dispose();
      sunMaterial.map?.dispose();
      sunMaterial.dispose();

      scene.remove(moonMesh);
      moonMesh.geometry.dispose();
      moonMaterial.map?.dispose();
      moonMaterial.dispose();

      scene.remove(starsField);
      starsField.geometry.dispose();
      (starsField.material as THREE.PointsMaterial).dispose();
      starsBright.geometry.dispose();
      (starsBright.material as THREE.PointsMaterial).dispose();
      starSprite.dispose();
      timer.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }

      parrots.dispose(); // also removes window.__parrots
      rain.dispose();
      delete (window as unknown as { __rain?: object }).__rain;
      bullets.dispose();
      delete (window as unknown as { __bullets?: object }).__bullets;
      water.dispose();
      delete (window as unknown as { __water?: object }).__water;
      atmos.dispose();
      delete (window as unknown as { __atmos?: object }).__atmos;
      chests.dispose();
      delete (window as unknown as { __chests?: object }).__chests;
      delete (window as unknown as { __cheats?: object }).__cheats;

      embers.dispose();
      delete (window as unknown as { __embers?: object }).__embers;
      plume.dispose();
      skyText.dispose();
      delete (window as unknown as { __zones?: object }).__zones;

      // release the remaining window debug handles — they were keeping the
      // disposed systems' closure graphs reachable from window after unmount
      delete (window as unknown as { __jeep?: object }).__jeep;
      delete (window as unknown as { __iceRain?: object }).__iceRain;
      delete (window as unknown as { __snowRain?: object }).__snowRain;
      delete (window as unknown as { __footprints?: object }).__footprints;
      delete (window as unknown as { __jumpRings?: object }).__jumpRings;
      delete (window as unknown as { __terrain?: object }).__terrain;
      delete (window as unknown as { __petDrone?: object }).__petDrone;
      delete (window as unknown as { __plane?: object }).__plane;
      delete (window as unknown as { __winter?: object }).__winter;
      delete (window as unknown as { __desert?: object }).__desert;
      delete (window as unknown as { __robotPet?: object }).__robotPet;
      delete (window as unknown as { __spotPet?: object }).__spotPet;
      delete (window as unknown as { __spiderPet?: object }).__spiderPet;
      delete (window as unknown as { __webs?: object }).__webs;
      delete (window as unknown as { __perf?: object }).__perf;

      clouds.dispose();
      delete (window as unknown as { __clouds?: object }).__clouds;
      scene.fog = null;

      delete (window as unknown as { __player?: PlayerDebugInfo }).__player;
      delete (window as unknown as { __char?: MD2Character }).__char;
      delete (window as unknown as {
        __dayNight?: {
          hour(): number;
          setHour(hour: number): void;
          sunHeight(): number;
          sunDir(): number[];
          moonDir(): number[];
          aim(dx: number, dy: number, dz: number): void;
        };
      }).__dayNight;
    };
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#bfd1e5]">
      <div ref={containerRef} className="absolute inset-0" />


      {/* ================= LOBBY dashboard overlay ================= */}
      {phase === 'lobby' && (
        <div className="pointer-events-none absolute inset-0 z-10 select-none">
          {/* readability scrims over the 3D showcase */}
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-zinc-950/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-zinc-950/70 to-transparent" />

          {/* LEFT HALF HEADER — one sharp-cornered glass bar welded to the
              top-left corner of the screen: player profile | divider | coin
              balance with "+". Top edge touches the viewport top and the
              left edge touches the viewport left; corners are square and
              the bottom-right corner is chamfer-cut starting from the
              centre of the right edge. sm+ gets exactly the left half
              (RATFIRE logo owns the right); phones get a compact bar capped
              short of the logo/buttons and drop the COINS label + "+" so
              the count stays readable. */}
          <header
            aria-label="Player header"
            className="pointer-events-auto absolute left-0 top-0 flex w-[calc(100%-8.5rem)] items-center gap-2.5 border border-amber-400/40 bg-zinc-950/70 py-2 pl-3 pr-2 shadow-xl backdrop-blur-md sm:w-[calc(50%-2rem)] sm:gap-3 sm:pl-4 sm:pr-4 [clip-path:polygon(0_0,100%_0,100%_50%,calc(100%_-_28px)_100%,0_100%)]"
          >
            {/* sharp amber underline fading toward the logo half */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-amber-400/80 via-amber-400/25 to-transparent"
            />
            {/* amber accent line riding the chamfered bottom-right cut
                (overshoot is trimmed by the header's own clip-path) */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-[13px] right-[-10px] h-px w-12 -rotate-45 bg-gradient-to-r from-amber-400/80 to-amber-400/5 sm:bottom-3.5"
            />
            {/* profile */}
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center bg-gradient-to-br from-amber-300 to-orange-600 text-base font-black text-zinc-950 sm:h-10 sm:w-10">
                {PLAYER_NAME.charAt(0)}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-black tracking-wide text-zinc-100 sm:text-sm">
                  {PLAYER_NAME}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold text-zinc-300">
                  <span className="flex items-center gap-1">
                    <Gem className="h-3 w-3 text-emerald-400" aria-hidden />
                    {gems}
                  </span>
                </div>
              </div>
            </div>

            {/* divider between profile and currency */}
            <span
              aria-hidden
              className="h-8 w-px shrink-0 bg-gradient-to-b from-transparent via-zinc-500/70 to-transparent"
            />

            {/* coin balance */}
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center border border-amber-400/50 bg-amber-400/15 sm:h-10 sm:w-10"
              >
                <Coins className="h-5 w-5 text-amber-400" />
              </span>
              <div className="leading-none">
                <p className="hidden text-[8px] font-black uppercase tracking-[0.3em] text-zinc-400 sm:block sm:text-[9px]">
                  Coins
                </p>
                <p className="text-sm font-black tabular-nums tracking-wide text-amber-300 sm:mt-1 sm:text-base">
                  {coins}
                </p>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.currentTarget.blur();
                  setLobbyPanel('store');
                }}
                aria-label="Get more coins"
                className="ml-1 hidden h-7 w-7 shrink-0 place-items-center border border-amber-400/50 bg-amber-400/10 text-amber-300 transition-all hover:bg-amber-400/25 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 active:scale-90 sm:ml-1 sm:grid"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </header>

          {/* top-right: game logo — owns the corner again; the maximize/
              sound buttons now live on the right EDGE, vertically centred */}
          <div className="absolute right-3 top-2 text-right sm:right-5 sm:top-3">
            <h1 className="text-2xl font-black italic leading-none tracking-tighter text-zinc-50 drop-shadow-[0_2px_0_rgba(0,0,0,0.55)] sm:text-4xl">
              RAT<span className="text-amber-400">FIRE</span>
            </h1>
            <p className="mt-1 hidden text-[9px] font-bold uppercase tracking-[0.35em] text-zinc-300 sm:block">
              Classic · Bermuda
            </p>
          </div>

          {/* left menu */}
          <nav
            aria-label="Lobby menu"
            className="pointer-events-auto absolute left-3 top-[4.75rem] flex flex-col gap-1.5 sm:left-5 sm:top-24 sm:gap-2"
          >
            {LOBBY_MENU.map((item) => {
              const MenuIcon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.blur();
                    handleMenuClick(item.id);
                  }}
                  className="flex w-max items-center gap-2.5 whitespace-nowrap border border-zinc-700/50 bg-zinc-950/60 px-3 py-2 text-left backdrop-blur-md transition-all hover:border-amber-400/60 hover:bg-zinc-900/80 hover:pl-4"
                >
                  <MenuIcon
                    className="h-4 w-4 shrink-0 text-amber-400"
                    aria-hidden
                  />
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-200 sm:text-xs">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>


          {/* bottom-left hint */}
          <p className="absolute bottom-5 left-4 hidden text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400/90 sm:block">
            Drag to rotate · Enter to deploy
          </p>

          {/* bottom-centre: push the whole game source to GitHub */}
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.blur();
              setGhOpen(true);
            }}
            aria-label="Save source code to GitHub"
            aria-haspopup="dialog"
            className="pointer-events-auto group absolute bottom-5 left-1/2 z-20 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border-2 border-zinc-600/60 bg-zinc-950/75 text-zinc-200 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.8)] backdrop-blur-md transition-all duration-200 hover:scale-110 hover:border-amber-400/70 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 active:scale-95 sm:bottom-8 sm:h-16 sm:w-16"
          >
            <GithubMark
              className="h-6 w-6 transition-transform duration-200 group-hover:rotate-6 sm:h-7 sm:w-7"
            />
          </button>

          {/* START */}
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.blur();
              enterGame();
            }}
            aria-label="Start game"
            className="group pointer-events-auto absolute bottom-5 right-4 outline-none sm:bottom-8 sm:right-8"
          >
            <span className="flex -skew-x-12 items-center bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 py-3 pl-7 pr-5 shadow-[0_10px_40px_-10px_rgba(251,146,60,0.9)] ring-1 ring-amber-200/70 transition-all duration-200 group-hover:scale-105 group-hover:shadow-[0_12px_50px_-8px_rgba(251,146,60,1)] group-focus-visible:ring-2 group-focus-visible:ring-white group-active:scale-95 sm:py-4 sm:pl-11 sm:pr-7">
              <span className="flex skew-x-12 items-center gap-2.5 text-xl font-black italic tracking-[0.12em] text-zinc-950 sm:text-2xl">
                START
                <Play
                  className="h-5 w-5 fill-zinc-950 sm:h-6 sm:w-6"
                  aria-hidden
                />
              </span>
            </span>
          </button>
        </div>
      )}

      {/* ===== fullscreen command panel — every menu entry owns one ===== */}
      {lobbyPanel &&
        (() => {
          const meta = PANEL_META[lobbyPanel];
          const PanelIcon = meta.icon;
          return (
            <section
              role="dialog"
              aria-modal="true"
              aria-label={`${meta.title} panel`}
              className="ratfire-panel pointer-events-auto absolute inset-0 z-30 flex flex-col border border-amber-400/40 bg-zinc-950/90 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_26px),calc(100%_-_26px)_100%,0_100%)]"
            >
              {/* panel header */}
              <header className="flex items-center gap-3 border-b border-amber-400/20 px-4 py-3 sm:px-6">
                <span className="grid h-10 w-10 shrink-0 place-items-center border border-amber-400/50 bg-amber-400/10">
                  <PanelIcon
                    className="h-5 w-5 text-amber-300"
                    aria-hidden
                  />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black uppercase tracking-[0.25em] text-zinc-100">
                    {meta.title}
                  </h2>
                  <p className="truncate text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                    {meta.tagline}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="hidden items-center gap-1.5 border border-amber-400/40 bg-amber-400/5 px-2.5 py-1.5 sm:flex">
                    <Coins
                      className="h-3.5 w-3.5 text-amber-400"
                      aria-hidden
                    />
                    <span className="text-xs font-black tabular-nums text-amber-300">
                      {coins}
                    </span>
                  </span>
                  <span className="hidden items-center gap-1.5 border border-emerald-400/40 bg-emerald-400/5 px-2.5 py-1.5 sm:flex">
                    <Gem
                      className="h-3.5 w-3.5 text-emerald-400"
                      aria-hidden
                    />
                    <span className="text-xs font-black tabular-nums text-emerald-300">
                      {gems}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.currentTarget.blur();
                      setLobbyPanel(null);
                    }}
                    aria-label="Close panel"
                    className="flex h-9 w-9 items-center justify-center border border-zinc-700 text-zinc-300 transition-colors hover:border-amber-400/60 hover:text-amber-300"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </header>

              {/* panel body */}
              <div className="ratfire-scroll flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
                <div
                  className={
                    lobbyPanel === 'weapons'
                      ? // Gun smithy runs wider — the 3D podium preview
                        // deserves the full-stage width.
                        'mx-auto flex min-h-full w-full max-w-7xl flex-col'
                      : lobbyPanel === 'character' || lobbyPanel === 'pet'
                        ? // Character + pet run the rack/display-room
                          // two-column stage — needs full-height flex.
                          'mx-auto flex min-h-full w-full max-w-6xl flex-col'
                        : 'mx-auto w-full max-w-6xl'
                  }
                >
                  {/* ================= STORE ================= */}
                  {lobbyPanel === 'store' && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {STORE_ITEMS.map((item) => {
                        const ItemIcon = item.icon;
                        const isSkin = item.kind === 'skin';
                        const isOwned = isSkin && !!owned[item.id];
                        const equipped =
                          isOwned &&
                          loadout.skinIndex === item.skinIndex;
                        const affordable = coins >= item.price;
                        return (
                          <article
                            key={item.id}
                            className="flex flex-col gap-3 border border-zinc-800 bg-zinc-900/60 p-4"
                          >
                            <div className="flex items-start gap-3">
                              <span className="grid h-10 w-10 shrink-0 place-items-center border border-zinc-700 bg-zinc-950/60">
                                <ItemIcon
                                  className={`h-5 w-5 ${item.accent}`}
                                  aria-hidden
                                />
                              </span>
                              <div className="min-w-0">
                                <h3 className="truncate text-xs font-black uppercase tracking-widest text-zinc-100">
                                  {item.name}
                                </h3>
                                <p className="mt-0.5 text-[11px] font-semibold leading-4 text-zinc-400">
                                  {item.blurb}
                                </p>
                              </div>
                            </div>
                            <div className="mt-auto flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-sm font-black tabular-nums text-amber-300">
                                <Coins
                                  className="h-4 w-4 text-amber-400"
                                  aria-hidden
                                />
                                {item.price}
                              </span>
                              {isOwned ? (
                                <span className="flex items-center gap-1 border border-emerald-400/50 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                                  <Check
                                    className="h-3.5 w-3.5"
                                    aria-hidden
                                  />
                                  {equipped ? 'Equipped' : 'Owned'}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.currentTarget.blur();
                                    buyStoreItem(item.id);
                                  }}
                                  className={`-skew-x-12 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-widest transition-all ${
                                    affordable
                                      ? 'bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 text-zinc-950 hover:brightness-110 active:scale-95'
                                      : 'border border-zinc-700 bg-zinc-900 text-zinc-500'
                                  }`}
                                >
                                  <span className="flex skew-x-12 items-center">
                                    Buy
                                  </span>
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {/* ============== LUCK ROYALE ============== */}
                  {lobbyPanel === 'luck' && (
                    <div className="flex flex-col items-center gap-6">
                      <div className="relative">
                        {/* pointer triangle riding the wheel's top edge */}
                        <span
                          aria-hidden
                          className="absolute -top-2 left-1/2 z-20 h-7 w-5 -translate-x-1/2 bg-gradient-to-b from-amber-200 to-amber-400 shadow-[0_2px_10px_rgba(251,191,36,0.8)] [clip-path:polygon(50%_100%,0_0,100%_0)]"
                        />
                        <div className="ratfire-luck-wheel relative h-56 w-56 sm:h-80 sm:w-80 lg:h-96 lg:w-96">
                          <div
                            className="absolute inset-0 rounded-full border-4 border-amber-400/70 shadow-[0_0_60px_-10px_rgba(251,191,36,0.65)]"
                            style={{
                              background: `conic-gradient(${LUCK_SEGMENTS.map(
                                (segment, index) =>
                                  `${segment.color} ${index * 45}deg ${
                                    (index + 1) * 45
                                  }deg`
                              ).join(', ')})`,
                              transform: `rotate(${luckRotation}deg)`,
                              transition: luckSpinning
                                ? 'transform 4s cubic-bezier(0.16, 1, 0.3, 1)'
                                : 'none',
                            }}
                          >
                            {LUCK_SEGMENTS.map((segment, index) => (
                              <span
                                key={segment.id}
                                className="ratfire-luck-label absolute left-1/2 top-1/2 -ml-8 -mt-2 w-16 text-center text-[10px] font-black uppercase leading-3 tracking-wider sm:-ml-10 sm:w-20 sm:text-xs"
                                style={
                                  {
                                    '--seg': `${
                                      index * 45 + 22.5
                                    }deg`,
                                    color:
                                      segment.fg === 'light'
                                        ? '#fafafa'
                                        : '#18181b',
                                  } as CSSProperties
                                }
                              >
                                {segment.label}
                              </span>
                            ))}
                          </div>
                          <div className="absolute left-1/2 top-1/2 z-10 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-amber-400/80 bg-zinc-950 sm:h-16 sm:w-16">
                            <span className="text-[10px] font-black italic tracking-widest text-amber-300 sm:text-xs">
                              RAT
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex w-full max-w-[18rem] gap-3 sm:max-w-sm">
                        <button
                          type="button"
                          disabled={luckSpinning}
                          onClick={(event) => {
                            event.currentTarget.blur();
                            spinLuck('coins');
                          }}
                          className="flex-1 -skew-x-12 bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 py-3 ring-1 ring-amber-200/70 transition-all enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:py-3.5"
                        >
                          <span className="flex skew-x-12 items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-zinc-950 sm:text-sm">
                            <Coins
                              className="h-4 w-4 sm:h-5 sm:w-5"
                              aria-hidden
                            />
                            Spin · {LUCK_COST.coins}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={luckSpinning}
                          onClick={(event) => {
                            event.currentTarget.blur();
                            spinLuck('gems');
                          }}
                          className="flex-1 -skew-x-12 bg-gradient-to-b from-emerald-300 via-emerald-400 to-teal-500 py-3 ring-1 ring-emerald-200/70 transition-all enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:py-3.5"
                        >
                          <span className="flex skew-x-12 items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-zinc-950 sm:text-sm">
                            <Gem
                              className="h-4 w-4 sm:h-5 sm:w-5"
                              aria-hidden
                            />
                            Gem · {LUCK_COST.gems}
                          </span>
                        </button>
                      </div>

                      <p
                        role="status"
                        className="min-h-5 text-center text-xs font-black uppercase tracking-[0.2em] text-amber-300"
                      >
                        {luckSpinning
                          ? 'Spinning…'
                          : luckResult ||
                            'Spin to win coins, gems & exclusive skins'}
                      </p>
                    </div>
                  )}

                  {/* ============== CHARACTER (dressing room) ============== */}
                  {lobbyPanel === 'character' && (
                    <div className="flex min-h-0 flex-1 flex-col-reverse gap-3 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-4">
                      {/* left column: costume rack + AI forge drawer */}
                      <div className="flex min-h-24 flex-1 flex-col gap-1.5 lg:min-h-0">
                        {/* costume rack — scrollable */}
                        <div
                          aria-label="Costume list"
                          className="ratfire-scroll flex min-h-24 flex-1 flex-col gap-1.5 overflow-y-auto border border-zinc-800/80 bg-zinc-900/40 p-1.5 lg:min-h-0"
                        >
                          <p className="shrink-0 px-1 pb-0.5 pt-0.5 text-[8px] font-black uppercase tracking-[0.3em] text-zinc-500">
                            Costume rack · {ALL_SKINS.length}
                          </p>
                          {ALL_SKINS.map((skin, index) => {
                            const unlocked = skinUnlocked(index);
                            const equipped = loadout.skinIndex === index;
                            const source = SKIN_SOURCES[index];
                            return (
                              <div
                                key={`${skin.name}-${index}`}
                                className="flex w-full shrink-0 items-stretch gap-1"
                              >
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.currentTarget.blur();
                                    if (!unlocked) {
                                      showToast(
                                        'Locked — win it in Luck Royale or buy in the Store'
                                      );
                                      return;
                                    }
                                    apiRef.current?.setSkin(index);
                                  }}
                                  className={`flex min-w-0 flex-1 items-center gap-2.5 border px-2.5 py-2 text-left transition-all ${
                                    equipped
                                      ? 'border-emerald-400/80 bg-emerald-500/10'
                                      : unlocked
                                        ? 'border-zinc-800 bg-zinc-950/40 hover:border-amber-400/50 hover:bg-zinc-900'
                                        : 'border-zinc-800/60 bg-zinc-950/60 opacity-70'
                                  }`}
                                >
                                  <span
                                    className="h-4 w-4 shrink-0 rounded-full ring-2 ring-zinc-700"
                                    style={{ backgroundColor: skin.color }}
                                  />
                                  <span
                                    className={`truncate text-[11px] font-bold ${
                                      equipped
                                        ? 'text-emerald-300'
                                        : 'text-zinc-200'
                                    }`}
                                  >
                                    {skin.name}
                                  </span>
                                  <span className="ml-auto flex shrink-0 items-center gap-1">
                                    {skin.forged && (
                                      <span className="border border-fuchsia-400/50 bg-fuchsia-500/10 px-1 text-[8px] font-black uppercase tracking-wider text-fuchsia-300">
                                        AI
                                      </span>
                                    )}
                                    {equipped ? (
                                      <Check
                                        className="h-3.5 w-3.5 text-emerald-400"
                                        aria-hidden
                                      />
                                    ) : !unlocked ? (
                                      <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-400/80">
                                        <Lock
                                          className="h-3 w-3"
                                          aria-hidden
                                        />
                                        {source?.source === 'store'
                                          ? 'Store'
                                          : 'Luck'}
                                      </span>
                                    ) : null}
                                  </span>
                                </button>
                                {/* AI edit trigger */}
                                <button
                                  type="button"
                                  aria-label={`Edit ${skin.name} with AI`}
                                  title="Edit with AI"
                                  onClick={(event) => {
                                    event.currentTarget.blur();
                                    setAiSource(index);
                                    setAiPrompt('');
                                  }}
                                  className={`grid w-7 shrink-0 place-items-center border transition-all ${
                                    aiSource === index
                                      ? 'border-fuchsia-400/80 bg-fuchsia-500/20 text-fuchsia-300'
                                      : 'border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:border-fuchsia-400/50 hover:text-fuchsia-300'
                                  }`}
                                >
                                  <Wand2
                                    className="h-3.5 w-3.5"
                                    aria-hidden
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        {/* AI costume forge drawer */}
                        {aiSource !== null && ALL_SKINS[aiSource] && (
                          <div className="shrink-0 border border-fuchsia-500/40 bg-fuchsia-500/5 p-2">
                            <div className="flex items-center gap-2">
                              <img
                                src={skinTextureUrl(
                                  ALL_SKINS[aiSource].file
                                )}
                                alt={`${ALL_SKINS[aiSource].name} texture`}
                                className="h-10 w-10 shrink-0 border border-zinc-700 bg-zinc-950 object-cover [image-rendering:pixelated]"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.25em] text-fuchsia-300">
                                  <Sparkles
                                    className="h-3 w-3"
                                    aria-hidden
                                  />
                                  AI costume forge
                                </p>
                                <p className="truncate text-[10px] font-bold text-zinc-300">
                                  Editing · {ALL_SKINS[aiSource].name}
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-label="Close AI forge"
                                disabled={aiGenerating}
                                onClick={(event) => {
                                  event.currentTarget.blur();
                                  setAiSource(null);
                                }}
                                className="grid h-7 w-7 shrink-0 place-items-center border border-zinc-700 bg-zinc-950/60 text-zinc-400 transition-all hover:border-fuchsia-400/60 hover:text-fuchsia-300 disabled:opacity-40"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </div>
                            <textarea
                              value={aiPrompt}
                              onChange={(event) =>
                                setAiPrompt(event.target.value)
                              }
                              rows={2}
                              maxLength={400}
                              disabled={aiGenerating}
                              placeholder="Describe the new look — e.g. molten lava armor with glowing cracks"
                              className="mt-1.5 w-full resize-none border border-zinc-700 bg-zinc-950/70 p-2 text-[11px] font-semibold text-zinc-100 placeholder:text-zinc-600 focus:border-fuchsia-400/60 focus:outline-none disabled:opacity-60"
                            />
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {AI_PROMPT_IDEAS.map((idea) => (
                                <button
                                  key={idea}
                                  type="button"
                                  disabled={aiGenerating}
                                  onClick={(event) => {
                                    event.currentTarget.blur();
                                    setAiPrompt(idea);
                                  }}
                                  className="border border-zinc-700 bg-zinc-900/70 px-1.5 py-0.5 text-[9px] font-bold text-zinc-300 transition-all hover:border-fuchsia-400/60 hover:text-fuchsia-200 disabled:opacity-40"
                                >
                                  {idea}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.currentTarget.blur();
                                forgeAiSkin();
                              }}
                              disabled={
                                aiGenerating || aiPrompt.trim().length < 2
                              }
                              className="mt-1.5 w-full -skew-x-12 border border-fuchsia-300/40 bg-gradient-to-b from-fuchsia-400 via-fuchsia-500 to-purple-700 transition-all enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <span className="flex skew-x-12 items-center justify-center gap-2 py-2 text-[11px] font-black uppercase tracking-[0.15em] text-white">
                                {aiGenerating ? (
                                  <LoaderCircle
                                    className="h-3.5 w-3.5 animate-spin"
                                    aria-hidden
                                  />
                                ) : (
                                  <Sparkles
                                    className="h-3.5 w-3.5"
                                    aria-hidden
                                  />
                                )}
                                {aiGenerating ? 'Forging…' : 'Forge costume'}
                              </span>
                            </button>
                            <p
                              role="status"
                              className="mt-1 text-center text-[9px] font-bold uppercase tracking-widest text-fuchsia-300/90"
                            >
                              {aiGenerating
                                ? 'Repainting the texture atlas — lands in the rack in ~20s'
                                : 'The AI repaints this costume into a NEW rack entry'}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* live display room — full height on desktop */}
                      <div className="relative h-72 shrink-0 overflow-hidden border border-zinc-700/60 bg-gradient-to-b from-zinc-900/70 via-zinc-950/80 to-zinc-950 lg:h-auto">
                        <CharacterPreview
                          skinIndex={loadout.skinIndex}
                          weaponIndex={heroPreviewWeaponIndex}
                          customSkinUrls={forgedSkins.map(
                            (skin) => skin.texturePath
                          )}
                        />
                        <p className="absolute left-3 top-3 flex items-center gap-1.5 border border-amber-400/40 bg-zinc-950/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-amber-300 backdrop-blur-sm">
                          <span
                            className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400"
                            aria-hidden
                          />
                          Live preview
                        </p>
                        <p className="absolute bottom-3 left-3 border border-zinc-700/60 bg-zinc-950/80 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-200 backdrop-blur-sm">
                          {ALL_SKINS[loadout.skinIndex]?.name}
                        </p>
                        <p className="absolute bottom-3 right-3 hidden text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-500 sm:block">
                          Drag to spin
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ================= MODS (mod loader) ================= */}
                  {lobbyPanel === 'mods' && (
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                      {/* loader header */}
                      <div className="flex shrink-0 items-center justify-between border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400">
                          Ratfire mod loader · 2 loaded
                        </p>
                        <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-600">
                          client-side · ui preview
                        </p>
                      </div>

                      {/* the two mods — one row, spaced apart */}
                      <div className="grid shrink-0 grid-cols-2 gap-4">
                        {/* CHRONOS — time & weather director */}
                        <article className="flex flex-col border border-zinc-800/80 bg-zinc-900/40 p-4">
                          <div className="flex items-start justify-between">
                            <span className="grid h-9 w-9 place-items-center border border-zinc-700 bg-zinc-950/60">
                              <Sun
                                className="h-4 w-4 text-amber-300"
                                aria-hidden
                              />
                            </span>
                            <span className="border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-emerald-300">
                              Installed
                            </span>
                          </div>
                          <p className="mt-3 text-xs font-black uppercase tracking-[0.25em] text-zinc-100">
                            Chronos
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Time &amp; weather director
                          </p>
                          <p className="mt-2 text-[11px] font-semibold leading-relaxed text-zinc-400">
                            Freeze the clock at any hour, speed up the day
                            cycle, or force clear skies and storms.
                          </p>
                          <div className="mt-4 flex items-center justify-between border-t border-zinc-800/80 pt-3">
                            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">
                              v1.0 · local
                            </span>
                            <span
                              aria-hidden
                              className="flex h-5 w-9 items-center justify-end border border-amber-400/40 bg-amber-400/15 px-0.5"
                            >
                              <span className="h-3.5 w-3.5 bg-amber-400" />
                            </span>
                          </div>
                        </article>

                        {/* CREATE — kinetic machine works */}
                        <article className="flex flex-col border border-zinc-800/80 bg-zinc-900/40 p-4">
                          <div className="flex items-start justify-between">
                            <span className="grid h-9 w-9 place-items-center border border-zinc-700 bg-zinc-950/60">
                              <Cog
                                className="h-4 w-4 text-orange-400"
                                aria-hidden
                              />
                            </span>
                            <span className="border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-emerald-300">
                              Installed
                            </span>
                          </div>
                          <p className="mt-3 text-xs font-black uppercase tracking-[0.25em] text-zinc-100">
                            Create
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Kinetic machine works
                          </p>
                          <p className="mt-2 text-[11px] font-semibold leading-relaxed text-zinc-400">
                            Motors, cogwheels, presses and conveyor belts —
                            factory automation for RATFIRE.
                          </p>
                          <div className="mt-4 flex items-center justify-between border-t border-zinc-800/80 pt-3">
                            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">
                              v0.1 · local
                            </span>
                            <span
                              aria-hidden
                              className="flex h-5 w-9 items-center justify-end border border-amber-400/40 bg-amber-400/15 px-0.5"
                            >
                              <span className="h-3.5 w-3.5 bg-amber-400" />
                            </span>
                          </div>
                        </article>
                      </div>

                      {/* random community mods — UI-only placeholders
                          verifying the list layout (no data wired) */}
                      <section className="flex shrink-0 flex-col gap-3 border border-zinc-800/80 bg-zinc-900/40 p-4">
                        <div className="flex items-center justify-between">
                          <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400">
                            <Layers
                              className="h-3.5 w-3.5 text-amber-400"
                              aria-hidden
                            />
                            Community mods
                          </p>
                          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-600">
                            ui preview · placeholders only
                          </p>
                        </div>
                        <div className="ratfire-scroll flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                          {MOD_PLACEHOLDERS.map((mod) => {
                            const PlaceholderIcon = mod.icon;
                            return (
                              <div
                                key={mod.id}
                                className="flex items-center gap-3 border border-zinc-800/80 bg-zinc-950/50 p-3"
                              >
                                <span className="grid h-9 w-9 shrink-0 place-items-center border border-zinc-700 bg-zinc-950/60">
                                  <PlaceholderIcon
                                    className={`h-4 w-4 ${mod.accent}`}
                                    aria-hidden
                                  />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-black uppercase tracking-widest text-zinc-100">
                                    {mod.name}
                                  </p>
                                  <p className="truncate text-[10px] font-semibold text-zinc-500">
                                    {mod.blurb}
                                  </p>
                                </div>
                                {mod.soon ? (
                                  <span className="-skew-x-12 shrink-0 border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                    <span className="flex skew-x-12 items-center">
                                      Soon
                                    </span>
                                  </span>
                                ) : (
                                  <span
                                    aria-hidden
                                    className="-skew-x-12 shrink-0 bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-950"
                                  >
                                    <span className="flex skew-x-12 items-center">
                                      Get
                                    </span>
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    </div>
                  )}

                  {/* ================= VAULT ================= */}
                  {lobbyPanel === 'vault' && (
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="border border-amber-400/30 bg-amber-400/5 p-4">
                          <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400">
                            <Coins
                              className="h-3.5 w-3.5 text-amber-400"
                              aria-hidden
                            />
                            Coins
                          </p>
                          <p className="mt-1 text-2xl font-black tabular-nums text-amber-300">
                            {coins}
                          </p>
                        </div>
                        <div className="border border-emerald-400/30 bg-emerald-400/5 p-4">
                          <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400">
                            <Gem
                              className="h-3.5 w-3.5 text-emerald-400"
                              aria-hidden
                            />
                            Gems
                          </p>
                          <p className="mt-1 text-2xl font-black tabular-nums text-emerald-300">
                            {gems}
                          </p>
                        </div>
                      </div>

                      <section className="border border-zinc-800 bg-zinc-900/60 p-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
                          Equipped loadout
                        </h3>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/50 p-3">
                            <span
                              className="h-5 w-5 shrink-0 rounded-full ring-2 ring-zinc-700"
                              style={{
                                backgroundColor:
                                  ALL_SKINS[loadout.skinIndex]?.color,
                              }}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black uppercase tracking-widest text-zinc-100">
                                {ALL_SKINS[loadout.skinIndex]?.name}
                              </p>
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                                Skin · change in Character
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/50 p-3">
                            {(() => {
                              const weapon =
                                ALL_WEAPONS[loadout.weaponIndex] ??
                                ALL_WEAPONS[0];
                              const WeaponIcon = weapon.icon;
                              return (
                                <>
                                  <span className="grid h-9 w-9 shrink-0 place-items-center border border-zinc-700 bg-zinc-950/60">
                                    <WeaponIcon
                                      className="h-4 w-4 text-amber-300"
                                      aria-hidden
                                    />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-black uppercase tracking-widest text-zinc-100">
                                      {weapon.name}
                                    </p>
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                                      {weapon.role} · change in Weapons
                                    </p>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
                          Skin locker
                        </h3>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {SKINS.map((skin, index) => {
                            const unlocked = skinUnlocked(index);
                            const equipped =
                              loadout.skinIndex === index;
                            const source = SKIN_SOURCES[index];
                            return (
                              <div
                                key={skin.name}
                                className={`flex items-center gap-3 border p-3 ${
                                  equipped
                                    ? 'border-emerald-400/70 bg-emerald-500/10'
                                    : 'border-zinc-800 bg-zinc-900/60'
                                }`}
                              >
                                <span
                                  className="h-4 w-4 shrink-0 rounded-full ring-2 ring-zinc-700"
                                  style={{ backgroundColor: skin.color }}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-black uppercase tracking-wider text-zinc-100">
                                    {skin.name}
                                  </p>
                                  {!unlocked && (
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400/80">
                                      Locked ·{' '}
                                      {source?.source === 'store'
                                        ? 'Store'
                                        : 'Luck Royale'}
                                    </p>
                                  )}
                                </div>
                                {equipped ? (
                                  <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                                    <Check
                                      className="h-3.5 w-3.5"
                                      aria-hidden
                                    />
                                    Worn
                                  </span>
                                ) : unlocked ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.currentTarget.blur();
                                      apiRef.current?.setSkin(index);
                                    }}
                                    className="-skew-x-12 bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-950 transition-all hover:brightness-110 active:scale-95"
                                  >
                                    <span className="flex skew-x-12">
                                      Equip
                                    </span>
                                  </button>
                                ) : (
                                  <Lock
                                    className="h-3.5 w-3.5 shrink-0 text-zinc-600"
                                    aria-hidden
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    </div>
                  )}

                  {/* ================= PET ================= */}
                  {lobbyPanel === 'pet' && (
                    <div className="flex min-h-0 flex-1 flex-col-reverse gap-3 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-4">
                      {/* left column: pet rack + orders drawer */}
                      <div className="flex min-h-24 flex-1 flex-col gap-1.5 lg:min-h-0">
                        {/* pet rack — scrollable, same bones as the
                            costume rack */}
                        <div
                          aria-label="Pet list"
                          className="ratfire-scroll flex min-h-24 flex-1 flex-col gap-1.5 overflow-y-auto border border-zinc-800/80 bg-zinc-900/40 p-1.5 lg:min-h-0"
                        >
                          <p className="shrink-0 px-1 pb-0.5 pt-0.5 text-[8px] font-black uppercase tracking-[0.3em] text-zinc-500">
                            Pet rack · {PETS.length}
                          </p>
                          {PETS.map((pet, index) => {
                            const deployed = petDeployed[pet.id];
                            const selected =
                              index === selectedPetIndex;
                            return (
                              <div
                                key={pet.name}
                                className="flex w-full shrink-0 items-stretch gap-1"
                              >
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.currentTarget.blur();
                                    if (!pet.unlocked) {
                                      showToast(
                                        'Locked — new pets arrive in a future update'
                                      );
                                      return;
                                    }
                                    setSelectedPetIndex(index);
                                    showToast(pet.blurb);
                                  }}
                                  className={`flex min-w-0 flex-1 items-center gap-2.5 border px-2.5 py-2 text-left transition-all ${
                                    deployed
                                      ? 'border-emerald-400/80 bg-emerald-500/10'
                                      : pet.unlocked
                                        ? selected
                                          ? 'border-amber-400/70 bg-amber-500/10'
                                          : 'border-zinc-800 bg-zinc-950/40 hover:border-amber-400/50 hover:bg-zinc-900'
                                        : 'border-zinc-800/60 bg-zinc-950/60 opacity-70'
                                  }`}
                                >
                                  <span
                                    className="h-4 w-4 shrink-0 rounded-full ring-2 ring-zinc-700"
                                    style={{ backgroundColor: pet.color }}
                                  />
                                  <span
                                    className={`truncate text-[11px] font-bold ${
                                      deployed
                                        ? 'text-emerald-300'
                                        : 'text-zinc-200'
                                    }`}
                                  >
                                    {pet.name}
                                  </span>
                                  <span className="ml-auto flex shrink-0 items-center gap-1">
                                    {pet.unlocked ? (
                                      <span
                                        className={`text-[9px] font-black uppercase tracking-wider ${
                                          deployed
                                            ? 'text-emerald-400/90'
                                            : 'text-amber-400/80'
                                        }`}
                                      >
                                        {deployed ? 'Deployed' : 'Standby'}
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-400/80">
                                        <Lock
                                          className="h-3 w-3"
                                          aria-hidden
                                        />
                                        Soon
                                      </span>
                                    )}
                                  </span>
                                </button>
                                {/* DEPLOY TOGGLE — on = the pet spawns
                                    in-world beside the player, off = it
                                    stands down (despawns). Every unlocked
                                    pet gets one; flips drive the game
                                    through apiRef.setPetDeployed. */}
                                {pet.unlocked ? (
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={deployed}
                                    aria-label={
                                      deployed
                                        ? `Deploy ${pet.name} — on (tap to stand down)`
                                        : `Deploy ${pet.name} — off (tap to spawn)`
                                    }
                                    title={
                                      deployed
                                        ? `Stand ${pet.name} down`
                                        : `Spawn ${pet.name}`
                                    }
                                    onClick={(event) => {
                                      event.currentTarget.blur();
                                      setPetDeployToggle(pet.id, !deployed);
                                      showToast(
                                        !deployed
                                          ? `${pet.name} deployed — spawning beside you`
                                          : `${pet.name} stood down — back on standby`
                                      );
                                    }}
                                    className={`grid w-7 shrink-0 place-items-center border transition-all ${
                                      deployed
                                        ? 'border-emerald-400/80 bg-emerald-500/20 text-emerald-300'
                                        : 'border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:border-emerald-400/50 hover:text-emerald-300'
                                    }`}
                                  >
                                    <Power
                                      className="h-3.5 w-3.5"
                                      aria-hidden
                                    />
                                  </button>
                                ) : (
                                  <span
                                    aria-hidden
                                    className="w-7 shrink-0 border border-transparent"
                                  />
                                )}
                                {/* orders trigger — the pet sibling of
                                    the AI edit wand; only the DEPLOYED
                                    pet (BUZZ) takes direct orders */}
                                {pet.id === 'buzz' && deployed ? (
                                  <button
                                    type="button"
                                    aria-label={`Open ${pet.name} orders`}
                                    title="Direct orders"
                                    onClick={(event) => {
                                      event.currentTarget.blur();
                                      setSelectedPetIndex(0);
                                      setPetOrdersOpen(true);
                                    }}
                                    className={`grid w-7 shrink-0 place-items-center border transition-all ${
                                      petOrdersOpen
                                        ? 'border-emerald-400/80 bg-emerald-500/20 text-emerald-300'
                                        : 'border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:border-emerald-400/50 hover:text-emerald-300'
                                    }`}
                                  >
                                    <Radar
                                      className="h-3.5 w-3.5"
                                      aria-hidden
                                    />
                                  </button>
                                ) : (
                                  <span
                                    aria-hidden
                                    className="w-7 shrink-0 border border-transparent"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* direct-orders drawer — the pet sibling of the
                            AI forge drawer */}
                        {petOrdersOpen && (
                          <div className="shrink-0 border border-emerald-500/40 bg-emerald-500/5 p-2">
                            <div className="flex items-center gap-2">
                              <span className="grid h-10 w-10 shrink-0 place-items-center border border-zinc-700 bg-zinc-950">
                                <Bot
                                  className="h-4 w-4 text-emerald-300"
                                  aria-hidden
                                />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.25em] text-emerald-300">
                                  <Radar
                                    className="h-3 w-3"
                                    aria-hidden
                                  />
                                  Direct orders
                                </p>
                                <p className="truncate text-[10px] font-bold text-zinc-300">
                                  BUZZ — combat drone
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-label="Close orders drawer"
                                onClick={(event) => {
                                  event.currentTarget.blur();
                                  setPetOrdersOpen(false);
                                }}
                                className="grid h-7 w-7 shrink-0 place-items-center border border-zinc-700 bg-zinc-950/60 text-zinc-400 transition-all hover:border-emerald-400/60 hover:text-emerald-300"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </div>
                            <div className="mt-1.5 grid grid-cols-2 gap-1">
                              {PET_ORDERS.map((order, index) => {
                                const OrderIcon = order.icon;
                                return (
                                  <button
                                    key={order.kind}
                                    type="button"
                                    onClick={(event) => {
                                      event.currentTarget.blur();
                                      apiRef.current?.droneDirective(
                                        order.kind
                                      );
                                      showToast(`BUZZ: ${order.call}`);
                                    }}
                                    className={`flex items-center gap-1.5 border border-zinc-700 bg-zinc-900/70 px-2 py-1.5 text-left transition-all hover:border-emerald-400/60 hover:bg-zinc-900 ${
                                      index === PET_ORDERS.length - 1
                                        ? 'col-span-2'
                                        : ''
                                    }`}
                                  >
                                    <OrderIcon
                                      className="h-3 w-3 shrink-0 text-emerald-300"
                                      aria-hidden
                                    />
                                    <span className="min-w-0">
                                      <span className="block truncate text-[10px] font-black uppercase tracking-widest text-zinc-100">
                                        {order.label}
                                      </span>
                                      <span className="block truncate text-[8px] font-bold uppercase tracking-[0.15em] text-zinc-500">
                                        {order.call}
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <p
                              role="status"
                              className="mt-1 text-center text-[9px] font-bold uppercase tracking-widest text-emerald-300/90"
                            >
                              Same brain as BUZZ voice commands — press V
                              in game
                            </p>
                          </div>
                        )}
                      </div>

                      {/* live display room — full height on desktop;
                          the rack row picked drives WHICH pet stars in
                          it: BUZZ the quad or DART the strike plane */}
                      <div className="relative h-72 shrink-0 overflow-hidden border border-zinc-700/60 bg-gradient-to-b from-zinc-900/70 via-zinc-950/80 to-zinc-950 lg:h-auto">
                        {PETS[selectedPetIndex]?.kind === 'plane' ? (
                          <PlanePreview />
                        ) : PETS[selectedPetIndex]?.kind === 'robot' ? (
                          <RobotPreview />
                        ) : PETS[selectedPetIndex]?.kind === 'spot' ? (
                          <SpotPreview />
                        ) : PETS[selectedPetIndex]?.kind === 'spider' ? (
                          <SpiderPreview />
                        ) : (
                          <DronePreview />
                        )}
                        <p className="absolute left-3 top-3 flex items-center gap-1.5 border border-amber-400/40 bg-zinc-950/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-amber-300 backdrop-blur-sm">
                          <span
                            className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400"
                            aria-hidden
                          />
                          Live preview
                        </p>
                        <p className="absolute bottom-3 left-3 border border-zinc-700/60 bg-zinc-950/80 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-200 backdrop-blur-sm">
                          {PETS[selectedPetIndex]?.name ?? 'BUZZ'}
                        </p>
                        <p className="absolute bottom-3 right-3 hidden text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-500 sm:block">
                          Drag to spin
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ============== COLLECTION ============== */}
                  {lobbyPanel === 'collection' && (
                    <div className="flex flex-col gap-4">
                      <section className="border border-zinc-800 bg-zinc-900/60 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
                            Unlock progress
                          </h3>
                          <span className="text-[11px] font-black tabular-nums text-amber-300">
                            {
                              SKINS.filter((_, index) =>
                                skinUnlocked(index)
                              ).length
                            }
                            /{SKINS.length} skins
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden bg-zinc-800">
                          <div
                            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                            style={{
                              width: `${
                                (SKINS.filter((_, index) =>
                                  skinUnlocked(index)
                                ).length /
                                  SKINS.length) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                      </section>

                      <section>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
                          World atlas
                        </h3>
                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                          {WORLD_BIOMES.map((biome) => (
                            <article
                              key={biome.name}
                              className="border border-zinc-800 bg-zinc-900/60 p-3"
                            >
                              <div
                                className={`h-14 w-full bg-gradient-to-br ${biome.gradient}`}
                                aria-hidden
                              />
                              <p className="mt-2 truncate text-[11px] font-black uppercase tracking-wider text-zinc-100">
                                {biome.name}
                              </p>
                              <p className="truncate text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                                {biome.tag}
                              </p>
                            </article>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
                          Systems online
                        </h3>
                        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                          {SYSTEM_CARDS.map((system) => {
                            const SystemIcon = system.icon;
                            return (
                              <article
                                key={system.name}
                                className="flex items-center gap-3 border border-zinc-800 bg-zinc-900/60 p-3"
                              >
                                <span className="grid h-9 w-9 shrink-0 place-items-center border border-zinc-700 bg-zinc-950/60">
                                  <SystemIcon
                                    className="h-4 w-4 text-amber-300"
                                    aria-hidden
                                  />
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-black uppercase tracking-wider text-zinc-100">
                                    {system.name}
                                  </p>
                                  <p className="flex items-center gap-1 truncate text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                                    <span
                                      className="h-1 w-1 rounded-full bg-emerald-400"
                                      aria-hidden
                                    />
                                    {system.note}
                                  </p>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    </div>
                  )}

                  {/* ================= WEAPONS (gun smithy) ================= */}
                  {lobbyPanel === 'weapons' && (
                    <div className="flex min-h-0 flex-1 flex-col-reverse gap-3 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-4">
                      {/* left column: weapon rack + AI forge drawer */}
                      <div className="flex min-h-24 flex-1 flex-col gap-1.5 lg:min-h-0">
                        {/* weapon rack — scrollable */}
                        <div
                          aria-label="Weapon list"
                          className="ratfire-scroll flex min-h-24 flex-1 flex-col gap-1.5 overflow-y-auto border border-zinc-800/80 bg-zinc-900/40 p-1.5 lg:min-h-0"
                        >
                          <p className="shrink-0 px-1 pb-0.5 pt-0.5 text-[8px] font-black uppercase tracking-[0.3em] text-zinc-500">
                            Weapon rack · {ALL_WEAPONS.length}
                          </p>
                          {ALL_WEAPONS.map((weapon, index) => {
                            const WeaponIcon = weapon.icon;
                            const equipped =
                              loadout.weaponIndex === index;
                            // Every mesh weapon row is forgeable — base
                            // AND AI-forged (chain-editing, same as the
                            // character panel). Only Unarmed is not:
                            // forged rows carry their base weapon index.
                            const forgeable =
                              weapon.baseIndex < WEAPONS.length - 1;
                            return (
                              <div
                                key={`${weapon.name}-${index}`}
                                className="flex w-full shrink-0 items-stretch gap-1"
                              >
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.currentTarget.blur();
                                    apiRef.current?.setWeapon(index);
                                  }}
                                  className={`flex min-w-0 flex-1 items-center gap-2.5 border px-2.5 py-2 text-left transition-all ${
                                    equipped
                                      ? 'border-amber-400/80 bg-amber-400/10'
                                      : 'border-zinc-800 bg-zinc-950/40 hover:border-amber-400/50 hover:bg-zinc-900'
                                  }`}
                                >
                                  {weapon.textureFile ? (
                                    <img
                                      src={skinTextureUrl(
                                        weapon.textureFile
                                      )}
                                      alt=""
                                      aria-hidden
                                      className="h-7 w-7 shrink-0 border border-zinc-700 bg-zinc-950 object-cover [image-rendering:pixelated]"
                                    />
                                  ) : (
                                    <span className="grid h-7 w-7 shrink-0 place-items-center border border-zinc-700 bg-zinc-950">
                                      <WeaponIcon
                                        className="h-3.5 w-3.5 text-zinc-300"
                                        aria-hidden
                                      />
                                    </span>
                                  )}
                                  <span className="min-w-0">
                                    <span
                                      className={`block truncate text-[11px] font-bold ${
                                        equipped
                                          ? 'text-amber-300'
                                          : 'text-zinc-200'
                                      }`}
                                    >
                                      {weapon.name}
                                    </span>
                                    <span className="block truncate text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">
                                      {weapon.role}
                                    </span>
                                  </span>
                                  <span className="ml-auto flex shrink-0 items-center gap-1">
                                    {weapon.forged && (
                                      <span className="border border-fuchsia-400/50 bg-fuchsia-500/10 px-1 text-[8px] font-black uppercase tracking-wider text-fuchsia-300">
                                        AI
                                      </span>
                                    )}
                                    {equipped && (
                                      <Check
                                        className="h-3.5 w-3.5 text-amber-400"
                                        aria-hidden
                                      />
                                    )}
                                  </span>
                                </button>
                                {/* AI edit trigger — the Unarmed slot has
                                    no texture, so it never forges */}
                                {forgeable ? (
                                  <button
                                    type="button"
                                    aria-label={`Edit ${weapon.name} texture with AI`}
                                    title="Edit texture with AI"
                                    onClick={(event) => {
                                      event.currentTarget.blur();
                                      setWAiSource(index);
                                      setWAiPrompt('');
                                    }}
                                    className={`grid w-7 shrink-0 place-items-center border transition-all ${
                                      wAiSource === index
                                        ? 'border-fuchsia-400/80 bg-fuchsia-500/20 text-fuchsia-300'
                                        : 'border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:border-fuchsia-400/50 hover:text-fuchsia-300'
                                    }`}
                                  >
                                    <Wand2
                                      className="h-3.5 w-3.5"
                                      aria-hidden
                                    />
                                  </button>
                                ) : (
                                  <span
                                    aria-hidden
                                    className="w-7 shrink-0 border border-transparent"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* AI weapon forge drawer */}
                        {wAiSource !== null && ALL_WEAPONS[wAiSource] && (
                          <div className="shrink-0 border border-fuchsia-500/40 bg-fuchsia-500/5 p-2">
                            <div className="flex items-center gap-2">
                              <img
                                src={skinTextureUrl(
                                  ALL_WEAPONS[wAiSource].textureFile ??
                                    'weapon.png'
                                )}
                                alt={`${ALL_WEAPONS[wAiSource].name} texture`}
                                className="h-10 w-10 shrink-0 border border-zinc-700 bg-zinc-950 object-cover [image-rendering:pixelated]"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.25em] text-fuchsia-300">
                                  <Sparkles
                                    className="h-3 w-3"
                                    aria-hidden
                                  />
                                  AI weapon forge
                                </p>
                                <p className="truncate text-[10px] font-bold text-zinc-300">
                                  Editing · {ALL_WEAPONS[wAiSource].name}
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-label="Close AI forge"
                                disabled={wAiGenerating}
                                onClick={(event) => {
                                  event.currentTarget.blur();
                                  setWAiSource(null);
                                }}
                                className="grid h-7 w-7 shrink-0 place-items-center border border-zinc-700 bg-zinc-950/60 text-zinc-400 transition-all hover:border-fuchsia-400/60 hover:text-fuchsia-300 disabled:opacity-40"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </div>
                            <textarea
                              value={wAiPrompt}
                              onChange={(event) =>
                                setWAiPrompt(event.target.value)
                              }
                              rows={2}
                              maxLength={400}
                              disabled={wAiGenerating}
                              placeholder="Describe the new look — e.g. gold dragon engravings on dark steel"
                              className="mt-1.5 w-full resize-none border border-zinc-700 bg-zinc-950/70 p-2 text-[11px] font-semibold text-zinc-100 placeholder:text-zinc-600 focus:border-fuchsia-400/60 focus:outline-none disabled:opacity-60"
                            />
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {WEAPON_AI_PROMPT_IDEAS.map((idea) => (
                                <button
                                  key={idea}
                                  type="button"
                                  disabled={wAiGenerating}
                                  onClick={(event) => {
                                    event.currentTarget.blur();
                                    setWAiPrompt(idea);
                                  }}
                                  className="border border-zinc-700 bg-zinc-900/70 px-1.5 py-0.5 text-[9px] font-bold text-zinc-300 transition-all hover:border-fuchsia-400/60 hover:text-fuchsia-200 disabled:opacity-40"
                                >
                                  {idea}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.currentTarget.blur();
                                forgeAiWeapon();
                              }}
                              disabled={
                                wAiGenerating || wAiPrompt.trim().length < 2
                              }
                              className="mt-1.5 w-full -skew-x-12 border border-fuchsia-300/40 bg-gradient-to-b from-fuchsia-400 via-fuchsia-500 to-purple-700 transition-all enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <span className="flex skew-x-12 items-center justify-center gap-2 py-2 text-[11px] font-black uppercase tracking-[0.15em] text-white">
                                {wAiGenerating ? (
                                  <LoaderCircle
                                    className="h-3.5 w-3.5 animate-spin"
                                    aria-hidden
                                  />
                                ) : (
                                  <Sparkles
                                    className="h-3.5 w-3.5"
                                    aria-hidden
                                  />
                                )}
                                {wAiGenerating ? 'Forging…' : 'Forge weapon'}
                              </span>
                            </button>
                            <p
                              role="status"
                              className="mt-1 text-center text-[9px] font-bold uppercase tracking-widest text-fuchsia-300/90"
                            >
                              {wAiGenerating
                                ? 'Repainting the texture atlas — lands in the rack in ~20s'
                                : 'The AI repaints this weapon into a NEW rack entry'}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* live gun smithy — full height on desktop */}
                      <div className="relative h-72 shrink-0 overflow-hidden border border-zinc-700/60 bg-gradient-to-b from-zinc-900/70 via-zinc-950/80 to-zinc-950 lg:h-auto">
                        {(() => {
                          const preview = weaponPreview(
                            loadout.weaponIndex
                          );
                          return (
                            <WeaponPreview
                              baseIndex={preview.base}
                              textureUrl={preview.url}
                            />
                          );
                        })()}
                        <p className="absolute left-3 top-3 flex items-center gap-1.5 border border-amber-400/40 bg-zinc-950/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-amber-300 backdrop-blur-sm">
                          <span
                            className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400"
                            aria-hidden
                          />
                          Live preview
                        </p>
                        {/* combat stat readout — top-right corner: the
                            six bars of the ACTIVE preview weapon, driven
                            by the same stats the gunplay uses */}
                        {(() => {
                          const rack = ALL_WEAPONS[loadout.weaponIndex];
                          if (
                            !rack ||
                            weaponPreview(loadout.weaponIndex).base === -1
                          ) {
                            return null; // Unarmed — no stats to read
                          }
                          const stats = resolveWeaponStats(
                            WEAPONS[rack.baseIndex]?.model ?? null,
                            rack.forged ? rack.textureFile : null
                          );
                          return (
                            <div className="absolute right-2 top-2 z-10 w-[8.75rem] border border-zinc-700/70 bg-zinc-950/85 p-2 backdrop-blur-sm sm:right-3 sm:top-3 sm:w-48 sm:p-2.5">
                              <div className="mb-1 flex items-baseline justify-between gap-2 border-b border-zinc-800 pb-1">
                                <p className="text-[8px] font-black uppercase tracking-[0.25em] text-zinc-500">
                                  Stats
                                </p>
                                <p className="truncate text-[8px] font-black uppercase tracking-wider text-emerald-400">
                                  {rack.name}
                                </p>
                              </div>
                              {WEAPON_STAT_META.map((row) => {
                                const StatIcon = row.icon;
                                const value = stats[row.key];
                                return (
                                  <div
                                    key={row.key}
                                    className="mt-1.5 flex items-start gap-1.5"
                                  >
                                    <StatIcon
                                      className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400"
                                      aria-hidden
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-baseline justify-between gap-1">
                                        <span className="truncate text-[8px] font-black uppercase tracking-[0.18em] text-zinc-300">
                                          {row.label}
                                        </span>
                                        <span className="text-[10px] font-black leading-none tabular-nums text-emerald-400">
                                          {value}
                                        </span>
                                      </div>
                                      <div
                                        className="mt-1 h-[3px] w-full overflow-hidden bg-zinc-800"
                                        aria-hidden
                                      >
                                        <div
                                          className="h-full bg-zinc-100 transition-[width] duration-500 ease-out"
                                          style={{
                                            width: `${Math.min(
                                              100,
                                              (value / row.max) * 100
                                            )}%`,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                        {(() => {
                          const preview = weaponPreview(
                            loadout.weaponIndex
                          );
                          return preview.base === -1 ? (
                            <p className="absolute inset-x-3 top-1/2 mx-auto w-fit -translate-y-1/2 border border-zinc-600/60 bg-zinc-950/85 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-300 backdrop-blur-sm">
                              Unarmed · bare hands
                            </p>
                          ) : null;
                        })()}
                        <p className="absolute bottom-3 left-3 border border-zinc-700/60 bg-zinc-950/80 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-200 backdrop-blur-sm">
                          {ALL_WEAPONS[loadout.weaponIndex]?.name ??
                            WEAPONS[0].name}
                        </p>
                        <p className="absolute bottom-3 right-3 hidden text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-500 sm:block">
                          Drag to spin
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* panel status footer */}
              <footer className="flex items-center justify-between gap-3 border-t border-amber-400/20 px-4 py-2 sm:px-6">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">
                  Ratfire command · {meta.title}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-600">
                  Esc to close
                </p>
              </footer>
            </section>
          );
        })()}


      {/* ================= GitHub export panel (centre modal) ================= */}
      {ghOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Save source code to GitHub"
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close GitHub panel"
            onClick={() => setGhOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-zinc-950/70 backdrop-blur-sm focus-visible:outline-none"
          />
          <section className="relative w-[min(92vw,26rem)] rounded-2xl border border-amber-400/30 bg-zinc-950/95 p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
            <div className="flex items-center justify-between border-b border-zinc-700/60 pb-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100 text-zinc-950">
                  <GithubMark className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.22em] text-zinc-100">
                    Push to GitHub
                  </h2>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    Back up the full game source
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGhOpen(false)}
                aria-label="Close GitHub panel"
                className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {ghStatus === 'success' ? (
              <div className="mt-4 space-y-4">
                <p className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <Check className="h-4 w-4 shrink-0" aria-hidden />
                  Saved {ghFiles} source files to GitHub
                </p>
                <a
                  href={ghUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-xs font-bold text-amber-300 underline underline-offset-4 transition-colors hover:bg-amber-400/20"
                >
                  {ghUrl}
                </a>
                <p className="text-[10px] font-semibold uppercase leading-snug tracking-widest text-zinc-500">
                  The repository opens in a new tab — every future save adds a
                  fresh commit.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGhStatus('idle')}
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
                  >
                    Save to another repo
                  </button>
                  <button
                    type="button"
                    onClick={() => setGhOpen(false)}
                    className="flex-1 rounded-lg bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 px-3 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-950 transition-all hover:brightness-110"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="mt-4 space-y-3.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveToGithub();
                }}
              >
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    GitHub token
                  </span>
                  <div className="relative">
                    <input
                      type={ghShowToken ? 'text' : 'password'}
                      value={ghToken}
                      onChange={(event) => setGhToken(event.target.value)}
                      placeholder="ghp_… or github_pat_…"
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 pl-3 pr-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setGhShowToken((value) => !value)}
                      aria-label={ghShowToken ? 'Hide token' : 'Show token'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 transition-colors hover:text-zinc-200"
                    >
                      {ghShowToken ? (
                        <EyeOff className="h-4 w-4" aria-hidden />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                  <span className="mt-1 block text-[10px] leading-snug text-zinc-500">
                    Used only for this request and never stored. Needs a classic
                    token with the "repo" scope — or a fine-grained token with
                    Contents + Administration read &amp; write.{' '}
                    <a
                      href="https://github.com/settings/tokens/new"
                      target="_blank"
                      rel="noreferrer"
                      className="whitespace-nowrap font-bold text-amber-400 underline underline-offset-2 transition-colors hover:text-amber-300"
                    >
                      Create / verify a token on GitHub ↗
                    </a>
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    Repository name
                  </span>
                  <input
                    type="text"
                    value={ghRepo}
                    onChange={(event) => setGhRepo(event.target.value)}
                    placeholder="my-ratfire-game"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
                  />
                  <span className="mt-1 block text-[10px] leading-snug text-zinc-500">
                    Created under your account on save — or updated with a new
                    commit if it already exists.
                  </span>
                </label>

                {ghStatus === 'error' && (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold leading-snug text-red-300"
                  >
                    {ghError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={
                    ghStatus === 'working' || !ghToken.trim() || !ghRepo.trim()
                  }
                  className="flex w-full -skew-x-12 items-center justify-center bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 py-3 ring-1 ring-amber-200/70 transition-all duration-200 enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="flex skew-x-12 items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-zinc-950">
                    {ghStatus === 'working' ? (
                      <>
                        <LoaderCircle
                          className="h-4 w-4 animate-spin"
                          aria-hidden
                        />
                        {ghStep}
                      </>
                    ) : (
                      'Save'
                    )}
                  </span>
                </button>
                <p className="text-center text-[10px] font-semibold uppercase leading-snug tracking-widest text-zinc-500">
                  First save uploads the full source (~115 MB) — later saves
                  are much faster. The upload keeps running server-side even
                  if you close this panel.
                </p>
              </form>
            )}
          </section>
        </div>
      )}

      {/* ==== transient toast — lobby menu stubs AND in-game loot pickups ==== */}
      {toast && (
        <div
          role="status"
          className="absolute left-1/2 top-28 z-40 -translate-x-1/2 rounded-full border border-amber-400/40 bg-zinc-950/85 px-5 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300 shadow-xl backdrop-blur-md sm:top-24"
        >
          {toast}
        </div>
      )}

      {/* ==== jeep enter hint — the dash gauges take over while driving ==== */}
      <div
        ref={driveHudRef}
        style={{ display: 'none' }}
        aria-live="polite"
        className="pointer-events-none absolute bottom-28 left-1/2 z-10 -translate-x-1/2 flex-col items-center gap-0.5 rounded-xl border border-amber-400/40 bg-zinc-950/70 px-5 py-2 text-center shadow-xl backdrop-blur-md"
      >
        <span
          ref={driveHudModeRef}
          className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-200"
        >
          PRESS E TO DRIVE
        </span>
      </div>

      {/* ==== jeep dash gauges: fuel / speed / temp (gauge-ui cluster) ==== */}
      <JeepGauges ref={jeepGaugesRef} />

      {/* ======= flight HUD: DART airspeed/altitude + board hint ======= */}
      <div
        ref={flightHudRef}
        style={{ display: 'none' }}
        aria-live="polite"
        className="pointer-events-none absolute bottom-44 left-1/2 z-10 -translate-x-1/2 flex-col items-center gap-0.5 rounded-xl border border-amber-400/40 bg-zinc-950/70 px-5 py-2 text-center shadow-xl backdrop-blur-md sm:bottom-40"
      >
        <div className="hidden flex-row items-baseline gap-1.5">
          <span
            ref={flightSpeedRef}
            className="text-2xl font-black tabular-nums text-amber-300"
          >
            0
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
            km/h
          </span>
          <span className="ml-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
            ALT
          </span>
          <span
            ref={flightAltRef}
            className="text-2xl font-black tabular-nums text-amber-300"
          >
            0
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
            m
          </span>
        </div>
        <span
          ref={flightHudModeRef}
          className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-200"
        >
          B — FLY DART
        </span>
      </div>

      {/* == top-LEFT HUD: circular 2D minimap dial with the curved vitals
          ring wrapped around it (ring is 133% of the minimap box, so the
          cluster sits inset far enough that the bezel never leaves the
          screen) == */}
      {phase === 'playing' && (
        <div className="absolute left-9 top-9 z-10 flex flex-col items-start gap-2">
          <Minimap
            ref={minimapRef}
            block={BLOCK}
            gridOffset={GRID_OFFSET}
            bridge={mapBridgeRef}
          />
          <HealthBar ref={healthBarRef} />
        </div>
      )}

      {/* ===== top-right HUD: live balance pill + BUZZ combat chip =====
              (shifted below the corner LOBBY button, which owns the exact
              top-right corner in the playing phase) */}
      {phase === 'playing' && (
        <div className="absolute right-3 top-14 z-10 flex flex-col items-end gap-2 sm:top-16">
          <div className="flex items-center gap-2 border border-amber-400/40 bg-zinc-950/70 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
            <span className="flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-amber-400" aria-hidden />
              <span className="text-xs font-black tabular-nums text-amber-300">
                {coins}
              </span>
            </span>
            {gems > 0 && (
              <span className="flex items-center gap-1.5">
                <Gem className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                <span className="text-xs font-black tabular-nums text-emerald-300">
                  {gems}
                </span>
              </span>
            )}
          </div>
          {/* drone-AI status: written from the game loop via
              droneHudRef (textContent only — zero React re-renders) */}
          <div className="flex items-center gap-1.5 border border-red-400/40 bg-zinc-950/70 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
            <Target className="h-3.5 w-3.5 text-red-400" aria-hidden />
            <span
              ref={droneHudRef}
              className="text-xs font-black tabular-nums text-red-300"
            >
              AI PATROL · HULL 100%
            </span>
          </div>
          {/* BUZZ voice link: link state + live mic level + last heard +
              BUZZ's reply — written via refs (textContent only, zero
              re-renders) */}
          <div className="w-64 border border-emerald-400/40 bg-zinc-950/70 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              <Mic
                className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                aria-hidden
              />
              <span
                ref={voiceHudStateRef}
                className="text-xs font-black tabular-nums text-emerald-300"
              >
                VOICE OFF · PRESS V
              </span>
            </div>
            <div
              className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800/80"
              aria-hidden
            >
              <div
                ref={voiceMeterRef}
                className="h-full w-full origin-left rounded-full bg-emerald-400/80 transition-transform duration-75"
                style={{ transform: 'scaleX(0)' }}
              />
            </div>
            <span
              ref={voiceHudHeardRef}
              className="mt-1 block truncate text-[11px] font-semibold leading-4 text-zinc-300"
            >
              Press V to talk — or type to BUZZ
            </span>
            <span
              ref={voiceHudReplyRef}
              className="mt-0.5 block whitespace-normal break-words text-[11px] font-semibold leading-4 text-amber-200"
            />
            {/* TYPED CHAT — the always-open channel: even when the speech
                (ASR) link is rate-limited, typed text rides the same LLM
                brain and BUZZ still answers (and speaks) out loud */}
            <form
              className="mt-1 flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const el = voiceTextRef.current;
                const text = el?.value.trim();
                if (!text) return;
                if (el) el.value = '';
                voiceInjectRef.current?.(text);
              }}
            >
              <input
                ref={voiceTextRef}
                type="text"
                maxLength={120}
                autoComplete="off"
                placeholder="Type to BUZZ…"
                aria-label="Type a message to BUZZ"
                className="h-6 min-w-0 flex-1 border border-emerald-400/30 bg-black/60 px-1.5 text-[11px] font-semibold text-emerald-100 outline-none placeholder:text-zinc-500 focus:border-emerald-300/70"
                onKeyDown={(e) => {
                  // Esc leaves the field instead of the mission
                  if (e.key === 'Escape') e.currentTarget.blur();
                }}
              />
              <button
                type="submit"
                aria-label="Send message to BUZZ"
                className="flex h-6 w-6 shrink-0 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 transition-colors hover:bg-emerald-400/25"
              >
                <Send className="h-3 w-3" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========== mobile touch controls — ONLY on touch devices ========== */}
      {phase === 'playing' && isTouch && (
        <TouchControls apiRef={touchApiRef} />
      )}

      {/* ===== right EDGE, vertically centred: MAXIMIZE (fullscreen) + sound
           stacked VERTICALLY (also the M key) — clears the lobby header/
           logo on top and the mobile fire cluster at the bottom; the top
           offset re-centres within the safe-area box on notched phones */}
      <div
        className="absolute right-3 z-0 flex -translate-y-1/2 flex-col items-center gap-2"
        style={{
          top: 'calc(50% + (env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) / 2)',
        }}
      >
        <button
          type="button"
          onClick={toggleImmersive}
          aria-label={
            isFullscreen
              ? 'Exit fullscreen (show the browser bars)'
              : 'Maximize game — hide the browser bars (fullscreen)'
          }
          aria-pressed={isFullscreen}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/55"
        >
          {isFullscreen ? (
            <Minimize className="h-5 w-5" aria-hidden />
          ) : (
            <Maximize className="h-5 w-5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute game sound' : 'Mute game sound'}
          aria-pressed={muted}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/55"
        >
          {muted ? (
            <VolumeX className="h-5 w-5" aria-hidden />
          ) : (
            <Volume2 className="h-5 w-5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => voiceToggleRef.current?.()}
          aria-label={
            voiceOn
              ? 'Stop BUZZ voice link (V)'
              : 'Start BUZZ voice link (V)'
          }
          aria-pressed={voiceOn}
          title="BUZZ voice link (V)"
          className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
            voiceOn
              ? 'bg-emerald-500/40 text-emerald-100 hover:bg-emerald-500/60'
              : 'bg-black/35 text-white/85 hover:bg-black/55'
          }`}
        >
          {voiceOn ? (
            <Mic className="h-5 w-5" aria-hidden />
          ) : (
            <MicOff className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>

      {/* ===== top-right corner: LOBBY screen toggle — owns the corner in
           the playing phase and tucks under the logo in the lobby; hidden
           while the screen itself or a command panel is open (both carry
           their own close controls) ===== */}
      {phase === 'lobby' && !lobbyScreenOpen && !lobbyPanel && (
        <LobbyScreenButton
          onToggle={() => setLobbyScreenOpen(true)}
          className="right-3 top-12 sm:right-5 sm:top-20"
        />
      )}
      {phase === 'playing' && !lobbyScreenOpen && !lobbyPanel && (
        <div className="absolute right-3 top-2 z-20 flex items-start gap-2 sm:right-5 sm:top-3">
          {/* ZONE STUDIO — colour-code skin forge for every zone's block faces */}
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.blur();
              setZoneStudioOpen((open) => !open);
            }}
            aria-haspopup="dialog"
            aria-expanded={zoneStudioOpen}
            aria-label="Open zone texture studio"
            title="Zone texture studio — colour block skins"
            className="pointer-events-auto group relative flex h-11 items-center gap-2.5 border border-emerald-400/50 bg-zinc-950/70 shadow-lg backdrop-blur-md transition-all hover:border-emerald-300 hover:bg-zinc-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 active:scale-[0.97]"
            style={{ zIndex: 20 }}
          >
            {/* emerald gradient icon tile — the studio's own accent */}
            <span
              aria-hidden
              className="grid h-7 w-7 shrink-0 place-items-center bg-gradient-to-br from-emerald-300 to-teal-600"
            >
              <Paintbrush className="h-4 w-4 text-zinc-950" />
            </span>
            <span className="pr-3 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-100 sm:text-xs">
              Skins
            </span>
            {/* sharp emerald underline fading out — echoes the lobby button */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-emerald-400/80 via-emerald-400/25 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
          <LobbyScreenButton
            onToggle={() => setLobbyScreenOpen(true)}
            className=""
            inline
          />
        </div>
      )}

      {/* ===== full-screen LOBBY screen — survival-GUI-style command deck
           (Inventory / Equipment / Crafting / Hotbar / Statistics) ===== */}
      {lobbyScreenOpen && (
        <LobbyScreen
          coins={coins}
          gems={gems}
          skinIndex={loadout.skinIndex}
          weaponIndex={heroPreviewWeaponIndex}
          customSkinUrls={forgedSkins.map((skin) => skin.texturePath)}
          skinName={ALL_SKINS[loadout.skinIndex]?.name ?? 'Hero'}
          onClose={() => setLobbyScreenOpen(false)}
          onBay={(id) => {
            setLobbyScreenOpen(false);
            setLobbyPanel(id);
          }}
          showToast={showToast}
        />
      )}

      {/* ===== ZONE STUDIO side panel — colour-code skins for every zone's
           block top/side tiles; docks under the Skins/Lobby button row in
           the playing phase ===== */}
      {phase === 'playing' &&
        zoneStudioOpen &&
        !lobbyScreenOpen &&
        !lobbyPanel && (
          <ZoneSkinPanel
            terrainRef={terrainHandleRef}
            terrainReady={terrainReady}
            appliedSkins={appliedSkins}
            onClose={() => setZoneStudioOpen(false)}
            onApplied={(zone, prompt) => {
              setAppliedSkins((prev) => {
                const next = { ...prev };
                if (prompt === null) delete next[zone];
                else next[zone] = prompt;
                return next;
              });
            }}
            showToast={showToast}
          />
        )}

    </main>
  );
}


/** Top-right corner button — opens the full-screen LOBBY screen (both
 *  phases). Same sharp-cornered glass + amber-gradient chrome as the
 *  lobby header bar. `inline` renders it inside a sibling button row
 *  (ZONE STUDIO sits to its left) instead of owning the corner. */
function LobbyScreenButton({
  onToggle,
  className,
  inline = false,
}: {
  onToggle: () => void;
  className: string;
  inline?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.currentTarget.blur();
        onToggle();
      }}
      aria-haspopup="dialog"
      aria-label="Open lobby screen"
      className={`pointer-events-auto group ${
        inline ? 'relative' : 'absolute'
      } flex h-11 items-center gap-2.5 border border-amber-400/50 bg-zinc-950/70 shadow-lg backdrop-blur-md transition-all hover:border-amber-300 hover:bg-zinc-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 active:scale-[0.97] ${className}`}
      style={{ zIndex: 20 }}
    >
      {/* amber gradient icon tile — mirrors the player avatar chip */}
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center bg-gradient-to-br from-amber-300 to-orange-600"
      >
        <Menu className="h-4 w-4 text-zinc-950" />
      </span>
      <span className="pr-3 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-100 sm:text-xs">
        Lobby
      </span>
      {/* sharp amber underline fading out — echoes the header bar */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-amber-400/80 via-amber-400/25 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}

/** Zone catalogue for the AI ZONE STUDIO panel — one entry per terrain
 *  material bucket (same ids/order as ZONE_SKIN_IDS in terrainChunks.ts). */
const STUDIO_ZONES: Array<{ id: ZoneSkinId; label: string; blurb: string }> = [
  { id: 'grass', label: 'Grassland', blurb: 'the default green world' },
  { id: 'snow', label: 'Snowfields', blurb: 'winter snow caps' },
  { id: 'ice', label: 'Glacier', blurb: 'cracked blue ice' },
  { id: 'sand', label: 'Dune Sea', blurb: 'golden desert sand' },
  { id: 'red', label: 'Red Desert', blurb: 'rust-red dunes' },
  { id: 'mesa', label: 'Mesa', blurb: 'terracotta badlands' },
  { id: 'basalt', label: 'Volcano', blurb: 'black basalt rock' },
  { id: 'lava', label: 'Lava', blurb: 'molten caldera flows' },
  { id: 'cherry', label: 'Cherry Grove', blurb: 'pink blossom meadows' },
  { id: 'shroom', label: 'Mushroom Fields', blurb: 'pale mycelium moor' },
  { id: 'crimson', label: 'Crimson Fields', blurb: 'red-tinted grasslands' },
  { id: 'golden', label: 'Golden Fields', blurb: 'yellow-tinted grasslands' },
];

/** Quick-pick colour presets for the zone colour-code panel. */
const COLOR_PRESETS: Array<{ hex: string; label: string }> = [
  { hex: '#58A83C', label: 'Grass green' },
  { hex: '#2E7D32', label: 'Forest floor' },
  { hex: '#E8F0EE', label: 'Snow white' },
  { hex: '#A8D8E8', label: 'Glacier ice' },
  { hex: '#D8C476', label: 'Desert sand' },
  { hex: '#B0532F', label: 'Red desert' },
  { hex: '#8A5A3B', label: 'Mesa rock' },
  { hex: '#2F2F33', label: 'Basalt' },
  { hex: '#E25822', label: 'Lava glow' },
  { hex: '#E8A0C8', label: 'Blossom pink' },
  { hex: '#B9A8C9', label: 'Mycelium lilac' },
  { hex: '#D85A8A', label: 'Candy rose' },
  { hex: '#C44540', label: 'Crimson grass' },
  { hex: '#D2AC38', label: 'Golden grass' },
];

/** Expand #rgb → #rrggbb and upper-case (input must already be validated). */
function normalizeHex(hex: string): string {
  const short = /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return hex.toUpperCase();
}

/** #rrggbb → three 0-255 channels. */
function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Deterministic per-cell jitter in [-1, 1] — stable pixels per repaint. */
function cellJitter(index: number): number {
  const s = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Paint the 32×64 zone atlas from one colour — a classic GRASS-BLOCK
 *  skin. The TOP half is the selected colour alone, laid down as an 8×8
 *  grid of big 4px pixel-art cells with a gentle brightness jitter (the
 *  same chunky pixel look as the grassland tile). The SIDE half is NOT
 *  painted with the colour: it keeps the zone's vanilla block texture
 *  (dirt, sandstone, basalt columns…) from `baseAtlas` and only wears
 *  the colour as a chunky fringe along its top edge — one full pixel row
 *  plus a ragged half row dipping into the block, exactly like the grass
 *  side overlay. When `baseAtlas` is missing a neutral earthy soil tone
 *  is painted underneath instead. */
function colorAtlasCanvas(
  hex: string,
  baseAtlas?: HTMLCanvasElement | null
): HTMLCanvasElement {
  const tile = ZONE_ATLAS_TILE;
  const canvas = document.createElement('canvas');
  canvas.width = tile;
  canvas.height = tile * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const [r, g, b] = hexToRgb(hex);
  const cells = 8;
  const cell = tile / cells;

  // --- TOP half: the colour itself in big pixel-art cells ---------------
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const f = Math.max(
        0.2,
        1.08 + cellJitter(cy * cells + cx) * 0.07
      );
      ctx.fillStyle = `rgb(${Math.min(255, Math.round(r * f))}, ${Math.min(
        255,
        Math.round(g * f)
      )}, ${Math.min(255, Math.round(b * f))})`;
      ctx.fillRect(cx * cell, cy * cell, cell, cell);
    }
  }

  // --- SIDE half: vanilla texture (or soil fallback) + colour fringe ----
  ctx.imageSmoothingEnabled = false;
  const hasBase =
    !!baseAtlas &&
    baseAtlas.width >= tile &&
    baseAtlas.height >= tile * 2;
  if (hasBase) {
    // the zone's own under-ground look, bottom half of its vanilla atlas
    ctx.drawImage(baseAtlas, 0, tile, tile, tile, 0, tile, tile, tile);
  } else {
    // no vanilla base available — paint a neutral earthy soil so the
    // fringe still reads as a capped block (55% soil, 45% the colour)
    const soil = (c: number, e: number) => Math.round(c * 0.45 + e * 0.55);
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const f = Math.max(0.2, 0.92 + cellJitter(64 + cy * cells + cx) * 0.08);
        ctx.fillStyle = `rgb(${soil(Math.round(r * f), 72)}, ${soil(
          Math.round(g * f),
          58
        )}, ${soil(Math.round(b * f), 44)})`;
        ctx.fillRect(cx * cell, tile + cy * cell, cell, cell);
      }
    }
  }
  // the colour rides ONLY the top edge of the side: row 0 fully coloured,
  // row 1 ragged (~60% of columns dip one big pixel lower — grass lip)
  const fringeCell = (cx: number, cy: number, jitter: number) => {
    const f = Math.max(0.2, 0.96 + jitter * 0.06);
    ctx.fillStyle = `rgb(${Math.min(255, Math.round(r * f))}, ${Math.min(
      255,
      Math.round(g * f)
    )}, ${Math.min(255, Math.round(b * f))})`;
    ctx.fillRect(cx * cell, tile + cy * cell, cell, cell);
  };
  for (let cx = 0; cx < cells; cx++) {
    fringeCell(cx, 0, cellJitter(128 + cx));
    if (cellJitter(160 + cx) > -0.25) fringeCell(cx, 1, cellJitter(192 + cx));
  }
  return canvas;
}

/** Same atlas as a PNG data URL (for previews + persistence). */
function buildColorAtlasDataUrl(
  hex: string,
  baseAtlas?: HTMLCanvasElement | null
): string {
  return colorAtlasCanvas(hex, baseAtlas).toDataURL('image/png');
}

/** One pixel-art tile (TOP or SIDE face) of a zone's live atlas. Reads the
 *  texture straight off the terrain material through the game handle —
 *  so previews update the instant a skin is applied — or draws an explicit
 *  override atlas (the pending AI result) when given. */
function ZoneTileCanvas({
  terrainRef,
  zone,
  face,
  overrideAtlas,
  tick = 0,
  className = '',
}: {
  terrainRef: { current: TerrainChunksHandle | null };
  zone: ZoneSkinId;
  face: 'top' | 'side';
  /** Draw this atlas data URL instead of the live material texture. */
  overrideAtlas?: string | null;
  /** Bump to force a redraw of the live preview (after apply/reset). */
  tick?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tile = ZONE_ATLAS_TILE;
    canvas.width = tile;
    canvas.height = tile;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let cancelled = false;

    const drawHalf = (img: HTMLImageElement | HTMLCanvasElement) => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, tile, tile);
      ctx.drawImage(
        img,
        0,
        face === 'top' ? 0 : tile,
        tile,
        tile, // source: one half of the 32x64 atlas
        0,
        0,
        tile,
        tile // dest: full 32x32 tile
      );
    };

    if (overrideAtlas) {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) drawHalf(img);
      };
      img.src = overrideAtlas;
      return () => {
        cancelled = true;
      };
    }

    const scratch = document.createElement('canvas');
    const terrain = terrainRef.current;
    if (terrain && terrain.getZoneAtlas(zone, scratch)) {
      drawHalf(scratch);
    }
    return () => {
      cancelled = true;
    };
  }, [terrainRef, zone, face, overrideAtlas, tick]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ imageRendering: 'pixelated' }}
      aria-hidden
    />
  );
}

/** COLOR ZONE STUDIO — the small side panel docked under the SKINS button
 *  (left of the Lobby button) during gameplay. Pick a zone, pick a colour
 *  code (native picker, hex field or preset swatch), preview the grass-block
 *  tiles it paints (big-pixel colour cap on top, colour fringe on the
 *  vanilla side texture), then apply to the WHOLE zone: every loaded
 *  chunk repaints instantly and the colour skin persists across reloads. */
function ZoneSkinPanel({
  terrainRef,
  terrainReady,
  appliedSkins,
  onClose,
  onApplied,
  showToast,
}: {
  terrainRef: { current: TerrainChunksHandle | null };
  terrainReady: boolean;
  appliedSkins: Record<string, string>;
  onClose: () => void;
  onApplied: (zone: ZoneSkinId, prompt: string | null) => void;
  showToast: (message: string) => void;
}) {
  const [zone, setZone] = useState<ZoneSkinId>('grass');
  /** Selected skin colour (always a valid #rrggbb) + the free-typed field. */
  const [color, setColor] = useState('#58A83C');
  const [hexInput, setHexInput] = useState('#58A83C');
  const [applying, setApplying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped after apply/reset so the live tile previews redraw. */
  const [previewTick, setPreviewTick] = useState(0);

  const zoneMeta = STUDIO_ZONES.find((z) => z.id === zone) ?? STUDIO_ZONES[0];
  const skinnedPrompt = appliedSkins[zone];

  const hexValid = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hexInput.trim());
  /** The pixel-art 32×64 atlas the current colour paints — top half = the
   *  colour in big pixels, bottom half = the zone's VANILLA side tile with
   *  the colour as a fringe along its top edge. Composited over the zone's
   *  original atlas (read through the terrain handle) whenever the code,
   *  the zone or the terrain readiness changes. */
  const [atlas, setAtlas] = useState<string | null>(null);
  useEffect(() => {
    if (!hexValid) {
      setAtlas(null);
      return;
    }
    const hex = normalizeHex(hexInput.trim());
    const scratch = document.createElement('canvas');
    const terrain = terrainRef.current;
    const base =
      terrain && terrain.getZoneBaseAtlas(zone, scratch) ? scratch : null;
    setAtlas(buildColorAtlasDataUrl(hex, base));
  }, [hexInput, hexValid, zone, terrainReady, previewTick, terrainRef]);

  // Esc closes the studio (same pattern as the fullscreen lobby panels)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Keep the free-typed hex field and the native picker in lockstep — the
   *  picker colour only commits once the text is a real #rgb / #rrggbb. */
  const commitHex = (value: string) => {
    setHexInput(value.slice(0, 7));
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())) {
      setColor(normalizeHex(value.trim()));
      setError(null);
    }
  };

  /** APPLY: paint the whole zone live from the colour, then persist it. */
  const apply = async () => {
    if (!atlas || applying || resetting) return;
    setApplying(true);
    setError(null);
    try {
      const terrain = terrainRef.current;
      const hex = normalizeHex(hexInput.trim());
      // composite the colour over the zone's VANILLA atlas — grass-block
      // style: big-pixel cap on the top face, fringe on the side's top edge
      const scratch = document.createElement('canvas');
      const base =
        terrain && terrain.getZoneBaseAtlas(zone, scratch) ? scratch : null;
      const canvas = colorAtlasCanvas(hex, base);
      // the canvas goes straight to the material — same pixels as `atlas`
      const applied = terrain
        ? await terrain.applyZoneSkin(zone, canvas)
        : false;
      if (!applied) throw new Error('Terrain is not ready yet — try again');
      onApplied(zone, hex);
      setPreviewTick((tick) => tick + 1);
      const saved = await fetch('/api/terrain/ai-texture', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone,
          prompt: hex,
          mode: 'color',
          atlas: canvas.toDataURL('image/png'),
        }),
      });
      if (!saved.ok) throw new Error('Applied, but could not save the skin');
      showToast(`${zoneMeta.label} re-skinned ${hex} — saved`);
    } catch (err) {
      setError(
        err instanceof Error && err.message.length > 0
          ? err.message
          : 'Could not apply the skin'
      );
    } finally {
      setApplying(false);
    }
  };

  /** RESET: restore the zone's original procedural texture + drop the save. */
  const reset = async () => {
    if (!skinnedPrompt || resetting || applying) return;
    setResetting(true);
    setError(null);
    try {
      const terrain = terrainRef.current;
      if (!terrain || !terrain.restoreZoneSkin(zone)) {
        throw new Error('Terrain is not ready yet — try again');
      }
      onApplied(zone, null);
      setPreviewTick((tick) => tick + 1);
      await fetch(`/api/terrain/ai-texture?zone=${encodeURIComponent(zone)}`, {
        method: 'DELETE',
      });
      showToast(`${zoneMeta.label} restored to vanilla`);
    } catch (err) {
      setError(
        err instanceof Error && err.message.length > 0
          ? err.message
          : 'Could not reset the zone'
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <aside
      role="dialog"
      aria-label="Zone texture studio"
      className="pointer-events-auto absolute right-3 top-[60px] z-20 flex max-h-[calc(100dvh-84px)] w-[19.5rem] max-w-[calc(100vw-1.5rem)] flex-col border border-emerald-400/40 bg-zinc-950/85 shadow-xl backdrop-blur-md sm:right-5 sm:top-[64px]"
    >
      {/* header — mirrors the lobby panel chrome in the studio accent */}
      <header className="flex shrink-0 items-center gap-2 border-b border-emerald-400/30 bg-zinc-950/80 px-3 py-2">
        <Paintbrush className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-200/90">
          Zone Studio
        </h2>
        <span className="ml-auto truncate text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          colour block skins
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close zone studio"
          className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center border border-zinc-700 bg-zinc-900/80 text-zinc-400 transition-colors hover:border-emerald-400/60 hover:text-emerald-200"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </header>

      <div className="ratfire-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {/* ZONE PICKER — one chip per terrain material bucket */}
        <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-500">
          Zone
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {STUDIO_ZONES.map((z) => {
            const selected = z.id === zone;
            const skinned = Boolean(appliedSkins[z.id]);
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => {
                  setZone(z.id);
                  setError(null);
                }}
                aria-pressed={selected}
                className={`flex items-center gap-1.5 border px-2 py-1.5 text-left transition-colors ${
                  selected
                    ? 'border-emerald-400/80 bg-emerald-400/15'
                    : 'border-zinc-800 bg-zinc-900/60 hover:border-emerald-400/40'
                }`}
              >
                <ZoneTileCanvas
                  terrainRef={terrainRef}
                  zone={z.id}
                  face="top"
                  tick={previewTick}
                  className="h-6 w-6 shrink-0 border border-zinc-700/80"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[10px] font-black uppercase tracking-[0.12em] ${
                      selected ? 'text-emerald-100' : 'text-zinc-300'
                    }`}
                  >
                    {z.label}
                  </span>
                </span>
                {skinned && (
                  <span
                    aria-label="skinned"
                    title={appliedSkins[z.id]}
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* SELECTED ZONE + CURRENT TILES (live off the terrain materials) */}
        <div className="mt-3 flex items-start gap-2 border border-zinc-800 bg-zinc-900/60 p-2">
          <div className="flex gap-1.5">
            <figure className="flex flex-col items-center gap-0.5">
              <ZoneTileCanvas
                terrainRef={terrainRef}
                zone={zone}
                face="top"
                tick={previewTick}
                className="h-12 w-12 border border-zinc-700"
              />
              <figcaption className="text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                Top
              </figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-0.5">
              <ZoneTileCanvas
                terrainRef={terrainRef}
                zone={zone}
                face="side"
                tick={previewTick}
                className="h-12 w-12 border border-zinc-700"
              />
              <figcaption className="text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                Side
              </figcaption>
            </figure>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-zinc-100">
              {zoneMeta.label}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold leading-3.5 text-zinc-500">
              {zoneMeta.blurb}
            </p>
            <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-300/80">
              {skinnedPrompt
                ? `skinned · ${skinnedPrompt}`
                : 'vanilla texture'}
            </p>
          </div>
        </div>

        {/* COLOUR CODE — native picker, hex field and preset swatches */}
        <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-500">
          Colour code
        </p>
        <div className="mt-1.5 flex items-stretch gap-1.5">
          <input
            type="color"
            value={color}
            onChange={(event) => {
              setColor(event.target.value);
              setHexInput(event.target.value.toUpperCase());
              setError(null);
            }}
            aria-label="Pick the skin colour"
            title="Pick the skin colour"
            className="h-9 w-10 shrink-0 cursor-pointer border border-zinc-700 bg-black/60 p-0.5"
          />
          <input
            type="text"
            value={hexInput}
            onChange={(event) => commitHex(event.target.value)}
            placeholder="#58A83C"
            maxLength={7}
            spellCheck={false}
            aria-label="Colour hex code"
            className={`min-w-0 flex-1 border bg-black/60 px-2 text-[11px] font-black uppercase tracking-[0.15em] text-zinc-100 outline-none placeholder:text-zinc-600 ${
              hexInput.trim().length === 0 || hexValid
                ? 'border-zinc-700 focus:border-emerald-400/70'
                : 'border-red-500/60 focus:border-red-400'
            }`}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              onClick={() => {
                setColor(preset.hex);
                setHexInput(preset.hex);
                setError(null);
              }}
              title={`${preset.label} · ${preset.hex}`}
              aria-label={`Use ${preset.label} (${preset.hex})`}
              aria-pressed={color.toUpperCase() === preset.hex}
              style={{ backgroundColor: preset.hex }}
              className={`h-6 w-6 border transition-transform hover:scale-110 ${
                color.toUpperCase() === preset.hex
                  ? 'border-emerald-300 ring-1 ring-emerald-300/70'
                  : 'border-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* LIVE PREVIEW — the exact tiles the colour paints */}
        {atlas && (
          <div className="mt-2 flex items-end gap-2 border border-zinc-800 bg-zinc-900/60 p-2">
            <figure className="flex flex-col items-center gap-0.5">
              <ZoneTileCanvas
                terrainRef={terrainRef}
                zone={zone}
                face="top"
                overrideAtlas={atlas}
                className="h-12 w-12 border border-emerald-400/50"
              />
              <figcaption className="text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                Top
              </figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-0.5">
              <ZoneTileCanvas
                terrainRef={terrainRef}
                zone={zone}
                face="side"
                overrideAtlas={atlas}
                className="h-12 w-12 border border-emerald-400/50"
              />
              <figcaption className="text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                Side
              </figcaption>
            </figure>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-emerald-200">
                {normalizeHex(hexInput.trim())}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold leading-3.5 text-zinc-500">
                big-pixel cap on top · colour fringe on the vanilla side.
              </p>
            </div>
          </div>
        )}

        {/* APPLY — repaints every loaded chunk of the zone, then saves */}
        <button
          type="button"
          onClick={() => void apply()}
          disabled={!atlas || applying || resetting}
          className="mt-2 flex h-9 w-full items-center justify-center gap-2 border border-emerald-400/70 bg-gradient-to-b from-emerald-400/25 to-teal-600/25 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-100 transition-colors hover:from-emerald-400/40 hover:to-teal-600/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {applying ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Paintbrush className="h-4 w-4" aria-hidden />
          )}
          {applying ? 'Painting the zone…' : `Apply to ${zoneMeta.label}`}
        </button>
        <p className="mt-1 text-center text-[9px] font-semibold text-zinc-600">
          instant repaint · saved across reloads
        </p>

        {/* ERROR */}
        {error && (
          <p className="mt-2 border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold leading-3.5 text-red-300">
            {error}
          </p>
        )}

        {/* RESET to vanilla (only when a skin is worn) */}
        {skinnedPrompt && (
          <button
            type="button"
            onClick={() => void reset()}
            disabled={resetting || applying}
            className="mt-3 flex h-8 w-full items-center justify-center gap-2 border border-zinc-700 bg-zinc-900/70 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
          >
            {resetting ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            )}
            Reset {zoneMeta.label} to vanilla
          </button>
        )}

        <p className="mt-3 border-t border-zinc-800 pt-2 text-[9px] font-semibold leading-3.5 text-zinc-600">
          Applying repaints the whole zone instantly and saves the skin — it
          survives reloads. Esc closes the studio.
        </p>
      </div>
    </aside>
  );
}

/** Framed section box for the LOBBY screen — RATFIRE's take on the
 *  titled crates of the classic survival GUI. */
function LobbyBox({
  icon: BoxIcon,
  title,
  hint,
  className = '',
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  className?: string;
  /** Optional control pinned to the header's far right (after the hint) —
   *  e.g. the crafting panel's help button + popover. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={`relative flex min-w-0 flex-col border border-zinc-800 bg-zinc-900/60 ${className}`}
    >
      <header className="flex items-center gap-2 border-b border-amber-400/25 bg-zinc-950/70 px-3 py-2">
        <BoxIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
        <h3 className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/90">
          {title}
        </h3>
        <span className="ml-auto truncate text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          {hint}
        </span>
        {action}
      </header>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  );
}

/** Crafting-panel recipe shape — a vanilla engine recipe OR an AI-forged
 *  custom one (which additionally carries its display name, generated icon
 *  path and AI flavor line). Vanilla recipes simply leave the extras off. */
type PanelRecipe = CraftRecipe & {
  custom?: boolean;
  name?: string;
  icon?: string;
  flavor?: string;
};

/** ==== CRAFTING PANEL — fully workable vanilla-style crafting ===========
 *  Shaped recipes on a 2x2 inventory grid or a 3x3 crafting table,
 *  shapeless recipes, furnace smelting and ore refining — 320+ real
 *  Minecraft recipes (src/game/crafting.ts) with real Minecraft Wiki item
 *  icons. Ingredients click into the grid straight from the lobby
 *  inventory (drag & drop works too), the searchable recipe book fills
 *  the grid for you, and CRAFT / CRAFT MAX consume stacks by count.
 *  ===================================================================== */
function CraftingPanel({
  invSlots,
  setInvSlots,
  craftGrid,
  setCraftGrid,
  showToast,
  dragActive,
  customRecipes,
  onForged,
  onDeleteCustom,
  onCustomIconChange,
}: {
  invSlots: Array<LobbyItemEntry | null>;
  setInvSlots: React.Dispatch<
    React.SetStateAction<Array<LobbyItemEntry | null>>
  >;
  craftGrid: Array<LobbyItemEntry | null>;
  setCraftGrid: React.Dispatch<
    React.SetStateAction<Array<LobbyItemEntry | null>>
  >;
  showToast: (message: string) => void;
  dragActive: boolean;
  /** AI-forged recipes (RECIPE FORGE) — matched in the grid + book shelf. */
  customRecipes: PanelRecipe[];
  /** Called after a successful forge so the lobby can keep the book. */
  onForged: (recipe: PanelRecipe) => void;
  /** Trash a forged recipe out of the book (lobby hits the DELETE API). */
  onDeleteCustom: (recipeId: string, name: string) => void;
  /** Re-icon a forged recipe (candidate pick or upload) — lobby keeps the
   *  book rows in sync with the saved DB state. */
  onCustomIconChange: (recipeId: string, iconPath: string) => void;
}) {
  /** 3 = crafting table (3x3), 2 = inventory grid (2x2). */
  const [tableMode, setTableMode] = useState<2 | 3>(3);
  const [bookOpen, setBookOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bookQuery, setBookQuery] = useState('');
  const [bookCat, setBookCat] = useState<RecipeCategory | 'ai' | 'all'>(
    'all'
  );
  const [dragOverCell, setDragOverCell] = useState<number | null>(null);
  /** Forged recipe id pending a second-tap delete confirm (book trash). */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** Two-tap delete on a forged book row: first tap arms the confirm, the
   *  second (within the window) fires onDeleteCustom. Arms expire silently. */
  const tapDeleteCustom = useCallback((recipeId: string, name: string) => {
    if (confirmDeleteId === recipeId) {
      setConfirmDeleteId(null);
      onDeleteCustom(recipeId, name);
      return;
    }
    setConfirmDeleteId(recipeId);
    window.setTimeout(
      () =>
        setConfirmDeleteId((current) =>
          current === recipeId ? null : current
        ),
      3000
    );
  }, [confirmDeleteId, onDeleteCustom]);
  /** Active placement blueprint — per grid cell, the accepted ingredient ids
   *  that belong there (null = must stay empty). Set by the recipe-book fill
   *  and the AI craft-by-words loader; drives the glowing ghost cells so the
   *  exact Minecraft pattern stays visible while missing parts are gathered,
   *  and guides smart chip placement into the proper cells. */
  const [blueprint, setBlueprint] = useState<
    Array<string[] | null> | null
  >(null);

  /** ==== AI — craft-by-words + recipe forge state ==== */
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgePrompt, setForgePrompt] = useState('');
  const [forgeBusy, setForgeBusy] = useState(false);
  const [forgeStep, setForgeStep] = useState('');
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [forgedRecipe, setForgedRecipe] = useState<PanelRecipe | null>(null);
  /** Pixel-art icon candidates (public /ai-icons/ paths) for the latest forge. */
  const [forgeCandidates, setForgeCandidates] = useState<string[]>([]);
  /** True while an icon pick/upload round-trip is in flight. */
  const [forgeIconBusy, setForgeIconBusy] = useState(false);

  /** Recipe-book categories — the vanilla shelf plus the AI Forge shelf. */
  const panelCats = useMemo(
    () => [...RECIPE_CATEGORIES, { id: 'ai' as const, label: 'AI Forge' }],
    []
  );

  /** Display label for ANY output id — AI-forged items resolve through the
   *  module-level AI_ITEM_DEFS registry, vanilla through the engine. */
  const displayLabel = useCallback(
    (id: string) => AI_ITEM_DEFS.get(id)?.label ?? craftItemLabel(id),
    []
  );

  /** Every ingredient id the forge may use — engine items + mined blocks. */
  const forgeCatalog = useMemo(() => {
    const entries = new Map<string, string>();
    for (const [id, def] of Object.entries(CRAFT_ITEMS)) {
      entries.set(id, def.label);
    }
    for (const group of MINED_BLOCK_GROUPS) {
      for (const item of group.items) {
        if (!entries.has(item.id)) entries.set(item.id, item.label);
      }
    }
    return [...entries].map(([id, label]) => ({ id, label }));
  }, []);

  const activeCells = useMemo(
    () => (tableMode === 3 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 3, 4]),
    [tableMode]
  );

  /** Write-through state mirrors — the refs are the authoritative values,
   *  advanced IMMEDIATELY on every crafting action so several actions in the
   *  same tick chain correctly, while React state mirrors them for rendering
   *  (plain setState calls — never nested inside updaters). */
  const invRef = useRef(invSlots);
  const gridRef = useRef(craftGrid);
  useEffect(() => {
    invRef.current = invSlots;
  }, [invSlots]);
  useEffect(() => {
    gridRef.current = craftGrid;
  }, [craftGrid]);
  const setInv = useCallback(
    (next: Array<LobbyItemEntry | null>) => {
      invRef.current = next;
      setInvSlots(next);
    },
    [setInvSlots]
  );
  const setGrid = useCallback(
    (next: Array<LobbyItemEntry | null>) => {
      gridRef.current = next;
      setCraftGrid(next);
    },
    [setCraftGrid]
  );

  /** Shared placement: return the cell's old item, take one from the source
   *  slot, and drop the new one into the grid cell. */
  const commitPlace = (
    srcSlotIndex: number,
    cellIndex: number
  ): boolean => {
    const slots = invRef.current;
    const source = slots[srcSlotIndex];
    if (!source || source.count < 1) return false;
    const existing = gridRef.current[cellIndex];
    if (existing && existing.id === source.id) {
      showToast(`${source.label} IS ALREADY IN SLOT ${cellIndex + 1}`);
      return false;
    }
    let next = slots;
    if (existing) {
      const given = lobbyGiveSlots(next, existing, 1);
      if (!given) {
        showToast('INVENTORY FULL — clear the grid first');
        return false;
      }
      next = given;
    }
    const taken = lobbyTakeSlots(next, source.id);
    if (!taken) return false;
    const gridNext = [...gridRef.current];
    gridNext[cellIndex] = { ...source, count: 1 };
    setInv(taken);
    setGrid(gridNext);
    return true;
  };

  /** The recipe satisfied by the placed grid (null = nothing yet) — the
   *  vanilla engine book first, then the AI-forged custom shelf. */
  const matchedVanilla = useMemo(() => {
    if (tableMode === 3) return findGridMatch(craftGrid, 3, 3);
    if ([2, 5, 6, 7, 8].some((cell) => craftGrid[cell])) return null;
    const sub = [craftGrid[0], craftGrid[1], craftGrid[3], craftGrid[4]];
    return findGridMatch(sub, 2, 2);
  }, [craftGrid, tableMode]);
  const matchedCustom = useMemo(() => {
    if (customRecipes.length === 0) return null;
    if (tableMode === 3) {
      return (
        customRecipes.find((recipe) =>
          gridMatchesRecipe(recipe, craftGrid, 3, 3)
        ) ?? null
      );
    }
    if ([2, 5, 6, 7, 8].some((cell) => craftGrid[cell])) return null;
    const sub = [craftGrid[0], craftGrid[1], craftGrid[3], craftGrid[4]];
    return (
      customRecipes.find((recipe) => gridMatchesRecipe(recipe, sub, 2, 2)) ??
      null
    );
  }, [craftGrid, tableMode, customRecipes]);
  const matched: PanelRecipe | null = matchedVanilla ?? matchedCustom;

  const have = useCallback(
    (id: string) => lobbyCountSlots(invSlots, id),
    [invSlots]
  );

  /** Distinct owned ingredients for the quick-place chips. */
  const chips = useMemo(() => {
    const byId = new Map<string, { id: string; count: number; img: string }>();
    for (const slot of invSlots) {
      if (!slot || slot.count < 1) continue;
      const cur = byId.get(slot.id);
      if (cur) cur.count += slot.count;
      else
        byId.set(slot.id, {
          id: slot.id,
          count: slot.count,
          img: slot.img,
        });
    }
    return [...byId.values()].sort((a, b) =>
      lobbyEntryForId(a.id).label.localeCompare(lobbyEntryForId(b.id).label)
    );
  }, [invSlots]);

  /** Place one item into a grid cell (from a slot index or an item id). */
  const placeCell = (cellIndex: number, srcSlot?: number, srcId?: string) => {
    let slotIndex = srcSlot;
    if (slotIndex === undefined && srcId) {
      slotIndex = invRef.current.findIndex(
        (s) => s?.id === srcId && s.count > 0
      );
      if (slotIndex === -1) {
        showToast('NONE LEFT IN INVENTORY');
        return;
      }
    }
    if (slotIndex === undefined) return;
    commitPlace(slotIndex, cellIndex);
  };

  /** Click a filled cell — return its item to the inventory. */
  const returnCell = (cellIndex: number) => {
    const entry = gridRef.current[cellIndex];
    if (!entry) return;
    const given = lobbyGiveSlots(invRef.current, entry, 1);
    if (!given) {
      showToast('INVENTORY FULL');
      return;
    }
    const gridNext = [...gridRef.current];
    gridNext[cellIndex] = null;
    setInv(given);
    setGrid(gridNext);
  };

  /** Return every placed item to the inventory (and drop the blueprint). */
  const clearGrid = () => {
    let slots = invRef.current;
    const gridNext = [...gridRef.current];
    let returned = 0;
    for (let cell = 0; cell < 9; cell++) {
      const entry = gridNext[cell];
      if (!entry) continue;
      const given = lobbyGiveSlots(slots, entry, 1);
      if (!given) continue;
      slots = given;
      gridNext[cell] = null;
      returned++;
    }
    setBlueprint(null);
    if (returned === 0) return;
    setInv(slots);
    setGrid(gridNext);
    showToast(
      `GRID CLEARED · ${returned} ITEM${returned > 1 ? 'S' : ''} BACK`
    );
  };

  /** Swap two grid cells (drag & drop rearranging). */
  const swapCells = (a: number, b: number) => {
    if (a === b) return;
    const next = [...gridRef.current];
    const tmp = next[a];
    next[a] = next[b];
    next[b] = tmp;
    setGrid(next);
  };

  /** Craft the matched recipe once (ingredients were taken at placement). */
  const craftOnce = () => {
    const recipe = matched;
    if (!recipe) return;
    const given = lobbyGiveSlots(
      invRef.current,
      { ...lobbyEntryForId(recipe.out), count: recipe.outCount },
      recipe.outCount
    );
    if (!given) {
      showToast('INVENTORY FULL — free a slot first');
      return;
    }
    setInv(given);
    setGrid(Array(9).fill(null));
    setBlueprint(null);
    showToast(
      `CRAFTED · ${displayLabel(recipe.out).toUpperCase()} ×${recipe.outCount}`
    );
  };

  /** Shift-craft: return grid items, then craft as many times as possible. */
  const craftMax = () => {
    const recipe = matched;
    if (!recipe) return;
    let slots = invRef.current;
    const keptGrid: Array<LobbyItemEntry | null> = Array(9).fill(null);
    for (let cell = 0; cell < 9; cell++) {
      const entry = gridRef.current[cell];
      if (!entry) continue;
      const given = lobbyGiveSlots(slots, entry, 1);
      if (given) slots = given;
      else keptGrid[cell] = entry;
    }
    const max = Math.min(
      maxCraftable(recipe, (id) => lobbyCountSlots(slots, id)),
      64
    );
    let crafted = 0;
    for (let attempt = 0; attempt < max; attempt++) {
      const taken: string[] = [];
      let ok = true;
      for (const { accepted, need } of recipeNeeds(recipe)) {
        for (let n = 0; n < need && ok; n++) {
          const pick = accepted.find((id) => lobbyCountSlots(slots, id) > 0);
          if (!pick) {
            ok = false;
            break;
          }
          const after = lobbyTakeSlots(slots, pick);
          if (!after) {
            ok = false;
            break;
          }
          slots = after;
          taken.push(pick);
        }
        if (!ok) break;
      }
      if (!ok) {
        for (const id of taken) {
          slots = lobbyGiveSlots(slots, lobbyEntryForId(id), 1) ?? slots;
        }
        break;
      }
      const given = lobbyGiveSlots(
        slots,
        { ...lobbyEntryForId(recipe.out), count: recipe.outCount },
        recipe.outCount
      );
      if (!given) {
        for (const id of taken) {
          slots = lobbyGiveSlots(slots, lobbyEntryForId(id), 1) ?? slots;
        }
        break;
      }
      slots = given;
      crafted++;
    }
    if (crafted === 0) {
      showToast('NOTHING CRAFTED — need more ingredients or slot space');
      setGrid(keptGrid);
      return;
    }
    setInv(slots);
    setGrid(keptGrid);
    setBlueprint(null);
    showToast(
      `CRAFTED ×${crafted} · ${displayLabel(recipe.out).toUpperCase()}`
    );
  };

  /** Load a recipe into the grid from inventory — shared by the recipe-book
   *  FILL and the AI craft-by-words loader. Places every owned ingredient at
   *  its EXACT Minecraft pattern position (shaped: row/col mapped to the 3×3
   *  cells; shapeless: the first active cells); cells you can't fill yet stay
   *  empty but show a glowing blueprint ghost marking where the missing part
   *  belongs. Wide recipes auto-switch to the 3×3 table instead of
   *  dead-ending. Returns the shortfall list for the caller's note. */
  const fillRecipe = (
    recipe: CraftRecipe
  ): Array<{ label: string; need: number; have: number }> => {
    if (recipe.type === 'smelting') {
      const missing = missingIngredients(recipe, (id) =>
        lobbyCountSlots(invRef.current, id)
      );
      if (missing.length) return missing;
      instantSmelt(recipe);
      return [];
    }
    const ph = (recipe.pattern ?? []).length;
    const pw = Math.max(...(recipe.pattern ?? [' ']).map((row) => row.length));
    let mode = tableMode;
    if (
      recipe.type === 'shaped' &&
      (recipe.mode > tableMode || ph > tableMode || pw > tableMode)
    ) {
      mode = 3;
      setTableMode(3);
      showToast('SWITCHED TO THE 3×3 CRAFTING TABLE');
    }
    const active = mode === 3 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 3, 4];
    let slots = invRef.current;
    const nextGrid: Array<LobbyItemEntry | null> = Array(9).fill(null);
    for (let cell = 0; cell < 9; cell++) {
      const entry = gridRef.current[cell];
      if (!entry) continue;
      const given = lobbyGiveSlots(slots, entry, 1);
      if (given) slots = given;
      else nextGrid[cell] = entry;
    }
    // Shortfall is measured BEFORE placement — items consumed by the grid
    // would otherwise read as "missing" even on a fully loaded pattern.
    const missing = missingIngredients(recipe, (id) =>
      lobbyCountSlots(slots, id)
    );
    // The blueprint: exact per-cell accepted ids, exactly like vanilla —
    // pickaxe = 3 material across the top, sticks down the middle column.
    const plan = recipeBlueprintCells(recipe, active);
    for (const cell of active) {
      if (nextGrid[cell]) continue; // an un-returnable item keeps its slot
      const accepted = plan[cell];
      if (!accepted) continue;
      const pick = accepted.find((id) => lobbyCountSlots(slots, id) > 0);
      if (!pick) continue; // left empty — the blueprint ghost marks the spot
      const after = lobbyTakeSlots(slots, pick);
      if (!after) continue;
      slots = after;
      nextGrid[cell] = lobbyEntryForId(pick);
    }
    setInv(slots);
    setGrid(nextGrid);
    setBlueprint(plan);
    setBookOpen(false);
    const name = displayLabel(recipe.out).toUpperCase();
    showToast(
      missing.length
        ? `BLUEPRINT SET · ${name} — MISSING: ${missing
            .map((m) => `${m.label} (${m.have}/${m.need})`)
            .join(', ')} — glowing cells mark the spots`
        : `GRID SET · ${name} — press CRAFT`
    );
    return missing;
  };

  /** Furnace recipes craft straight from the book (no grid). */
  const instantSmelt = (recipe: CraftRecipe): boolean => {
    const accepted = expandIngredient(recipe.ins?.[0] ?? '');
    const pick = accepted.find((id) => lobbyCountSlots(invRef.current, id) > 0);
    if (!pick) {
      showToast(`NEED: ${accepted.map((id) => craftItemLabel(id)).join(' / ')}`);
      return false;
    }
    const after = lobbyTakeSlots(invRef.current, pick);
    if (!after) return false;
    const given = lobbyGiveSlots(
      after,
      { ...lobbyEntryForId(recipe.out), count: recipe.outCount },
      recipe.outCount
    );
    if (!given) {
      showToast('INVENTORY FULL');
      return false;
    }
    setInv(given);
    showToast(
      `SMELTED · ${displayLabel(recipe.out).toUpperCase()} ×${recipe.outCount}`
    );
    return true;
  };

  /** ==== AI CRAFT-BY-WORDS — phrase → best-matching recipe → grid ===== */
  const askCraftWords = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiBusy) return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const res = await fetch('/api/ai/craft-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          recipes: CRAFT_RECIPES.concat(customRecipes).map((recipe) => ({
            id: recipe.id,
            out: recipe.custom ? recipe.name : craftItemLabel(recipe.out),
            ingredients: recipeIngredientLabels(recipe).join(' + '),
            type: recipe.type,
          })),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        recipeId?: string;
        note?: string;
      };
      const recipe = data.recipeId
        ? CRAFT_RECIPES.find((r) => r.id === data.recipeId) ??
          customRecipes.find((r) => r.id === data.recipeId)
        : null;
      if (!recipe) {
        setAiNote(
          data.note ?? 'No recipe matches — try naming the item, or forge it.'
        );
        return;
      }
      setAiPrompt('');
      const name = displayLabel(recipe.out).toUpperCase();
      // Load the exact Minecraft pattern — owned parts land at their proper
      // positions; missing parts glow as blueprint ghosts in the exact cells
      // they belong. CRAFT only lights up when the grid truly matches, so
      // correct placement always decides the outcome.
      const missing = fillRecipe(recipe);
      if (recipe.type === 'smelting') {
        setAiNote(
          missing.length
            ? `${name} — furnace needs: ${missing
                .map((m) => `${m.label} (${m.have}/${m.need})`)
                .join(', ')}`
            : `${name} — smelted straight from the furnace book`
        );
        return;
      }
      setAiNote(
        missing.length
          ? `${name} — pattern loaded with what you own. Missing: ${missing
              .map((m) => `${m.label} (${m.have}/${m.need})`)
              .join(', ')}. The glowing cells show exactly where the rest goes — get the parts, fill them in, then press CRAFT.`
          : `${name} — grid loaded in the correct pattern, press CRAFT`
      );
    } catch {
      setAiNote('AI link failed — try again in a moment.');
    } finally {
      setAiBusy(false);
    }
  }, [aiPrompt, aiBusy, customRecipes, fillRecipe, displayLabel]);

  /** ==== AI RECIPE FORGE — invent + paint + save a custom recipe =======
   *
   *  The forge runs as a BACKGROUND job on the server (recipe design +
   *  three image-model candidates easily outlast the proxy timeout, and
   *  one-shot requests there end in "502"). POST returns a jobId instantly;
   *  we poll GET until the job settles, then present the recipe with its
   *  icon candidates. */
  const runForge = useCallback(async () => {
    const prompt = forgePrompt.trim();
    if (!prompt || forgeBusy) return;
    setForgeBusy(true);
    setForgeError(null);
    setForgedRecipe(null);
    setForgeCandidates([]);
    setForgeStep('Designing the recipe…');
    try {
      const res = await fetch('/api/ai/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, catalog: forgeCatalog }),
      });
      const start = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        jobId?: string;
        error?: string;
      };
      if (!res.ok || !start.ok || !start.jobId) {
        setForgeError(start.error ?? 'The forge stalled — try again.');
        return;
      }
      const deadline = Date.now() + 3 * 60_000;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (Date.now() > deadline) {
          setForgeError(
            'The forge is taking unusually long — give it a moment and try again.'
          );
          return;
        }
        const poll = await fetch(
          `/api/ai/forge?jobId=${encodeURIComponent(start.jobId)}`,
          { cache: 'no-store' }
        );
        const job = (await poll.json().catch(() => ({}))) as {
          ok?: boolean;
          status?: 'working' | 'done' | 'error';
          stage?: 'design' | 'icons' | 'save';
          recipe?: {
            recipeId: string;
            name: string;
            type: 'shaped' | 'shapeless';
            mode: number;
            pattern: string[];
            key: Record<string, string>;
            ins: string[];
            outId: string;
            outCount: number;
            cat: string;
            iconPath: string | null;
            flavor: string | null;
          };
          candidates?: string[];
          error?: string;
        };
        if (!poll.ok || !job.ok) {
          setForgeError(job.error ?? 'Lost the forge job — try again.');
          return;
        }
        setForgeStep(
          job.stage === 'icons'
            ? 'Painting pixel icons…'
            : job.stage === 'save'
              ? 'Saving to the book…'
              : 'Designing the recipe…'
        );
        if (job.status === 'done' && job.recipe) {
          const data = job.recipe;
          const recipe: PanelRecipe = {
            id: data.recipeId,
            out: data.outId,
            outCount: data.outCount,
            mode: data.mode === 2 ? 2 : 3,
            type: data.type,
            cat: 'tech',
            pattern: data.pattern,
            key: data.key,
            ins: data.type === 'shapeless' ? data.ins : undefined,
            custom: true,
            name: data.name,
            icon: data.iconPath ?? '',
            flavor: data.flavor ?? undefined,
          };
          if (recipe.icon) {
            AI_ITEM_DEFS.set(recipe.out, { label: recipe.name, img: recipe.icon });
          }
          setForgeCandidates(
            job.candidates && job.candidates.length > 0
              ? job.candidates
              : recipe.icon
                ? [recipe.icon]
                : []
          );
          setForgedRecipe(recipe);
          onForged(recipe);
          setBookCat('ai');
          setBookQuery('');
          showToast(`FORGED · ${recipe.name.toUpperCase()} — SAVED TO THE BOOK`);
          return;
        }
        if (job.status === 'error') {
          setForgeError(job.error ?? 'The forge stalled — try again.');
          return;
        }
      }
    } catch {
      setForgeError('Forge link failed — try again.');
    } finally {
      setForgeBusy(false);
      setForgeStep('');
    }
  }, [forgePrompt, forgeBusy, forgeCatalog, onForged, showToast]);

  /** Re-icon the forged recipe everywhere (panel, book, sprite registry). */
  const commitForgeIcon = useCallback(
    (recipeId: string, outId: string, name: string, iconPath: string) => {
      AI_ITEM_DEFS.set(outId, { label: name, img: iconPath });
      setForgedRecipe((current) =>
        current && current.id === recipeId ? { ...current, icon: iconPath } : current
      );
      onCustomIconChange(recipeId, iconPath);
    },
    [onCustomIconChange]
  );

  /** Candidate pick — persists the chosen iconPath on the saved recipe. */
  const pickForgeCandidate = useCallback(
    async (iconPath: string) => {
      if (!forgedRecipe || forgeIconBusy) return;
      setForgeIconBusy(true);
      try {
        const res = await fetch('/api/recipes/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipeId: forgedRecipe.id, iconPath }),
        });
        if (!res.ok) throw new Error('save failed');
        commitForgeIcon(
          forgedRecipe.id,
          forgedRecipe.out,
          forgedRecipe.name,
          iconPath
        );
        showToast('ICON UPDATED');
      } catch {
        showToast('ICON CHANGE FAILED — STILL THE OLD ONE');
      } finally {
        setForgeIconBusy(false);
      }
    },
    [forgedRecipe, forgeIconBusy, commitForgeIcon, showToast]
  );

  /** Upload your own art — the server pixelizes it into a 16×16 vanilla-style
   *  sprite (same pipeline as the generated candidates) and binds it. */
  const uploadForgeIcon = useCallback(
    async (file: File) => {
      if (!forgedRecipe || forgeIconBusy) return;
      if (file.size > 6 * 1024 * 1024) {
        setForgeError('Image too large — keep it under 6 MB.');
        return;
      }
      setForgeIconBusy(true);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('read failed'));
          reader.readAsDataURL(file);
        });
        const res = await fetch('/api/ai/forge/icon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl, recipeId: forgedRecipe.id }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          iconPath?: string;
          error?: string;
        };
        if (!data.ok || !data.iconPath) {
          throw new Error(data.error ?? 'upload failed');
        }
        commitForgeIcon(
          forgedRecipe.id,
          forgedRecipe.out,
          forgedRecipe.name,
          data.iconPath
        );
        showToast('CUSTOM ICON APPLIED');
      } catch (error) {
        setForgeError(
          error instanceof Error && error.message !== 'read failed'
            ? error.message
            : 'Upload failed — try another image.'
        );
      } finally {
        setForgeIconBusy(false);
      }
    },
    [forgedRecipe, forgeIconBusy, commitForgeIcon, showToast]
  );

  /** Filtered + searched recipe list for the book — vanilla shelves, the
   *  AI Forge shelf ('ai'), or everything ('all' appends the customs). */
  const bookRecipes = useMemo<PanelRecipe[]>(() => {
    const q = bookQuery.trim().toLowerCase();
    const hay = (recipe: PanelRecipe) =>
      `${recipe.custom ? recipe.name : craftItemLabel(recipe.out)} ${recipeIngredientLabels(recipe).join(' ')}`.toLowerCase();
    const customs = customRecipes.filter(
      (recipe) => !q || hay(recipe).includes(q)
    );
    if (bookCat === 'ai') return customs;
    return CRAFT_RECIPES.filter((recipe) => {
      if (bookCat !== 'all' && recipe.cat !== bookCat) return false;
      if (!q) return true;
      return hay(recipe).includes(q);
    }).concat(bookCat === 'all' ? customs : []);
  }, [bookQuery, bookCat, customRecipes]);

  /** Esc closes the book before it closes the whole lobby screen. */
  useEffect(() => {
    if (!bookOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        setBookOpen(false);
        setConfirmDeleteId(null);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions);
  }, [bookOpen]);

  /** Esc closes the forge before it closes the whole lobby screen. */
  useEffect(() => {
    if (!forgeOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        setForgeOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions);
  }, [forgeOpen]);

  const resultLabel = matched ? displayLabel(matched.out) : null;

  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* ===== toolbar: grid mode + book + help ===== */}
      <div className="flex items-center gap-1.5">
        <div
          className="flex border border-zinc-700"
          role="group"
          aria-label="Crafting grid size"
        >
          {([2, 3] as const).map((size) => (
            <button
              key={size}
              type="button"
              onClick={(event) => {
                event.currentTarget.blur();
                setBlueprint(null);
                setTableMode(size);
                if (size === 2 && [2, 5, 6, 7, 8].some((c) => craftGrid[c])) {
                  showToast('ITEMS OUTSIDE THE 2×2 GRID — press CLEAR to retrieve');
                }
              }}
              aria-pressed={tableMode === size}
              title={size === 2 ? 'Inventory 2×2 grid' : 'Crafting table 3×3 grid'}
              className={`px-2 py-1 text-[9px] font-black tracking-widest transition-colors ${
                tableMode === size
                  ? 'bg-amber-400/20 text-amber-300'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {size}×{size}
            </button>
          ))}
        </div>
        <span className="ml-auto flex gap-1.5">
          <button
            type="button"
            aria-label="AI Recipe Forge"
            aria-expanded={forgeOpen}
            title="AI Recipe Forge — invent a custom item"
            onClick={(event) => {
              event.currentTarget.blur();
              setForgeOpen((open) => !open);
              setBookOpen(false);
              setHelpOpen(false);
            }}
            className={`grid h-5 w-5 place-items-center border transition-colors ${
              forgeOpen
                ? 'border-fuchsia-400/70 bg-fuchsia-400/15 text-fuchsia-300'
                : 'border-zinc-700 text-zinc-400 hover:border-fuchsia-400/60 hover:text-fuchsia-300'
            }`}
          >
            <Wand2 className="h-3 w-3" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Recipe book"
            aria-expanded={bookOpen}
            title="Recipe book — 320+ recipes, auto-fill"
            onClick={(event) => {
              event.currentTarget.blur();
              setBookOpen((open) => !open);
              setHelpOpen(false);
            }}
            className={`grid h-5 w-5 place-items-center border transition-colors ${
              bookOpen
                ? 'border-amber-400/70 bg-amber-400/15 text-amber-300'
                : 'border-zinc-700 text-zinc-400 hover:border-amber-400/60 hover:text-amber-300'
            }`}
          >
            <BookOpen className="h-3 w-3" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Crafting help"
            aria-expanded={helpOpen}
            title="How crafting works"
            onClick={(event) => {
              event.currentTarget.blur();
              setHelpOpen((open) => !open);
              setBookOpen(false);
            }}
            className={`grid h-5 w-5 place-items-center border transition-colors ${
              helpOpen
                ? 'border-amber-400/70 bg-amber-400/15 text-amber-300'
                : 'border-zinc-700 text-zinc-400 hover:border-amber-400/60 hover:text-amber-300'
            }`}
          >
            <CircleHelp className="h-3 w-3" aria-hidden />
          </button>
        </span>
      </div>

      {/* ===== AI craft-by-words — natural language → grid ===== */}
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void askCraftWords();
        }}
      >
        <Sparkles
          className="h-3.5 w-3.5 shrink-0 text-fuchsia-300"
          aria-hidden
        />
        <input
          value={aiPrompt}
          onChange={(event) => setAiPrompt(event.target.value)}
          placeholder='AI craft by words — "make me a diamond pickaxe"'
          aria-label="Describe what to craft and the AI loads the recipe"
          maxLength={300}
          className="min-w-0 flex-1 border border-fuchsia-400/30 bg-zinc-900/80 px-2 py-1.5 text-[11px] font-semibold text-zinc-100 placeholder:text-zinc-600 focus:border-fuchsia-400/70 focus:outline-none"
        />
        <button
          type="submit"
          disabled={aiBusy || aiPrompt.trim().length === 0}
          aria-label="Load the matching recipe into the grid"
          className="grid h-7 w-7 shrink-0 place-items-center border border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-300 transition-colors hover:bg-fuchsia-400/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {aiBusy ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Send className="h-3 w-3" aria-hidden />
          )}
        </button>
      </form>
      {aiNote && (
        <p
          role="status"
          className="-mt-1.5 text-[9px] font-bold leading-snug text-fuchsia-300"
        >
          {aiNote}
        </p>
      )}

      {helpOpen && (
        <div
          role="note"
          aria-label="Crafting instructions"
          className="border border-amber-400/40 bg-zinc-950/95 p-2.5 text-left"
        >
          <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.25em] text-amber-300">
            How to craft
          </p>
          <ul className="space-y-1 text-[10px] font-semibold leading-relaxed text-zinc-300">
            <li>• Click an INGREDIENT chip to drop one into the grid, or drag items from the inventory.</li>
            <li>• Click a placed cell to take it back; CLEAR empties the grid.</li>
            <li>• Matching a recipe lights the result — CRAFT forges it, CRAFT MAX forges a whole stack.</li>
            <li>• AI / recipe-book fills show glowing GHOST cells — the exact Minecraft spots for parts you're missing. CRAFT only lights up when the grid truly matches the pattern.</li>
            <li>• 2×2 recipes work anywhere; 3-wide recipes need the 3×3 crafting table mode.</li>
            <li>• The recipe book (book icon) auto-fills any recipe you own the parts for; furnace recipes smelt instantly.</li>
          </ul>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="mt-2 w-full border border-amber-400/50 bg-amber-400/10 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-amber-300 transition-colors hover:bg-amber-400/25"
          >
            Got it
          </button>
        </div>
      )}

      {/* ===== main: grid → arrow → result ===== */}
      <div className="flex items-center justify-center gap-2.5">
        <div
          className={`grid gap-1.5 transition-shadow ${
            tableMode === 3 ? 'grid-cols-3' : 'grid-cols-2'
          } ${dragActive ? 'ring-1 ring-amber-400/40' : ''}`}
        >
          {(tableMode === 3 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 3, 4]).map(
            (cellIndex) => {
              const placed = craftGrid[cellIndex];
              const dropHandlers = {
                onDragOver: (event: ReactDragEvent<HTMLElement>) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDragOverCell(cellIndex);
                },
                onDragLeave: () => {
                  setDragOverCell((current) =>
                    current === cellIndex ? null : current
                  );
                },
                onDrop: (event: ReactDragEvent<HTMLElement>) => {
                  event.preventDefault();
                  const payload = parseLobbyDrag(
                    event.dataTransfer.getData('text/plain')
                  );
                  if (payload?.from === 'inv') {
                    placeCell(cellIndex, payload.index);
                  } else if (payload?.from === 'craftcell') {
                    swapCells(payload.index, cellIndex);
                  }
                  setDragOverCell(null);
                },
              };
              const cellClass = `group relative grid h-10 w-10 place-items-center border transition-all sm:h-11 sm:w-11 ${
                dragOverCell === cellIndex
                  ? 'border-amber-400 bg-amber-400/10 ring-1 ring-amber-400/50'
                  : placed
                    ? 'border-zinc-500/70 bg-zinc-900/70'
                    : 'border-zinc-600/70 bg-zinc-950/70'
              }`;
              if (placed) {
                return (
                  <button
                    key={cellIndex}
                    type="button"
                    draggable
                    title={`${placed.label} — click to take back`}
                    aria-label={`Remove ${placed.label} from crafting slot ${cellIndex + 1}`}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        'text/plain',
                        JSON.stringify({
                          from: 'craftcell',
                          index: cellIndex,
                          id: placed.id,
                        })
                      );
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={(event) => {
                      event.currentTarget.blur();
                      returnCell(cellIndex);
                    }}
                    className={cellClass}
                    {...dropHandlers}
                  >
                    <ItemSprite
                      img={placed.img}
                      fallbackIcon={placed.icon}
                      className="pointer-events-none h-11 w-11"
                    />
                    <HoverName label={placed.label} />
                  </button>
                );
              }
              const ghostIds = placed ? null : blueprint?.[cellIndex] ?? null;
              if (ghostIds) {
                const ghost = lobbyEntryForId(ghostIds[0]);
                const alt =
                  ghostIds.length > 1
                    ? ` (or ${ghostIds
                        .slice(1, 3)
                        .map((id) => craftItemLabel(id))
                        .join(' / ')})`
                    : '';
                return (
                  <span
                    key={cellIndex}
                    title={`Blueprint — ${ghost.label}${alt} goes here`}
                    aria-label={`Blueprint slot ${cellIndex + 1}: needs ${ghost.label}${alt}`}
                    className={`group relative grid h-10 w-10 place-items-center border border-dashed border-amber-400/60 bg-amber-400/[0.06] transition-all sm:h-11 sm:w-11 ${
                      dragOverCell === cellIndex
                        ? 'bg-amber-400/15 ring-1 ring-amber-400/50'
                        : ''
                    }`}
                    {...dropHandlers}
                  >
                    <ItemSprite
                      img={ghost.img}
                      fallbackIcon={Package}
                      className="pointer-events-none h-11 w-11 opacity-30"
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-1 -top-1 grid h-3 w-3 place-items-center rounded-full border border-amber-400/70 bg-zinc-950 text-[8px] font-black leading-none text-amber-300"
                    >
                      +
                    </span>
                    <HoverName label={`${ghost.label}${alt}`} />
                  </span>
                );
              }
              return (
                <span
                  key={cellIndex}
                  title="Empty slot — click an ingredient chip or drop an item here"
                  className={cellClass}
                  {...dropHandlers}
                >
                  <span
                    className="pointer-events-none h-1 w-1 rounded-full bg-zinc-800"
                    aria-hidden
                  />
                </span>
              );
            }
          )}
        </div>
        <ArrowUp
          className="h-6 w-6 shrink-0 text-amber-400 [transform:rotate(90deg)]"
          strokeWidth={2.4}
          aria-hidden
        />
        <button
          type="button"
          disabled={!matched}
          onClick={(event) => {
            event.currentTarget.blur();
            craftOnce();
          }}
          aria-label={
            matched
              ? `Craft ${resultLabel}`
              : 'Crafting result — place a recipe in the grid'
          }
          className={`group relative grid h-12 w-12 shrink-0 place-items-center border transition-all sm:h-14 sm:w-14 ${
            matched
              ? 'cursor-pointer border-amber-400/60 bg-amber-400/10 hover:bg-amber-400/25 hover:shadow-[0_0_18px_-2px_rgba(251,191,36,0.55)]'
              : 'cursor-not-allowed border-zinc-700/70 bg-zinc-950/70'
          }`}
        >
          {matched ? (
            <>
              <ItemSprite
                img={craftItemImg(matched.out)}
                fallbackIcon={Package}
                className="h-14 w-14"
              />
              {matched.outCount > 1 && (
                <span className="absolute bottom-0 right-0.5 text-[10px] font-black tabular-nums text-zinc-100">
                  ×{matched.outCount}
                </span>
              )}
            </>
          ) : (
            <span
              className="h-1.5 w-1.5 rounded-full bg-zinc-700"
              aria-hidden
            />
          )}
        </button>
      </div>

      {/* matched recipe name */}
      <p className="text-center text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">
        {matched ? (
          <span className="text-amber-300">
            = {resultLabel}
            {matched.outCount > 1 ? ` ×${matched.outCount}` : ''}
          </span>
        ) : (
          'place items to match a recipe'
        )}
      </p>

      {/* ===== actions ===== */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={!matched}
          onClick={(event) => {
            event.currentTarget.blur();
            craftOnce();
          }}
          className="border px-1 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600 enabled:border-amber-400/60 enabled:bg-amber-400/10 enabled:text-amber-300 enabled:hover:bg-amber-400/25"
        >
          Craft
        </button>
        <button
          type="button"
          disabled={!matched}
          onClick={(event) => {
            event.currentTarget.blur();
            craftMax();
          }}
          title="Craft as many as your inventory allows"
          className="border px-1 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600 enabled:border-zinc-600 enabled:text-zinc-200 enabled:hover:border-amber-400/60 enabled:hover:text-amber-300"
        >
          Craft max
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.blur();
            clearGrid();
          }}
          className="border border-zinc-700 px-1 py-1.5 text-[9px] font-black uppercase tracking-widest text-zinc-300 transition-colors hover:border-amber-400/60 hover:text-amber-300"
        >
          Clear
        </button>
      </div>

      {/* ===== ingredient quick-place chips ===== */}
      <div className="mt-auto">
        <p className="mb-1 text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500">
          Ingredients — click to place
        </p>
        <div className="ratfire-scroll flex max-h-24 flex-wrap content-start gap-1 overflow-y-auto pr-1">
          {chips.length === 0 && (
            <span className="text-[9px] font-semibold text-zinc-600">
              Inventory is empty.
            </span>
          )}
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              disabled={
                blueprint
                  ? !activeCells.some(
                      (cell) =>
                        !craftGrid[cell] &&
                        blueprint[cell]?.includes(chip.id)
                    )
                  : !activeCells.some((cell) => !craftGrid[cell])
              }
              onClick={(event) => {
                event.currentTarget.blur();
                // With a blueprint active, chips snap into the exact cells
                // the pattern wants — same placement discipline as vanilla.
                const empty = blueprint
                  ? activeCells.find(
                      (cell) =>
                        !craftGrid[cell] &&
                        blueprint[cell]?.includes(chip.id)
                    )
                  : activeCells.find((cell) => !craftGrid[cell]);
                if (empty === undefined) return;
                placeCell(empty, undefined, chip.id);
              }}
              title={`Place 1 ${lobbyEntryForId(chip.id).label} into the grid`}
              aria-label={`Place 1 ${lobbyEntryForId(chip.id).label} into the crafting grid`}
              className="group relative flex h-8 w-8 items-center justify-center border border-zinc-700/80 bg-zinc-950/70 transition-colors hover:border-amber-400/60 hover:bg-zinc-900 disabled:opacity-40"
            >
              <ItemSprite
                img={chip.img}
                fallbackIcon={Package}
                className="h-7 w-7"
              />
              <span className="absolute -bottom-1 -right-1 border border-zinc-800 bg-zinc-950 px-0.5 text-[8px] font-black tabular-nums text-zinc-300">
                {chip.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ===== AI RECIPE FORGE — invent + paint + save a custom recipe ===== */}
      {forgeOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="AI Recipe Forge"
            onClick={(event) => {
              if (event.target === event.currentTarget) setForgeOpen(false);
            }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/80 p-3 backdrop-blur-sm sm:p-6"
          >
            <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden border border-fuchsia-400/40 bg-zinc-950/95 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.95)]">
              <header className="flex items-center gap-3 border-b border-fuchsia-400/20 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center border border-fuchsia-400/50 bg-fuchsia-400/10">
                  <Wand2 className="h-4 w-4 text-fuchsia-300" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-black uppercase tracking-[0.25em] text-zinc-100">
                    AI Recipe Forge
                  </h3>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                    invent · paint · save forever
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForgeOpen(false)}
                  aria-label="Close the forge"
                  className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center border border-zinc-700 text-zinc-300 transition-colors hover:border-fuchsia-400/60 hover:text-fuchsia-300"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </header>
              <div className="ratfire-scroll flex flex-col gap-2.5 overflow-y-auto p-4">
                <p className="text-[10px] font-semibold leading-snug text-zinc-400">
                  Describe a custom item. The AI designs a balanced recipe from
                  your real ingredients, paints a pixel-art icon and saves it
                  to the recipe book (AI Forge shelf) permanently.
                </p>
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runForge();
                  }}
                >
                  <input
                    value={forgePrompt}
                    onChange={(event) => setForgePrompt(event.target.value)}
                    placeholder='Describe the item — "lava sword", "jetpack"…'
                    aria-label="Describe the item to forge"
                    maxLength={300}
                    className="min-w-0 flex-1 border border-fuchsia-400/30 bg-zinc-900/80 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 placeholder:text-zinc-600 focus:border-fuchsia-400/70 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={forgeBusy || forgePrompt.trim().length === 0}
                    aria-label="Forge the item"
                    className="grid h-9 w-9 shrink-0 place-items-center border border-fuchsia-400/60 bg-fuchsia-400/15 text-fuchsia-200 transition-colors hover:bg-fuchsia-400/30 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {forgeBusy ? (
                      <LoaderCircle
                        className="h-4 w-4 animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <Wand2 className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </form>
                <div className="flex flex-wrap gap-1">
                  {['lava sword', 'jetpack', 'glow berry pie', 'crystal cannon'].map(
                    (idea) => (
                      <button
                        key={idea}
                        type="button"
                        disabled={forgeBusy}
                        onClick={() => setForgePrompt(idea)}
                        className="border border-zinc-700/70 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-zinc-400 transition-colors hover:border-fuchsia-400/60 hover:text-fuchsia-300 disabled:opacity-40"
                      >
                        {idea}
                      </button>
                    )
                  )}
                </div>
                {forgeBusy && forgeStep && (
                  <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.25em] text-fuchsia-300">
                    <LoaderCircle
                      className="h-3 w-3 animate-spin"
                      aria-hidden
                    />
                    {forgeStep}
                  </p>
                )}
                {forgeError && (
                  <p className="border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold leading-snug text-red-300">
                    {forgeError}
                  </p>
                )}
                {forgedRecipe && !forgeBusy && (
                  <div className="flex gap-3 border border-fuchsia-400/40 bg-fuchsia-400/5 p-3">
                    <span className="grid h-16 w-16 shrink-0 place-items-center border border-zinc-700 bg-zinc-900">
                      <ItemSprite
                        img={forgedRecipe.icon || undefined}
                        fallbackIcon={Package}
                        className="h-14 w-14"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black uppercase tracking-[0.2em] text-fuchsia-200">
                        {forgedRecipe.name}
                      </p>
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                        {forgedRecipe.type} recipe · needs the{' '}
                        {forgedRecipe.mode === 2 ? '2×2 grid' : '3×3 table'} ·
                        out ×{forgedRecipe.outCount}
                      </p>
                      {forgedRecipe.flavor && (
                        <p className="mt-1 text-[10px] font-semibold italic leading-snug text-zinc-400">
                          “{forgedRecipe.flavor}”
                        </p>
                      )}
                      <p className="mt-1.5 flex flex-wrap gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                        {recipeIngredientLabels(forgedRecipe).map((label) => (
                          <span
                            key={label}
                            className="border border-zinc-700 px-1 py-0.5"
                          >
                            {label}
                          </span>
                        ))}
                      </p>
                      <p className="mt-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">
                        <Check className="h-3 w-3" aria-hidden /> Saved to the
                        recipe book
                      </p>
                    </div>
                  </div>
                )}
                {forgedRecipe && !forgeBusy && (
                  <div className="border border-fuchsia-400/30 bg-zinc-900/60 p-3">
                    <p className="mb-2 text-[9px] font-black uppercase tracking-[0.25em] text-zinc-400">
                      Icon — tap a sprite to swap, or upload your own
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {forgeCandidates.map((candidate) => {
                        const active = candidate === forgedRecipe.icon;
                        return (
                          <button
                            key={candidate}
                            type="button"
                            disabled={forgeIconBusy}
                            onClick={() => void pickForgeCandidate(candidate)}
                            aria-label={
                              active
                                ? `Current icon of ${forgedRecipe.name}`
                                : `Use this icon for ${forgedRecipe.name}`
                            }
                            className={`grid h-12 w-12 place-items-center border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                              active
                                ? 'border-2 border-fuchsia-400 bg-fuchsia-400/10'
                                : 'border border-zinc-700 bg-zinc-950 hover:border-fuchsia-400/60'
                            }`}
                          >
                            <ItemSprite
                              img={candidate}
                              fallbackIcon={Package}
                              className="h-10 w-10"
                            />
                          </button>
                        );
                      })}
                      <label
                        className={`grid h-12 w-12 cursor-pointer place-items-center border border-dashed border-zinc-600 bg-zinc-950 text-zinc-400 transition-colors hover:border-fuchsia-400/60 hover:text-fuchsia-300 ${
                          forgeIconBusy
                            ? 'pointer-events-none opacity-50'
                            : ''
                        }`}
                        aria-label="Upload a custom icon image"
                        title="Upload your own icon (PNG / JPG / WebP)"
                      >
                        {forgeIconBusy ? (
                          <LoaderCircle
                            className="h-4 w-4 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <ImagePlus className="h-4 w-4" aria-hidden />
                        )}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadForgeIcon(file);
                            event.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    {forgeIconBusy && (
                      <p className="mt-2 text-[9px] font-black uppercase tracking-[0.25em] text-fuchsia-300">
                        Working on the icon…
                      </p>
                    )}
                  </div>
                )}
                <p className="border-t border-zinc-800 pt-2 text-[9px] font-semibold leading-snug text-zinc-600">
                  Forging takes up to a minute — the AI designs the recipe,
                  then paints three pixel sprites. The recipe saves across
                  reloads. Esc closes.
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ===== recipe book overlay (portal — spans the whole screen) ===== */}
      {bookOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Crafting recipe book"
            onClick={(event) => {
              if (event.target === event.currentTarget) setBookOpen(false);
            }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/80 p-3 backdrop-blur-sm sm:p-6"
          >
            <div className="flex h-full w-full max-w-3xl flex-col border border-amber-400/40 bg-zinc-950/95 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.95)]">
              <header className="flex items-center gap-3 border-b border-amber-400/20 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center border border-amber-400/50 bg-amber-400/10">
                  <BookOpen className="h-4 w-4 text-amber-300" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-black uppercase tracking-[0.25em] text-zinc-100">
                    Recipe book
                  </h3>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                    {bookRecipes.length} recipes · FILL loads the grid · SMELT forges instantly · trash removes AI forges
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBookOpen(false)}
                  aria-label="Close recipe book"
                  className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center border border-zinc-700 text-zinc-300 transition-colors hover:border-amber-400/60 hover:text-amber-300"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </header>
              <div className="border-b border-zinc-800/80 px-4 py-2.5">
                <input
                  type="search"
                  value={bookQuery}
                  onChange={(event) => setBookQuery(event.target.value)}
                  placeholder="Search recipes — try planks, pickaxe, iron, torch…"
                  aria-label="Search recipes"
                  className="w-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {panelCats.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setBookCat(cat.id)}
                      aria-pressed={bookCat === cat.id}
                      className={`border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest transition-colors ${
                        bookCat === cat.id
                          ? 'border-amber-400/70 bg-amber-400/15 text-amber-300'
                          : 'border-zinc-700/70 text-zinc-400 hover:border-amber-400/50 hover:text-zinc-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ratfire-scroll grid flex-1 content-start gap-1.5 overflow-y-auto p-3 sm:grid-cols-2">
                {bookRecipes.length === 0 && (
                  <p className="col-span-full py-6 text-center text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">
                    {bookCat === 'ai' && !bookQuery.trim()
                      ? 'No AI forged recipes yet — press the WAND to invent one'
                      : `No recipes match “${bookQuery}”`}
                  </p>
                )}
                {bookRecipes.map((recipe) => {
                  const craftable = maxCraftable(recipe, have) > 0;
                  return (
                    <div
                      key={recipe.id}
                      title={
                        recipe.custom && recipe.flavor
                          ? recipe.flavor
                          : undefined
                      }
                      className={`flex items-center gap-2 border p-1.5 ${
                        craftable
                          ? 'border-emerald-400/30 bg-emerald-400/5'
                          : 'border-zinc-800/80 bg-zinc-950/50'
                      }`}
                    >
                      <span className="relative grid h-10 w-10 shrink-0 place-items-center border border-zinc-700 bg-zinc-900">
                        {recipe.custom ? (
                          <ItemSprite
                            img={recipe.icon}
                            fallbackIcon={Package}
                            className="h-9 w-9"
                          />
                        ) : (
                          <ItemSprite
                            img={craftItemImg(recipe.out)}
                            fallbackIcon={Package}
                            className="h-9 w-9"
                          />
                        )}
                        {recipe.outCount > 1 && (
                          <span className="absolute bottom-0 right-0.5 text-[9px] font-black tabular-nums text-zinc-200">
                            ×{recipe.outCount}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-black uppercase tracking-wider text-zinc-100">
                          {recipe.custom ? (
                            <span className="text-fuchsia-300">
                              {recipe.name}
                              {recipe.custom ? ' ✦' : ''}
                            </span>
                          ) : (
                            craftItemLabel(recipe.out)
                          )}
                        </span>
                        <span className="block truncate text-[9px] font-semibold text-zinc-500">
                          {recipeIngredientLabels(recipe).join(' + ')}
                        </span>
                      </span>
                      {recipe.type === 'smelting' ? (
                        <button
                          type="button"
                          onClick={() => instantSmelt(recipe)}
                          title="Smelt one input in the furnace"
                          className="shrink-0 border border-emerald-400/50 bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-400/25"
                        >
                          Smelt
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fillRecipe(recipe)}
                          title="Load this recipe into the grid"
                          className="shrink-0 border border-amber-400/50 bg-amber-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-amber-300 transition-colors hover:bg-amber-400/25"
                        >
                          Fill
                        </button>
                      )}
                      {recipe.custom && (
                        <button
                          type="button"
                          onClick={() =>
                            tapDeleteCustom(recipe.id, recipe.name)
                          }
                          aria-label={
                            confirmDeleteId === recipe.id
                              ? `Tap again to delete ${recipe.name} forever`
                              : `Delete forged recipe ${recipe.name}`
                          }
                          title={
                            confirmDeleteId === recipe.id
                              ? 'Tap again — deletes forever'
                              : 'Delete this forged recipe'
                          }
                          className={`shrink-0 border transition-colors ${
                            confirmDeleteId === recipe.id
                              ? 'w-11 border-red-400 bg-red-400/20 px-1 py-1 text-[9px] font-black uppercase tracking-widest text-red-200'
                              : 'w-7 border-red-400/40 py-1 text-red-300/70 hover:border-red-400 hover:bg-red-400/10 hover:text-red-200'
                          }`}
                        >
                          {confirmDeleteId === recipe.id ? (
                            'Sure?'
                          ) : (
                            <Trash2
                              className="mx-auto h-3 w-3"
                              aria-hidden
                            />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/** Full-screen LOBBY screen — the classic survival-GUI layout (Inventory /
 *  Equipment / Crafting / Hotbar / Statistics) rebuilt in RATFIRE chrome.
 *  Opens from the top-right corner button in BOTH phases; the bay strip on
 *  top hands off to the eight fullscreen command panels. */
function LobbyScreen({
  coins,
  gems,
  skinIndex,
  weaponIndex,
  customSkinUrls,
  skinName,
  onClose,
  onBay,
  showToast,
}: {
  coins: number;
  gems: number;
  skinIndex: number;
  weaponIndex: number;
  customSkinUrls: string[];
  skinName: string;
  onClose: () => void;
  onBay: (id: LobbyPanelId) => void;
  showToast: (message: string) => void;
}) {
  /** Procedural lobby soundtrack — fades in with the lobby screen and stops
   *  the moment the player deploys (this component unmounts). Deliberately
   *  no volume control of its own; the global mute toggle silences it.
   *
   *  The same mount/unmount lifecycle drives the LOBBY HOLD on every game
   *  sound: while this screen is up the whole game audio (master graph,
   *  rain/snow/ice beds, drone weapon sounds, footstep loops) is held
   *  silent so the soundtrack plays alone; the instant it unmounts
   *  everything resumes. */
  useEffect(() => {
    startLobbyMusic();
    setGameSuspended(true);
    return () => {
      // release the hold first so world audio fades back in while the
      // soundtrack fades out — a smooth crossfade instead of dead air
      setGameSuspended(false);
      stopLobbyMusic();
    };
  }, []);

  /** Picked inventory item (slot highlight). */
  const [invPicked, setInvPicked] = useState<string | null>(null);
  /** Block currently opened in the details panel (replaces the grid view). */
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  /** Hotbar contents (item ids) + selected slot. */
  const [hotbar, setHotbar] = useState<Array<string | null>>(() => {
    const slots: Array<string | null> = Array(9).fill(null);
    slots[0] = 'blade';
    return slots;
  });
  const [hotPicked, setHotPicked] = useState(0);
  /** Dynamic inventory slots — real drop targets: items can be dragged out
   *  to the craft grid and back, and crafted results land here with counts. */
  const [invSlots, setInvSlots] = useState<Array<LobbyItemEntry | null>>(() => {
    const slots: Array<LobbyItemEntry | null> = Array(LOBBY_INV_SLOTS).fill(
      null
    );
    LOBBY_INV_ITEMS.forEach((item, index) => {
      slots[index] = item;
    });
    return slots;
  });
  /** Player-filled crafting grid (whole item entries, row-major over the
   *  3x3 layout — the 2x2 inventory grid uses the top-left 2x2). */
  const [craftGrid, setCraftGrid] = useState<Array<LobbyItemEntry | null>>(() =>
    Array(9).fill(null)
  );
  /** The drag payload currently in flight (drives the drop highlights). */
  const [draggingItem, setDraggingItem] = useState<LobbyDragPayload | null>(
    null
  );
  /** Crafting cell currently hovered by a drag (drop highlight). */
  const [dragOverCell, setDragOverCell] = useState<number | null>(null);
  /** Inventory slot currently hovered by a drag (drop highlight). */
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  /** ==== AI — the forged recipe book (RECIPE FORGE, survives reloads) ==== */
  const [customRecipes, setCustomRecipes] = useState<PanelRecipe[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/recipes/custom');
        const data = (await res.json()) as {
          ok: boolean;
          recipes?: Array<{
            recipeId: string;
            name: string;
            type: string;
            mode: number;
            pattern: string;
            keyMap: string;
            ins: string;
            outId: string;
            outCount: number;
            iconPath: string | null;
            flavor: string | null;
          }>;
        };
        if (cancelled || !data.ok || !data.recipes) return;
        const list: PanelRecipe[] = data.recipes.map((row) => ({
          id: row.recipeId,
          out: row.outId,
          outCount: row.outCount,
          mode: row.mode === 2 ? 2 : 3,
          type: row.type === 'shapeless' ? 'shapeless' : 'shaped',
          cat: 'tech',
          pattern: JSON.parse(row.pattern) as string[],
          key: JSON.parse(row.keyMap) as Record<string, string>,
          ins:
            row.type === 'shapeless'
              ? (JSON.parse(row.ins) as string[])
              : undefined,
          custom: true,
          name: row.name,
          icon: row.iconPath ?? '',
          flavor: row.flavor ?? undefined,
        }));
        for (const recipe of list) {
          if (recipe.icon) {
            AI_ITEM_DEFS.set(recipe.out, {
              label: recipe.name,
              img: recipe.icon,
            });
          }
        }
        setCustomRecipes(list);
      } catch {
        // Offline or empty — the book simply stays vanilla.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  /** A fresh forge lands here: register the item sprite + keep the book. */
  const handleForged = useCallback((recipe: PanelRecipe) => {
    if (recipe.icon) {
      AI_ITEM_DEFS.set(recipe.out, { label: recipe.name, img: recipe.icon });
    }
    setCustomRecipes((list) => [
      recipe,
      ...list.filter((row) => row.id !== recipe.id),
    ]);
  }, []);
  /** Trash a forged recipe (recipe-book delete button): optimistic removal
   *  from the book, then DELETE /api/recipes/custom — rolled back + toasted
   *  if the network or the database refuses. Forged items already crafted
   *  keep their icon/label via AI_ITEM_DEFS; only the recipe row goes. */
  const handleDeleteCustom = useCallback(
    async (recipeId: string, name: string) => {
      const victim = customRecipes.find((row) => row.id === recipeId) ?? null;
      setCustomRecipes((list) =>
        list.filter((row) => row.id !== recipeId)
      );
      showToast(`RECIPE REMOVED · ${name.toUpperCase()}`);
      try {
        const res = await fetch(
          `/api/recipes/custom?recipeId=${encodeURIComponent(recipeId)}`,
          { method: 'DELETE' }
        );
        const data = (await res.json()) as { ok: boolean };
        if (!data.ok) throw new Error('delete refused');
      } catch {
        if (victim) {
          setCustomRecipes((list) => [
            victim,
            ...list.filter((row) => row.id !== recipeId),
          ]);
        }
        showToast('DELETE FAILED — FORGED RECIPE RESTORED');
      }
    },
    [customRecipes, showToast]
  );
  /** Re-icon a forged recipe (forge panel candidate pick / upload): keep
   *  the book row's sprite in step with the saved DB state. */
  const handleCustomIconChange = useCallback(
    (recipeId: string, iconPath: string) => {
      setCustomRecipes((list) =>
        list.map((row) =>
          row.id === recipeId ? { ...row, icon: iconPath } : row
        )
      );
    },
    []
  );
  /** Live snapshot for SARGE — the assistant grounds every answer in what
   *  the player ACTUALLY holds (inventory counts, grid contents, forgeries). */
  const sargeContext = useMemo<SargeContext>(() => {
    const held = invSlots.filter(
      (slot): slot is LobbyItemEntry => slot !== null
    );
    return {
      inventory: held
        .slice(0, 24)
        .map((slot) => `${slot.label} x${slot.count}`),
      craftingGrid: craftGrid
        .filter((cell): cell is LobbyItemEntry => cell !== null)
        .map((cell) => cell.label)
        .slice(0, 9),
      forgedItems: customRecipes.map((recipe) => recipe.name).slice(0, 10),
    };
  }, [invSlots, craftGrid, customRecipes]);
  /** Live item lookup for the hotbar (ids move in and out of slots). */
  const invEntryById = useMemo(
    () =>
      new Map(
        invSlots
          .filter((slot): slot is LobbyItemEntry => slot !== null)
          .map((slot) => [slot.id, slot])
      ),
    [invSlots]
  );

  /** The block currently open in the details panel (null = grid view). */
  const inspected = inspectedId
    ? (invEntryById.get(inspectedId) ?? LOBBY_INV_DEF.get(inspectedId) ?? null)
    : null;
  const inspectedGroup = inspected
    ? (MINED_BLOCK_GROUPS.find((group) =>
        group.items.some((entry) => entry.id === inspected.id)
      ) ?? null)
    : null;
  const inspectedStats =
    inspected && inspectedGroup
      ? {
          ...MINED_GROUP_STATS[inspectedGroup.key],
          ...MINED_STAT_OVERRIDES[inspected.id],
        }
    : null;
  /** Legacy click behavior, now a button inside the details panel. */
  const assignInspectedToHotbar = () => {
    if (!inspected) return;
    setInvPicked(inspected.id);
    setHotbar((slots) => {
      const next = [...slots];
      next[hotPicked] = inspected.id;
      return next;
    });
    showToast(`${inspected.label} → SLOT ${hotPicked + 1}`);
  };
  const closeInspect = () => setInspectedId(null);

  /** Drop on an inventory slot: receive an item dragged OUT of the crafting
   *  grid, or reorder/swap inventory slots. */
  const handleInvDrop = (slotIndex: number, raw: string) => {
    const payload = parseLobbyDrag(raw);
    if (!payload) return;
    if (payload.from === 'craftcell') {
      const entry = craftGrid[payload.index];
      if (!entry) return;
      const given = lobbyGiveSlots(invSlots, entry, 1);
      if (!given) {
        showToast('INVENTORY FULL');
        return;
      }
      setInvSlots(given);
      setCraftGrid((grid) => {
        const next = [...grid];
        next[payload.index] = null;
        return next;
      });
      showToast(`${entry.label} → INVENTORY`);
      return;
    }
    // inv → inv: place on an empty slot, swap on an occupied one
    if (payload.index === slotIndex) return;
    const dragged = invSlots[payload.index];
    if (!dragged) return;
    const target = invSlots[slotIndex];
    setInvSlots((slots) => {
      const next = [...slots];
      next[payload.index] = target ?? null;
      next[slotIndex] = dragged;
      return next;
    });
    showToast(
      target
        ? `${dragged.label} ⇄ ${target.label}`
        : `${dragged.label} → SLOT ${slotIndex + 1}`
    );
  };

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Lobby screen"
      className="ratfire-panel pointer-events-auto absolute inset-0 z-30 flex flex-col border border-amber-400/40 bg-zinc-950/90 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_26px),calc(100%_-_26px)_100%,0_100%)]"
    >
      {/* screen header — same anatomy as the fullscreen panel headers */}
      <header className="flex items-center gap-3 border-b border-amber-400/20 px-4 py-3 sm:px-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center border border-amber-400/50 bg-amber-400/10">
          <Menu className="h-5 w-5 text-amber-300" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black uppercase tracking-[0.25em] text-zinc-100">
            Lobby
          </h2>
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            Command deck · all bays
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 border border-amber-400/40 bg-amber-400/5 px-2.5 py-1.5 sm:flex">
            <Coins className="h-3.5 w-3.5 text-amber-400" aria-hidden />
            <span className="text-xs font-black tabular-nums text-amber-300">
              {coins}
            </span>
          </span>
          <span className="hidden items-center gap-1.5 border border-emerald-400/40 bg-emerald-400/5 px-2.5 py-1.5 sm:flex">
            <Gem className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
            <span className="text-xs font-black tabular-nums text-emerald-300">
              {gems}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lobby screen"
            className="flex h-9 w-9 items-center justify-center border border-zinc-700 text-zinc-300 transition-colors hover:border-amber-400/60 hover:text-amber-300"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      {/* screen body — top padding is half the side padding so the bays bar
          sits tight under the header */}
      <div className="ratfire-scroll flex min-h-0 flex-1 flex-col overflow-y-auto p-4 pt-2 sm:p-6 sm:pt-3">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
          {/* bay strip — the eight command bays, one click each. The strip
              stretches across the WHOLE screen width (flex-1 buttons), so it
              spans over the inventory, the equipment AND the top of the
              crafting table on the right. */}
          <nav
            aria-label="Open a command bay"
            className="flex w-full flex-wrap items-stretch gap-2"
          >
            <span className="hidden shrink-0 items-center text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500 sm:flex">
              Bays
            </span>
            {LOBBY_MENU.map((item) => {
              const BayIcon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.blur();
                    onBay(item.id as LobbyPanelId);
                  }}
                  className="flex min-w-fit flex-1 items-center justify-center gap-1.5 border border-zinc-700/60 bg-zinc-950/60 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-300 transition-all hover:border-amber-400/60 hover:text-amber-300"
                >
                  <BayIcon
                    className="h-3.5 w-3.5 text-amber-400"
                    aria-hidden
                  />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* ===== top row: inventory | equipment | crafting ===== */}
          <div className="grid gap-4 lg:grid-cols-12">
            {/* INVENTORY */}
            <LobbyBox
              icon={Package}
              title={inspected ? inspected.label : 'Inventory'}
              hint={
                inspected
                  ? `${inspectedGroup?.label ?? 'Block'} · details`
                  : `${invSlots.filter((slot) => slot !== null).length}/${LOBBY_INV_SLOTS} slots`
              }
              className="lg:col-span-6"
            >
              {inspected && !inspectedStats ? (
                /* CRAFTED ITEM DETAILS — identity + actions (no vanilla stats) */
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/50 p-2.5">
                    <span className="grid h-16 w-16 shrink-0 place-items-center border border-zinc-600/70 bg-zinc-900/70">
                      <ItemSprite
                        img={inspected.img}
                        fallbackIcon={inspected.icon}
                        className="h-14 w-14"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black uppercase tracking-[0.2em] text-zinc-100">
                        {inspected.label}
                      </p>
                      <p className="truncate text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                        Crafted & processed · ×{inspected.count} in stock
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeInspect}
                      aria-label="Back to inventory"
                      className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center border border-zinc-700 text-zinc-400 transition-colors hover:border-amber-400/60 hover:text-amber-300"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={assignInspectedToHotbar}
                      className="min-w-0 flex-1 border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-amber-300 transition-colors hover:bg-amber-400/20"
                    >
                      → Hotbar slot {hotPicked + 1}
                    </button>
                    <button
                      type="button"
                      onClick={closeInspect}
                      className="flex shrink-0 items-center gap-1.5 border border-zinc-700 px-3 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-300 transition-colors hover:border-amber-400/60 hover:text-amber-300"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
                    </button>
                  </div>
                </div>
              ) : inspected && inspectedStats ? (
                /* BLOCK DETAILS — replaces the grid while a block is open */
                <div className="ratfire-scroll flex max-h-[24rem] flex-col gap-2 overflow-y-auto pr-1">
                  {/* identity row */}
                  <div className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/50 p-2.5">
                    <span className="grid h-16 w-16 shrink-0 place-items-center border border-zinc-600/70 bg-zinc-900/70">
                      <ItemSprite
                        img={inspected.img}
                        fallbackIcon={inspected.icon}
                        className="h-14 w-14"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black uppercase tracking-[0.2em] text-zinc-100">
                        {inspected.label}
                      </p>
                      <p className="truncate text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                        {inspectedGroup?.label ?? 'Item'} · ×{inspected.count} in stock
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeInspect}
                      aria-label="Back to inventory"
                      className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center border border-zinc-700 text-zinc-400 transition-colors hover:border-amber-400/60 hover:text-amber-300"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  {/* vanilla stat rows */}
                  <DetailStatRow
                    icon={Hammer}
                    label="Hardness"
                    value={fmtHardness(inspectedStats.hardness)}
                    bar={hardnessPct(inspectedStats.hardness)}
                    barClass={
                      inspectedStats.hardness < 0 ? 'bg-red-500' : 'bg-amber-400'
                    }
                  />
                  <DetailStatRow
                    icon={Bomb}
                    label="Blast resist"
                    value={fmtBlast(inspectedStats.blast)}
                    bar={blastPct(inspectedStats.blast)}
                    barClass={
                      inspectedStats.blast >= 1000 ? 'bg-red-400' : 'bg-amber-400'
                    }
                  />
                  <DetailStatRow
                    icon={toolIcon(inspectedStats.tool)}
                    label="Best tool"
                    value={inspectedStats.tool}
                  />
                  <div className="flex items-start gap-2 border border-zinc-800 bg-zinc-950/50 px-2.5 py-1.5">
                    <Globe
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"
                      aria-hidden
                    />
                    <span className="w-24 shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      Found in
                    </span>
                    <span className="min-w-0 flex-1 text-[10px] font-bold leading-snug text-zinc-200">
                      {inspectedStats.where}
                    </span>
                  </div>
                  {/* actions */}
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={assignInspectedToHotbar}
                      className="min-w-0 flex-1 border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-amber-300 transition-colors hover:bg-amber-400/20"
                    >
                      → Hotbar slot {hotPicked + 1}
                    </button>
                    <button
                      type="button"
                      onClick={closeInspect}
                      className="flex shrink-0 items-center gap-1.5 border border-zinc-700 px-3 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-300 transition-colors hover:border-amber-400/60 hover:text-amber-300"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
                    </button>
                  </div>
                </div>
              ) : (
              <div className="ratfire-scroll grid max-h-[24rem] grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-8">
                {LOBBY_INV_SECTIONS.map((section) => {
                  const SectionIcon = section.icon;
                  return (
                    <Fragment key={section.key}>
                      <div className="col-span-full flex items-center gap-1.5 pt-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">
                        <SectionIcon
                          className="h-3 w-3 text-amber-400"
                          aria-hidden
                        />
                        {section.label}
                      </div>
                      {invSlots
                        .slice(section.start, section.end)
                        .map((item, offset) => {
                          const index = section.start + offset;
                  const invDropHandlers = {
                    onDragOver: (event: ReactDragEvent<HTMLElement>) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDragOverSlot(index);
                    },
                    onDragLeave: () => {
                      setDragOverSlot((current) =>
                        current === index ? null : current
                      );
                    },
                    onDrop: (event: ReactDragEvent<HTMLElement>) => {
                      event.preventDefault();
                      handleInvDrop(
                        index,
                        event.dataTransfer.getData('text/plain')
                      );
                      setDragOverSlot(null);
                      setDraggingItem(null);
                    },
                  };
                  if (!item) {
                    return (
                      <span
                        key={`empty-${index}`}
                        title="Empty slot — drop an item here"
                        className={`grid aspect-square place-items-center border transition-colors ${
                          dragOverSlot === index
                            ? 'border-amber-400 bg-amber-400/10 ring-1 ring-amber-400/50'
                            : 'border-zinc-800/70 bg-zinc-950/40'
                        }`}
                        {...invDropHandlers}
                      >
                        <span
                          className="h-1 w-1 rounded-full bg-zinc-800"
                          aria-hidden
                        />
                      </span>
                    );
                  }
                  const picked = invPicked === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      draggable
                      title={`${item.label} — drag into the crafting grid`}
                      aria-label={`${item.label} ×${item.count}`}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          'text/plain',
                          JSON.stringify({ from: 'inv', index, id: item.id })
                        );
                        event.dataTransfer.effectAllowed = 'move';
                        setDraggingItem({ from: 'inv', index, id: item.id });
                      }}
                      onDragEnd={() => {
                        setDraggingItem(null);
                        setDragOverSlot(null);
                      }}
                      onClick={(event) => {
                        event.currentTarget.blur();
                        setInvPicked(item.id);
                        setInspectedId(item.id);
                      }}
                      className={`group relative grid aspect-square cursor-grab place-items-center border transition-all active:cursor-grabbing ${
                        picked ||
                        (draggingItem?.from === 'inv' &&
                          draggingItem.index === index) ||
                        dragOverSlot === index
                          ? 'border-amber-400 bg-amber-400/10 ring-1 ring-amber-400/50'
                          : 'border-zinc-600/70 bg-zinc-950/70 hover:border-amber-400/60 hover:bg-zinc-900'
                      }`}
                      {...invDropHandlers}
                    >
                      <ItemSprite
                        img={item.img}
                        fallbackIcon={item.icon}
                        className="h-14 w-14"
                      />
                      {item.count > 1 && (
                        <span className="absolute bottom-0.5 left-1 text-[9px] font-black tabular-nums text-zinc-200">
                          ×{item.count}
                        </span>
                      )}
                      <HoverName label={item.label} />
                    </button>
                  );
                        })}
                    </Fragment>
                  );
                })}
              </div>
              )}
            </LobbyBox>

            {/* EQUIPMENT */}
            <LobbyBox
              icon={UserRound}
              title="Equipment"
              hint={skinName}
              className="lg:col-span-3"
            >
              <div className="flex h-full gap-2">
                {/* armor slots (locked — visual stub, like MOD_PLACEHOLDERS) */}
                <div className="flex shrink-0 flex-col gap-1.5">
                  {LOBBY_ARMOR.map((slot) => {
                    const SlotIcon = slot.icon;
                    return (
                      <span
                        key={slot.id}
                        title={`${slot.label} — coming soon`}
                        className="relative grid h-11 w-11 place-items-center border border-zinc-700/70 bg-zinc-950/70 sm:h-12 sm:w-12"
                      >
                        <SlotIcon
                          className="h-4 w-4 text-zinc-500"
                          aria-hidden
                        />
                        <Lock
                          className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-zinc-600"
                          aria-hidden
                        />
                      </span>
                    );
                  })}
                </div>
                {/* live 3D hero preview */}
                <div className="relative min-w-0 flex-1 overflow-hidden border border-zinc-700/60 bg-gradient-to-b from-zinc-900/70 via-zinc-950/80 to-zinc-950">
                  <CharacterPreview
                    skinIndex={skinIndex}
                    weaponIndex={weaponIndex}
                    customSkinUrls={customSkinUrls}
                  />
                  <p className="absolute left-2 top-2 flex items-center gap-1 border border-amber-400/40 bg-zinc-950/80 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-amber-300 backdrop-blur-sm">
                    <span
                      className="h-1 w-1 animate-pulse rounded-full bg-amber-400"
                      aria-hidden
                    />
                    Live
                  </p>
                  <p className="absolute bottom-2 left-2 right-2 truncate border border-zinc-700/60 bg-zinc-950/80 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-zinc-200 backdrop-blur-sm">
                    {skinName}
                  </p>
                </div>
              </div>
            </LobbyBox>

            {/* CRAFTING — fully workable vanilla-style crafting */}
            <LobbyBox
              icon={Hammer}
              title="Crafting"
              hint="2×2 · 3×3 · 320+ recipes"
              className="lg:col-span-3"
            >
              <CraftingPanel
                invSlots={invSlots}
                setInvSlots={setInvSlots}
                craftGrid={craftGrid}
                setCraftGrid={setCraftGrid}
                showToast={showToast}
                dragActive={!!draggingItem}
                customRecipes={customRecipes}
                onForged={handleForged}
                onDeleteCustom={handleDeleteCustom}
                onCustomIconChange={handleCustomIconChange}
              />
            </LobbyBox>
          </div>

          {/* ===== bottom row: hotbar | statistics ===== */}
          <div className="grid gap-4 lg:grid-cols-12">
            {/* HOTBAR */}
            <LobbyBox
              icon={Sword}
              title="Hotbar"
              hint={`Slot ${hotPicked + 1} selected`}
              className="lg:col-span-6"
            >
              <div className="grid grid-cols-9 gap-1.5">
                {hotbar.map((itemId, slotIndex) => {
                  const item = itemId
                    ? (invEntryById.get(itemId) ?? LOBBY_INV_DEF.get(itemId))
                    : undefined;
                  const ItemIcon = item?.icon ?? null;
                  const active = slotIndex === hotPicked;
                  return (
                    <button
                      key={slotIndex}
                      type="button"
                      aria-label={`Hotbar slot ${slotIndex + 1}${
                        item ? ` — ${item.label}` : ' — empty'
                      }`}
                      aria-pressed={active}
                      onClick={(event) => {
                        event.currentTarget.blur();
                        setHotPicked(slotIndex);
                      }}
                      className={`group relative grid aspect-square place-items-center border transition-all ${
                        active
                          ? 'border-amber-400 bg-amber-400/10 ring-1 ring-amber-400/50'
                          : 'border-zinc-600/70 bg-zinc-950/70 hover:border-amber-400/60 hover:bg-zinc-900'
                      }`}
                    >
                      <ItemSprite
                        img={item?.img}
                        fallbackIcon={ItemIcon}
                        className="h-10 w-10"
                      />
                      <span className="absolute left-1 top-0.5 text-[8px] font-black tabular-nums text-zinc-500">
                        {slotIndex + 1}
                      </span>
                      {item && <HoverName label={item.label} />}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-500">
                Pick an inventory item to load it into slot {hotPicked + 1}
              </p>
            </LobbyBox>

            {/* STATISTICS */}
            <LobbyBox
              icon={Gauge}
              title="Statistics"
              hint="Hero vitals"
              className="lg:col-span-6"
            >
              <div className="flex h-full flex-col gap-3">
                <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                  {LOBBY_STATS.map((stat) => {
                    const StatIcon = stat.icon;
                    return (
                      <div key={stat.id} className="flex items-center gap-2">
                        <StatIcon
                          className="h-3.5 w-3.5 shrink-0 text-zinc-300"
                          aria-hidden
                        />
                        <span className="w-20 shrink-0 truncate text-[9px] font-black uppercase tracking-[0.18em] text-zinc-400">
                          {stat.label}
                        </span>
                        <span className="h-1.5 min-w-0 flex-1 overflow-hidden bg-zinc-800">
                          <span
                            className={`block h-full bg-gradient-to-r ${stat.bar}`}
                            style={{
                              width: `${Math.round(
                                (stat.value / stat.max) * 100
                              )}%`,
                            }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-right text-[10px] font-black tabular-nums text-zinc-200">
                          {stat.display}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* level strip — nod to the classic Lv badge + EXP bar */}
                <div className="mt-auto flex items-center gap-3 border border-amber-400/30 bg-amber-400/5 p-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-amber-400/70 bg-zinc-950/70">
                    <span className="text-center leading-none">
                      <span className="block text-[8px] font-black uppercase tracking-[0.2em] text-amber-200/80">
                        Lv
                      </span>
                      <span className="block text-base font-black tabular-nums text-amber-300">
                        67
                      </span>
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.25em] text-zinc-400">
                      Experience
                      <span className="tabular-nums text-zinc-300">
                        180 / 2695 EXP
                      </span>
                    </p>
                    <span className="block h-1.5 overflow-hidden bg-zinc-800">
                      <span
                        className="block h-full bg-gradient-to-r from-amber-500 to-amber-300"
                        style={{ width: '7%' }}
                      />
                    </span>
                  </div>
                </div>
              </div>
            </LobbyBox>
          </div>

          {/* ===== AI row: SARGE chat | mission generator ===== */}
          <div className="grid gap-4 lg:grid-cols-12">
            <LobbyBox
              icon={Bot}
              title="AI Command"
              hint="SARGE · game-aware answers"
              className="lg:col-span-7"
            >
              <AiCommandBox context={sargeContext} />
            </LobbyBox>
            <LobbyBox
              icon={Dices}
              title="AI Missions"
              hint="daily bounties"
              className="lg:col-span-5"
            >
              <AiMissionBox showToast={showToast} />
            </LobbyBox>
          </div>
        </div>
      </div>

      {/* screen footer */}
      <footer className="flex items-center justify-between border-t border-amber-400/20 px-4 py-2.5 sm:px-6">
        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-600">
          Ratfire Command · Lobby
        </span>
        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-600">
          Esc to close
        </span>
      </footer>
    </section>
  );
}

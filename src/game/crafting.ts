/**
 * RATFIRE crafting engine — a fully workable vanilla-Minecraft-style crafting
 * system: shaped recipes (3x3 crafting table + 2x2 inventory grid), shapeless
 * recipes, furnace smelting and ore "refining" (turning mined ore blocks into
 * their material drops, like breaking them in vanilla).
 *
 * Every item icon comes from the real Minecraft Wiki inventory sprites
 * (downloaded to /public/wiki/icons) or from the game's own vanilla block
 * textures (/public/blocks) — see the `wiki()` helper.
 */

// ---------------------------------------------------------------------------
// Item registry
// ---------------------------------------------------------------------------

export type CraftItemDef = {
  id: string;
  label: string;
  img: string;
};

/** Wiki icon path from the item's display label ("Oak Planks" -> Oak_Planks). */
const wiki = (label: string) => `/wiki/icons/${label.replace(/ /g, '_')}.png`;
/** Game-shipped vanilla block texture. */
const block = (id: string) => `/blocks/${id}.png`;

const def = (id: string, label: string, img: string): [string, CraftItemDef] => [
  id,
  { id, label, img },
];

const WOODS = [
  'oak',
  'spruce',
  'birch',
  'jungle',
  'acacia',
  'dark_oak',
  'mangrove',
  'cherry',
  'pale_oak',
] as const;
const WOOD_LABELS: Record<string, string> = {
  oak: 'Oak',
  spruce: 'Spruce',
  birch: 'Birch',
  jungle: 'Jungle',
  acacia: 'Acacia',
  dark_oak: 'Dark Oak',
  mangrove: 'Mangrove',
  cherry: 'Cherry',
  pale_oak: 'Pale Oak',
};

export const CRAFT_ITEMS: Record<string, CraftItemDef> = Object.fromEntries([
  // --- mined blocks already carry game textures (icon fallback for crafting) ---
  ...[
    'stone', 'deepslate', 'granite', 'diorite', 'andesite', 'tuff', 'calcite',
    'dripstone_block', 'cobbled_deepslate', 'cobblestone', 'pointed_dripstone',
    'bedrock', 'dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'podzol',
    'mycelium', 'mud', 'clay', 'gravel', 'sand', 'red_sand', 'sandstone',
    'red_sandstone', 'moss_block', 'snow_block', 'snow', 'ice_block',
    'packed_ice', 'blue_ice', 'obsidian', 'crying_obsidian', 'netherrack',
    'basalt', 'smooth_basalt', 'blackstone', 'soul_sand', 'soul_soil',
    'nether_wart_block', 'warped_wart_block', 'crimson_nylium', 'warped_nylium',
    'nether_bricks', 'glowstone', 'end_stone', 'chorus_plant', 'chorus_flower',
    'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log',
    'dark_oak_log', 'mangrove_log', 'cherry_log', 'pale_oak_log', 'vines',
    'cave_vines', 'kelp', 'seagrass', 'tall_grass', 'short_grass', 'fern',
    'large_fern', 'dead_bush', 'cactus', 'sugar_cane', 'bamboo',
    'red_mushroom', 'brown_mushroom', 'dandelion', 'poppy', 'cornflower',
    'blue_orchid', 'crimson_roots', 'warped_roots', 'nether_wart', 'sponge',
    'wet_sponge',
  ].map((id) => def(id, id.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()), block(id))),

  // --- wood family ---
  ...WOODS.map((w) =>
    def(`${w}_planks`, `${WOOD_LABELS[w]} Planks`, wiki(`${WOOD_LABELS[w]} Planks`))
  ),
  def('bamboo_planks', 'Bamboo Planks', wiki('Bamboo Planks')),
  ...WOODS.map((w) => def(`${w}_slab`, `${WOOD_LABELS[w]} Slab`, wiki(`${WOOD_LABELS[w]} Slab`))),
  def('bamboo_slab', 'Bamboo Slab', wiki('Bamboo Slab')),
  ...WOODS.map((w) => def(`${w}_stairs`, `${WOOD_LABELS[w]} Stairs`, wiki(`${WOOD_LABELS[w]} Stairs`))),
  def('bamboo_stairs', 'Bamboo Stairs', wiki('Bamboo Stairs')),
  def('bamboo_mosaic', 'Bamboo Mosaic', wiki('Bamboo Mosaic')),
  def('bamboo_mosaic_slab', 'Bamboo Mosaic Slab', wiki('Bamboo Mosaic Slab')),
  def('bamboo_mosaic_stairs', 'Bamboo Mosaic Stairs', wiki('Bamboo Mosaic Stairs')),
  ...WOODS.map((w) => def(`${w}_button`, `${WOOD_LABELS[w]} Button`, wiki(`${WOOD_LABELS[w]} Button`))),
  def('bamboo_button', 'Bamboo Button', wiki('Bamboo Button')),
  ...WOODS.map((w) =>
    def(`${w}_pressure_plate`, `${WOOD_LABELS[w]} Pressure Plate`, wiki(`${WOOD_LABELS[w]} Pressure Plate`))
  ),
  def('bamboo_pressure_plate', 'Bamboo Pressure Plate', wiki('Bamboo Pressure Plate')),
  ...WOODS.map((w) => def(`${w}_fence`, `${WOOD_LABELS[w]} Fence`, wiki(`${WOOD_LABELS[w]} Fence`))),
  def('bamboo_fence', 'Bamboo Fence', wiki('Bamboo Fence')),
  ...WOODS.map((w) => def(`${w}_fence_gate`, `${WOOD_LABELS[w]} Fence Gate`, wiki(`${WOOD_LABELS[w]} Fence Gate`))),
  def('bamboo_fence_gate', 'Bamboo Fence Gate', wiki('Bamboo Fence Gate')),
  ...WOODS.map((w) => def(`${w}_door`, `${WOOD_LABELS[w]} Door`, wiki(`${WOOD_LABELS[w]} Door`))),
  def('bamboo_door', 'Bamboo Door', wiki('Bamboo Door')),
  ...WOODS.map((w) => def(`${w}_trapdoor`, `${WOOD_LABELS[w]} Trapdoor`, wiki(`${WOOD_LABELS[w]} Trapdoor`))),
  def('bamboo_trapdoor', 'Bamboo Trapdoor', wiki('Bamboo Trapdoor')),
  ...WOODS.map((w) => def(`${w}_sign`, `${WOOD_LABELS[w]} Sign`, wiki(`${WOOD_LABELS[w]} Sign`))),
  def('bamboo_sign', 'Bamboo Sign', wiki('Bamboo Sign')),
  ...WOODS.map((w) => def(`${w}_boat`, `${WOOD_LABELS[w]} Boat`, wiki(`${WOOD_LABELS[w]} Boat`))),
  def('bamboo_raft', 'Bamboo Raft', wiki('Bamboo Raft')),

  // --- basics ---
  def('stick', 'Stick', wiki('Stick')),
  def('crafting_table', 'Crafting Table', wiki('Crafting Table')),
  def('furnace', 'Furnace', wiki('Furnace')),
  def('chest', 'Chest', wiki('Chest')),
  def('barrel', 'Barrel', wiki('Barrel')),
  def('torch', 'Torch', wiki('Torch')),
  def('soul_torch', 'Soul Torch', wiki('Soul Torch')),
  def('lantern', 'Lantern', wiki('Lantern')),
  def('soul_lantern', 'Soul Lantern', wiki('Soul Lantern')),
  def('ladder', 'Ladder', wiki('Ladder')),
  def('paper', 'Paper', wiki('Paper')),
  def('sugar', 'Sugar', wiki('Sugar')),
  def('glass_bottle', 'Glass Bottle', wiki('Glass Bottle')),
  def('flower_pot', 'Flower Pot', wiki('Flower Pot')),
  def('campfire', 'Campfire', wiki('Campfire')),
  def('soul_campfire', 'Soul Campfire', wiki('Soul Campfire')),

  // --- materials ---
  def('coal', 'Coal', wiki('Coal')),
  def('charcoal', 'Charcoal', wiki('Charcoal')),
  def('iron_ingot', 'Iron Ingot', wiki('Iron Ingot')),
  def('copper_ingot', 'Copper Ingot', wiki('Copper Ingot')),
  def('gold_ingot', 'Gold Ingot', wiki('Gold Ingot')),
  def('netherite_scrap', 'Netherite Scrap', wiki('Netherite Scrap')),
  def('netherite_ingot', 'Netherite Ingot', wiki('Netherite Ingot')),
  def('iron_nugget', 'Iron Nugget', wiki('Iron Nugget')),
  def('gold_nugget', 'Gold Nugget', wiki('Gold Nugget')),
  def('diamond', 'Diamond', wiki('Diamond')),
  def('emerald', 'Emerald', wiki('Emerald')),
  def('redstone', 'Redstone Dust', wiki('Redstone')),
  def('lapis_lazuli', 'Lapis Lazuli', wiki('Lapis Lazuli')),
  def('nether_quartz', 'Nether Quartz', wiki('Nether Quartz')),
  def('glowstone_dust', 'Glowstone Dust', wiki('Glowstone Dust')),
  def('flint', 'Flint', wiki('Flint')),
  def('clay_ball', 'Clay Ball', wiki('Clay Ball')),
  def('brick', 'Brick', wiki('Brick')),
  def('nether_brick', 'Nether Brick', wiki('Nether Brick')),
  def('dried_kelp', 'Dried Kelp', wiki('Dried Kelp')),

  // --- storage / mineral blocks ---
  def('block_of_iron', 'Block of Iron', wiki('Block of Iron')),
  def('block_of_copper', 'Block of Copper', wiki('Block of Copper')),
  def('block_of_gold', 'Block of Gold', wiki('Block of Gold')),
  def('block_of_diamond', 'Block of Diamond', wiki('Block of Diamond')),
  def('block_of_emerald', 'Block of Emerald', wiki('Block of Emerald')),
  def('block_of_coal', 'Block of Coal', wiki('Block of Coal')),
  def('block_of_redstone', 'Block of Redstone', wiki('Block of Redstone')),
  def('block_of_lapis_lazuli', 'Block of Lapis Lazuli', wiki('Block of Lapis Lazuli')),
  def('block_of_netherite', 'Block of Netherite', wiki('Block of Netherite')),
  def('block_of_quartz', 'Block of Quartz', wiki('Block of Quartz')),
  def('quartz_pillar', 'Quartz Pillar', wiki('Quartz Pillar')),
  def('chiseled_quartz_block', 'Chiseled Quartz Block', wiki('Chiseled Quartz Block')),
  def('quartz_bricks', 'Quartz Bricks', wiki('Quartz Bricks')),
  def('quartz_slab', 'Quartz Slab', wiki('Quartz Slab')),
  def('quartz_stairs', 'Quartz Stairs', wiki('Quartz Stairs')),

  // --- stone & decor ---
  def('glass', 'Glass', wiki('Glass')),
  def('glass_pane', 'Glass Pane', wiki('Glass Pane')),
  def('smooth_stone', 'Smooth Stone', wiki('Smooth Stone')),
  def('stone_bricks', 'Stone Bricks', wiki('Stone Bricks')),
  def('chiseled_stone_bricks', 'Chiseled Stone Bricks', wiki('Chiseled Stone Bricks')),
  def('mossy_cobblestone', 'Mossy Cobblestone', wiki('Mossy Cobblestone')),
  def('mossy_stone_bricks', 'Mossy Stone Bricks', wiki('Mossy Stone Bricks')),
  def('stone_slab', 'Smooth Stone Slab', wiki('Smooth Stone Slab')),
  def('cobblestone_slab', 'Cobblestone Slab', wiki('Cobblestone Slab')),
  def('cobblestone_stairs', 'Cobblestone Stairs', wiki('Cobblestone Stairs')),
  def('mossy_cobblestone_slab', 'Mossy Cobblestone Slab', wiki('Mossy Cobblestone Slab')),
  def('stone_brick_slab', 'Stone Brick Slab', wiki('Stone Brick Slab')),
  def('stone_brick_stairs', 'Stone Brick Stairs', wiki('Stone Brick Stairs')),
  def('polished_andesite', 'Polished Andesite', wiki('Polished Andesite')),
  def('polished_granite', 'Polished Granite', wiki('Polished Granite')),
  def('polished_diorite', 'Polished Diorite', wiki('Polished Diorite')),
  def('andesite_slab', 'Andesite Slab', wiki('Andesite Slab')),
  def('granite_slab', 'Granite Slab', wiki('Granite Slab')),
  def('diorite_slab', 'Diorite Slab', wiki('Diorite Slab')),
  def('bricks', 'Bricks', wiki('Bricks')),
  def('brick_slab', 'Brick Slab', wiki('Brick Slab')),
  def('brick_stairs', 'Brick Stairs', wiki('Brick Stairs')),
  def('terracotta', 'Terracotta', wiki('Terracotta')),
  def('smooth_sandstone', 'Smooth Sandstone', wiki('Smooth Sandstone')),
  def('cut_sandstone', 'Cut Sandstone', wiki('Cut Sandstone')),
  def('chiseled_sandstone', 'Chiseled Sandstone', wiki('Chiseled Sandstone')),
  def('sandstone_slab', 'Sandstone Slab', wiki('Sandstone Slab')),
  def('sandstone_stairs', 'Sandstone Stairs', wiki('Sandstone Stairs')),
  def('cut_red_sandstone', 'Cut Red Sandstone', wiki('Cut Red Sandstone')),
  def('chiseled_red_sandstone', 'Chiseled Red Sandstone', wiki('Chiseled Red Sandstone')),
  def('red_sandstone_slab', 'Red Sandstone Slab', wiki('Red Sandstone Slab')),
  def('red_sandstone_stairs', 'Red Sandstone Stairs', wiki('Red Sandstone Stairs')),
  def('polished_deepslate', 'Polished Deepslate', wiki('Polished Deepslate')),
  def('deepslate_bricks', 'Deepslate Bricks', wiki('Deepslate Bricks')),
  def('deepslate_tiles', 'Deepslate Tiles', wiki('Deepslate Tiles')),
  def('cobbled_deepslate_slab', 'Cobbled Deepslate Slab', wiki('Cobbled Deepslate Slab')),
  def('cobbled_deepslate_stairs', 'Cobbled Deepslate Stairs', wiki('Cobbled Deepslate Stairs')),
  def('polished_blackstone', 'Polished Blackstone', wiki('Polished Blackstone')),
  def('polished_blackstone_bricks', 'Polished Blackstone Bricks', wiki('Polished Blackstone Bricks')),
  def('nether_brick_slab', 'Nether Brick Slab', wiki('Nether Brick Slab')),
  def('nether_brick_stairs', 'Nether Brick Stairs', wiki('Nether Brick Stairs')),
  def('nether_brick_fence', 'Nether Brick Fence', wiki('Nether Brick Fence')),
  def('red_nether_bricks', 'Red Nether Bricks', wiki('Red Nether Bricks')),
  def('end_stone_bricks', 'End Stone Bricks', wiki('End Stone Bricks')),
  def('polished_basalt', 'Polished Basalt', wiki('Polished Basalt')),
  def('polished_blackstone_slab', 'Polished Blackstone Slab', wiki('Polished Blackstone Slab')),
  def('polished_blackstone_stairs', 'Polished Blackstone Stairs', wiki('Polished Blackstone Stairs')),
  def('dried_kelp_block', 'Dried Kelp Block', wiki('Dried Kelp Block')),
  def('jukebox', 'Jukebox', wiki('Jukebox')),
  def('note_block', 'Note Block', wiki('Note Block')),

  // --- redstone ---
  def('lever', 'Lever', wiki('Lever')),
  def('stone_button', 'Stone Button', wiki('Stone Button')),
  def('stone_pressure_plate', 'Stone Pressure Plate', wiki('Stone Pressure Plate')),
  def('light_weighted_pressure_plate', 'Light Weighted Pressure Plate', wiki('Light Weighted Pressure Plate')),
  def('heavy_weighted_pressure_plate', 'Heavy Weighted Pressure Plate', wiki('Heavy Weighted Pressure Plate')),
  def('redstone_torch', 'Redstone Torch', wiki('Redstone Torch')),
  def('redstone_lamp', 'Redstone Lamp', wiki('Redstone Lamp')),
  def('piston', 'Piston', wiki('Piston')),
  def('observer', 'Observer', wiki('Observer')),
  def('hopper', 'Hopper', wiki('Hopper')),
  def('rail', 'Rail', wiki('Rail')),
  def('powered_rail', 'Powered Rail', wiki('Powered Rail')),
  def('detector_rail', 'Detector Rail', wiki('Detector Rail')),
  def('activator_rail', 'Activator Rail', wiki('Activator Rail')),
  def('repeater', 'Redstone Repeater', wiki('Redstone Repeater')),
  def('comparator', 'Redstone Comparator', wiki('Redstone Comparator')),

  // --- tools & combat ---
  ...(
    [
      ['wooden', 'Wooden', 'planks'],
      ['stone', 'Stone', 'stone'],
      ['iron', 'Iron', 'iron'],
      ['golden', 'Golden', 'gold'],
      ['diamond', 'Diamond', 'diamond'],
      ['netherite', 'Netherite', 'netherite'],
    ] as const
  ).flatMap(([prefix, label]) => [
    def(`${prefix}_pickaxe`, `${label} Pickaxe`, wiki(`${label} Pickaxe`)),
    def(`${prefix}_axe`, `${label} Axe`, wiki(`${label} Axe`)),
    def(`${prefix}_shovel`, `${label} Shovel`, wiki(`${label} Shovel`)),
    def(`${prefix}_hoe`, `${label} Hoe`, wiki(`${label} Hoe`)),
    def(`${prefix}_sword`, `${label} Sword`, wiki(`${label} Sword`)),
  ]),
  ...(['iron', 'golden', 'diamond'] as const).flatMap((prefix) => {
    const label = prefix === 'golden' ? 'Golden' : prefix === 'iron' ? 'Iron' : 'Diamond';
    return [
      def(`${prefix}_helmet`, `${label} Helmet`, wiki(`${label} Helmet`)),
      def(`${prefix}_chestplate`, `${label} Chestplate`, wiki(`${label} Chestplate`)),
      def(`${prefix}_leggings`, `${label} Leggings`, wiki(`${label} Leggings`)),
      def(`${prefix}_boots`, `${label} Boots`, wiki(`${label} Boots`)),
    ];
  }),
  ...(
    [
      ['helmet', 'Helmet'],
      ['chestplate', 'Chestplate'],
      ['leggings', 'Leggings'],
      ['boots', 'Boots'],
    ] as const
  ).map(([part, label]) => def(`netherite_${part}`, `Netherite ${label}`, wiki(`Netherite ${label}`))),
  def('shears', 'Shears', wiki('Shears')),
  def('flint_and_steel', 'Flint and Steel', wiki('Flint and Steel')),
  def('bucket', 'Bucket', wiki('Bucket')),
  def('compass', 'Compass', "/wiki/icons/Compass.gif"),
  def('clock', 'Clock', "/wiki/icons/Clock.gif"),
  def('anvil', 'Anvil', wiki('Anvil')),

  // --- ore blocks (mined in-game, used as smelting/refine ingredients) ---
  def('coal_ore', 'Coal Ore', block('coal_ore')),
  def('deepslate_coal_ore', 'Deepslate Coal Ore', block('deepslate_coal_ore')),
  def('iron_ore', 'Iron Ore', block('iron_ore')),
  def('deepslate_iron_ore', 'Deepslate Iron Ore', block('deepslate_iron_ore')),
  def('copper_ore', 'Copper Ore', block('copper_ore')),
  def('deepslate_copper_ore', 'Deepslate Copper Ore', block('deepslate_copper_ore')),
  def('gold_ore', 'Gold Ore', block('gold_ore')),
  def('deepslate_gold_ore', 'Deepslate Gold Ore', block('deepslate_gold_ore')),
  def('redstone_ore', 'Redstone Ore', block('redstone_ore')),
  def('deepslate_redstone_ore', 'Deepslate Redstone Ore', block('deepslate_redstone_ore')),
  def('lapis_ore', 'Lapis Ore', block('lapis_ore')),
  def('deepslate_lapis_ore', 'Deepslate Lapis Ore', block('deepslate_lapis_ore')),
  def('diamond_ore', 'Diamond Ore', block('diamond_ore')),
  def('deepslate_diamond_ore', 'Deepslate Diamond Ore', block('deepslate_diamond_ore')),
  def('emerald_ore', 'Emerald Ore', block('emerald_ore')),
  def('deepslate_emerald_ore', 'Deepslate Emerald Ore', block('deepslate_emerald_ore')),
  def('nether_quartz_ore', 'Nether Quartz Ore', block('nether_quartz_ore')),
  def('nether_gold_ore', 'Nether Gold Ore', block('nether_gold_ore')),
  def('ancient_debris', 'Ancient Debris', block('ancient_debris')),

  // --- RATFIRE gear reagents (off-inventory items used in tech recipes) ---
  def('coins', 'Coin stack', block('coins')),
  def('gems', 'Gem shard', block('gems')),
  def('loot_chest', 'Loot chest', block('chest')),
  def('blade', 'Blade', block('blade')),
  def('rail', 'Railgun core', block('rail')),
  def('cell', 'Power cell', block('cell')),
  def('medkit', 'Med kit', block('medkit')),
  def('fuel', 'Fuel can', block('fuel')),
  def('ice', 'Ice charm', block('ice')),
  def('ore', 'Ore magnet', block('ore')),
  def('chip', 'Pet chip', block('chip')),
  def('dust', 'Forge dust', block('dust')),

  // --- RATFIRE tech (legacy recipes, game-shipped output textures) ---
  def('railcore', 'Rail core', '/blocks/out_railcore.png'),
  def('thermal', 'Thermal charm', '/blocks/out_thermal.png'),
  def('magnet', 'Loot magnet', '/blocks/out_magnet.png'),
  def('petchip', 'Pet chip v2', '/blocks/out_petchip.png'),
]);

// ---------------------------------------------------------------------------
// Tags (vanilla ingredient groups)
// ---------------------------------------------------------------------------

const PLANK_IDS = [...WOODS.map((w) => `${w}_planks`), 'bamboo_planks'];
const LOG_IDS = WOODS.map((w) => `${w}_log`);
const WOOD_SLAB_IDS = [...WOODS.map((w) => `${w}_slab`), 'bamboo_slab'];

const TAGS: Record<string, string[]> = {
  planks: PLANK_IDS,
  logs: LOG_IDS,
  wooden_slabs: WOOD_SLAB_IDS,
  coal: ['coal', 'charcoal'],
};

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export type RecipeCategory =
  | 'basics'
  | 'wood'
  | 'stone'
  | 'redstone'
  | 'tools'
  | 'combat'
  | 'smelting'
  | 'refine'
  | 'tech';

export const RECIPE_CATEGORIES: Array<{ id: RecipeCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'basics', label: 'Basics' },
  { id: 'wood', label: 'Woodwork' },
  { id: 'stone', label: 'Stone & decor' },
  { id: 'redstone', label: 'Redstone' },
  { id: 'tools', label: 'Tools' },
  { id: 'combat', label: 'Combat' },
  { id: 'smelting', label: 'Furnace' },
  { id: 'refine', label: 'Refine' },
  { id: 'tech', label: 'RATFIRE' },
];

export type CraftRecipe = {
  id: string;
  out: string;
  outCount: number;
  /** Minimum grid size: 2 = craftable in the 2x2 inventory grid; 3 = crafting table. */
  mode: 2 | 3;
  type: 'shaped' | 'shapeless' | 'smelting';
  cat: RecipeCategory;
  /** Shaped pattern rows (' ' = empty cell). Characters map through `key`. */
  pattern?: string[];
  /** Pattern character -> ingredient spec (item id or #tag). */
  key?: Record<string, string>;
  /** Shapeless / smelting ingredient specs (item id or #tag). */
  ins?: string[];
  note?: string;
};

const R = (
  id: string,
  out: string,
  outCount: number,
  cat: RecipeCategory,
  extra: Partial<CraftRecipe>
): CraftRecipe => ({
  id,
  out,
  outCount,
  cat,
  mode: 3,
  type: 'shaped',
  ...extra,
});

/** wood-type loop helper: fn may return one recipe or a list of them. */
function perWood(
  fn: (wood: string, label: string) => CraftRecipe | CraftRecipe[]
): CraftRecipe[] {
  return [...WOODS.map((w) => fn(w, WOOD_LABELS[w])), fn('bamboo', 'Bamboo')].flat();
}

export const CRAFT_RECIPES: CraftRecipe[] = [
  // ===== WOOD =====
  ...perWood((w, label) =>
    w === 'bamboo'
      ? [
          R('bamboo_planks', 'bamboo_planks', 2, 'wood', {
            type: 'shapeless',
            mode: 2,
            ins: ['bamboo'],
            note: 'Split bamboo into planks.',
          }),
        ]
      : [
          R(`${w}_planks`, `${w}_planks`, 4, 'wood', {
            type: 'shapeless',
            mode: 2,
            ins: [`${w}_log`],
            note: 'Break a log into planks.',
          }),
        ]
  ),
  R('stick', 'stick', 4, 'basics', {
    type: 'shaped',
    mode: 2,
    pattern: ['P', 'P'],
    key: { P: '#planks' },
  }),
  ...perWood((w, label) =>
    R(`${w}_button`, `${w}_button`, 1, 'wood', {
      pattern: ['P'],
      key: { P: `${w}_planks` },
      note: `${label} plank button.`,
    })
  ),
  ...perWood((w, label) =>
    R(`${w}_pressure_plate`, `${w}_pressure_plate`, 1, 'redstone', {
      pattern: ['PP'],
      key: { P: `${w}_planks` },
    })
  ),
  ...perWood((w, label) =>
    R(`${w}_slab`, `${w}_slab`, 6, 'wood', {
      pattern: ['PPP'],
      key: { P: `${w}_planks` },
    })
  ),
  R('bamboo_mosaic', 'bamboo_mosaic', 1, 'wood', {
    pattern: ['S', 'S'],
    key: { S: 'bamboo_slab' },
  }),
  ...perWood((w, label) =>
    R(`${w}_stairs`, `${w}_stairs`, 4, 'wood', {
      pattern: ['P..', 'PP.', 'PPP'],
      key: { P: `${w}_planks` },
    })
  ),
  R('bamboo_mosaic_stairs', 'bamboo_mosaic_stairs', 4, 'wood', {
    pattern: ['M..', 'MM.', 'MMM'],
    key: { M: 'bamboo_mosaic' },
  }),
  ...perWood((w, label) =>
    R(`${w}_fence`, `${w}_fence`, 3, 'wood', {
      pattern: ['PSP', 'PSP'],
      key: { P: `${w}_planks`, S: 'stick' },
    })
  ),
  ...perWood((w, label) =>
    R(`${w}_fence_gate`, `${w}_fence_gate`, 1, 'wood', {
      pattern: ['SPS', 'SPS'],
      key: { P: `${w}_planks`, S: 'stick' },
    })
  ),
  ...perWood((w, label) =>
    R(`${w}_door`, `${w}_door`, 3, 'wood', {
      pattern: ['PP', 'PP', 'PP'],
      key: { P: `${w}_planks` },
    })
  ),
  ...perWood((w, label) =>
    R(`${w}_trapdoor`, `${w}_trapdoor`, 2, 'wood', {
      pattern: ['PPP', 'PPP'],
      key: { P: `${w}_planks` },
    })
  ),
  ...perWood((w, label) =>
    R(`${w}_sign`, `${w}_sign`, 3, 'wood', {
      pattern: ['PPP', 'PPP', '.S.'],
      key: { P: `${w}_planks`, S: 'stick' },
    })
  ),
  ...perWood((w, label) =>
    w === 'bamboo'
      ? R('bamboo_raft', 'bamboo_raft', 1, 'wood', {
          pattern: ['P.P', 'PPP'],
          key: { P: 'bamboo_planks' },
        })
      : R(`${w}_boat`, `${w}_boat`, 1, 'wood', {
          pattern: ['P.P', 'PPP'],
          key: { P: `${w}_planks` },
          note: `${label} boat.`,
        })
  ),
  R('chest', 'chest', 1, 'basics', {
    pattern: ['PPP', 'P.P', 'PPP'],
    key: { P: '#planks' },
  }),
  R('furnace', 'furnace', 1, 'basics', {
    pattern: ['CCC', 'C.C', 'CCC'],
    key: { C: 'cobblestone' },
  }),
  R('barrel', 'barrel', 1, 'basics', {
    pattern: ['PPP', 'P.P', 'SSS'],
    key: { P: '#planks', S: '#wooden_slabs' },
  }),
  R('crafting_table', 'crafting_table', 1, 'basics', {
    type: 'shaped',
    mode: 2,
    pattern: ['PP', 'PP'],
    key: { P: '#planks' },
  }),
  R('ladder', 'ladder', 3, 'basics', {
    pattern: ['S.S', 'SSS', 'S.S'],
    key: { S: 'stick' },
  }),
  R('torch', 'torch', 4, 'basics', {
    type: 'shaped',
    mode: 2,
    pattern: ['C', 'S'],
    key: { C: '#coal', S: 'stick' },
  }),
  R('soul_torch', 'soul_torch', 4, 'basics', {
    pattern: ['C', 'S', 'O'],
    key: { C: '#coal', S: 'stick', O: '#soul' },
    note: 'Soul flame variant.',
  }),
  R('lantern', 'lantern', 1, 'basics', {
    pattern: ['NNN', 'N.T', 'NNN'],
    key: { N: 'iron_nugget', T: 'torch' },
  }),
  R('soul_lantern', 'soul_lantern', 1, 'basics', {
    pattern: ['NNN', 'N.T', 'NNN'],
    key: { N: 'iron_nugget', T: 'soul_torch' },
  }),
  R('campfire', 'campfire', 1, 'basics', {
    pattern: ['.S.', 'SCS', 'LLL'],
    key: { S: 'stick', C: '#coal', L: '#logs' },
  }),
  R('soul_campfire', 'soul_campfire', 1, 'basics', {
    pattern: ['.S.', 'SCS', 'LLL'],
    key: { S: 'stick', C: '#coal', L: '#logs', O: '#soul' },
    note: 'Place a soul block beneath the coal — pattern key L accepts soul sand too.',
  }),
  R('paper', 'paper', 3, 'basics', {
    pattern: ['CCC'],
    key: { C: 'sugar_cane' },
  }),
  R('sugar', 'sugar', 1, 'basics', {
    type: 'shapeless',
    mode: 2,
    ins: ['sugar_cane'],
  }),
  R('glass_bottle', 'glass_bottle', 3, 'basics', {
    pattern: ['.G.', 'G.G', '.G.'],
    key: { G: 'glass' },
    note: 'Also craftable in the 2x2 grid? No — 3 wide, use a crafting table.',
  }),
  R('flower_pot', 'flower_pot', 1, 'basics', {
    pattern: ['.B.', 'B.B', '.B.'],
    key: { B: 'brick' },
  }),
  R('jukebox', 'jukebox', 1, 'basics', {
    pattern: ['PPP', 'PDP', 'PPP'],
    key: { P: '#planks', D: 'diamond' },
  }),
  R('note_block', 'note_block', 1, 'redstone', {
    pattern: ['PPP', 'PRP', 'PPP'],
    key: { P: '#planks', R: 'redstone' },
  }),

  // ===== STONE & DECOR =====
  R('stone_bricks', 'stone_bricks', 4, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['SS', 'SS'],
    key: { S: 'stone' },
  }),
  R('chiseled_stone_bricks', 'chiseled_stone_bricks', 1, 'stone', {
    pattern: ['S', 'S'],
    key: { S: 'stone_slab' },
  }),
  R('mossy_cobblestone', 'mossy_cobblestone', 1, 'stone', {
    type: 'shapeless',
    ins: ['cobblestone', 'moss_block'],
  }),
  R('mossy_cobblestone_v', 'mossy_cobblestone', 1, 'stone', {
    type: 'shapeless',
    ins: ['cobblestone', 'vines'],
  }),
  R('mossy_stone_bricks', 'mossy_stone_bricks', 1, 'stone', {
    type: 'shapeless',
    ins: ['stone_bricks', 'moss_block'],
  }),
  R('stone_slab', 'stone_slab', 6, 'stone', {
    pattern: ['SSS'],
    key: { S: 'stone' },
  }),
  R('cobblestone_slab', 'cobblestone_slab', 6, 'stone', {
    pattern: ['CCC'],
    key: { C: 'cobblestone' },
  }),
  R('cobblestone_stairs', 'cobblestone_stairs', 4, 'stone', {
    pattern: ['C..', 'CC.', 'CCC'],
    key: { C: 'cobblestone' },
  }),
  R('stone_brick_slab', 'stone_brick_slab', 6, 'stone', {
    pattern: ['SSS'],
    key: { S: 'stone_bricks' },
  }),
  R('stone_brick_stairs', 'stone_brick_stairs', 4, 'stone', {
    pattern: ['S..', 'SS.', 'SSS'],
    key: { S: 'stone_bricks' },
  }),
  R('polished_andesite', 'polished_andesite', 4, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['AA', 'AA'],
    key: { A: 'andesite' },
  }),
  R('polished_granite', 'polished_granite', 4, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['GG', 'GG'],
    key: { G: 'granite' },
  }),
  R('polished_diorite', 'polished_diorite', 4, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['DD', 'DD'],
    key: { D: 'diorite' },
  }),
  R('andesite', 'andesite', 1, 'stone', {
    type: 'shapeless',
    ins: ['diorite', 'cobblestone'],
    note: 'Vanilla: diorite + cobblestone.',
  }),
  R('granite', 'granite', 1, 'stone', {
    type: 'shapeless',
    ins: ['diorite', 'nether_quartz'],
    note: 'Vanilla: diorite + quartz.',
  }),
  R('andesite_slab', 'andesite_slab', 6, 'stone', {
    pattern: ['AAA'],
    key: { A: 'andesite' },
  }),
  R('granite_slab', 'granite_slab', 6, 'stone', {
    pattern: ['GGG'],
    key: { G: 'granite' },
  }),
  R('diorite_slab', 'diorite_slab', 6, 'stone', {
    pattern: ['DDD'],
    key: { D: 'diorite' },
  }),
  R('sandstone', 'sandstone', 1, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['SS', 'SS'],
    key: { S: 'sand' },
  }),
  R('red_sandstone', 'red_sandstone', 1, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['SS', 'SS'],
    key: { S: 'red_sand' },
  }),
  R('cut_sandstone', 'cut_sandstone', 4, 'stone', {
    pattern: ['SS', 'SS'],
    key: { S: 'sandstone' },
  }),
  R('chiseled_sandstone', 'chiseled_sandstone', 1, 'stone', {
    pattern: ['S', 'S'],
    key: { S: 'sandstone_slab' },
  }),
  R('smooth_sandstone', 'smooth_sandstone', 1, 'stone', {
    type: 'smelting',
    ins: ['sandstone'],
  }),
  R('sandstone_slab', 'sandstone_slab', 6, 'stone', {
    pattern: ['SSS'],
    key: { S: 'sandstone' },
  }),
  R('sandstone_stairs', 'sandstone_stairs', 4, 'stone', {
    pattern: ['S..', 'SS.', 'SSS'],
    key: { S: 'sandstone' },
  }),
  R('cut_red_sandstone', 'cut_red_sandstone', 4, 'stone', {
    pattern: ['SS', 'SS'],
    key: { S: 'red_sandstone' },
  }),
  R('chiseled_red_sandstone', 'chiseled_red_sandstone', 1, 'stone', {
    pattern: ['S', 'S'],
    key: { S: 'red_sandstone_slab' },
  }),
  R('red_sandstone_slab', 'red_sandstone_slab', 6, 'stone', {
    pattern: ['SSS'],
    key: { S: 'red_sandstone' },
  }),
  R('red_sandstone_stairs', 'red_sandstone_stairs', 4, 'stone', {
    pattern: ['S..', 'SS.', 'SSS'],
    key: { S: 'red_sandstone' },
  }),
  R('bricks', 'bricks', 1, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['BB', 'BB'],
    key: { B: 'brick' },
  }),
  R('brick_slab', 'brick_slab', 6, 'stone', {
    pattern: ['BBB'],
    key: { B: 'bricks' },
  }),
  R('brick_stairs', 'brick_stairs', 4, 'stone', {
    pattern: ['B..', 'BB.', 'BBB'],
    key: { B: 'bricks' },
  }),
  R('polished_deepslate', 'polished_deepslate', 4, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['DD', 'DD'],
    key: { D: 'cobbled_deepslate' },
  }),
  R('deepslate_bricks', 'deepslate_bricks', 4, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['PP', 'PP'],
    key: { P: 'polished_deepslate' },
  }),
  R('deepslate_tiles', 'deepslate_tiles', 4, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['BB', 'BB'],
    key: { B: 'deepslate_bricks' },
  }),
  R('cobbled_deepslate_slab', 'cobbled_deepslate_slab', 6, 'stone', {
    pattern: ['CCC'],
    key: { C: 'cobbled_deepslate' },
  }),
  R('cobbled_deepslate_stairs', 'cobbled_deepslate_stairs', 4, 'stone', {
    pattern: ['C..', 'CC.', 'CCC'],
    key: { C: 'cobbled_deepslate' },
  }),
  R('polished_basalt', 'polished_basalt', 4, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['BB', 'BB'],
    key: { B: 'basalt' },
  }),
  R('polished_blackstone', 'polished_blackstone', 4, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['BB', 'BB'],
    key: { B: 'blackstone' },
  }),
  R('polished_blackstone_bricks', 'polished_blackstone_bricks', 4, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['PP', 'PP'],
    key: { P: 'polished_blackstone' },
  }),
  R('polished_blackstone_slab', 'polished_blackstone_slab', 6, 'stone', {
    pattern: ['PPP'],
    key: { P: 'polished_blackstone' },
  }),
  R('polished_blackstone_stairs', 'polished_blackstone_stairs', 4, 'stone', {
    pattern: ['P..', 'PP.', 'PPP'],
    key: { P: 'polished_blackstone' },
  }),
  R('nether_bricks', 'nether_bricks', 1, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['NN', 'NN'],
    key: { N: 'nether_brick' },
  }),
  R('nether_brick_slab', 'nether_brick_slab', 6, 'stone', {
    pattern: ['NNN'],
    key: { N: 'nether_bricks' },
  }),
  R('nether_brick_stairs', 'nether_brick_stairs', 4, 'stone', {
    pattern: ['N..', 'NN.', 'NNN'],
    key: { N: 'nether_bricks' },
  }),
  R('nether_brick_fence', 'nether_brick_fence', 6, 'stone', {
    pattern: ['NNN', 'N.N', 'NNN'],
    key: { N: 'nether_brick' },
  }),
  R('red_nether_bricks', 'red_nether_bricks', 1, 'stone', {
    pattern: ['NW', 'WN'],
    key: { N: 'nether_bricks', W: 'nether_wart' },
  }),
  R('end_stone_bricks', 'end_stone_bricks', 4, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['EE', 'EE'],
    key: { E: 'end_stone' },
  }),
  R('block_of_quartz', 'block_of_quartz', 1, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['QQ', 'QQ'],
    key: { Q: 'nether_quartz' },
  }),
  R('quartz_pillar', 'quartz_pillar', 2, 'stone', {
    pattern: ['Q', 'Q'],
    key: { Q: 'block_of_quartz' },
  }),
  R('chiseled_quartz_block', 'chiseled_quartz_block', 1, 'stone', {
    pattern: ['Q', 'Q'],
    key: { Q: 'quartz_slab' },
    note: 'Needs quartz slabs (see Quartz slab in this book? craft from block of quartz).',
  }),
  R('quartz_slab', 'quartz_slab', 6, 'stone', {
    pattern: ['QQQ'],
    key: { Q: 'block_of_quartz' },
  }),
  R('quartz_stairs', 'quartz_stairs', 4, 'stone', {
    pattern: ['Q..', 'QQ.', 'QQQ'],
    key: { Q: 'block_of_quartz' },
  }),
  R('quartz_bricks', 'quartz_bricks', 1, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['QQ', 'QQ'],
    key: { Q: 'block_of_quartz' },
  }),
  R('glass_pane', 'glass_pane', 16, 'stone', {
    pattern: ['GGG', 'GGG'],
    key: { G: 'glass' },
  }),
  R('snow_block', 'snow_block', 1, 'stone', {
    type: 'shaped',
    mode: 2,
    pattern: ['SS', 'SS'],
    key: { S: 'snow' },
  }),
  R('packed_ice', 'packed_ice', 1, 'stone', {
    pattern: ['III', 'III', 'III'],
    key: { I: 'ice_block' },
  }),
  R('blue_ice', 'blue_ice', 1, 'stone', {
    pattern: ['III', 'III', 'III'],
    key: { I: 'packed_ice' },
  }),
  R('dried_kelp_block', 'dried_kelp_block', 1, 'stone', {
    pattern: ['KKK', 'KKK', 'KKK'],
    key: { K: 'dried_kelp' },
  }),
  R('glowstone', 'glowstone', 1, 'stone', {
    pattern: ['DD', 'DD'],
    key: { D: 'glowstone_dust' },
  }),

  // ===== STORAGE BLOCKS =====
  ...(
    [
      ['iron_ingot', 'block_of_iron'],
      ['copper_ingot', 'block_of_copper'],
      ['gold_ingot', 'block_of_gold'],
      ['diamond', 'block_of_diamond'],
      ['emerald', 'block_of_emerald'],
      ['coal', 'block_of_coal'],
      ['redstone', 'block_of_redstone'],
      ['lapis_lazuli', 'block_of_lapis_lazuli'],
      ['netherite_ingot', 'block_of_netherite'],
    ] as const
  ).flatMap(([ing, blok]) => [
    R(`compress_${blok}`, blok, 1, 'basics', {
      pattern: ['MMM', 'MMM', 'MMM'],
      key: { M: ing },
    }),
    R(`uncompress_${blok}`, ing, 9, 'basics', {
      type: 'shapeless',
      ins: [blok],
    }),
  ]),

  // ===== REDSTONE =====
  R('lever', 'lever', 1, 'redstone', {
    type: 'shaped',
    mode: 2,
    pattern: ['S', 'C'],
    key: { S: 'stick', C: 'cobblestone' },
  }),
  R('stone_button', 'stone_button', 1, 'redstone', {
    type: 'shaped',
    mode: 2,
    pattern: ['S'],
    key: { S: 'stone' },
  }),
  R('stone_pressure_plate', 'stone_pressure_plate', 1, 'redstone', {
    pattern: ['SS'],
    key: { S: 'stone' },
  }),
  R('light_weighted_pressure_plate', 'light_weighted_pressure_plate', 1, 'redstone', {
    pattern: ['GG'],
    key: { G: 'gold_ingot' },
  }),
  R('heavy_weighted_pressure_plate', 'heavy_weighted_pressure_plate', 1, 'redstone', {
    pattern: ['II'],
    key: { I: 'iron_ingot' },
  }),
  R('redstone_torch', 'redstone_torch', 1, 'redstone', {
    type: 'shaped',
    mode: 2,
    pattern: ['R', 'S'],
    key: { R: 'redstone', S: 'stick' },
  }),
  R('redstone_lamp', 'redstone_lamp', 1, 'redstone', {
    pattern: ['.R.', 'RGR', '.R.'],
    key: { R: 'redstone', G: 'glowstone' },
  }),
  R('piston', 'piston', 1, 'redstone', {
    pattern: ['PPP', 'CIC', 'CRC'],
    key: { P: '#planks', C: 'cobblestone', I: 'iron_ingot', R: 'redstone' },
  }),
  R('observer', 'observer', 1, 'redstone', {
    pattern: ['CCC', 'RRQ', 'CCC'],
    key: { C: 'cobblestone', R: 'redstone', Q: 'nether_quartz' },
  }),
  R('hopper', 'hopper', 1, 'redstone', {
    pattern: ['I.I', 'ICI', '.I.'],
    key: { I: 'iron_ingot', C: 'chest' },
  }),
  R('rail', 'rail', 16, 'redstone', {
    pattern: ['I.I', 'ISI', 'I.I'],
    key: { I: 'iron_ingot', S: 'stick' },
  }),
  R('powered_rail', 'powered_rail', 6, 'redstone', {
    pattern: ['G.G', 'GRG', 'GSG'],
    key: { G: 'gold_ingot', R: 'redstone', S: 'stick' },
  }),
  R('detector_rail', 'detector_rail', 6, 'redstone', {
    pattern: ['I.I', 'IPI', 'IRI'],
    key: { I: 'iron_ingot', P: 'stone_pressure_plate', R: 'redstone' },
  }),
  R('activator_rail', 'activator_rail', 6, 'redstone', {
    pattern: ['ISI', 'IRI', 'ISI'],
    key: { I: 'iron_ingot', S: 'stick', R: 'redstone_torch' },
  }),
  R('repeater', 'repeater', 1, 'redstone', {
    pattern: ['TRT', 'SSS'],
    key: { T: 'redstone_torch', R: 'redstone', S: 'stone' },
  }),
  R('comparator', 'comparator', 1, 'redstone', {
    pattern: ['.T.', 'TQT', 'SSS'],
    key: { T: 'redstone_torch', Q: 'nether_quartz', S: 'stone' },
  }),

  // ===== TOOLS =====
  ...(
    [
      ['wooden', '#planks', 'Wooden'],
      ['stone', 'cobblestone', 'Stone'],
      ['iron', 'iron_ingot', 'Iron'],
      ['golden', 'gold_ingot', 'Golden'],
      ['diamond', 'diamond', 'Diamond'],
    ] as const
  ).flatMap(([prefix, mat, label]) => [
    R(`${prefix}_pickaxe`, `${prefix}_pickaxe`, 1, 'tools', {
      pattern: ['MMM', '.S.', '.S.'],
      key: { M: mat, S: 'stick' },
      note: `${label} tools.`,
    }),
    R(`${prefix}_axe`, `${prefix}_axe`, 1, 'tools', {
      pattern: ['MM', 'MS', '.S'],
      key: { M: mat, S: 'stick' },
    }),
    R(`${prefix}_shovel`, `${prefix}_shovel`, 1, 'tools', {
      pattern: ['M', 'S', 'S'],
      key: { M: mat, S: 'stick' },
    }),
    R(`${prefix}_hoe`, `${prefix}_hoe`, 1, 'tools', {
      pattern: ['MM', '.S', '.S'],
      key: { M: mat, S: 'stick' },
    }),
    R(`${prefix}_sword`, `${prefix}_sword`, 1, 'combat', {
      pattern: ['M', 'M', 'S'],
      key: { M: mat, S: 'stick' },
    }),
  ]),
  // netherite upgrades — shapeless diamond tool + ingot (legacy smithing flavor)
  ...(
    [
      ['pickaxe', 'Pickaxe'],
      ['axe', 'Axe'],
      ['shovel', 'Shovel'],
      ['hoe', 'Hoe'],
      ['sword', 'Sword'],
    ] as const
  ).map(([part, label]) =>
    R(`netherite_${part}`, `netherite_${part}`, 1, 'tools', {
      type: 'shapeless',
      ins: [`diamond_${part}`, 'netherite_ingot'],
      note: `Smithing upgrade: Diamond ${label} + Netherite Ingot.`,
    })
  ),

  // ===== COMBAT / ARMOR =====
  ...(
    [
      ['iron', 'Iron', 'iron_ingot'],
      ['golden', 'Golden', 'gold_ingot'],
      ['diamond', 'Diamond', 'diamond'],
    ] as const
  ).flatMap(([prefix, label, mat]) => [
    R(`${prefix}_helmet`, `${prefix}_helmet`, 1, 'combat', {
      pattern: ['MMM', 'M.M'],
      key: { M: mat },
      note: `${label} armor.`,
    }),
    R(`${prefix}_chestplate`, `${prefix}_chestplate`, 1, 'combat', {
      pattern: ['M.M', 'MMM', 'MMM'],
      key: { M: mat },
    }),
    R(`${prefix}_leggings`, `${prefix}_leggings`, 1, 'combat', {
      pattern: ['MMM', 'M.M', 'M.M'],
      key: { M: mat },
    }),
    R(`${prefix}_boots`, `${prefix}_boots`, 1, 'combat', {
      pattern: ['M.M', 'M.M'],
      key: { M: mat },
    }),
  ]),
  ...(
    [
      ['helmet', 'Helmet'],
      ['chestplate', 'Chestplate'],
      ['leggings', 'Leggings'],
      ['boots', 'Boots'],
    ] as const
  ).map(([part, label]) =>
    R(`netherite_${part}`, `netherite_${part}`, 1, 'combat', {
      type: 'shapeless',
      ins: [`diamond_${part}`, 'netherite_ingot'],
      note: `Smithing upgrade: Diamond ${label} + Netherite Ingot.`,
    })
  ),
  R('shears', 'shears', 1, 'tools', {
    type: 'shaped',
    mode: 2,
    pattern: ['I.', '.I'],
    key: { I: 'iron_ingot' },
  }),
  R('flint_and_steel', 'flint_and_steel', 1, 'tools', {
    type: 'shapeless',
    ins: ['iron_ingot', 'flint'],
  }),
  R('bucket', 'bucket', 1, 'tools', {
    pattern: ['I.I', '.I.'],
    key: { I: 'iron_ingot' },
  }),
  R('compass', 'compass', 1, 'tools', {
    pattern: ['.I.', 'IRI', '.I.'],
    key: { I: 'iron_ingot', R: 'redstone' },
  }),
  R('clock', 'clock', 1, 'tools', {
    pattern: ['.G.', 'GRG', '.G.'],
    key: { G: 'gold_ingot', R: 'redstone' },
  }),
  R('anvil', 'anvil', 1, 'tools', {
    pattern: ['BBB', '.B.', 'BBB'],
    key: { B: 'block_of_iron' },
  }),

  // ===== SMELTING (furnace) =====
  R('smelt_iron_ore', 'iron_ingot', 1, 'smelting', { type: 'smelting', ins: ['iron_ore'] }),
  R('smelt_deepslate_iron_ore', 'iron_ingot', 1, 'smelting', { type: 'smelting', ins: ['deepslate_iron_ore'] }),
  R('smelt_copper_ore', 'copper_ingot', 1, 'smelting', { type: 'smelting', ins: ['copper_ore'] }),
  R('smelt_deepslate_copper_ore', 'copper_ingot', 1, 'smelting', { type: 'smelting', ins: ['deepslate_copper_ore'] }),
  R('smelt_gold_ore', 'gold_ingot', 1, 'smelting', { type: 'smelting', ins: ['gold_ore'] }),
  R('smelt_deepslate_gold_ore', 'gold_ingot', 1, 'smelting', { type: 'smelting', ins: ['deepslate_gold_ore'] }),
  R('smelt_nether_gold_ore', 'gold_ingot', 1, 'smelting', { type: 'smelting', ins: ['nether_gold_ore'] }),
  R('smelt_ancient_debris', 'netherite_scrap', 1, 'smelting', { type: 'smelting', ins: ['ancient_debris'] }),
  R('smelt_sand', 'glass', 1, 'smelting', { type: 'smelting', ins: ['sand'] }),
  R('smelt_red_sand', 'glass', 1, 'smelting', { type: 'smelting', ins: ['red_sand'] }),
  R('smelt_cobblestone', 'stone', 1, 'smelting', { type: 'smelting', ins: ['cobblestone'] }),
  R('smelt_stone', 'smooth_stone', 1, 'smelting', { type: 'smelting', ins: ['stone'] }),
  R('smelt_cobbled_deepslate', 'deepslate', 1, 'smelting', { type: 'smelting', ins: ['cobbled_deepslate'] }),
  R('smelt_basalt', 'smooth_basalt', 1, 'smelting', { type: 'smelting', ins: ['basalt'] }),
  R('smelt_netherrack', 'nether_brick', 1, 'smelting', { type: 'smelting', ins: ['netherrack'] }),
  R('smelt_clay', 'terracotta', 1, 'smelting', { type: 'smelting', ins: ['clay'] }),
  R('smelt_clay_ball', 'brick', 1, 'smelting', { type: 'smelting', ins: ['clay_ball'] }),
  R('smelt_log', 'charcoal', 1, 'smelting', { type: 'smelting', ins: ['#logs'], note: 'Any log becomes charcoal.' }),
  R('smelt_wet_sponge', 'sponge', 1, 'smelting', { type: 'smelting', ins: ['wet_sponge'] }),
  R('smelt_kelp', 'dried_kelp', 1, 'smelting', { type: 'smelting', ins: ['kelp'] }),

  // ===== REFINE (turn an ore block into its vanilla drop) =====
  R('refine_coal_ore', 'coal', 1, 'refine', { type: 'shapeless', ins: ['coal_ore'], note: 'Mined coal ore drop.' }),
  R('refine_deepslate_coal_ore', 'coal', 1, 'refine', { type: 'shapeless', ins: ['deepslate_coal_ore'] }),
  R('refine_redstone_ore', 'redstone', 4, 'refine', { type: 'shapeless', ins: ['redstone_ore'], note: 'Vanilla drops 4-5 dust.' }),
  R('refine_deepslate_redstone_ore', 'redstone', 4, 'refine', { type: 'shapeless', ins: ['deepslate_redstone_ore'] }),
  R('refine_lapis_ore', 'lapis_lazuli', 6, 'refine', { type: 'shapeless', ins: ['lapis_ore'], note: 'Vanilla drops 4-9.' }),
  R('refine_deepslate_lapis_ore', 'lapis_lazuli', 6, 'refine', { type: 'shapeless', ins: ['deepslate_lapis_ore'] }),
  R('refine_diamond_ore', 'diamond', 1, 'refine', { type: 'shapeless', ins: ['diamond_ore'] }),
  R('refine_deepslate_diamond_ore', 'diamond', 1, 'refine', { type: 'shapeless', ins: ['deepslate_diamond_ore'] }),
  R('refine_emerald_ore', 'emerald', 1, 'refine', { type: 'shapeless', ins: ['emerald_ore'] }),
  R('refine_deepslate_emerald_ore', 'emerald', 1, 'refine', { type: 'shapeless', ins: ['deepslate_emerald_ore'] }),
  R('refine_quartz_ore', 'nether_quartz', 2, 'refine', { type: 'shapeless', ins: ['nether_quartz_ore'] }),
  R('refine_gravel', 'flint', 1, 'refine', { type: 'shapeless', ins: ['gravel'], note: 'Gravel can drop flint.' }),
  R('refine_clay', 'clay_ball', 4, 'refine', { type: 'shapeless', ins: ['clay'], note: 'Clay block = 4 clay balls.' }),
  R('refine_glowstone', 'glowstone_dust', 4, 'refine', { type: 'shapeless', ins: ['glowstone'], note: 'Glowstone breaks into 2-4 dust.' }),
  R('refine_snow_block', 'snow', 6, 'refine', { type: 'shapeless', ins: ['snow_block'], note: 'Shovel a snow block back into layers.' }),
  R('refine_grass_block', 'dirt', 1, 'refine', { type: 'shapeless', ins: ['grass_block'], note: 'Without Silk Touch grass drops dirt.' }),
  R('refine_podzol', 'dirt', 1, 'refine', { type: 'shapeless', ins: ['podzol'] }),
  R('refine_mycelium', 'dirt', 1, 'refine', { type: 'shapeless', ins: ['mycelium'] }),
  R('refine_stone', 'cobblestone', 1, 'refine', { type: 'shapeless', ins: ['stone'], note: 'Mining stone drops cobblestone.' }),
  R('refine_deepslate', 'cobbled_deepslate', 1, 'refine', { type: 'shapeless', ins: ['deepslate'] }),
  R('refine_nether_wart_block', 'nether_wart', 9, 'refine', { type: 'shapeless', ins: ['nether_wart_block'] }),

  // ===== NETHERITE =====
  R('netherite_ingot', 'netherite_ingot', 1, 'smelting', {
    pattern: ['SGS', 'G.G', 'SGS'],
    key: { S: 'netherite_scrap', G: 'gold_ingot' },
    note: '4 scrap + 4 gold ingots, checkerboard.',
  }),

  // ===== RATFIRE TECH (legacy) =====
  R('railcore', 'railcore', 1, 'tech', {
    pattern: ['.C.', '...', '.O.'],
    key: { C: 'cell', O: 'ore' },
    note: 'RATFIRE railgun core: power cell over ore magnet.',
  }),
  R('thermal', 'thermal', 1, 'tech', {
    pattern: ['...', 'F.I', '...'],
    key: { F: 'fuel', I: 'ice' },
    note: 'Thermal charm: fuel + ice charm.',
  }),
  R('magnet', 'magnet', 1, 'tech', {
    pattern: ['O..', '...', '..O'],
    key: { O: 'ore' },
    note: 'Loot magnet: two ore magnets corner to corner.',
  }),
  R('petchip', 'petchip', 1, 'tech', {
    pattern: ['..P', '...', 'C..'],
    key: { P: 'chip', C: 'gems' },
    note: 'Pet chip v2: pet chip + gem shard.',
  }),
];

// fill tag '#soul'
TAGS.soul = ['soul_sand', 'soul_soil'];
// quartz slab referenced before definition order — fine, ids are strings.

// ---------------------------------------------------------------------------
// Matching engine
// ---------------------------------------------------------------------------

export type PlacedCell = { id: string } | null;
/** Row-major grid of placed items — length 4 (2x2) or 9 (3x3). */
export type CraftGrid = PlacedCell[];

/** Expand an ingredient spec ("oak_planks" | "#planks") into acceptable ids. */
export function expandIngredient(spec: string): string[] {
  if (spec.startsWith('#')) {
    const tag = spec.slice(1);
    const ids = TAGS[tag];
    if (ids) return ids;
    // unknown tag — treat the spec itself as an item id
    return [tag];
  }
  return [spec];
}

function expandAll(specs: string[]): string[][] {
  return specs.map(expandIngredient);
}

/** Trim a W×H id matrix to its bounding box of non-null cells. */
function boundingBox(
  ids: (string | null)[],
  w: number,
  h: number
): { cells: (string | null)[]; w: number; h: number } | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (ids[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX === -1) return null;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const cells: (string | null)[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      cells.push(ids[y * w + x]);
    }
  }
  return { cells, w: bw, h: bh };
}

function shapedMatches(
  recipe: CraftRecipe,
  ids: (string | null)[],
  gridW: number,
  gridH: number
): boolean {
  const pattern = recipe.pattern ?? [];
  const key = recipe.key ?? {};
  const ph = pattern.length;
  const pw = Math.max(...pattern.map((row) => row.length));
  const placed = boundingBox(ids, gridW, gridH);
  if (!placed) return false;
  if (placed.w !== pw || placed.h !== ph) return false;
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const ch = pattern[y]?.[x] ?? ' ';
      const placedId = placed.cells[y * pw + x];
      if (ch === ' ' || ch === '.') {
        if (placedId) return false;
      } else {
        if (!placedId) return false;
        const accepted = expandIngredient(key[ch] ?? ch);
        if (!accepted.includes(placedId)) return false;
      }
    }
  }
  return true;
}

function shapelessMatches(
  recipe: CraftRecipe,
  ids: (string | null)[]
): boolean {
  const ins = expandAll(recipe.ins ?? []);
  const placed = ids.filter((id): id is string => !!id);
  if (placed.length !== ins.length) return false;
  const pool = [...ins];
  for (const id of placed) {
    const idx = pool.findIndex((accepted) => accepted.includes(id));
    if (idx === -1) return false;
    pool.splice(idx, 1);
  }
  return pool.length === 0;
}

/** Does the placed grid satisfy this recipe? */
export function gridMatchesRecipe(
  recipe: CraftRecipe,
  grid: CraftGrid,
  gridW: number,
  gridH: number
): boolean {
  if (recipe.type === 'smelting') return false;
  const ids = grid.map((cell) => (cell ? cell.id : null));
  if (recipe.type === 'shapeless') return shapelessMatches(recipe, ids);
  return shapedMatches(recipe, ids, gridW, gridH);
}

/** First recipe satisfied by the grid (search order = database order). */
export function findGridMatch(
  grid: CraftGrid,
  gridW: number,
  gridH: number
): CraftRecipe | null {
  for (const recipe of CRAFT_RECIPES) {
    if (gridMatchesRecipe(recipe, grid, gridW, gridH)) return recipe;
  }
  return null;
}

/**
 * Exact per-cell placement plan for a recipe — the Minecraft pattern
 * mapped onto grid cell indexes. `activeCells` is the row-major list of
 * usable cell indexes for the current grid size ([0..8] for the 3x3 table,
 * [0,1,3,4] for the 2x2 inventory grid). Each entry holds the accepted
 * ingredient ids that belong in that cell (shaped: pattern row/col →
 * y*3+x, exactly like vanilla; shapeless: first N active cells), or null
 * when the cell must stay empty. Used by the recipe-book fill and the AI
 * craft-by-words loader so items land in their proper positions.
 */
export function recipeBlueprintCells(
  recipe: CraftRecipe,
  activeCells: number[]
): Array<string[] | null> {
  const cells: Array<string[] | null> = Array(9).fill(null);
  if (recipe.type === 'shapeless') {
    (recipe.ins ?? []).forEach((spec, i) => {
      const cell = activeCells[i];
      if (cell !== undefined && cell >= 0 && cell < 9) {
        cells[cell] = expandIngredient(spec);
      }
    });
    return cells;
  }
  if (recipe.type === 'smelting') return cells;
  const key = recipe.key ?? {};
  (recipe.pattern ?? []).forEach((row, y) => {
    for (let x = 0; x < Math.min(row.length, 3); x++) {
      const ch = row[x] ?? ' ';
      if (ch === ' ' || ch === '.') continue;
      const cell = y * 3 + x;
      if (cell < 0 || cell > 8) continue;
      cells[cell] = expandIngredient(key[ch] ?? ch);
    }
  });
  return cells;
}

/** Ingredient need list for one craft: [{acceptedIds, need}] */
export function recipeNeeds(recipe: CraftRecipe): Array<{ accepted: string[]; need: number }> {
  const needs = new Map<string, { accepted: string[]; need: number }>();
  const bump = (accepted: string[]) => {
    const k = [...accepted].sort().join('|');
    const cur = needs.get(k);
    if (cur) cur.need += 1;
    else needs.set(k, { accepted, need: 1 });
  };
  if (recipe.type === 'shaped') {
    const key = recipe.key ?? {};
    for (const row of recipe.pattern ?? []) {
      for (const ch of row) {
        if (ch !== ' ' && ch !== '.') bump(expandIngredient(key[ch] ?? ch));
      }
    }
  } else {
    for (const spec of recipe.ins ?? []) bump(expandIngredient(spec));
  }
  return [...needs.values()];
}

export type HaveFn = (id: string) => number;

/** Missing ingredients for one craft of this recipe, given inventory counts. */
export function missingIngredients(
  recipe: CraftRecipe,
  have: HaveFn
): Array<{ label: string; need: number; have: number }> {
  return recipeNeeds(recipe)
    .map(({ accepted, need }) => {
      const owned = accepted.reduce((sum, id) => sum + have(id), 0);
      return { label: acceptedLabel(accepted), need, have: owned };
    })
    .filter((entry) => entry.have < entry.need);
}

function acceptedLabel(accepted: string[]): string {
  if (accepted.length === 1) return itemLabel(accepted[0]);
  if (accepted.length <= 3) return accepted.map(itemLabel).join(' / ');
  return `${itemLabel(accepted[0])} (+${accepted.length - 1} more)`;
}

export function itemLabel(id: string): string {
  return CRAFT_ITEMS[id]?.label ?? id.replaceAll('_', ' ');
}

export function itemImg(id: string): string {
  return CRAFT_ITEMS[id]?.img ?? '';
}

/** How many times can this recipe be crafted with current inventory counts? */
export function maxCraftable(recipe: CraftRecipe, have: HaveFn): number {
  let max = Infinity;
  for (const { accepted, need } of recipeNeeds(recipe)) {
    const owned = accepted.reduce((sum, id) => sum + have(id), 0);
    max = Math.min(max, Math.floor(owned / need));
  }
  return max === Infinity ? 0 : Math.max(0, max);
}

/** Can this recipe be used in the given grid size? */
export function recipeFitsMode(recipe: CraftRecipe, size: 2 | 3): boolean {
  if (recipe.mode > size) return false;
  if (recipe.type === 'shaped') {
    const ph = (recipe.pattern ?? []).length;
    const pw = Math.max(...(recipe.pattern ?? ['']).map((r) => r.length));
    return ph <= size && pw <= size;
  }
  return true;
}

/** Ingredient label list for the recipe book rows. */
export function recipeIngredientLabels(recipe: CraftRecipe): string[] {
  if (recipe.type === 'shaped') {
    const key = recipe.key ?? {};
    const out: string[] = [];
    const seen = new Set<string>();
    for (const row of recipe.pattern ?? []) {
      for (const ch of row) {
        if (ch === ' ' || ch === '.') continue;
        const accepted = expandIngredient(key[ch] ?? ch);
        const k = [...accepted].sort().join('|');
        if (!seen.has(k)) {
          seen.add(k);
          out.push(acceptedLabel(accepted));
        }
      }
    }
    return out;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const accepted of expandAll(recipe.ins ?? [])) {
    const k = [...accepted].sort().join('|');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(acceptedLabel(accepted));
    }
  }
  return out;
}

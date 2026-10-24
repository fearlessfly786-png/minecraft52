import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI LOBBY ASSISTANT — the lobby's "AI COMMAND" chat box.
 *
 * POST { messages: [{ role: 'user' | 'assistant', content }, ...] } →
 *   SARGE (the RATFIRE command AI) answers with full game context: the
 *   weapon arsenal, zones, crafting system, mods, AI forges and economy.
 *   The client sends the recent chat history; the server prepends the
 *   game-knowledge system prompt so answers stay grounded in THIS game.
 */

/** Everything SARGE knows about RATFIRE — kept in one place so the answer
 *  quality matches the actual game (same facts as the lobby UI shows). */
const SYSTEM = [
  "You are SARGE, the command AI of RATFIRE — a browser voxel arena shooter with a full Minecraft-style crafting system.",
  "Personality: gruff, warm, military radio brevity. Max ~110 words. Never use markdown headers or bullet lists longer than 3 items.",
  "GAME KNOWLEDGE:",
  "- PHASES: lobby (inventory/equipment/crafting/hotbar/statistics deck) → battlefield (WASD move, mouse aim, click shoot, R reload, Sprint Shift, Jump Space, V toggles the BUZZ voice link).",
  "- ARSENAL (11 MD2 weapons): Blade, Shotgun, Chaingun, Railgun, BFG, Blaster, Grenade Launcher, Hyperblaster, Machinegun, Rocket Launcher, Super Shotgun. WEAPONS bay can AI-forge custom weapon skins.",
  "- ZONES: GRASSLANDS (start), DESERT, TUNDRA, VOLCANO — each with terrain, loot chests, AI patrols and BUZZ the drone wingman (voice commands with V).",
  "- ECONOMY: coins + gems from kills/chests; store bay sells gear; daily AI missions pay coins and gems.",
  "- CRAFTING (the crafting panel in the lobby): 2x2 inventory grid or 3x3 crafting table, 320+ vanilla recipes, shaped + shapeless + furnace smelting + ore refining. Click ingredient chips into the grid, recipe book auto-fills, CRAFT / CRAFT MAX consume stacks. Mined blocks land in the lobby inventory.",
  "- AI FEATURES: AI Command (this chat), AI Mission Generator (daily bounties), AI Craft-by-Words (type what you want and the grid loads it), AI Recipe Forge (invents custom items like a lava sword, paints the icon, saves the recipe to the book forever), plus costume/weapon/terrain skin forges and the BUZZ voice link.",
  "- MODS bay: Chronos time & weather control, Create kinetic machinery.",
  "If asked how to win: survive waves, loot chests, craft gear, finish AI missions for gems. Answer as SARGE.",
].join("\n");

/** LIVE PLAYER SNAPSHOT — the lobby sends what the player actually holds so
 *  "what should I craft next?" gets answers grounded in THIS run, not
 *  generic advice. Every entry is a short label string from the client. */
type SargeContext = {
  inventory?: unknown;
  craftingGrid?: unknown;
  forgedItems?: unknown;
};

const MAX_CONTEXT_ITEMS = 24;
const MAX_CONTEXT_LABEL = 48;

function sanitizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, MAX_CONTEXT_LABEL))
    .filter((v) => v.length > 0)
    .slice(0, MAX_CONTEXT_ITEMS);
}

function contextBlock(context: SargeContext): string {
  const inventory = sanitizeLabels(context.inventory);
  const craftingGrid = sanitizeLabels(context.craftingGrid);
  const forgedItems = sanitizeLabels(context.forgedItems);
  const lines: string[] = ["LIVE PLAYER SNAPSHOT (ground every answer in this — it is the truth right now):"];
  if (inventory.length > 0) {
    lines.push(`- Inventory right now: ${inventory.join(", ")}.`);
  } else {
    lines.push("- Inventory right now: empty.");
  }
  if (craftingGrid.length > 0) {
    lines.push(`- Items sitting on the crafting grid: ${craftingGrid.join(", ")}.`);
  }
  if (forgedItems.length > 0) {
    lines.push(`- AI-forged custom items this player owns recipes for: ${forgedItems.join(", ")}.`);
  }
  lines.push(
    "When the player asks what to do/craft next, reason FROM this snapshot (e.g. suggest recipes their counts can satisfy, or what to mine)."
  );
  return lines.join("\n");
}

const MAX_HISTORY = 12;
const MAX_CONTENT = 600;

type ChatMsg = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  let history: ChatMsg[] = [];
  let context: SargeContext = {};
  try {
    const body = (await request.json()) as {
      messages?: unknown;
      context?: unknown;
    };
    if (Array.isArray(body?.messages)) {
      history = body.messages
        .filter(
          (m): m is ChatMsg =>
            !!m &&
            typeof m === "object" &&
            ((m as ChatMsg).role === "user" ||
              (m as ChatMsg).role === "assistant") &&
            typeof (m as ChatMsg).content === "string"
        )
        .slice(-MAX_HISTORY)
        .map((m) => ({
          role: m.role,
          content: m.content.trim().slice(0, MAX_CONTENT),
        }))
        .filter((m) => m.content.length > 0);
    }
    if (body?.context && typeof body.context === "object") {
      context = body.context as SargeContext;
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return NextResponse.json(
      { ok: false, error: "Say something first, soldier" },
      { status: 400 }
    );
  }

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: `${SYSTEM}\n\n${contextBlock(context)}` },
        ...history.slice(0, -1),
        {
          role: "user",
          content: history[history.length - 1].content,
        },
      ],
      thinking: { type: "disabled" },
    });
    const reply = (completion.choices[0]?.message?.content ?? "").trim();
    if (!reply) throw new Error("Empty reply");
    return NextResponse.json({ ok: true, reply });
  } catch (error) {
    console.error("[ai/assistant POST]", error);
    return NextResponse.json(
      { ok: false, error: "SARGE is off the radio — try again" },
      { status: 500 }
    );
  }
}

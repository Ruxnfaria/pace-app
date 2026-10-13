import assert from "node:assert/strict";
import test from "node:test";

import { requestChestOpen } from "./chest-opening.ts";

const chestId = "11111111-1111-4111-8111-111111111111";

test("client waits for the authoritative response before revealing a reward", async () => {
  let releaseResponse: ((response: Response) => void) | undefined;
  const responsePromise = new Promise<Response>((resolve) => {
    releaseResponse = resolve;
  });
  let revealed = false;
  const opening = requestChestOpen(
    chestId,
    async () => responsePromise,
  ).then((reward) => {
    revealed = true;
    return reward;
  });

  await Promise.resolve();
  assert.equal(revealed, false);

  releaseResponse?.(Response.json({
    reward: {
      chest_id: chestId,
      chest_slug: "common_chest",
      chest_name: "Baú Comum",
      chest_rarity: "common",
      reward_type: "crystals",
      amount: 5,
      item_id: null,
    },
    walletCrystals: 25,
  }));

  const reward = await opening;
  assert.equal(revealed, true);
  assert.equal(reward.amount, 5);
  assert.equal(reward.walletCrystals, 25);
});

test("client rejects non-crystal and malformed reward payloads", async () => {
  await assert.rejects(
    requestChestOpen(chestId, async () => Response.json({
      reward: {
        chest_id: chestId,
        chest_slug: "common_chest",
        chest_name: "Baú Comum",
        chest_rarity: "common",
        reward_type: "energy",
        amount: 50,
      },
    })),
    /Resposta de recompensa inválida/,
  );
});

test("client surfaces the API error without inventing a reward", async () => {
  await assert.rejects(
    requestChestOpen(
      chestId,
      async () => Response.json(
        { error: "Baú não encontrado" },
        { status: 404 },
      ),
    ),
    /Baú não encontrado/,
  );
});

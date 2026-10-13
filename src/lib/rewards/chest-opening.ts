export type ChestOpenReward = {
  chestId: string;
  chestSlug: string;
  chestName: string;
  chestRarity: "common" | "rare" | "epic";
  rewardType: "crystals";
  amount: number;
  walletCrystals: number | null;
};

type ChestOpenApiResponse = {
  reward?: {
    chest_id?: unknown;
    chest_slug?: unknown;
    chest_name?: unknown;
    chest_rarity?: unknown;
    reward_type?: unknown;
    amount?: unknown;
  };
  walletCrystals?: unknown;
  error?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requestChestOpen(
  chestId: string,
  fetcher: typeof fetch = fetch,
): Promise<ChestOpenReward> {
  if (!UUID_PATTERN.test(chestId)) {
    throw new Error("Baú inválido");
  }

  const response = await fetcher("/api/rewards/chests/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chestId }),
  });
  const payload = (await response.json()) as ChestOpenApiResponse;

  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Não foi possível abrir o baú",
    );
  }

  const reward = payload.reward;
  if (
    !reward
    || typeof reward.chest_id !== "string"
    || reward.chest_id !== chestId
    || typeof reward.chest_slug !== "string"
    || typeof reward.chest_name !== "string"
    || !["common", "rare", "epic"].includes(String(reward.chest_rarity))
    || reward.reward_type !== "crystals"
    || !Number.isSafeInteger(reward.amount)
    || Number(reward.amount) <= 0
  ) {
    throw new Error("Resposta de recompensa inválida");
  }

  const walletCrystals = Number.isSafeInteger(payload.walletCrystals)
    ? Number(payload.walletCrystals)
    : null;

  return {
    chestId: reward.chest_id,
    chestSlug: reward.chest_slug,
    chestName: reward.chest_name,
    chestRarity: reward.chest_rarity as ChestOpenReward["chestRarity"],
    rewardType: "crystals",
    amount: Number(reward.amount),
    walletCrystals,
  };
}

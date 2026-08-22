const STORAGE_KEY = "pace:pending-core-energy";

type PendingCoreEnergy = {
  amount: number;
  updatedAt: number;
};

export function queueCoreEnergy(amount: number) {
  if (typeof window === "undefined") return;
  if (amount <= 0) return;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    const current: PendingCoreEnergy = stored
      ? JSON.parse(stored)
      : {
          amount: 0,
          updatedAt: Date.now(),
        };

    const next: PendingCoreEnergy = {
      amount: (current.amount || 0) + amount,
      updatedAt: Date.now(),
    };

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(next)
    );
  } catch (error) {
    console.error(
      "[PRAXE] Erro ao guardar Energia pendente:",
      error
    );
  }
}

export function consumeCoreEnergy(): number {
  if (typeof window === "undefined") return 0;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) return 0;

    const pending: PendingCoreEnergy = JSON.parse(stored);

    window.localStorage.removeItem(STORAGE_KEY);

    return Number(pending.amount) || 0;
  } catch (error) {
    console.error(
      "[PRAXE] Erro ao consumir Energia pendente:",
      error
    );

    return 0;
  }
}
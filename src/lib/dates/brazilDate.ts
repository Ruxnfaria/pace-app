const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

const brazilDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BRAZIL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Returns the logical calendar date in Brazil, independent of host timezone. */
export function getBrazilDate(date = new Date()): string {
  const parts = brazilDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to determine the Brazil calendar date");
  }

  return `${year}-${month}-${day}`;
}

export function formatNumber(value: unknown) {
  return typeof value === "number"
    ? new Intl.NumberFormat("en-US").format(value)
    : value == null
      ? "—"
      : String(value);
}

export function relativeTime(value?: string) {
  if (!value) return "Never";
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  return formatter.format(Math.round(minutes / 60), "hour");
}

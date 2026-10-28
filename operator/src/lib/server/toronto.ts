export function torontoParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const isoDate = `${get("year")}-${get("month")}-${get("day")}`;
  const month = `${get("year")}-${get("month")}`;
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const mondayOffset = weekdayIndex === 0 ? -6 : 1 - weekdayIndex;
  const base = new Date(`${isoDate}T12:00:00`);
  base.setDate(base.getDate() + mondayOffset);
  const weekStart = base.toISOString().slice(0, 10);
  const sunday = new Date(base);
  sunday.setDate(sunday.getDate() + 6);
  const weekEnd = sunday.toISOString().slice(0, 10);
  return {
    weekday,
    hour,
    isoDate,
    month,
    weekStart,
    weekEnd,
    isWeekday: weekdayIndex >= 1 && weekdayIndex <= 5,
  };
}

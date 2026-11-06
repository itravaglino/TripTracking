const CLUSTER_GAP_MS = 36 * 60 * 60 * 1000;

export function groupReservations(reservations) {
  const dated = [];
  const undated = [];
  for (const item of reservations) {
    const start = Date.parse(item.start || "");
    if (Number.isNaN(start)) undated.push(item);
    else dated.push({ item, start, end: endMs(item, start) });
  }
  dated.sort((a, b) => a.start - b.start);
  const clusters = [];
  for (const entry of dated) {
    const last = clusters[clusters.length - 1];
    if (last && entry.start - last.end <= CLUSTER_GAP_MS) {
      last.items.push(entry.item);
      last.end = Math.max(last.end, entry.end);
    } else {
      clusters.push({ items: [entry.item], end: entry.end });
    }
  }
  if (undated.length) clusters.push({ items: undated, end: null });
  return clusters.map((cluster) => ({
    id: cluster.items.map((item) => item.id).join("~"),
    title: tripTitle(cluster.items),
    start: cluster.items.find((item) => item.start)?.start || "",
    end: [...cluster.items].reverse().find((item) => item.end || item.start)?.end
      || [...cluster.items].reverse().find((item) => item.start)?.start
      || "",
    items: cluster.items,
  }));
}

function endMs(item, start) {
  const end = Date.parse(item.end || "");
  return Number.isNaN(end) ? start : Math.max(start, end);
}

function tripTitle(items) {
  const place = items.map((item) => item.destination || item.location).find(Boolean);
  if (place) return place.split("·").pop().trim() || place;
  return items[0]?.title || "Trip";
}

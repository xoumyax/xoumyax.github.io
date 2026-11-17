// Year ranges as written in the content ("2024–26", "2022-23", "2024–", "Fall 2022 – Fall 2023").

/** The last year a range reaches, reading a two-digit end ("2024–26") as 2026; 0 when it names none. */
export function lastYear(y: string): number {
  const years = [...y.matchAll(/(\d{4})(?:\s*[–-]\s*(\d{2})(?!\d))?/g)].flatMap((m) => {
    const start = Number(m[1]);
    if (m[2] === undefined) return [start];
    let end = Math.floor(start / 100) * 100 + Number(m[2]);
    if (end < start) end += 100;
    return [start, end];
  });
  return years.length ? Math.max(...years) : 0;
}

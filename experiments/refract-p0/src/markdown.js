export function markdownLines(markdown) {
  return markdown.split(/\r?\n/).map((text, index) => ({
    line: index + 1,
    text
  }));
}

export function headings(markdown) {
  return markdownLines(markdown)
    .map((record) => {
      const match = record.text.match(/^(#{1,6})\s+(.+?)\s*$/);
      return match
        ? { ...record, level: match[1].length, label: match[2] }
        : null;
    })
    .filter(Boolean);
}

export function labeledFields(markdown) {
  const records = [];
  let section = null;

  for (const record of markdownLines(markdown)) {
    const heading = record.text.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      section = heading[1];
      continue;
    }

    const match = record.text.match(/^(?:-\s+)?\*\*([^*]+?):\*\*\s*(.+?)\s*$/);
    if (match) {
      records.push({
        ...record,
        section,
        label: match[1].trim(),
        value: match[2].trim()
      });
    }
  }

  return records;
}

export function hashChainRows(markdown) {
  const records = [];
  let inChain = false;

  for (const record of markdownLines(markdown)) {
    if (/^##\s+5-Link Hash Chain\s*$/.test(record.text)) {
      inChain = true;
      continue;
    }
    if (inChain && /^##\s+/.test(record.text)) break;
    if (!inChain) continue;

    const match = record.text.match(/^\|\s*([^|]+?)\s*\|\s*\x60([0-9a-f]{64})\x60\s*\|\s*$/i);
    if (match && match[1].trim() !== "Link") {
      records.push({
        ...record,
        label: match[1].trim(),
        hash: match[2]
      });
    }
  }

  return records;
}

export function explicitTimestamps(markdown) {
  const records = [];
  const pattern = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g;

  for (const record of markdownLines(markdown)) {
    for (const match of record.text.matchAll(pattern)) {
      records.push({
        ...record,
        value: match[0],
        column: (match.index ?? 0) + 1
      });
    }
  }

  return records;
}

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

export function explicitIdentityComparisons(markdown) {
  const records = [];
  const identityFieldPattern =
    /`(agent_id|identity\.subject|authorized_by|signer_id|principal_id)`\s+is\s+`([^`]+)`/gi;
  const sharedReferentPattern =
    /\b(?:same human|same person|same principal|refer to the same)\b/i;

  for (const record of markdownLines(markdown)) {
    const bindings = [...record.text.matchAll(identityFieldPattern)].map(
      (match) => ({ field: match[1], value: match[2] })
    );
    if (bindings.length < 2) continue;

    records.push({
      ...record,
      left: bindings[0],
      right: bindings[1],
      label_comparison: record.text.includes("!=")
        ? "DISTINCT_STRINGS"
        : "UNSPECIFIED",
      source_states_shared_referent: sharedReferentPattern.test(record.text)
    });
  }

  return records;
}

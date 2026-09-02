/** Escape a string for embedding in a QuickStatements quoted value. */
function qsQuote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Serialise a ChangeSet to QuickStatements v1 (tab-separated). QS v1 cannot
 * forward-reference an item created earlier in the same batch except the
 * single most recent CREATE (via LAST); cross-links between two brand-new
 * items are emitted as `# MANUAL:` comments for a second pass.
 * @param {import('./changeset.js').ChangeSet} cs
 * @returns {string}
 */
export function serialize(cs) {
  const lines = [];
  let lastCreatedRef = null;

  const qsValue = (v) => {
    switch (v.kind) {
      case 'item': return v.qid || null;              // ref handled by caller
      case 'string': case 'url': case 'external-id': return qsQuote(v.value);
      case 'time': return `+${v.value}T00:00:00Z/${v.precision}`;
      default: return null;
    }
  };

  const tail = (claim) => {
    let s = '';
    for (const q of claim.qualifiers || []) s += `\t${q.property}\t${qsValue(q.value)}`;
    if (claim.reference && claim.reference.P854) s += `\tS854\t${qsQuote(claim.reference.P854)}`;
    return s;
  };

  for (const op of cs.ops) {
    if (op.type === 'create-item') {
      lines.push('CREATE');
      for (const [lang, text] of Object.entries(op.labels)) lines.push(`LAST\tL${lang}\t${qsQuote(text)}`);
      for (const [lang, text] of Object.entries(op.descriptions)) lines.push(`LAST\tD${lang}\t${qsQuote(text)}`);
      for (const c of op.claims) {
        if (c.value.kind === 'item' && c.value.ref) {
          lines.push(`# MANUAL: after import, add ${c.property} -> (new item "${c.value.ref}") on new item "${op.ref}"`);
          continue;
        }
        lines.push(`LAST\t${c.property}\t${qsValue(c.value)}${tail(c)}`);
      }
      lastCreatedRef = op.ref;
    } else if (op.type === 'add-statement') {
      const subject = op.target.qid || (op.target.ref === lastCreatedRef ? 'LAST' : null);
      const object = op.value.kind === 'item' && op.value.ref
        ? (op.value.ref === lastCreatedRef ? 'LAST' : null)
        : qsValue(op.value);
      if (!subject || object === null) {
        lines.push(`# MANUAL: after import, add ${op.property} -> ${op.value.qid || `(new "${op.value.ref}")`} on ${op.target.qid || `(new "${op.target.ref}")`}`);
        continue;
      }
      lines.push(`${subject}\t${op.property}\t${object}${tail(op)}`);
    } else if (op.type === 'end-statement') {
      lines.push(`# end statement ${op.statementId} with P582 +${op.endDate}T00:00:00Z/11 (apply in the QuickStatements UI)`);
    }
  }
  return lines.join('\n') + '\n';
}

import { normalizeAnchorText } from './conversation-index.js';

export function geminiVisibleText(node) {
  if (node.closest('user-query')) {
    const lines = [...node.querySelectorAll('.query-text-line')];
    if (lines.length) return lines.map(line => line.innerText || line.textContent).join('\n').replace(/^\s*(?:You said|你说|你話|你话)\s*[:：]?\s*/i, '');
  }
  const doc = node.ownerDocument; const win = doc.defaultView;
  const walker = doc.createTreeWalker(node, win.NodeFilter.SHOW_TEXT); let text = '';
  for (let child = walker.nextNode(); child; child = walker.nextNode()) {
    if (!child.parentElement?.closest('button,[role="button"],[hidden],[aria-hidden="true"],script,style,.sr-only')) text += child.nodeValue || '';
  }
  return node.closest('user-query') ? text.replace(/^\s*(?:You said|你说|你話|你话)\s*[:：]?\s*/i, '') : text;
}
export function geminiNativeMessages(doc, role) {
  const selector = role === 'user' ? 'user-query .query-text, user-query .query-content' : 'model-response message-content';
  const candidates = [...doc.querySelectorAll(selector)].filter(node => role !== 'user' || !node.matches('.query-content') || !node.querySelector('.query-text'));
  return candidates.filter(node => !candidates.some(other => other !== node && other.contains(node)));
}
export function geminiMatchesTurn(node, id) {
  const turnId = id.match(/^gemini:(.+):(user|assistant)$/)?.[1];
  if (!turnId) return false;
  for (let parent = node; parent && parent.tagName !== 'BODY'; parent = parent.parentElement) {
    for (const attribute of ['id', 'data-message-id', 'data-response-id', 'data-turn-id']) {
      const value = parent.getAttribute(attribute);
      if (value && (value === turnId || value === turnId.replace(/^r_/, '') || value.split(/\s+/).includes(turnId))) return true;
    }
    if (parent.matches('.conversation-container')) break;
  }
  return false;
}
export function resolveGeminiLocation(doc, tree, key) {
  const target = tree.targets.get(key);
  const missing = reason => ({ element: null, reason });
  if (!target) return missing('target-missing');
  const nodes = geminiNativeMessages(doc, target.role);
  const byId = nodes.filter(node => geminiMatchesTurn(node, target.messageId));
  let message;
  if (byId.length > 1) return missing('ambiguous-message');
  if (byId.length === 1) message = byId[0];
  else {
    const identical = new Set([...tree.targets.values()].filter(entry => entry.role === target.role && entry.anchorText === target.anchorText).map(entry => entry.messageId));
    if (identical.size > 1) return missing('ambiguous-message');
    const matches = nodes.filter(node => normalizeAnchorText(geminiVisibleText(node)) === target.anchorText);
    if (matches.length !== 1) return missing(matches.length ? 'ambiguous-message' : 'not-mounted');
    message = matches[0];
  }
  if (key === `index:${target.messageId}`) return { element: message, reason: '' };
  if (target.imageKey) {
    const images = [...message.querySelectorAll('img')];
    const ordinal = Number(target.imageKey.split(':image:').at(-1));
    // Preserve native image handling; only a single image is unambiguous when
    // the host has additional icons or thumbnails in the message body.
    const image = images.length === 1 ? images[0] : images.filter(image => image.alt && image.alt === target.title)[ordinal];
    return { element: image || message, reason: '', fallback: !image };
  }
  const tableMatches = target.blockType === 'table' ? [...message.querySelectorAll('table')].filter(table => {
    const row = table.tHead?.rows[0] || table.rows[0];
    const cells = row ? [...row.cells].map(cell => normalizeAnchorText(geminiVisibleText(cell))) : [];
    return cells.length === target.tableCells?.length && cells.every((cell, i) => cell === normalizeAnchorText(target.tableCells[i]));
  }) : null;
  let anchors = tableMatches || [...message.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,li')].filter(node => {
    const text = normalizeAnchorText(geminiVisibleText(node));
    return text === normalizeAnchorText(target.title) || target.blockType === 'list' && node.tagName === 'LI'
      && normalizeAnchorText(geminiVisibleText(node).split(/[:：]/)[0]) === normalizeAnchorText(target.title);
  });
  anchors = anchors.filter(node => !anchors.some(other => other !== node && other.contains(node)));
  const peers = [...tree.targets.entries()].filter(([candidateKey, candidate]) => candidateKey !== `index:${target.messageId}`
    && candidate.messageId === target.messageId && candidate.blockType === target.blockType && candidate.title === target.title);
  const ordinal = peers.findIndex(([candidateKey]) => candidateKey === key);
  const anchor = anchors.length === 1 ? anchors[0] : anchors.length === peers.length ? anchors[ordinal] : null;
  return { element: anchor || message, reason: '', fallback: !anchor };
}

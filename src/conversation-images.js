// Visit block and inline images, including images nested in lists and tables.
export function visitConversationImages(nodes, visit) {
  for (const node of nodes || []) {
    if (node.type === "image") visit(node);
    if (node.children) visitConversationImages(node.children, visit);
    if (node.blocks) visitConversationImages(node.blocks, visit);
    for (const item of node.items || []) { visitConversationImages(item.inline, visit); visitConversationImages(item.children, visit); }
    for (const row of node.type === "table" ? [node.headers, ...(node.rows || [])] : [])
      for (const cell of row || []) visitConversationImages(cell, visit);
  }
}

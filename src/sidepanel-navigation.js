export function createBackIcon(document) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) icon.setAttribute(name, value);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm15 18-6-6 6-6'); icon.append(path);
  return icon;
}

export function createPageNavigation(document, { title, backLabel, onBack, wordmark = false }) {
  const nav = document.createElement('nav'); nav.className = 'window-settings-nav';
  nav.setAttribute('aria-label', title);
  const back = document.createElement('button'); back.className = 'window-settings-back'; back.type = 'button';
  back.setAttribute('aria-label', backLabel); back.title = backLabel;
  back.append(createBackIcon(document)); back.addEventListener('click', onBack);
  const heading = document.createElement('h1'); heading.className = 'window-settings-nav-title'; heading.textContent = title;
  if (wordmark && title.startsWith('Polaris')) {
    const brand = document.createElement('span'); brand.className = 'polaris-wordmark'; brand.textContent = title;
    heading.replaceChildren(brand);
  }
  nav.append(back, heading);
  return nav;
}

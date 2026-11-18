// Showcase car for the dashboard hero card: glossy red four-door coupe, side view, original
// drawing (no maker badge). Driver + passenger behind tinted glass, small NIETE + Taleemabad
// decal on the rear door. Wheels are groups .wh so the page can spin them while it drives in.
module.exports = (L, k = 'h') => {
  const wheel = (cx) => `<g class="wh" style="transform-origin:${cx}px 112px">
<circle cx="${cx}" cy="112" r="30" fill="#0B0D12"/><circle cx="${cx}" cy="112" r="27" fill="none" stroke="#1F2430" stroke-width="2"/>
<circle cx="${cx}" cy="112" r="21" fill="url(#rim${k})"/>
${[0, 36, 72, 108, 144].map(a => `<rect x="${cx - 1.6}" y="92" width="3.2" height="40" rx="1.6" fill="#E5E7EB" transform="rotate(${a} ${cx} 112)"/>`).join('')}
<circle cx="${cx}" cy="112" r="16" fill="none" stroke="#9CA3AF" stroke-width="1"/>
<path d="M${cx - 14} ${112 - 9}a17 17 0 0 1 10-9" stroke="#DC2626" stroke-width="5" fill="none" stroke-linecap="round"/>
<circle cx="${cx}" cy="112" r="5" fill="#374151"/><circle cx="${cx}" cy="112" r="2" fill="#D1D5DB"/></g>`;
  return `<svg viewBox="0 0 420 150" class="sedan"><defs>
<linearGradient id="sbody${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6B6B"/><stop offset=".28" stop-color="#E5182B"/><stop offset=".62" stop-color="#A50E1E"/><stop offset="1" stop-color="#4C0710"/></linearGradient>
<linearGradient id="sglass${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B4A63"/><stop offset=".5" stop-color="#151C2B"/><stop offset="1" stop-color="#0A0F1A"/></linearGradient>
<radialGradient id="rim${k}" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#F9FAFB"/><stop offset=".6" stop-color="#9CA3AF"/><stop offset="1" stop-color="#4B5563"/></radialGradient>
<linearGradient id="shine${k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<ellipse cx="214" cy="140" rx="196" ry="9" fill="#000" opacity=".45"/>
<path d="M22 108c-4-10 0-22 12-28l38-10c24-12 48-26 78-32 30-6 80-6 112 4 18 6 34 16 48 24l50 8c24 4 38 12 44 22 3 6 2 14-2 18l-36 2c-2-20-16-34-36-34s-34 14-36 34H146c-2-20-16-34-36-34s-34 14-36 34H30c-4-2-7-4-8-8z" fill="url(#sbody${k})"/>
<path d="M40 86c40-8 90-14 150-14 60 0 120 6 196 14" stroke="#FFB4B4" stroke-width="1.6" fill="none" opacity=".55"/>
<path d="M112 68c18-16 44-26 78-28 32-2 60 2 80 12l22 14z" fill="url(#sglass${k})"/>
<path d="M150 46l-16 22h14l18-24zM226 40l-12 26h8l14-26z" fill="#fff" opacity=".13"/>
<circle cx="164" cy="56" r="7" fill="#0B0F19" opacity=".9"/><path d="M152 68c2-7 6-9 12-9s10 2 12 9z" fill="#0B0F19" opacity=".9"/>
<circle cx="246" cy="55" r="7" fill="#0B0F19" opacity=".9"/><path d="M234 67c2-7 6-9 12-9s10 2 12 9z" fill="#0B0F19" opacity=".9"/>
<path d="M199 41v27" stroke="#0B0F19" stroke-width="5"/>
<path d="M286 60l10 2c2 0 3 2 2 4l-2 3h-12z" fill="#A50E1E"/><path d="M286 60l10 2c2 0 3 2 2 4" stroke="#FF8A8A" stroke-width="1" fill="none"/>
<path d="M199 70c-1 14 0 30 2 44M294 68c-3 14-3 30-1 46" stroke="#5A0A14" stroke-width="1.4" fill="none" opacity=".8"/>
<rect x="172" y="68" width="16" height="4" rx="2" fill="#F3F4F6" opacity=".85"/><rect x="268" y="67" width="16" height="4" rx="2" fill="#F3F4F6" opacity=".85"/>
<path d="M364 80l32 8c2 1 2 4 0 5l-6 2-28-8z" fill="#E0F2FE"/><path d="M366 86l28 7" stroke="#38BDF8" stroke-width="1.6"/>
<path d="M396 98l9 1v9l-9 2z" fill="#0B0D12"/>
<path d="M27 84l22-6 2 6-22 7z" fill="#FF3B3B"/><path d="M29 86l18-5" stroke="#FFD1D1" stroke-width="1"/>
<path d="M146 116h148M30 116h44M366 116h36" stroke="#2A0508" stroke-width="5" stroke-linecap="round"/>
<path d="M70 66c60-30 200-34 236 0" stroke="url(#shine${k})" stroke-width="3" fill="none" opacity=".7"/>
<g class="logos"><rect x="150" y="73" width="140" height="40" rx="10" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1.5"/><image href="${L.niete}" x="158" y="77" width="84" height="32"/><path d="M250 79v28" stroke="#CBD5E1" stroke-width="1.5"/><image href="${L.taleemabad}" x="261" y="75.5" width="19.5" height="35"/></g>
${wheel(110)}${wheel(330)}
</svg>`;
};

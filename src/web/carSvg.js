// Dashboard car (v5): red wedge supercar seen from above (generic Lamborghini-style shape,
// no maker badge), facing +x. Driver + passenger visible through the glass canopy;
// NIETE + Taleemabad logos on a white engine-cover panel (group .logos, centre 27,28 —
// the page counter-rotates it so the logos always read upright).
// k = id suffix so two copies on one page keep their own gradients.
module.exports = (L, k = 'a') => `<svg viewBox="0 0 124 58"><defs>
<linearGradient id="rb${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B91C1C"/><stop offset=".22" stop-color="#EF4444"/><stop offset=".5" stop-color="#F87171"/><stop offset=".78" stop-color="#EF4444"/><stop offset="1" stop-color="#991B1B"/></linearGradient>
<linearGradient id="rg${k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1E293B"/><stop offset="1" stop-color="#475569"/></linearGradient></defs>
<rect x="8" y="6" width="112" height="48" rx="16" fill="#020617" opacity=".35"/>
<rect x="15" y="1.5" width="22" height="9" rx="3" fill="#0B0F19"/><rect x="15" y="47.5" width="22" height="9" rx="3" fill="#0B0F19"/>
<rect x="86" y="3" width="19" height="8" rx="3" fill="#0B0F19"/><rect x="86" y="47" width="19" height="8" rx="3" fill="#0B0F19"/>
<path d="M7 11l7-5.5h70l22 4 12 12.5 2 7-2 7-12 12.5-22 4H14L7 47z" fill="url(#rb${k})"/>
<rect x="3" y="9" width="5" height="40" rx="2" fill="#111827"/>
<path d="M86 9.5l18 4M86 48.5l18-4M92 29h22" stroke="#7F1D1D" stroke-width="1" opacity=".8"/>

<path d="M44 7.5l10 5-12 0zM44 50.5l10-5-12 0z" fill="#111827" opacity=".85"/>
<path d="M48 12l32 3 8 14-8 14-32 3c-3-5-4.5-10-4.5-17S45 17 48 12z" fill="url(#rg${k})"/>
<path d="M80 15l8 14-8 14-4-1.6 6.4-12.4L76 16.6z" fill="#93C5FD" opacity=".6"/>
<ellipse cx="59" cy="21" rx="3.6" ry="7.4" fill="#0EA5E9"/><circle cx="62" cy="21" r="4" fill="#F2C9A5"/><path d="M62 17a4 4 0 0 0 0 8 3 4 0 0 1 0-8z" fill="#2B1B12"/><path d="M58 17a4 4 0 0 1 4 0v8a4 4 0 0 1-4 0z" fill="#2B1B12"/>
<ellipse cx="59" cy="37" rx="3.6" ry="7.4" fill="#14B8A6"/><circle cx="62" cy="37" r="4" fill="#E3AE86"/><path d="M58 33a4 4 0 0 1 4 0v8a4 4 0 0 1-4 0z" fill="#111827"/>
<rect x="76" y="3.4" width="5" height="3.6" rx="1.4" fill="#7F1D1D"/><rect x="76" y="51" width="5" height="3.6" rx="1.4" fill="#7F1D1D"/>
<path d="M108 12.5l6 4M108 45.5l6-4" stroke="#FEF9C3" stroke-width="2.4" stroke-linecap="round"/>
<rect x="5" y="15" width="2.6" height="10" rx="1.2" fill="#FCA5A5"/><rect x="5" y="33" width="2.6" height="10" rx="1.2" fill="#FCA5A5"/>
<g class="logos"><rect x="10" y="20" width="34" height="16" rx="4" fill="#FFFFFF"/><image href="${L.niete}" x="12" y="23.5" width="23" height="8.8"/><image href="${L.taleemabad}" x="36.5" y="22.6" width="5.6" height="10.4"/></g>
</svg>`;

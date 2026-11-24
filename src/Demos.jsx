// A scene at the end of each task row, in the style of Flisk Chat's + menu: a tiny working UI that plays one short story on
// a 5 s timeline with spring easing. SVG and CSS only (see demos.css). "drop" is chat's own attach-files scene.
const n = (k) => Array.from({length: k}, (_, i) => i);
const Cursor = ({cls}) => <path className={'cur ' + cls} d="M0 0v13l3.4-3 2.6 5.6 2.2-1L5.6 9H10Z" />;
const Doc = ({x, y, cls, k = 1}) => (
  <g className={'dc ' + cls} style={{transformOrigin: 'center'}}>
    <path transform={`translate(${x},${y}) scale(${k})`} d="M0 3Q0 0 3 0h12l7 7v19q0 3-3 3H3q-3 0-3-3Z" />
    <path transform={`translate(${x},${y}) scale(${k})`} d="M15 0v7h7M5 15h12M5 20.5h8" />
  </g>
);

export function Demo({kind}) {
  return (
    <svg className={'demo demo-' + kind} viewBox="0 0 200 60" width="200" height="60" focusable="false" aria-hidden="true">
      <rect className="bg" x="1" y="1" width="198" height="58" rx="5" />
      {kind === 'photo' && (<>
        <g className="big"><rect x="12" y="12" width="56" height="36" rx="3" /><path d="M12 40l14-12 10 8 12-14 20 18" /><circle cx="26" cy="22" r="3" /></g>
        <path className="pt" d="M74 30H112" />
        {n(3).map((i) => <g key={i} className="sm" style={{animationDelay: (i * 0.16) + 's', transform: `translate(${118 + i * 24}px,18px)`}}><rect x="0" y="0" width="20" height="20" rx="2.5" /><path d="M0 15l6-5 5 4 4-5 5 6" /></g>)}
        <circle className="ok" cx="186" cy="14" r="5" /><path className="tk" d="M183.4 14l2 2 3.4-4" />
        <Cursor cls="pc" />
      </>)}
      {kind === 'editor' && (<>
        <g className="big"><rect x="12" y="12" width="56" height="36" rx="3" /><circle cx="40" cy="26" r="7" /><path d="M26 48c2-9 8-12 14-12s12 3 14 12" /></g>
        <path className="pt" d="M74 30H112" />
        <g className="sm" style={{transform: 'translate(122px,12px)'}}><rect x="0" y="0" width="56" height="36" rx="3" className="zone" /><circle cx="28" cy="14" r="7" /><path d="M14 36c2-9 8-12 14-12s12 3 14 12" /></g>
        <circle className="ok" cx="186" cy="14" r="5" /><path className="tk" d="M183.4 14l2 2 3.4-4" />
        <Cursor cls="pc" />
      </>)}
      {kind === 'merge' && (<>
        <Doc x={36} y={16} cls="da" /><Doc x={66} y={16} cls="db" />
        <path className="pt" d="M104 30H122" />
        <g className="one"><Doc x={140} y={13} cls="dm" k={1.2} /><circle className="badge" cx="170" cy="14" r="6" /><path className="two" d="M168 14h4M170 12v4" /></g>
        <Cursor cls="mc" />
      </>)}
      {kind === 'shrink' && (<>
        <g className="bigdoc"><Doc x={30} y={10} cls="d0" k={1.5} /></g>
        <rect className="trk" x="84" y="26" width="86" height="6" rx="3" /><rect className="bar" x="84" y="26" width="86" height="6" rx="3" />
        <path className="arr" d="M176 22v14M171 31l5 5 5-5" />
        <rect className="lbl" x="84" y="40" width="40" height="4.4" rx="2.2" />
      </>)}
      {kind === 'mark' && (<>
        <Doc x={36} y={10} cls="d0" k={1.5} />
        <circle className="rip" cx="62" cy="34" r="12" />
        <g className="stamp"><rect x="42" y="27" width="40" height="13" rx="3" /><path d="M48 33.5h28" /></g>
        <rect className="ln l1" x="104" y="20" width="76" height="5" rx="2.5" /><rect className="ln l2" x="104" y="30" width="56" height="5" rx="2.5" /><rect className="ln l3" x="104" y="40" width="66" height="5" rx="2.5" />
        <Cursor cls="kc" />
      </>)}
      {kind === 'drop' && (<>
        <rect className="zone" x="116" y="9" width="76" height="42" rx="5" />
        <path className="plus" d="M154 24v12M148 30h12" />
        {n(3).map((i) => <g key={i} className="chip" style={{animationDelay: (i * 0.14) + 's', transform: 'translate(' + (124 + i * 22) + 'px,19px)'}}><path d="M0 3Q0 0 3 0h7l6 6v15q0 3-3 3H3q-3 0-3-3Z" /><path d="M3.5 13h9M3.5 17.5h6" /></g>)}
        <circle className="ok" cx="180" cy="17" r="5" /><path className="tk" d="M177.4 17l2 2 3.4-4" />
        <g className="fc"><path d="M0 3Q0 0 3 0h12l7 7v19q0 3-3 3H3q-3 0-3-3Z" /><path d="M15 0v7h7M5 15h12M5 20.5h8" /></g>
        <Cursor cls="ac" />
      </>)}
    </svg>
  );
}

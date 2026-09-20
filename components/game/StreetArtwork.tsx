import { Circle, G, Line, Path, Rect } from 'react-native-svg';
export const Tree = ({ x, y, size = 3.5 }: { x: number; y: number; size?: number }) => (
  <G>
    <Circle cx={x + 1.4} cy={y + 1.8} r={size + 0.5} fill="#203f33" opacity={0.12} />
    <Circle cx={x} cy={y} r={size} fill="#6e9270" />
    <Circle cx={x - size * 0.28} cy={y - size * 0.28} r={size * 0.72} fill="#91ae7c" />
    <Circle cx={x - size * 0.4} cy={y - size * 0.4} r={size * 0.35} fill="#b3c58a" opacity={0.65} />
  </G>
);

export const Garden = ({ variant }: { variant: number }) => (
  <G>
    <Rect x={0} y={0} width={27} height={29} rx={1} fill={variant % 2 ? '#b9cba8' : '#c3d2b1'} />
    <Path d="M0 1 H26 V28 H0" fill="none" stroke="#a7bb99" strokeWidth={0.6} />
    {variant % 4 === 0 ? <>
      <Rect x={5} y={6} width={17} height={15} rx={6} fill="#d8dcc1" />
      <Path d="M0 14 H27" stroke="#ede7d5" strokeWidth={2.2} />
      <Tree x={11} y={9} size={4.4} /><Tree x={20} y={22} size={3.2} />
      <Rect x={6} y={19} width={5} height={1.4} rx={0.3} fill="#947e61" />
    </> : <>
      <Rect x={0} y={19} width={13} height={5} fill="#e4decb" />
      <Rect x={8} y={6} width={17} height={17} rx={1.2} fill="#536450" opacity={0.16} />
      <Rect x={6} y={4} width={17} height={17} rx={1} fill="#f3e9d6" />
      <Rect x={6.7} y={4.7} width={15.6} height={15.6} rx={0.5} fill={variant % 3 === 0 ? '#71888b' : variant % 3 === 1 ? '#b18a72' : '#b4a48a'} />
      <Path d="M14.5 5 V20 L21.8 16 V8 Z" fill="#243d38" opacity={0.13} />
      <Line x1={14.5} y1={5} x2={14.5} y2={20} stroke="#f5ecda" strokeWidth={0.55} opacity={0.7} />
      <Rect x={9} y={8} width={3} height={4} rx={0.3} fill="#354c4e" />
      <Line x1={9.5} y1={8.5} x2={11.5} y2={8.5} stroke="#b2c8c0" strokeWidth={0.7} />
      <Rect x={18} y={15} width={2} height={3} fill="#e1c9aa" />
      <Tree x={5} y={26} size={2.7} /><Tree x={24} y={2} size={2.2} />
    </>}
  </G>
);

/** One unchanged verge, including the garden and the small roadside tree.
 * Baked together so cache handovers do not mount ten tree nodes per lot. */
export const RoadsideStrip = ({ variant, left }: { variant: number; left: boolean }) => (
  <G>
    <G transform={`translate(${left ? -21 : 21} 0)${left ? ' scale(-1 1)' : ''}`}><Garden variant={variant} /></G>
    <Tree x={left ? -17.5 : 17.5} y={left ? 26 : 10} size={2.1} />
    {left && <Line x1={-15.5} y1={0} x2={-15.5} y2={29} stroke="#a6b59b" strokeWidth={0.35} />}
  </G>
);


export const JunctionLandscape = ({ dark }: { dark: boolean }) => {
  const SIZE = 100;
  const grass = dark ? '#233831' : '#c6d5b7';
  const treeFill = dark ? '#3b6250' : '#88a887';
  const treeDark = dark ? '#52755d' : '#aec3a0';
  const trees = [
    { x: 12, y: 12, r: 4 }, { x: 24, y: 8, r: 2.6 }, { x: 8, y: 26, r: 3 },
    { x: 88, y: 12, r: 3.6 }, { x: 76, y: 8, r: 2.4 }, { x: 92, y: 26, r: 2.8 },
    { x: 12, y: 88, r: 3.4 }, { x: 24, y: 92, r: 2.6 }, { x: 8, y: 74, r: 2.8 },
    { x: 88, y: 88, r: 4 }, { x: 76, y: 92, r: 2.4 }, { x: 92, y: 74, r: 3 },
  ];
  return <G>
      <Rect x={0} y={0} width={SIZE} height={SIZE} fill={grass} />
      <Path d="M2 30 H30 V2 M70 2 V30 H98 M2 70 H30 V98 M70 98 V70 H98" stroke={dark ? "#3a5043" : "#afc29e"} strokeWidth={0.7} fill="none" />
      {/* Low courtyard buildings anchor the street without hiding traffic. */}
      {[{ x: 3, y: 34 }, { x: 79, y: 3 }, { x: 3, y: 56 }, { x: 79, y: 79 }].map((home, i) => (
        <G key={`home-${i}`}>
          <Rect x={home.x - 1} y={home.y - 1} width={20} height={15} rx={1.5} fill={dark ? '#35483f' : '#cbd7c3'} />
          <Rect x={home.x + 1} y={home.y + 1.2} width={16} height={11} rx={1} fill="#000000" opacity={0.1} />
          <Rect x={home.x} y={home.y} width={16} height={11} rx={1} fill={dark ? '#6b716d' : i % 2 ? '#c3b09a' : '#bcc9c8'} stroke={dark ? '#808981' : '#f3eee4'} strokeWidth={0.7} />
          <Line x1={home.x + 1} y1={home.y + 5.5} x2={home.x + 15} y2={home.y + 5.5} stroke={dark ? '#515e58' : '#9ca9a4'} strokeWidth={0.6} />
          <Rect x={home.x + 3} y={home.y + 2} width={3} height={2} rx={0.4} fill={dark ? '#b4b391' : '#e7eee8'} />
        </G>
      ))}
      {trees.map((tr, i) => (
        <G key={`tree-${i}`}>
          <Circle cx={tr.x + 0.6} cy={tr.y + 0.8} r={tr.r} fill="rgba(0,0,0,0.18)" />
          <Circle cx={tr.x} cy={tr.y} r={tr.r} fill={treeFill} />
          <Circle cx={tr.x - tr.r * 0.3} cy={tr.y - tr.r * 0.3} r={tr.r * 0.55} fill={treeDark} opacity={0.5} />
        </G>
      ))}
  </G>;
};

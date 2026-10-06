import { Circle, Svg } from "react-native-svg";

/** Compact Jcode mark for the mobile provider icon. */
export function JcodeProviderMark(props: { readonly color: string; readonly size: number }) {
  const dots = [
    [18, 18, 3.2],
    [34, 34, 3.6],
    [50, 50, 4],
    [66, 66, 3.6],
    [82, 82, 3],
  ] as const;
  return (
    <Svg width={props.size} height={props.size} viewBox="0 0 100 100">
      {dots.map(([cx, cy, r]) => (
        <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={props.color} />
      ))}
    </Svg>
  );
}

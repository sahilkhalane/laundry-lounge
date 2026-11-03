import { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";
import { qrMatrix } from "../qr";

/** Native SVG QR preview, with a four-module quiet zone on every side. */
export default function QR({
  value,
  size = 132,
}: {
  value: string;
  size?: number;
}) {
  const shape = useMemo(() => {
    const matrix = qrMatrix(value);
    const parts: string[] = [];
    for (let row = 0; row < matrix.size; row++) {
      for (let col = 0; col < matrix.size; col++) {
        if (matrix.data[row * matrix.size + col])
          parts.push(`M${col + 4} ${row + 4}h1v1h-1z`);
      }
    }
    return { extent: matrix.size + 8, path: parts.join("") };
  }, [value]);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${shape.extent} ${shape.extent}`}
      accessibilityLabel={`QR garment tag ${value}`}
      accessible
    >
      <Rect width={shape.extent} height={shape.extent} fill="#fff" />
      <Path d={shape.path} fill="#111" />
    </Svg>
  );
}

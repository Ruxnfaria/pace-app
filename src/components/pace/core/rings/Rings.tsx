"use client";

import Ring from "./Ring";

type RingsProps = {
  count: number;
  primary: string;
  secondary: string;
  glow: number;
};

export default function Rings({
  count,
  primary,
  secondary,
  glow,
}: RingsProps) {
  if (count <= 0) {
    return null;
  }

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <Ring
          key={index}
          index={index}
          primary={primary}
          secondary={secondary}
          glow={glow}
        />
      ))}
    </>
  );
}
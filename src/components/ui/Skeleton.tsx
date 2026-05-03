import React from 'react';

interface Props {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  style?: React.CSSProperties;
}

export default function Skeleton({ width = '100%', height = 14, borderRadius = 6, style }: Props) {
  return (
    <div style={{
      width, height, borderRadius,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease infinite',
      ...style,
    }} />
  );
}

export function SkeletonRows({ rows = 3, gap = 8 }: { rows?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px' }}>
          <Skeleton width={60} height={12} />
          <Skeleton width="40%" height={12} />
          <div style={{ flex: 1 }} />
          <Skeleton width={70} height={12} />
        </div>
      ))}
    </div>
  );
}

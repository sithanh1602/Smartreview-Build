import React from 'react';
import { Tooltip } from '@heroui/react';

// Names a control that shows only an icon. The child must be focusable (Button, ToggleButton).
export function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <Tooltip delay={300} closeDelay={0}>
      {children}
      <Tooltip.Content showArrow>{text}</Tooltip.Content>
    </Tooltip>
  );
}

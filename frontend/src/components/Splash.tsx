import type { ReactNode } from "react";
import { MolkoAvatar } from "./MolkoAvatar";

export function Splash({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <MolkoAvatar size={128} />
      <p className="text-sm text-tertiary">{message}</p>
      {children}
    </div>
  );
}

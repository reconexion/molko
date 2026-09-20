import { Mascot } from "page-mascot";

export function MolkoAvatar({ size = 96 }: { size?: number }) {
  return (
    <Mascot
      directions="/mascots/koala-directions.webp"
      reactions="/mascots/koala-reactions.webp"
      size={size}
      label="Molko"
    />
  );
}

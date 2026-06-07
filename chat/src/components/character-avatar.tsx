import {
  Avatar as AvatarRoot,
  AvatarFallback,
  AvatarImage,
} from "./ui/avatar";
import { portraitUrl } from "../api";
import { cn } from "../lib/utils";

/** A character portrait avatar with graceful initials fallback. */
export function Avatar({
  charset,
  name,
  className,
}: {
  charset: string;
  name: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <AvatarRoot className={cn("ring-1 ring-border", className)}>
      <AvatarImage src={portraitUrl(charset)} alt={name} />
      <AvatarFallback>{initials}</AvatarFallback>
    </AvatarRoot>
  );
}

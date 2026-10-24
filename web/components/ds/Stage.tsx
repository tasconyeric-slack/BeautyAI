import type { HTMLAttributes } from "react";
import "./tokens.css";

export type StageProps = HTMLAttributes<HTMLDivElement>;

/** Neutral surround for portraits; the caller supplies the image and its description. */
export function Stage({ children, className = "", ...props }: StageProps) {
  return <div className={`ap-stage ${className}`} {...props}>{children}</div>;
}

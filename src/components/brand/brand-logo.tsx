import Image from "next/image";
import { cn } from "@/lib/cn";

const LOGOS = {
  color: {
    src: "/brand/Logo_Bank_NTT.png",
    width: 1600,
    height: 948,
  },
  onBlue: {
    src: "/brand/Logo-Bank-NTT-featured-237-design-1.png",
    width: 740,
    height: 416,
  },
} as const;

export function BrandLogo({
  variant = "color",
  className,
}: {
  variant?: keyof typeof LOGOS;
  className?: string;
}) {
  const logo = LOGOS[variant];

  return (
    <Image
      src={logo.src}
      alt="Bank NTT"
      width={logo.width}
      height={logo.height}
      className={cn("h-16 w-auto", className)}
    />
  );
}

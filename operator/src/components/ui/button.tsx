import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-3.5 text-sm font-medium tracking-tight transition-[opacity,transform,background-color,border-color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50 active:enabled:scale-[0.99]",
  {
    variants: {
      variant: {
        primary: "border border-lime bg-lime text-paper hover:enabled:bg-white",
        lime: "border border-lime bg-lime text-paper hover:enabled:bg-white",
        outline:
          "border border-line bg-cream text-ink hover:enabled:border-muted hover:enabled:bg-forest-2",
        ghost:
          "border border-transparent bg-transparent text-muted hover:enabled:bg-forest-2 hover:enabled:text-ink",
        danger: "border border-red/40 bg-danger-bg text-red",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, type = "button", ...props }: Props) {
  return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />;
}

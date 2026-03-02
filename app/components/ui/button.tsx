"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "neutral" | "error" | "ghost";
  size?: "medium" | "small" | "xsmall";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "medium",
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          "disabled:pointer-events-none disabled:opacity-60",
          {
            "h-10 px-4 text-sm": size === "medium",
            "h-9 px-3 text-sm": size === "small",
            "h-8 px-2.5 text-xs": size === "xsmall",
          },
          {
            "bg-emerald-500 text-slate-950 hover:bg-emerald-400":
              variant === "primary",
            "bg-slate-700 text-slate-100 hover:bg-slate-600":
              variant === "neutral",
            "bg-red-600 text-white hover:bg-red-500": variant === "error",
            "border border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800":
              variant === "ghost",
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };

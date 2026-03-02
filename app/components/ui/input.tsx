"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-lg border bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition-colors",
          "placeholder:text-slate-500",
          "focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-red-500 focus:ring-red-500/50 focus:border-red-500"
            : "border-slate-700",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };

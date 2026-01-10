import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-normal transition-all duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-slate-900 text-white shadow-lg hover:bg-slate-800 hover:shadow-xl transition-all duration-300",
        destructive: "bg-red-600 text-white shadow-lg hover:bg-red-700 hover:shadow-xl transition-all duration-300",
        outline: "border border-slate-200 bg-white shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:shadow-md transition-all duration-300 text-slate-900",
        secondary: "bg-slate-100 text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-200 hover:shadow-md transition-all duration-300",
        ghost: "hover:bg-slate-100 hover:text-slate-900 transition-colors duration-200 text-slate-700",
        link: "text-slate-900 underline-offset-4 hover:underline font-medium",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }


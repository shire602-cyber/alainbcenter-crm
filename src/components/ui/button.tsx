'use client'

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Spinner } from "./spinner"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-body font-semibold tracking-normal transition-all duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-slate-900 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 hover:bg-slate-800",
        destructive: "bg-red-600 text-white shadow-lg hover:bg-red-700 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300",
        outline: "border border-slate-200 bg-white shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:shadow-md transition-all duration-300 text-slate-900",
        secondary: "bg-slate-100 text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-200 hover:shadow-md transition-all duration-300",
        ghost: "hover:bg-slate-100 hover:text-slate-900 transition-colors duration-200 text-slate-700",
        link: "text-slate-900 underline-offset-4 hover:underline font-medium hover:text-primary transition-colors",
        success: "bg-green-600 text-white shadow-lg hover:bg-green-700 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-caption",
        lg: "h-11 px-8 text-body-large",
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
  loading?: boolean
  success?: boolean
  error?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, success, error, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const [ripples, setRipples] = React.useState<Array<{ id: number; x: number; y: number }>>([])

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (asChild || loading) return

      // Create ripple effect
      const button = e.currentTarget
      const rect = button.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const id = Date.now()

      setRipples((prev) => [...prev, { id, x, y }])

      // Remove ripple after animation
      setTimeout(() => {
        setRipples((prev) => prev.filter((ripple) => ripple.id !== id))
      }, 600)

      if (props.onClick) {
        props.onClick(e)
      }
    }

    // Determine variant based on state
    let effectiveVariant = variant
    if (success) effectiveVariant = 'success'
    if (error) effectiveVariant = 'destructive'

    return (
      <Comp
        className={cn(
          buttonVariants({ variant: effectiveVariant, size, className }),
          loading && "opacity-75 cursor-not-allowed",
          success && "bg-green-600 hover:bg-green-700",
          error && "bg-red-600 hover:bg-red-700"
        )}
        ref={ref}
        onClick={handleClick}
        disabled={loading || props.disabled}
        {...props}
      >
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="absolute rounded-full bg-white/30 pointer-events-none animate-ripple"
            style={{
              left: `${ripple.x}px`,
              top: `${ripple.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}
        {loading && <Spinner size={size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md'} variant="circle" className="text-current" />}
        {!loading && children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }


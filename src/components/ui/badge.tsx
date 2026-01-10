import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-caption font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/80",
        outline: "text-foreground",
        success: "bg-green-50 text-green-700 border-green-200 font-semibold shadow-sm hover:bg-green-100",
        warning: "bg-amber-50 text-amber-700 border-amber-200 font-semibold shadow-sm hover:bg-amber-100",
        error: "bg-red-50 text-red-700 border-red-200 font-semibold shadow-sm hover:bg-red-100",
        hot: "bg-red-50 text-red-700 border-red-200 font-semibold shadow-sm hover:bg-red-100",
        warm: "bg-orange-50 text-orange-700 border-orange-200 font-semibold shadow-sm hover:bg-orange-100",
        cold: "bg-blue-50 text-blue-700 border-blue-200 font-medium shadow-sm hover:bg-blue-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }


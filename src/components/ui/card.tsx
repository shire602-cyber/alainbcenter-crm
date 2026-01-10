'use client'

import * as React from "react"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  selectable?: boolean
  selected?: boolean
  onSelect?: () => void
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, selectable, selected, onSelect, onClick, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (selectable && onSelect) {
        onSelect()
      }
      if (onClick) {
        onClick(e)
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl border border-slate-200/60 bg-card text-card-foreground shadow-lg transition-all duration-300 hover:border-slate-300 hover:shadow-xl hover:-translate-y-1 active:scale-[0.99] relative",
          selectable && "cursor-pointer",
          selected && "ring-2 ring-blue-500 border-blue-300 shadow-xl",
          className
        )}
        onClick={handleClick}
        {...props}
      >
        {selected && selectable && (
          <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center z-10">
            <Check className="h-3 w-3 text-white" />
          </div>
        )}
      </div>
    )
  }
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-2 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-subhead text-foreground",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-body text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0 gap-3", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }


"use client"

import * as React from "react"
import { Rocket } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { onboardingEntryState } from '../lib/onboardingReadiness'

export interface OnboardingStep {
  href: string
  title: string
  description: string
}

interface CommonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const InfoCardTitle = React.memo(({ children, className, ...props }: CommonCardProps) => (
  <div className={cn("font-medium mb-1", className)} {...props}>{children}</div>
))
InfoCardTitle.displayName = "InfoCardTitle"

const InfoCardDescription = React.memo(({ children, className, ...props }: CommonCardProps) => (
  <div className={cn("text-muted-foreground leading-4", className)} {...props}>{children}</div>
))
InfoCardDescription.displayName = "InfoCardDescription"

const InfoCardContent = React.memo(({ children, className, ...props }: CommonCardProps) => (
  <div className={cn("flex flex-col gap-1 text-xs", className)} {...props}>{children}</div>
))
InfoCardContent.displayName = "InfoCardContent"

const InfoCardFooter = ({ children, className }: CommonCardProps) => (
  <div className={cn("mt-2 flex text-xs text-muted-foreground", className)}>
    {children}
  </div>
)

export function OnboardingCards({
  steps,
  onboardingStatus,
  onDismiss,
  onOpenDialog,
  userRole,
}: {
  steps: OnboardingStep[]
  onboardingStatus?: string
  onDismiss: () => void
  onOpenDialog?: () => void
  userRole?: any
}) {
  const [dismissedSteps] = React.useState<string[]>([])
  const cards = steps.filter(({ href }) => !dismissedSteps.includes(href))
  const [showCompleted, setShowCompleted] = React.useState(cards.length > 0)

  React.useEffect(() => {
    let timeout: NodeJS.Timeout | undefined
    if (cards.length === 0) timeout = setTimeout(() => setShowCompleted(false), 2700)
    return () => clearTimeout(timeout)
  }, [cards.length])

  if (onboardingEntryState({
    canManageOnboarding: userRole?.canManageOnboarding === true,
    onboardingStatus,
  }) === 'hidden') return null

  return cards.length || showCompleted ? (
    <div className="w-full">
      {cards.map(({ href, title, description }) => (
        <OnboardingCard key={href} title={title} description={description} onDismiss={onDismiss} onOpenDialog={onOpenDialog} />
      ))}
    </div>
  ) : null
}

function OnboardingCard({
  title,
  description,
  onDismiss,
  onOpenDialog,
}: {
  title: string
  description: string
  onDismiss?: () => void
  onOpenDialog?: () => void
}) {
  const [isDismissed, setIsDismissed] = React.useState(false)

  const handleDismiss = () => {
    setIsDismissed(true)
    onDismiss?.()
  }

  if (isDismissed) return null

  return (
    <>
      <div
        className={cn(
          "group relative rounded-lg border bg-white dark:bg-black transition-all duration-300 ease-spring group-has-[[data-collapsible=icon]]/sidebar-wrapper:hidden",
          "opacity-100 translate-y-0 hover:shadow-sm"
        )}
      >
        <div className="absolute -top-1 -right-1.5 z-10">
          <div className="h-3 w-3 rounded-full bg-blue-700 dark:bg-blue-400 border-blue-200 dark:border-blue-800/50 border-3 animate-pulse" />
        </div>
        <div className="flex items-start">
          <InfoCardContent className="pt-2 px-2">
            <InfoCardTitle>{title}</InfoCardTitle>
            <InfoCardDescription>{description}</InfoCardDescription>
          </InfoCardContent>
        </div>
        <InfoCardFooter>
          <div className="m-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={onOpenDialog} className="text-xs h-6">Get started</Button>
            <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-xs h-6">Skip for now</Button>
          </div>
        </InfoCardFooter>
      </div>

      <div className="hidden group-has-[[data-collapsible=icon]]/sidebar-wrapper:block relative">
        <div className="absolute -top-1 -right-1.5 z-10">
          <div className="h-3 w-3 rounded-full bg-blue-700 dark:bg-blue-400 border-blue-200 dark:border-blue-800/50 border-3 animate-pulse" />
        </div>
        <Button aria-label="Open hospital setup" variant="outline" size="icon" className="size-8" onClick={onOpenDialog}>
          <Rocket aria-hidden className="size-3" />
        </Button>
      </div>
    </>
  )
}

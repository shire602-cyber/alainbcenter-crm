/**
 * Typography System
 * 
 * Consistent typography scales and utilities for the Alain CRM
 * Based on Inter font with semantic sizing
 */

export const typography = {
  // Font families
  fontFamily: {
    sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
  },
  
  // Font sizes (using Tailwind defaults but with specific line-heights)
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],      // 12px - labels, badges
    sm: ['0.875rem', { lineHeight: '1.25rem' }],  // 14px - body text, buttons
    base: ['1rem', { lineHeight: '1.5rem' }],     // 16px - default body
    lg: ['1.125rem', { lineHeight: '1.75rem' }],  // 18px - emphasized body
    xl: ['1.25rem', { lineHeight: '1.75rem' }],   // 20px - small headings
    '2xl': ['1.5rem', { lineHeight: '2rem' }],    // 24px - section headings
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px - page titles
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }], // 36px - large page titles
  },
  
  // Font weights (limit to 2 for performance)
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
  },
  
  // Letter spacing
  letterSpacing: {
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
  },
} as const

/**
 * Typography utility classes for semantic use
 */
export const typographyClasses = {
  // Page titles
  pageTitle: 'text-3xl font-semibold tracking-tight text-foreground',
  // Section headings
  sectionHeading: 'text-2xl font-semibold tracking-tight text-foreground',
  // Card titles
  cardTitle: 'text-lg font-semibold tracking-tight text-foreground',
  // Body text
  body: 'text-sm text-foreground',
  bodyLarge: 'text-base text-foreground',
  // Muted/secondary text
  muted: 'text-sm text-muted-foreground',
  mutedSmall: 'text-xs text-muted-foreground',
  // Labels
  label: 'text-sm font-medium text-foreground',
  labelSmall: 'text-xs font-medium text-foreground',
} as const




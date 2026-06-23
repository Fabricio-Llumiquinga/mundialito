---
inclusion: auto
---

# Frontend Design - Mundial 2026 Predictions Portal

## Design Direction
Sports betting / ESPN / Betcris-inspired dark portal for Any2Cloud employees. Dense data, bold typography, prominent scores, dark-first theme.

## Brand Colors (Any2Cloud)
- Primary: Coral #E97250 (main accent, active states, CTAs)
- Secondary: Orange #F59438 (highlights, gradients)
- Accent: Magenta #D13573 (hover states, secondary actions)
- Pink: #DE5760 (error states, live indicators)
- Base: Black #000000 / Dark surfaces

## Anti-Slop Rules (adapted from taste-skill)
- NO generic AI aesthetics (purple gradients, centered-everything, three-equal-cards)
- NO Inter, Roboto, or Arial as fonts. Use Oswald (display) + Source Sans 3 (body)
- ONE accent color per page, used consistently across all sections
- ONE corner-radius scale: sharp (rounded-sm/md) for the sports/betting aesthetic
- Dark mode is the DEFAULT and ONLY theme (like ESPN, Betcris, FanDuel)
- NO em-dashes anywhere in the UI
- Every animation must be motivated (hierarchy, feedback, state transition)

## Layout Principles
- Dense data layouts with prominent numbers (scores in large bold Oswald)
- Tables with alternating row backgrounds for readability
- Left border accents on cards to indicate status (coral=live, green=completed, gray=upcoming)
- Compact navigation with clear active indicators
- Match cards: horizontal layout showing both teams + score prominently

## Component Library
- Use HeroUI v3 as the component foundation (compound component pattern)
- Override CSS variables for Any2Cloud brand colors in global.css
- Dark theme as default via `data-theme="dark"` class, no light mode toggle needed
- Import `@heroui/styles/css` for component styles

## Typography
- Display/Headlines: Oswald, uppercase, tracking-wide
- Body: Source Sans 3, regular weight
- Numbers/Scores: Oswald, bold, large size
- Labels: Source Sans 3, small, uppercase, tracking-wider, gray

## Motion
- Subtle fade-in on page load
- Pulse animation on "Live" badges only
- Hover: translateY(-2px) on cards, color transitions on buttons
- No excessive animations — this is a data-dense app, not a landing page

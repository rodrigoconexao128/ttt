# WhatsApp CRM SaaS - Design Guidelines

## Design Approach
**System-Based Approach** using principles from Linear (clean productivity), Slack (messaging efficiency), and WhatsApp Web (user familiarity). This is a utility-focused application where clarity, efficiency, and learnability are paramount.

## Core Design Principles
1. **Functional Clarity**: Every element serves a clear purpose
2. **Messaging-First**: Chat interface is the primary focus
3. **Minimal Friction**: Quick access to conversations and responses
4. **Familiar Patterns**: Leverage WhatsApp Web conventions for instant recognition

## Typography
- **Primary Font**: Inter (clean, readable for extended use)
- **Headings**: Font weight 600-700, sizes: text-2xl (dashboard), text-lg (section headers), text-base (conversation names)
- **Body Text**: Font weight 400, text-sm for messages and lists
- **Monospace**: For phone numbers and technical details (font-mono text-xs)

## Layout System
**Spacing Units**: Use Tailwind primitives of 2, 4, 6, 8, 12, and 16
- Component padding: p-4 to p-6
- Section margins: mb-6 to mb-8
- Tight spacing for message threads: space-y-2
- Generous spacing for dashboard sections: space-y-8

## Application Structure

### Authentication Pages
- Centered card layout (max-w-md mx-auto)
- Minimal branding (logo + tagline)
- Single-column form with text-base inputs
- Clear CTAs with w-full buttons

### Main Dashboard Layout
**Three-Column Layout** (inspired by WhatsApp Web):
1. **Sidebar** (w-16): Navigation icons vertically stacked - Dashboard, Conversations, Settings, Connection Status
2. **Conversations List** (w-80): Scrollable list of active chats with contact name, last message preview, timestamp, unread badge
3. **Chat Area** (flex-1): Selected conversation with message thread and input field

### WhatsApp Connection Flow
- QR Code centered in empty state (max-w-sm mx-auto)
- Connection status indicator: "Scanning..." → "Connected" with visual feedback
- Reconnect button prominently displayed on disconnect

## Component Library

### Conversation List Item
- Avatar circle (w-12 h-12) with contact initial
- Contact name (font-semibold text-sm)
- Message preview (text-xs truncate)
- Timestamp (text-xs) aligned right
- Unread badge (rounded-full px-2 py-1 text-xs) when applicable
- Hover state: subtle background change

### Message Thread
- Messages in bubbles with max-w-md
- Sender messages: ml-auto, rounded-lg px-4 py-2
- Received messages: mr-auto, rounded-lg px-4 py-2
- Timestamp below each message (text-xs)
- Avatar for received messages only
- Scrollable container with messages anchored to bottom

### Message Input
- Fixed bottom bar with shadow
- Textarea with auto-resize (min-h-12 max-h-32)
- Send button (icon only) on right
- Attachment icon on left (optional)

### Dashboard Stats Cards
- Grid of 2-4 cards (grid-cols-2 lg:grid-cols-4)
- Each card: rounded-lg p-6
- Large number (text-3xl font-bold)
- Label below (text-sm)
- Icon in top-right corner

### Connection Status Badge
- Pill-shaped indicator in sidebar
- "Connected" with green dot
- "Disconnected" with red dot
- Pulsing animation when connecting

### Navigation
- Icon-only vertical sidebar with tooltips on hover
- Active state: distinct background treatment
- Icons from Heroicons (outline style)

## Responsive Behavior
- **Desktop** (lg:): Full three-column layout
- **Tablet** (md:): Hide sidebar, conversations list toggleable
- **Mobile**: Single view navigation - list OR chat, with back button

## Empty States
- Centered content with icon (w-16 h-16 mb-4)
- Descriptive heading (text-lg font-semibold)
- Actionable text (text-sm) with CTA button
- Use for: No conversations, WhatsApp not connected, no messages in thread

## Forms
- Labels above inputs (text-sm font-medium mb-2)
- Input fields: rounded-md px-4 py-2 w-full
- Error messages: text-xs mt-1
- Form spacing: space-y-4

## Critical Elements
- **Real-time indicators**: Typing indicators, message delivery status (sent/delivered/read)
- **Timestamp consistency**: Relative times for recent messages, absolute for older
- **Search functionality**: Prominent search bar in conversations list
- **Quick filters**: All/Unread/Archived tabs above conversation list

## Animations
Use sparingly:
- Smooth scroll to new messages
- Fade in/out for status changes
- Subtle pulse for connection status
- No distracting transitions

This design prioritizes speed, clarity, and familiar messaging patterns to create an efficient CRM experience.
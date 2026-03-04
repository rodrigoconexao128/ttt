# WhatsApp CRM SaaS

## Overview

A complete multi-tenant WhatsApp CRM SaaS platform that enables users to manage WhatsApp conversations through a centralized web interface. Features include WhatsApp QR code authentication, AI-powered automatic responses via Mistral, subscription plans with PIX payment integration, and a comprehensive admin panel for platform management. Built with React, Express, PostgreSQL, and the Baileys library for WhatsApp Web integration.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Major Updates (Nov 6, 2025)

**Complete SaaS Transformation:**
- ✅ Multi-tenant architecture with subscription plans
- ✅ PIX payment integration using qrcode-pix library
- ✅ Admin panel with user management, plan CRUD, payment approval, and system configuration
- ✅ Subscription flow: users choose plans, generate PIX QR codes, admin approves payments
- ✅ Mistral API key moved from environment variables to database (system_config table)
- ✅ Role-based access control (owner, admin, user roles)
- ✅ Default plans seeded: Básico (R$99.90), Profissional (R$199.90), Empresarial (R$499.90)

## System Architecture

### Frontend Architecture

**Framework & Build System**
- **React 18** with TypeScript for type-safe component development
- **Vite** as the build tool and development server for fast HMR and optimized production builds
- **Wouter** for lightweight client-side routing instead of React Router
- **TanStack Query (React Query)** for server state management, caching, and automatic refetching

**UI Component System**
- **shadcn/ui** component library built on Radix UI primitives
- **Tailwind CSS** for utility-first styling with custom design tokens
- Design system follows WhatsApp Web patterns (three-column layout: sidebar, conversations list, chat area)
- Custom color scheme using CSS variables for theme support (light/dark modes via `--background`, `--foreground`, etc.)

**State Management Strategy**
- Server state managed by TanStack Query with query keys like `["/api/auth/user"]`, `["/api/conversations"]`
- WebSocket integration for real-time message updates and connection status
- Polling fallback (2-second intervals) for message synchronization
- No global client state management library (Redux/Zustand) - relies on React Query cache

### Backend Architecture

**Server Framework**
- **Express.js** with TypeScript running on Node.js
- ESM module system (`"type": "module"` in package.json)
- Development uses `tsx` for TypeScript execution; production compiles with `esbuild`

**Authentication & Session Management**
- **Replit Auth** via OpenID Connect (OIDC) using Passport.js strategy
- Session storage in PostgreSQL using `connect-pg-simple`
- Session cookies with 7-day TTL, httpOnly and secure flags enabled
- Mandatory user table structure for Replit Auth compatibility (`users` table with id, email, firstName, lastName, profileImageUrl)

**WhatsApp Integration**
- **@whiskeysockets/baileys** library for WhatsApp Web protocol implementation
- Multi-device authentication using `useMultiFileAuthState`
- Session management stores connection state per user with in-memory sessions map
- QR code generation using `qrcode` library for initial device pairing
- WebSocket server for real-time bidirectional communication between client and WhatsApp connection status

**API Design**
- RESTful endpoints under `/api` namespace
- Authentication middleware (`isAuthenticated`) protects all data routes
- WebSocket endpoint for real-time updates (connection status, new messages, QR codes)
- Session-based userId extraction from `req.user.claims.sub`

### Data Storage

**Database**
- **PostgreSQL** via Neon serverless with WebSocket connections
- **Drizzle ORM** for type-safe database queries and schema management
- Connection pooling using `@neondatabase/serverless` with WebSocket constructor override

**Schema Design**
- `sessions` table: OIDC session storage (sid, sess, expire) with expiration index
- `users` table: User profiles with Replit Auth fields + role (owner/admin/user) for RBAC
- `admins` table: Admin credentials with bcrypt password hashing
- `plans` table: Subscription plans (nome, valor, periodicidade, limiteConversas, limiteAgentes, ativo)
- `subscriptions` table: User subscriptions (userId, planId, status, dataInicio, dataFim)
- `payments` table: Payment records (subscriptionId, valor, metodoPagamento, status, pixCode, pixQrCode)
- `system_config` table: System-wide settings (chave, valor) - stores Mistral API key
- `whatsapp_connections` table: One-to-one user relationship storing phoneNumber, isConnected status, qrCode, and sessionData (JSONB)
- `conversations` table: Linked to connections, tracks contactNumber, contactName, lastMessageText, lastMessageTime, unreadCount
- `messages` table: Stores message history with conversationId, senderId, text, isFromMe boolean, timestamp, messageId (WhatsApp's unique ID)
- `ai_agent_config` table: User-specific AI agent configuration (userId, prompt, isActive, model)
- `agent_disabled_conversations` table: Per-conversation agent override (conversationId foreign key)

**Data Relations**
- Users → Subscriptions (one-to-many, cascade delete)
- Plans → Subscriptions (one-to-many, cascade delete)
- Subscriptions → Payments (one-to-many, cascade delete)
- Users → WhatsAppConnections (one-to-one, cascade delete)
- WhatsAppConnections → Conversations (one-to-many, cascade delete)
- Conversations → Messages (one-to-many, cascade delete)
- Users → AIAgentConfig (one-to-one, cascade delete)
- Conversations → AgentDisabledConversations (one-to-one, cascade delete)

### AI Agent System

**Overview**
- Automated customer response system powered by Mistral AI
- Each user can configure a custom AI agent with personalized prompts
- Global enable/disable control with per-conversation override capability
- Real-time integration with WhatsApp message flow

**Architecture**
- **Backend (`server/aiAgent.ts`)**: Mistral SDK integration, conversation history context, response generation
- **Frontend (`client/src/pages/my-agent.tsx`)**: Configuration interface with prompt editor, model selection, test functionality
- **WhatsApp Integration (`server/whatsapp.ts`)**: Automatic message interception, agent status checking, response delivery via Baileys

**Database Schema**
- `ai_agent_config` table: User-specific configuration (userId, prompt, isActive, model, messagesResponded)
- `agent_disabled_conversations` table: Per-conversation agent override (conversationId foreign key)

**API Endpoints**
- `GET/POST /api/agent/config`: Retrieve or update agent configuration
- `POST /api/agent/test`: Test agent with sample message before deployment
- `POST /api/agent/toggle/:conversationId`: Enable/disable agent for specific conversation
- `GET /api/agent/status/:conversationId`: Check if agent is active for a conversation

**Features**
- Custom prompt configuration with model selection (mistral-tiny, mistral-small, mistral-medium)
- Test interface to preview agent responses before activation
- Global agent toggle with visual status indicators
- Per-conversation disable/enable controls in chat interface
- Dashboard statistics showing agent status and messages responded count
- Automatic conversation history context (last 10 messages) for context-aware responses

**Security**
- Mistral API key stored in environment secrets (`MISTRAL_API_KEY`)
- Authentication required for all agent endpoints
- Per-user agent isolation (users cannot access other users' agents)

### External Dependencies

**Third-Party Services**
- **Replit Auth (OIDC)**: User authentication and identity management via `process.env.ISSUER_URL` and `process.env.REPL_ID`
- **Neon Database**: Serverless PostgreSQL hosting accessed via `process.env.DATABASE_URL`
- **WhatsApp Web Protocol**: Through Baileys library connecting to WhatsApp's servers

**Key Libraries**
- **Baileys**: WhatsApp Web client implementation with multi-file auth state
- **Pino**: Logging for WhatsApp connection events
- **QRCode**: QR code generation for device pairing
- **WebSocket (ws)**: Real-time server-client communication and Neon database connections
- **Drizzle ORM & Drizzle Kit**: Database schema management and migrations
- **React Hook Form + Zod**: Form validation (resolvers configured but not extensively used in current codebase)
- **date-fns**: Date formatting and manipulation with Brazilian Portuguese locale support

**Development Tools**
- **@replit/vite-plugin-runtime-error-modal**: Development error overlay
- **@replit/vite-plugin-cartographer**: Code navigation
- **@replit/vite-plugin-dev-banner**: Development environment indicator
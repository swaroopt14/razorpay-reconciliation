# Zord Ingestion Console - Architecture

## Project Structure

```
zord-ingestion-frontend/
├── app/                          # Next.js App Router pages
│   ├── console/                  # Customer console routes
│   ├── ops/                      # Operations console routes
│   ├── admin/                    # Admin console routes
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global styles
│
├── components/                    # React components
│   ├── auth/                     # Authentication components
│   │   ├── LoginFormDark.tsx
│   │   ├── SignUpForm.tsx
│   │   ├── DarkLoginLayout.tsx
│   │   ├── LoginLayout.tsx
│   │   ├── RoleSwitcher.tsx
│   │   └── index.ts
│   │
│   ├── ingestion/                # Ingestion-related components
│   │   ├── ReceiptTimeline.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── EvidenceTree.tsx
│   │   ├── EvidenceFileViewer.tsx
│   │   ├── BatchSummaryCard.tsx
│   │   ├── ErrorExplanationBox.tsx
│   │   └── index.ts
│   │
│   └── common/                   # Shared/common components
│
├── hooks/                        # Custom React hooks
│   ├── useAuth.ts
│   ├── usePolling.ts
│   └── index.ts
│
├── services/                     # Business logic & API services
│   ├── api/                      # API service layer
│   │   ├── receiptService.ts
│   │   └── index.ts
│   │
│   └── auth/                     # Authentication service
│       ├── authService.ts
│       └── index.ts
│
├── utils/                        # Utility functions
│   ├── errors/                   # Error handling
│   │   └── errorHandler.ts
│   │
│   ├── validation/               # Form validation
│   │   └── formValidation.ts
│   │
│   ├── formatting/               # Data formatting
│   │   └── dateFormatting.ts
│   │
│   ├── permissions.ts
│   ├── polling.ts
│   └── index.ts
│
├── types/                        # TypeScript type definitions
│   ├── auth.ts
│   ├── receipt.ts
│   ├── batch.ts
│   └── evidence.ts
│
├── constants/                    # Application constants
│   └── index.ts
│
├── config/                       # Configuration files
│   └── api.config.ts
│
└── public/                       # Static assets
    └── login/                    # Login page images
```

## Design Principles

### 1. Feature-Based Organization
- Components are organized by feature/domain (auth, ingestion)
- Related functionality is grouped together
- Easy to locate and maintain code

### 2. Separation of Concerns
- **Services**: Business logic and API calls
- **Components**: UI presentation
- **Hooks**: Reusable stateful logic
- **Utils**: Pure utility functions
- **Types**: Type definitions

### 3. Single Responsibility
- Each file has a single, clear purpose
- Functions are focused and testable
- Easy to debug and maintain

### 4. Reusability
- Common utilities in `utils/`
- Shared components in `components/common/`
- Custom hooks for repeated patterns

## File Naming Conventions

- **Components**: PascalCase (e.g., `ReceiptTimeline.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useAuth.ts`)
- **Services**: camelCase (e.g., `authService.ts`)
- **Utils**: camelCase (e.g., `formValidation.ts`)
- **Types**: camelCase (e.g., `receipt.ts`)
- **Constants**: UPPER_SNAKE_CASE in constants files

## Import Patterns

### Preferred Import Style
```typescript
// From feature modules
import { ReceiptTimeline } from '@/components/ingestion'
import { useAuth } from '@/hooks'
import { getReceipt } from '@/services/api'
import { formatDateTime } from '@/utils'
import { ROUTES } from '@/constants'
```

### Avoid Deep Imports
```typescript
// ❌ Bad
import { ReceiptTimeline } from '@/components/ingestion/ReceiptTimeline'

// ✅ Good
import { ReceiptTimeline } from '@/components/ingestion'
```

## Debugging Tips

### 1. Error Handling
- All errors go through `utils/errors/errorHandler.ts`
- Use custom error classes for better debugging
- Error messages are user-friendly

### 2. Logging
- Use `console.error` for errors (will be replaced with proper logging)
- Use `console.log` for development debugging
- Remove console logs before production

### 3. Type Safety
- All types are defined in `types/` directory
- Use TypeScript strictly
- Leverage type inference where possible

### 4. Component Debugging
- Components are in feature folders
- Use React DevTools for component inspection
- Check props and state in DevTools

## Development Workflow

### Adding a New Feature
1. Create types in `types/` if needed
2. Create service in `services/` for API calls
3. Create components in appropriate feature folder
4. Create hooks if stateful logic is reusable
5. Add constants if needed
6. Update exports in index files

### Debugging a Bug
1. Check error handler for error type
2. Check service layer for API issues
3. Check component for UI issues
4. Check hooks for state management issues
5. Use browser DevTools for runtime debugging

## Testing Strategy (Future)

- Unit tests: `__tests__/` folders next to source files
- Component tests: Test components in isolation
- Integration tests: Test feature workflows
- E2E tests: Test complete user flows

## Performance Considerations

- Use Next.js Image component for images
- Implement code splitting for large components
- Use React.memo for expensive components
- Optimize re-renders with proper hooks usage

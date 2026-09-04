# Project Structure Overview

## Directory Organization

### `/app` - Next.js Pages
All route pages organized by console/role:
- `console/` - Customer console pages
- `ops/` - Operations console pages  
- `admin/` - Admin console pages

### `/components` - React Components
**Feature-based organization:**
- `auth/` - Authentication & login components
- `ingestion/` - Ingestion-related components (receipts, evidence, batches)
- `common/` - Shared/reusable components
- `layout/` - Layout components

**Each feature folder has:**
- Component files (PascalCase)
- `index.ts` for clean exports

### `/services` - Business Logic
**Service layer separation:**
- `api/` - API service functions
- `auth/` - Authentication service functions

**Benefits:**
- Easy to mock for testing
- Easy to replace with real API
- Clear separation of concerns

### `/hooks` - Custom React Hooks
Reusable stateful logic:
- `useAuth.ts` - Authentication state management
- `usePolling.ts` - Polling logic

### `/utils` - Utility Functions
**Categorized utilities:**
- `errors/` - Error handling utilities
- `validation/` - Form validation utilities
- `formatting/` - Data formatting utilities
- `permissions.ts` - Permission checks
- `polling.ts` - Polling utilities

### `/types` - TypeScript Types
Type definitions organized by domain:
- `auth.ts` - Authentication types
- `receipt.ts` - Receipt types
- `batch.ts` - Batch types
- `evidence.ts` - Evidence types

### `/constants` - Application Constants
Centralized constants:
- API endpoints
- Routes
- Error messages
- Status configurations
- Storage keys

### `/config` - Configuration
Configuration files:
- `api.config.ts` - API configuration

## Import Patterns

### ✅ Recommended
```typescript
// Feature-based imports
import { ReceiptTimeline } from '@/components/ingestion'
import { LoginFormDark } from '@/components/auth'

// Service imports
import { getReceipt } from '@/services/api'
import { isAuthenticated } from '@/services/auth'

// Hook imports
import { useAuth, usePolling } from '@/hooks'

// Utility imports
import { formatDateTime } from '@/utils'
import { validateEmail } from '@/utils/validation'

// Constants
import { ROUTES, ERROR_MESSAGES } from '@/constants'
```

### ❌ Avoid
```typescript
// Deep imports
import { ReceiptTimeline } from '@/components/ingestion/ReceiptTimeline'

// Old lib imports (deprecated)
import { getReceipt } from '@/lib/api'
```

## Benefits of This Structure

1. **Easy Navigation**: Find files quickly by feature
2. **Parallel Development**: Multiple developers can work on different features
3. **Better Debugging**: Clear separation makes issues easier to locate
4. **Scalability**: Easy to add new features without cluttering
5. **Maintainability**: Related code is grouped together
6. **Testability**: Services and utils are easy to test in isolation

## Migration Notes

All old `@/lib/` imports have been migrated to:
- `@/services/api/` - API services
- `@/services/auth/` - Auth services
- `@/utils/` - Utilities
- `@/components/{feature}/` - Components

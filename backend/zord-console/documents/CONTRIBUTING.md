# Contributing Guide

## Development Workflow

### 1. Feature Development

When working on a new feature:

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Follow the folder structure**
   - Components → `components/{feature}/`
   - Services → `services/{feature}/`
   - Hooks → `hooks/`
   - Utils → `utils/{category}/`

3. **Update exports**
   - Add exports to index files for easier imports
   - Keep imports clean and organized

4. **Test your changes**
   - Check for linting errors
   - Test in browser
   - Verify all imports work

### 2. Debugging

#### Component Issues
- Check component props and state in React DevTools
- Verify imports are correct
- Check console for errors

#### API/Service Issues
- Check `services/api/` for API calls
- Verify error handling in `utils/errors/`
- Check network tab in browser DevTools

#### State Management
- Use custom hooks in `hooks/` for reusable logic
- Check localStorage for auth state
- Verify state updates are happening

### 3. Code Organization

#### Adding a New Component
```typescript
// components/ingestion/NewComponent.tsx
export function NewComponent() {
  // Component code
}

// components/ingestion/index.ts
export { NewComponent } from './NewComponent'
```

#### Adding a New Service
```typescript
// services/api/newService.ts
export async function getNewData() {
  // Service code
}

// services/api/index.ts
export * from './newService'
```

#### Adding a New Hook
```typescript
// hooks/useNewHook.ts
export function useNewHook() {
  // Hook code
}

// hooks/index.ts
export { useNewHook } from './useNewHook'
```

### 4. Import Guidelines

#### ✅ Good Imports
```typescript
import { ReceiptTimeline } from '@/components/ingestion'
import { useAuth } from '@/hooks'
import { getReceipt } from '@/services/api'
import { formatDateTime } from '@/utils'
import { ROUTES } from '@/constants'
```

#### ❌ Bad Imports
```typescript
import { ReceiptTimeline } from '@/components/ingestion/ReceiptTimeline'
import { getReceipt } from '@/services/api/receiptService'
```

### 5. File Naming

- **Components**: PascalCase (e.g., `ReceiptTimeline.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useAuth.ts`)
- **Services**: camelCase (e.g., `authService.ts`)
- **Utils**: camelCase (e.g., `formValidation.ts`)
- **Types**: camelCase (e.g., `receipt.ts`)

### 6. Testing Checklist

Before committing:
- [ ] No linting errors
- [ ] All imports resolve correctly
- [ ] Component renders without errors
- [ ] TypeScript types are correct
- [ ] No console errors
- [ ] Responsive design works

### 7. Common Issues

#### Import Errors
- Check if file exists in new location
- Verify index.ts exports are correct
- Check path aliases in tsconfig.json

#### Type Errors
- Verify types are imported correctly
- Check type definitions in `types/`
- Ensure all required props are provided

#### Build Errors
- Clear `.next` folder: `rm -rf .next`
- Reinstall dependencies: `npm install`
- Check for circular dependencies

## Agile Development Practices

### Sprint Planning
- Break features into small, testable components
- Assign components to team members
- Use feature folders for parallel work

### Daily Standups
- Report progress on assigned components
- Identify blockers early
- Share knowledge about new patterns

### Code Reviews
- Review for structure and organization
- Check imports and exports
- Verify error handling
- Test the feature manually

### Retrospectives
- Discuss folder structure improvements
- Share debugging tips
- Identify common patterns to extract

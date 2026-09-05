# Debugging Guide

## Quick Debugging Checklist

### 1. Import Errors
```bash
# Check if imports are correct
grep -r "from '@/lib/" .
# Should show no results after migration
```

### 2. Type Errors
- Check `types/` directory for type definitions
- Verify all required props are provided
- Check TypeScript compiler errors

### 3. Runtime Errors
- Check browser console for errors
- Verify React DevTools for component state
- Check Network tab for API errors

## Common Debugging Scenarios

### Component Not Rendering
1. Check imports in component file
2. Verify component is exported in index.ts
3. Check for console errors
4. Verify props are being passed correctly

### API Calls Failing
1. Check `services/api/` for API implementation
2. Verify error handling in `utils/errors/`
3. Check network tab in DevTools
4. Verify API endpoints in `config/api.config.ts`

### Authentication Issues
1. Check `services/auth/` for auth logic
2. Verify localStorage in DevTools
3. Check `hooks/useAuth.ts` for auth state
4. Verify routes in `constants/index.ts`

### State Not Updating
1. Check if using correct hooks
2. Verify state management in components
3. Check for re-render issues
4. Use React DevTools Profiler

## Debugging Tools

### VS Code
- Use TypeScript language server for type checking
- Use ESLint extension for linting
- Use Prettier for formatting

### Browser DevTools
- React DevTools for component inspection
- Network tab for API debugging
- Console for runtime errors
- Application tab for localStorage

### Terminal
```bash
# Check for TypeScript errors
npm run build

# Check for linting errors
npm run lint

# Check for unused imports
npx ts-prune
```

## File Location Reference

### Components
- Auth: `components/auth/`
- Ingestion: `components/ingestion/`
- Common: `components/common/`

### Services
- API: `services/api/`
- Auth: `services/auth/`

### Hooks
- All hooks: `hooks/`

### Utils
- Errors: `utils/errors/`
- Validation: `utils/validation/`
- Formatting: `utils/formatting/`
- Permissions: `utils/permissions.ts`
- Polling: `utils/polling.ts`

### Constants
- All constants: `constants/index.ts`

### Config
- API config: `config/api.config.ts`

## Debugging Workflow

1. **Identify the Issue**
   - Check browser console
   - Check terminal for build errors
   - Check React DevTools

2. **Locate the Code**
   - Use file structure to find relevant files
   - Check feature folders first
   - Check services for business logic

3. **Fix the Issue**
   - Make minimal changes
   - Test incrementally
   - Verify no regressions

4. **Verify the Fix**
   - Test in browser
   - Check for linting errors
   - Verify types are correct

# Configuration Files Organization

## Overview

Configuration files are organized into two main locations:

1. **Root directory** - Tool configs that must stay in root (required by tools)
2. **`.config/` folder** - Organized copies for reference and version control
3. **`config/` folder** - Application-level configuration (API, etc.)

## Root Directory Config Files

These files **must** remain in the project root:

```
├── package.json          # npm/yarn package configuration
├── package-lock.json      # npm lock file
├── next.config.js        # Next.js configuration
├── tsconfig.json         # TypeScript configuration
├── tailwind.config.ts    # Tailwind CSS configuration
├── postcss.config.js     # PostCSS configuration
├── .eslintrc.json        # ESLint configuration
├── .prettierrc.json      # Prettier configuration
└── next-env.d.ts         # Next.js TypeScript definitions (generated)
```

## `.config/` Folder Structure

Organized copies of tool configurations:

```
.config/
 ├── nextjs/
 │   └── next.config.js
 ├── styles/
 │   ├── tailwind.config.ts
 │   └── postcss.config.js
 ├── typescript/
 │   └── tsconfig.json
 ├── eslint/
 │   └── .eslintrc.json
 ├── prettier/
 │   └── .prettierrc.json
 └── README.md
```

**Purpose**: Reference copies, easier to view and compare changes.

## `config/` Folder Structure

Application-level configuration:

```
config/
 ├── api.config.ts        # API endpoints configuration
 └── README.md
```

**Purpose**: Application-specific configuration, not tool configs.

## Editing Configuration

### Tool Configs (Next.js, TypeScript, etc.)
- ✅ **Edit root files** (e.g., `next.config.js`, `tsconfig.json`)
- 📋 **Sync to `.config/`** folder for organization (optional)

### Application Configs
- ✅ **Edit in `config/`** folder (e.g., `config/api.config.ts`)

## Why This Structure?

1. **Tool Requirements**: Many tools require configs in root
2. **Organization**: `.config/` provides organized view
3. **Version Control**: Easier to track changes in organized structure
4. **Documentation**: Clear separation between tool and app configs

## Sync Script (Optional)

To keep `.config/` in sync with root files:

```bash
#!/bin/bash
# sync-configs.sh
cp next.config.js .config/nextjs/
cp tsconfig.json .config/typescript/
cp tailwind.config.ts .config/styles/
cp postcss.config.js .config/styles/
cp .eslintrc.json .config/eslint/
cp .prettierrc.json .config/prettier/
echo "Configs synced to .config/ folder"
```

---
name: cortex:manage
description: Manage memories - search, view, delete, update fragments
allowed-tools: mcp__cortex-memory__cortex_recall, mcp__cortex-memory__cortex_delete, mcp__cortex-memory__cortex_forget_project, AskUserQuestion
user-invocable: true
---

# Memory Management

Help the user manage their Cortex memories.

## Capabilities

### Search and View Memories

Use `cortex_recall` to find specific memories:
- Search by content
- Filter by project
- View memory details

### Delete Specific Memory

Use `cortex_delete` to remove a memory fragment:
1. First call WITHOUT `confirm: true` to preview what will be deleted
2. Show the user the preview (content, project, timestamp)
3. Ask for explicit confirmation
4. If confirmed, call with `confirm: true` to delete

### Forget Project Memories

Use `cortex_forget_project` to delete all memories for a project:
1. First call WITHOUT `confirm: true` to get count
2. Show the user how many memories will be deleted
3. Ask for explicit confirmation
4. If confirmed, call with `confirm: true` to proceed

## Important Safety Rules

**ALWAYS follow these rules for destructive actions:**

1. **Preview First**: Always call the delete/forget tool without confirm first
2. **Show Impact**: Display exactly what will be affected
3. **Explicit Confirmation**: Ask user "Are you sure you want to delete X?"
4. **Never Assume**: Don't delete without explicit user approval
5. **Be Clear**: State what will be permanently lost

## Example Flows

### Deleting a Specific Memory

User: "Delete the memory about the auth bug fix"

1. Search for memories about auth bug:
   ```
   cortex_recall(query: "auth bug fix")
   ```

2. Show results and ask which one to delete

3. Preview the deletion:
   ```
   cortex_delete(memoryId: 123)
   ```

4. Show preview to user: "This will delete: 'Fixed auth bug by...' from project X"

5. Ask: "Are you sure you want to delete this memory?"

6. If yes:
   ```
   cortex_delete(memoryId: 123, confirm: true)
   ```

### Clearing a Project's Memories

User: "Clear all memories for the old-project"

1. Preview:
   ```
   cortex_forget_project(projectId: "old-project")
   ```

2. Show: "This will delete 45 memories from old-project"

3. Ask: "This action cannot be undone. Are you sure?"

4. If yes:
   ```
   cortex_forget_project(projectId: "old-project", confirm: true)
   ```

## What NOT to Do

- Never delete without showing what will be deleted
- Never assume the user wants to delete
- Never delete multiple memories without listing them first
- Never forget a project without explicit confirmation

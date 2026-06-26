# Ticketing System Example

Internal issue tracking system similar to Jira or Linear.

## Features

### Core Entities

- **Users**: Team members with roles (admin, member, viewer)
- **Projects**: Workspaces to organize issues with unique keys (e.g., "ENG", "PROJ")
- **Issues**: Tasks, bugs, features, and epics with workflow management
- **Comments**: Discussion threads on issues
- **Labels**: Flexible categorization with colors

### Workflows

#### Issue Lifecycle
```
todo → in_progress → in_review → done
  ↓                                ↑
cancelled ←-----------------------→ (reopen)
```

#### Operations

**Issues:**
- `start` - Begin work (requires assignee, active project)
- `submit_for_review` - Request review after completion
- `complete` - Mark as done
- `cancel` - Cancel issue
- `reopen` - Reopen completed/cancelled issues
- `assign` - Assign to team member
- `escalate` - Increase priority to urgent

**Projects:**
- `archive` - Archive completed project
- `unarchive` - Restore archived project

**Users:**
- `suspend` - Suspend user account
- `reactivate` - Reactivate suspended/inactive user
- `promote_to_admin` - Grant admin privileges

## Usage

```bash
# Generate code (from example directory or project root)
cd examples/ticketing
compose composition.nix
# Or: compose examples/ticketing/composition.nix

# Run comprehensive integration tests (in-memory database)
bun test

# Start REST API server
bun run server
# Or directly: bun run generated/server.ts

# Start MCP server
bun run mcp

# Development mode with auto-reload
bun run dev
```

Fresh local databases apply demo users, a project, an issue, a label, and a comment by default. Set `OPENB2C_APPLY_FIXTURES=false` to start without fixtures.

## Testing

The generated integration tests use an in-memory SQLite database and include:
- **HTTP API tests**: CRUD operations, pagination, sorting, filtering
- **Custom operations**: Workflow transitions (start, complete, escalate, etc.)
- **MCP protocol tests**: All tools and operations via MCP
- **35+ comprehensive tests** auto-generated from schema

All tests run against a fresh in-memory database on each execution.

## API Examples

### Create a project
```bash
POST /project
{
  "key": "ENG",
  "name": "Engineering",
  "description": "Core product development",
  "owner_id": 1
}
```

### Create an issue
```bash
POST /issue
{
  "project_id": 1,
  "number": 1,
  "name": "Implement user authentication",
  "description": "Add JWT-based auth",
  "type": "feature",
  "priority": "high",
  "creator_id": 1,
  "assignee_id": 2
}
```

### Start working on an issue
```bash
POST /issue/:id/start
```

### Add a comment
```bash
POST /comment
{
  "issue_id": 1,
  "author_id": 2,
  "body": "Working on this now"
}
```

## Schema

Includes these modules:
- `api_key` - API authentication
- `identity` - Federated identity system
- `user` - Team member management
- `project` - Project organization
- `issue` - Issue tracking
- `comment` - Discussion threads
- `label` - Categorization and tagging

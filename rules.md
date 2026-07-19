# Engineering Rules

## Coding Rules

- **Naming Conventions:** Use `camelCase` for variables and functions. Use `PascalCase` for classes and TypeScript types/interfaces. Use `UPPER_SNAKE_CASE` for constants.
- **Folder Conventions:** Feature-based or layered modular structure. Stick to the predefined folders (`controllers`, `services`, `models`, `routes`).
- **File Naming:** Use `.ts` extension. Name files descriptively. Postfix files with their type where applicable (e.g., `user.controller.ts`, `auth.middleware.ts`, `scan.service.ts`).
- **Commit Message Conventions:** Follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **Documentation Rules:** Maintain clean code that documents itself. Use JSDoc for complex logic or public service functions. Update `memory.md` when completing tasks.

## Backend Rules

- **Always use the service layer:** Controllers must never contain complex business logic.
- **Never query the database directly inside controllers:** Controllers should call a service function, which interacts with the database/models.
- **Keep controllers thin:** Extract, validate, pass to service, return response.
- **Business logic belongs in services:** Services orchestrate data flow, external API calls, and domain rules.
- **Repositories/Models only communicate with the database:** No HTTP request logic inside models.
- **Never duplicate logic:** Create shared utility functions or shared services.

## API Rules

- **RESTful APIs only:** Follow strict REST principles.
- **Proper HTTP methods:** Use GET for fetching, POST for creating, PATCH for partial updates, PUT for replacements, DELETE for removal.
- **Versioned endpoints:** All API routes must be prefixed with `/api/v1/`.
- **Consistent response format:** Use a standard API response builder utility for all responses.
  - Success: `{ success: true, data: { ... } }`
  - Error: `{ success: false, error: { code, message } }`
- **Validation before processing:** Validate all inputs using Zod middleware before the controller executes.
- **No business logic inside routes:** Routes just map endpoints to middleware and controllers.

## Error Handling Rules

- **Always throw typed/custom errors:** Use predefined error classes (e.g., `NotFoundError`, `UnauthorizedError`).
- **Never swallow exceptions:** Catch blocks must log the error or rethrow it.
- **Always log unexpected failures:** Use the global error handler and logger.
- **Never expose internal stack traces to clients:** The global error handler must strip sensitive trace data in production.

## Validation Rules

- **Validate every request:** Never trust client data.
- **Validate query parameters:** Ensure types and limits (e.g., pagination constraints).
- **Validate request body:** Use strict Zod schemas.
- **Validate path parameters:** Ensure IDs are valid formats (e.g., MongoDB ObjectIDs).
- **Validate environment variables:** Ensure the application fails fast on startup if environment variables are missing (using Zod on `process.env`).

## Security Rules

- **Input sanitization:** Rely on Zod and ORM protections against injection.
- **Authentication required where appropriate:** Protect routes with JWT middleware by default, explicitly opt-out for public routes.
- **Authorization checks:** Use RBAC middleware to enforce permissions.
- **Rate limiting:** Apply rate limiters to all endpoints, with stricter limits on auth routes.
- **Secure headers:** Use Helmet to set appropriate HTTP security headers.
- **Password hashing:** Always hash passwords using bcrypt before saving. Never return password hashes in API responses.
- **JWT handling:** Keep secrets secure. Validate expiration. Use blacklists for logouts.
- **Secret management:** Keep secrets out of code. Use `.env` files.
- **No sensitive logs:** Ensure passwords, tokens, and PII are redacted from logs.

## Database Rules

- **No raw queries unless necessary:** Use Mongoose ODM methods.
- **Indexes for performance:** Ensure fields used in frequent queries (like IDs, geographic locations, and statuses) are indexed.
- **Use transactions where required:** When updating multiple collections simultaneously, use MongoDB sessions/transactions.
- **Avoid N+1 queries:** Use Mongoose `populate()` efficiently or aggregation pipelines.

## AI Rules

- **Prompt Versioning:** Maintain and version system prompts in the codebase.
- **Context size limits:** Manage token limits by trimming chat histories (e.g., only send the last 10 messages).
- **Token optimization:** Downsize images before sending to Groq Vision API to reduce bandwidth and processing time.
- **Fallback responses:** Gracefully handle API timeouts or failures from Groq.

## Libraries

**Allowed:**
- Express (API framework)
- Mongoose (MongoDB ODM)
- Zod (Validation)
- JSONWebToken (Auth)
- Winston/Morgan (Logging)
- BullMQ (Queues)
- Redis (Caching/Sessions)
- Multer/Sharp (File uploads & processing)
- Groq SDK (AI integration)
- @qdrant/js-client-rest (Vector DB client)

**Disallowed:**
- Duplicate validation libraries (e.g., don't use Joi if Zod is installed).
- Multiple ORMs/ODMs (stick to Mongoose).
- Heavy, unmaintained packages without justification.

## Boundaries

- **Controllers:** Cannot access DB directly. Must use Services.
- **Services:** Cannot know about the HTTP layer (req/res objects). They accept raw data and return data or throw errors.
- **Repositories (Models):** Cannot call external APIs.
- **Avoid circular dependencies:** Structure services hierarchically or use dependency injection patterns if needed.

## Performance Rules

- **Async everywhere:** Use async/await for all I/O operations.
- **Avoid blocking operations:** Do not run heavy synchronous tasks on the main Node.js thread.
- **Cache expensive operations:** Cache treatment lookups and frequent reads in Redis.
- **Paginate large datasets:** Always implement pagination for lists.

## Testing Rules

- **Unit tests:** For utility functions, validators, and core service logic.
- **Integration tests:** For API endpoints (using Supertest).
- **Mock external APIs:** Always mock Groq API, AWS S3, Twilio, and SendGrid in tests.
- **Minimum coverage expectations:** Aim for >80% coverage on core business logic.

## Documentation Rules

- **Every public function documented:** Use JSDoc.
- **Every module documented:** Briefly explain the module's purpose.
- **Keep README updated:** Reflect system architecture changes.
- **Keep architecture.md updated:** Document structural shifts.
- **Keep phases.md updated:** Track feature roadmaps.
- **Keep memory.md updated:** Continuously update project state upon completing tasks.

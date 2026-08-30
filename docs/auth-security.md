# Authentication, jurisdiction and audit boundaries

## Current implementation

SCRB Sahayak is a React/Vite frontend backed by FastAPI and PostgreSQL. Officers
sign in with a service/badge ID and password. FastAPI issues a signed JWT and
validates it on every protected API request.

Frontend route guards improve navigation, but they are not the security
boundary. Every case, person, analytics, network and document endpoint applies
server-side role and jurisdiction checks before returning data.

## Jurisdiction model

- Police IT and state leadership: statewide administrative/read scope.
- IGP: configured command range.
- DIG: assigned districts.
- SP/ASP: district.
- DySP: subdivision.
- SHO/Inspector and lower ranks: station.

Write permissions are checked separately from visibility. Assigned-IO checks
protect diary, investigation-plan, custody-clock and document changes.

## Audit and AI boundaries

- Case actions and protected document views create audit events.
- AI tools are read-only and receive only the requesting officer's permitted
  records.
- External AI requests pass through backend tokenisation and metadata-only
  privacy auditing.
- Zero Data Retention routing is configurable. Disabling it is permitted only
  for synthetic hackathon data and is shown truthfully in the UI.

## Prototype limitations

The browser currently stores the JWT in local storage and logout does not revoke
an already issued token. A production deployment should use short-lived tokens,
secure refresh/session handling, revocation and departmental identity systems.
The hackathon environment must not contain operational police data.

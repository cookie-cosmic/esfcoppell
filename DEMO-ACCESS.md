# Staff Access — This Workspace

## Where the hidden admin button is

There is one way in. It opens the sign-in screen and never grants access by itself:

1. **Footer icon** — the tiny faded smile icon at the **bottom-right of the footer**,
   next to the copyright line (it brightens on hover; its tooltip says “Staff”).
   Click it **five times within 3 seconds**.

The staff console has no public link, and the old `/admin` address no longer works.

## Signing in

The staff sign-in asks for one field only: the chapter staff password (no email).
The owner password is intentionally not stored in this repository. Create or reset it
on the server:

```bash
npm run create-admin
```

Never commit a real password to documentation or source control.

## Current database state

A fresh deployment has no administrator until `npm run create-admin` is run on the API
host. The site can then be populated through the admin dashboard.

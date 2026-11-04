# Table7 frontend

React + TypeScript + Vite. Runs entirely on **mock data** for now, so no backend is needed.

```sh
cd frontend
npm install
npm run dev      # http://localhost:5173
```

## How it's laid out

One page. The toggle in the header ("I'm hiring" / "I'm looking for work") slides between the two flows:

- **Employer** (`src/flows/employer/`): type a prompt → AI-matched candidates. Results stay blurred until the user signs in with an employer account.
- **Applicant** (`src/flows/applicant/`): create account / sign in → pay for membership → edit profile (LinkedIn connect, CV upload, skills, visibility).

## For the backend (OP793)

All data goes through **`src/api/index.ts`**. Each function has a comment with a suggested endpoint. Replace each function body with a real `fetch` call and delete `src/api/mock.ts`.

The request and response shapes are in **`src/api/types.ts`**. If the backend needs different shapes, change them there and TypeScript will point to every screen that needs updating.

The mock keeps the "logged-in" state in localStorage. Clear site data to reset it.

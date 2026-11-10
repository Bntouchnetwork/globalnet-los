# GlobalNet AI LOS — site

Static site published with GitHub Pages (Settings › Pages › Deploy from a branch › `main` / root).

| Page | What it is |
| --- | --- |
| `index.html` | Public landing page. "Sign in" opens the login. |
| `login.html` | Login (password or email link) + two-step sign-in with an authenticator app. Opens the LOS. |
| `los.html` | The full LOS, connected to Supabase: loans, settings, CRM, partners, e-sign, disclosures and MCR are saved in the database. |
| `sign.html` | Page where borrowers and the loan officer sign (access code, E-SIGN consent, audit certificate). |
| `preview.html` | The LOS with sample data, kept in the browser only (for demos). |
| `app.html` | Old address — forwards to `los.html`. |
| `config.js` | Supabase address and publishable key (public by design; every table is protected by Row Level Security and two-step sign-in). |

Database: Supabase project `globalnet-ai-los`. The source code (screens, database migrations, worker) lives in the private repository `globalnet-ai-los`; these files are built there with `tools/build_site.py`.

In Supabase › Authentication › URL Configuration, the Site URL and Redirect URLs must include `https://bntouchnetwork.github.io/globalnet-los/`.

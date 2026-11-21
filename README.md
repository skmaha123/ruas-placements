# RUAS Placement Portal — Directorate of Training and Placement

A placement-updates website for Ramaiah University of Applied Sciences, hosted free on GitHub Pages.

- **Students and visitors** can only view the page: drives, eligibility, deadlines, schedule and announcements, with search and filters.
- **Admins** log in and can add, edit or delete companies, announcements and statistics, then click **Publish changes**.

## Files
| File | Purpose |
|---|---|
| `index.html`, `style.css`, `app.js` | The website |
| `config.js` | University name, season, branch list, contact details. Edit this file directly on GitHub. |
| `data.json` | All drives, announcements and stats. The admin panel updates this file. |

## Publish on GitHub Pages
1. Create a new **public** repository, for example `ruas-placements`.
2. Upload all files from this folder. Use **Add file → Upload files** and drop them in.
3. Go to **Settings → Pages** and set *Deploy from a branch* → `main` → `/ (root)` → **Save**.
4. The site will be at `https://<username>.github.io/ruas-placements/`.

## How admin login works
The site is static, so it can't keep passwords safely. A password check inside the page could be read by anyone. Instead, admins sign in with a **GitHub access token** that has write access to this repository. Only people who hold such a token can publish changes. Everyone else can only view the site.

### Create an admin token (once per admin)
1. On GitHub, open **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Fill in the form:
   - **Name:** `RUAS placement admin`
   - **Expiration:** your choice, for example 90 days
   - **Repository access:** *Only select repositories* → choose this repository
   - **Permissions** → *Repository permissions* → **Contents: Read and write**
3. Click **Generate token**, then copy the token. It starts with `github_pat_`.
4. On the website, click **Admin login**. Enter `username/ruas-placements` as the repository and paste the token.

To give another staff member admin access, add them under **Settings → Collaborators** in the repository. They then create their own token.

### Editing
- **+ Company**, **+ Announcement**, **Edit stats** and the **Edit** buttons on cards all change the page in your browser first.
- **Publish changes** saves everything to `data.json` in the repository. The public page updates about a minute later.
- **Download data.json** saves a backup copy.

Never paste the token into a file or share it. If a token leaks, delete it in GitHub settings and create a new one.

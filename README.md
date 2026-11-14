<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1XYtk9zjAYxixfM1MuXRE_Ssw2omisjX_

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket and import it in Vercel.
2. Add `GEMINI_API_KEY` under **Project Settings → Environment Variables**.
3. Vercel builds the Vite frontend to `dist` and deploys `api/index.ts` as a serverless function automatically via `vercel.json`.


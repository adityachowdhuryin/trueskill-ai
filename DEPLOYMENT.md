# Production Deployment Guide: TrueSkill AI

This guide walks you through deploying the TrueSkill AI application (FastAPI backend and Next.js frontend) using free-tier services.

---

## 1. Database Tier: Neo4j AuraDB (Cloud)
AuraDB provides a fully managed, persistent cloud-hosted instance of Neo4j.

1. **Sign Up**: Go to [Neo4j Aura Console](https://console.neo4j.io/) and create an account.
2. **Create Instance**:
   * Click **Create Instance**.
   * Under **AuraDB**, select the **Free** instance tier.
   * Click **Create**.
3. **Download Credentials**:
   * Copy and download the generated `.txt` credentials file containing the URI, username (`neo4j`), and password. **Do not lose this file.**
   * Wait a few minutes for the status to show **Running**.

---

## 2. Backend Tier: FastAPI (Render)
Render provides free web hosting for Python web services.

1. **Sign Up**: Sign up on [Render](https://render.com/).
2. **Deploy Service**:
   * Go to the dashboard and click **New** $\rightarrow$ **Web Service**.
   * Connect your GitHub repository.
3. **Configure Service Details**:
   * **Name**: `trueskill-ai-backend` (or similar)
   * **Environment**: `Python`
   * **Root Directory**: `backend` (This is critical: tells Render to build and start inside the `backend` folder)
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. **Configure Environment Variables**:
   Click **Advanced** and add the following variables:
   * `NEO4J_URI`: The `neo4j+s://...` URI from your downloaded AuraDB credentials.
   * `NEO4J_USERNAME`: `neo4j`
   * `NEO4J_PASSWORD`: The password from your downloaded AuraDB credentials.
   * `GROQ_API_KEY`: Your primary Groq API key.
   * `GROQ_API_KEY_BACKUP`: (Optional) Your backup Groq API key for rate-limit protection.
   * `GITHUB_TOKEN`: (Optional) A GitHub Personal Access Token (PAT) to fetch portfolio READMEs from public GitHub repos.
   * `ALLOWED_ORIGINS`: The URL of your Vercel frontend (e.g., `https://your-app.vercel.app`). Leave blank or set to `*` initially if you haven't deployed the frontend yet. Update this after deploying to Vercel for CORS security.
5. **Click Create Web Service**. It will build and launch. Note the generated URL (e.g., `https://trueskill-ai-backend.onrender.com`).

> [!NOTE]
> Render's free tier goes to sleep after 15 minutes of inactivity. When a user accesses the page after it goes to sleep, the first request will take about 40–50 seconds to complete (cold start) as the container wakes up.

---

## 3. Frontend Tier: Next.js (Vercel)
Vercel is the optimal platform for hosting Next.js applications.

1. **Sign Up**: Sign up on [Vercel](https://vercel.com/) (Hobby plan is free).
2. **Import Project**:
   * Click **Add New** $\rightarrow$ **Project**.
   * Import your GitHub repository.
3. **Configure Project**:
   * **Root Directory**: Click *Edit* and select the `frontend` folder.
   * **Framework Preset**: Leave as **Next.js**.
   * **Build and Output Settings**: Leave as default.
4. **Configure Environment Variables**:
   Under **Environment Variables**, add:
   * `NEXT_PUBLIC_API_URL`: The URL of your deployed Render backend (e.g., `https://trueskill-ai-backend.onrender.com` without a trailing slash).
5. **Deploy**:
   * Click **Deploy**. Vercel will build the frontend and provide you with a production URL (e.g., `https://your-app.vercel.app`).
6. **Update Backend CORS (Final Step)**:
   * Go back to your **Render** dashboard for the backend web service.
   * Go to **Environment** $\rightarrow$ Edit environment variables.
   * Update `ALLOWED_ORIGINS` to point to your new Vercel production URL (e.g., `https://your-app.vercel.app`). Save changes.
   * Render will automatically redeploy the backend with the correct CORS rules active.

Your production deployment is now complete and fully connected!

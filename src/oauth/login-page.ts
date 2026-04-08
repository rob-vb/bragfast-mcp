export interface LoginPageParams {
  clientId: string;
  state?: string;
  codeChallenge: string;
  redirectUri: string;
  error?: string;
}

export function renderLoginPage(params: LoginPageParams): string {
  const { clientId, state, codeChallenge, redirectUri, error } = params;

  const errorHtml = error
    ? `<div class="error">${escapeHtml(error)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect Bragfast</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      padding: 2rem;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }
    .logo {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 1.5rem;
      color: #111;
    }
    h1 {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #111;
    }
    p {
      color: #666;
      font-size: 0.875rem;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }
    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: #333;
      margin-bottom: 0.375rem;
    }
    input[type="password"], input[type="text"] {
      width: 100%;
      padding: 0.625rem 0.75rem;
      border: 1.5px solid #ddd;
      border-radius: 8px;
      font-size: 0.875rem;
      font-family: monospace;
      outline: none;
      transition: border-color 0.15s;
      margin-bottom: 1rem;
    }
    input:focus { border-color: #111; }
    button[type="submit"] {
      width: 100%;
      padding: 0.75rem;
      background: #111;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    button[type="submit"]:hover { background: #333; }
    .error {
      background: #fff0f0;
      border: 1.5px solid #ffcdd2;
      color: #c62828;
      padding: 0.625rem 0.75rem;
      border-radius: 8px;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    .footer {
      margin-top: 1.25rem;
      text-align: center;
      font-size: 0.8125rem;
      color: #999;
    }
    .footer a {
      color: #111;
      text-decoration: none;
      font-weight: 500;
    }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">brag.fast</div>
    <h1>Connect to brag.fast</h1>
    <p>Enter your brag.fast API key to connect. Your AI assistant will be able to generate release images and videos on your behalf.</p>
    ${errorHtml}
    <form method="POST" action="/oauth/submit">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <input type="hidden" name="state" value="${escapeHtml(state ?? "")}" />
      <label for="api_key">API Key</label>
      <input
        type="password"
        id="api_key"
        name="api_key"
        placeholder="bf_..."
        autocomplete="off"
        autofocus
        required
      />
      <button type="submit">Connect</button>
    </form>
    <div class="footer">
      Don't have a key? <a href="https://brag.fast/dashboard/account" target="_blank" rel="noopener">Get one here →</a>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

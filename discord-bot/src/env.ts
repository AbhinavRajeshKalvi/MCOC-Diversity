// Settings from the environment.

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is not set. Copy .env.example to .env (or add it on Render) and fill it in.`);
    process.exit(1);
  }
  return value;
}

export const env = {
  token: required("DISCORD_TOKEN"),
  devGuildId: process.env.DISCORD_DEV_GUILD_ID?.trim() || null,
  appUrl: (process.env.APP_URL?.trim() || "").replace(/\/+$/, ""),
  pollMs: Math.max(5, Number(process.env.POLL_SECONDS) || 20) * 1000,
  port: Number(process.env.PORT) || 3001,
  registerOnly: process.argv.includes("--register")
};

/** A link into the app, or null when APP_URL isn't set. */
export function appLink(path: string): string | null {
  return env.appUrl ? `${env.appUrl}${path}` : null;
}

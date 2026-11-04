export const GET = () => new Response(process.env.CF_PAGES_COMMIT_SHA ?? "");

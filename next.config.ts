import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The AI assistant and grader read their prompts from prompts/ at run time.
  outputFileTracingIncludes: { "/api/**/*": ["./prompts/**/*.md"], "/teacher/**/*": ["./prompts/**/*.md"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

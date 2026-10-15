import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const art = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/art" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      image: image(),
      date: z.coerce.date(),
      caption: z.string().optional(),
      alt: z.string().optional(),
      tags: z.array(z.string()).default([]),
    }),
});

const applings = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/applings" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      image: image(),
      link: z.string().optional(),
    }),
});

const posts = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/posts" }),
  schema: z.object({ title: z.string(), date: z.coerce.date() }),
});

const status = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/status" }),
  schema: z.object({ date: z.coerce.date() }),
});

const pages = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/pages" }),
  schema: z.object({ title: z.string() }),
});

export const collections = { art, applings, posts, status, pages };
